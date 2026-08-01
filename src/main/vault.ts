import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { VaultEntry } from '@shared/types'

/**
 * Secret store, OS-backed.
 *
 * Substitution from the spec, deliberate: `keytar` was archived in Oct 2023 and
 * ships no prebuilt binary for a current Electron ABI — building it needs the
 * MSVC C++ toolchain, which is not installed on this machine. Electron's
 * first-party `safeStorage` uses the same OS facilities keytar wrapped
 * (DPAPI on Windows, Keychain on macOS, kwallet/libsecret on Linux) with zero
 * native build. Ciphertext lives in its own file; SQLite never sees a secret,
 * and nothing is ever written unencrypted.
 */

type VaultFile = Record<string, { c: string; at: number }>

function vaultPath(): string {
  return join(app.getPath('userData'), 'vault.enc.json')
}

function assertAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      process.platform === 'linux'
        ? 'OS keyring unavailable. Install gnome-keyring or kwallet, then restart DevHub — DevHub refuses to store secrets unencrypted.'
        : 'OS encryption unavailable, refusing to store secrets unencrypted.'
    )
  }
}

function readFile(): VaultFile {
  const p = vaultPath()
  if (!existsSync(p)) return {}
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as VaultFile
  } catch {
    return {}
  }
}

function writeFileAtomic(data: VaultFile): void {
  const p = vaultPath()
  mkdirSync(dirname(p), { recursive: true })
  const tmp = `${p}.tmp`
  writeFileSync(tmp, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 })
  renameSync(tmp, p)
}

export function vaultSet(key: string, value: string): void {
  assertAvailable()
  const data = readFile()
  data[key] = { c: safeStorage.encryptString(value).toString('base64'), at: Date.now() }
  writeFileAtomic(data)
}

export function vaultGet(key: string): string | null {
  const data = readFile()
  const row = data[key]
  if (!row) return null
  assertAvailable()
  try {
    return safeStorage.decryptString(Buffer.from(row.c, 'base64'))
  } catch {
    return null
  }
}

export function vaultGetJson<T>(key: string): T | null {
  const raw = vaultGet(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function vaultSetJson(key: string, value: unknown): void {
  vaultSet(key, JSON.stringify(value))
}

export function vaultDelete(key: string): boolean {
  const data = readFile()
  if (!(key in data)) return false
  delete data[key]
  writeFileAtomic(data)
  return true
}

/** Removes every key beginning with `prefix`. Returns how many went. */
export function vaultDeletePrefix(prefix: string): number {
  const data = readFile()
  let n = 0
  for (const k of Object.keys(data)) {
    if (k.startsWith(prefix)) {
      delete data[k]
      n++
    }
  }
  if (n) writeFileAtomic(data)
  return n
}

export function vaultKeys(): string[] {
  return Object.keys(readFile())
}

export function vaultHas(key: string): boolean {
  return key in readFile()
}

function mask(value: string): string {
  const compact = value.replace(/\s+/g, '')
  if (compact.length <= 4) return '••••'
  return `••••••••${compact.slice(-4)}`
}

/** Masked inventory for the credential vault screen. Never returns plaintext. */
export function vaultEntries(): VaultEntry[] {
  const data = readFile()
  return Object.entries(data).map(([key, row]) => {
    let masked = '••••••••'
    const plain = vaultGet(key)
    if (plain !== null) {
      // JSON blobs (token sets, MSAL caches) get a size hint instead of a tail
      masked = plain.trimStart().startsWith('{')
        ? `••• encrypted JSON, ${plain.length} bytes`
        : mask(plain)
    }
    const [head] = key.split(':')
    const kind: VaultEntry['kind'] =
      head === 'mail' ? 'mail' : head === 'connector' ? 'connector' : head === 'oauth' ? 'oauth-client' : 'other'
    return { key, kind, label: labelFor(key), masked, createdAt: row.at }
  })
}

function labelFor(key: string): string {
  const parts = key.split(':')
  if (parts[0] === 'mail') return `${parts[1]} · ${parts[2]} · ${parts[3] ?? 'tokens'}`
  if (parts[0] === 'connector') return `${parts[1]} · ${parts.slice(2).join(':')}`
  if (parts[0] === 'oauth') return `${parts[1]} OAuth client`
  return key
}

/* ── key naming, single source of truth ───────────────────────────────── */

export const vaultKey = {
  /** the user's own OAuth app credentials, per provider */
  oauthClient: (provider: string) => `oauth:${provider}:client`,
  /** per-account token material */
  mailTokens: (provider: string, email: string) => `mail:${provider}:${email}:tokens`,
  connectorField: (connectorId: string, field: string) => `connector:${connectorId}:${field}`,
  connectorPrefix: (connectorId: string) => `connector:${connectorId}:`
}
