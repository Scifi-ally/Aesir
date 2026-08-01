import type { ConnectorState, ConnectorTestResult, JsonPath } from '@shared/types'
import { manifestById } from '@shared/connectors'
import { connectorStates, deleteConnector, log, upsertConnector } from './db'
import { vaultDeletePrefix, vaultGet, vaultKey, vaultSet } from './vault'

function pluck(obj: unknown, path: JsonPath | undefined): unknown {
  if (!path) return undefined
  let cur: unknown = obj
  for (const step of path) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string | number, unknown>)[step as string]
  }
  return cur
}

function asText(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return null
}

/** `{{field}}` substitution. Header values are stripped of CR/LF; URL values are encoded. */
function fill(template: string, values: Record<string, string>, mode: 'url' | 'header' | 'body'): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const raw = values[key]
    if (raw === undefined) throw new Error(`missing credential field: ${key}`)
    if (mode === 'url') return encodeURIComponent(raw)
    if (mode === 'header') return raw.replace(/[\r\n]/g, '')
    return raw.replace(/"/g, '\\"')
  })
}

function storedValues(connectorId: string, fields: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of fields) {
    const v = vaultGet(vaultKey.connectorField(connectorId, f))
    if (v !== null) out[f] = v
  }
  return out
}

async function runTest(
  connectorId: string,
  values: Record<string, string>
): Promise<ConnectorTestResult> {
  const manifest = manifestById(connectorId)
  if (!manifest) throw new Error(`unknown connector: ${connectorId}`)
  const t = manifest.test

  const url = fill(t.url, values, 'url')
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(t.headers ?? {})) headers[k] = fill(v, values, 'header')
  const body = t.body !== undefined ? fill(t.body, values, 'body') : undefined

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(url, {
      method: t.method,
      headers,
      body: t.method === 'POST' ? (body ?? '') : undefined,
      signal: controller.signal
    })
    const text = await res.text()
    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      /* some errors come back as plain text */
    }

    const apiError = asText(pluck(json, t.errorPath))
    const okFlag = t.okPath ? Boolean(pluck(json, t.okPath)) : true
    const ok = res.ok && okFlag && !(!res.ok && apiError)

    const identity = ok ? asText(pluck(json, t.identityPath)) : null
    const detail = ok ? asText(pluck(json, t.detailPath)) : null

    return {
      ok,
      status: res.status,
      identity,
      detail,
      error: ok ? null : (apiError ?? `HTTP ${res.status} ${res.statusText}`),
      raw: text.slice(0, 800)
    }
  } catch (e) {
    const msg = (e as Error).name === 'AbortError' ? 'request timed out after 20s' : (e as Error).message
    return { ok: false, status: null, identity: null, detail: null, error: msg, raw: '' }
  } finally {
    clearTimeout(timer)
  }
}

/** Stores credentials, then immediately proves them with the manifest's real call. */
export async function connect(
  connectorId: string,
  values: Record<string, string>
): Promise<ConnectorTestResult> {
  const manifest = manifestById(connectorId)
  if (!manifest) throw new Error(`unknown connector: ${connectorId}`)

  for (const f of manifest.fields) {
    const v = values[f.key]
    if (!v || !v.trim()) throw new Error(`${f.label} is required`)
  }

  const result = await runTest(connectorId, values)
  if (!result.ok) {
    // nothing is persisted until the credential actually works
    return result
  }

  for (const f of manifest.fields) vaultSet(vaultKey.connectorField(connectorId, f.key), values[f.key].trim())
  upsertConnector({
    id: connectorId,
    connectedAt: Date.now(),
    lastTestAt: Date.now(),
    ok: true,
    identity: result.identity,
    detail: result.detail,
    error: null
  })
  log('info', 'connector', `${connectorId} connected as ${result.identity ?? 'unknown identity'}`)
  return result
}

export async function test(connectorId: string): Promise<ConnectorTestResult> {
  const manifest = manifestById(connectorId)
  if (!manifest) throw new Error(`unknown connector: ${connectorId}`)
  const values = storedValues(
    connectorId,
    manifest.fields.map((f) => f.key)
  )
  const missing = manifest.fields.filter((f) => !(f.key in values))
  if (missing.length) throw new Error(`${manifest.name} is not connected`)

  const result = await runTest(connectorId, values)
  upsertConnector({
    id: connectorId,
    lastTestAt: Date.now(),
    ok: result.ok,
    identity: result.identity,
    detail: result.detail,
    error: result.error
  })
  return result
}

export function remove(connectorId: string): void {
  vaultDeletePrefix(vaultKey.connectorPrefix(connectorId))
  deleteConnector(connectorId)
  log('info', 'connector', `${connectorId} removed`)
}

export function states(): ConnectorState[] {
  return connectorStates()
}

/** Re-tests everything already connected; drives the status strip's health dots. */
export async function testAll(): Promise<void> {
  for (const s of connectorStates()) {
    if (s.connected) await test(s.id).catch(() => undefined)
  }
}
