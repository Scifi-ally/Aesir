import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConnectorManifest, ConnectorState, ConnectorTestResult } from '@shared/types'
import { Button, Dot, ErrorState, Input, Label, Loading, Row, timeAgo } from '../../components/ui'
import { useApp, usePaletteActions } from '../../state'

/**
 * Everything on this screen is derived from the manifest list in
 * src/shared/connectors.ts — a sixth connector is a sixth manifest, not new UI.
 */
export default function Connectors(): React.JSX.Element {
  const { toast, view, setView } = useApp()
  const [manifests, setManifests] = useState<ConnectorManifest[]>([])
  const [states, setStates] = useState<Record<string, ConnectorState>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [ms, st] = await Promise.all([
      window.devhub.connectors.manifests(),
      window.devhub.connectors.states()
    ])
    setManifests(ms)
    setStates(Object.fromEntries(st.map((s) => [s.id, s])))
    return ms
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const ms = await load()
        setSelectedId((cur) => cur ?? ms[0]?.id ?? null)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    })()
  }, [load])

  useEffect(() => {
    if (view.kind === 'connectors' && view.focus) setSelectedId(view.focus)
  }, [view])

  usePaletteActions(
    () =>
      manifests.flatMap((m) => [
        {
          id: `conn.open.${m.id}`,
          label: `${states[m.id]?.connected ? 'Settings' : 'Connect'} — ${m.name}`,
          group: 'connectors',
          glyph: m.icon,
          run: () => setView({ kind: 'connectors', focus: m.id })
        },
        ...(states[m.id]?.connected
          ? [
              {
                id: `conn.test.${m.id}`,
                label: `Test ${m.name} connection`,
                group: 'connectors',
                glyph: '↻',
                run: async () => {
                  const r = await window.devhub.connectors.test(m.id)
                  toast(
                    r.ok ? `${m.name}: ${r.identity ?? 'ok'}` : `${m.name}: ${r.error ?? 'failed'}`,
                    r.ok ? 'info' : 'error'
                  )
                  void load()
                }
              }
            ]
          : [])
      ]),
    [manifests, states, load, setView, toast]
  )

  const selected = useMemo(
    () => manifests.find((m) => m.id === selectedId) ?? null,
    [manifests, selectedId]
  )

  if (loading) return <Loading what="loading connector manifests" />
  if (error) return <ErrorState title="connectors failed to load" detail={error} />

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[200px] flex-none overflow-y-auto bg-[var(--bg-1)] py-4 border-r border-[#27272a]">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-2)] px-4 mb-2">Connections</div>
        {manifests.map((m) => {
          const s = states[m.id]
          return (
            <Row key={m.id} active={m.id === selectedId} onClick={() => setSelectedId(m.id)}>
              <div className="flex items-center gap-2">
                <Dot state={!s?.connected ? 'idle' : s.ok === true ? 'ok' : s.ok === false ? 'bad' : 'warn'} />
                <span style={{ color: m.id === selectedId ? 'var(--fg-0)' : 'var(--fg-1)' }}>
                  {m.icon} {m.name}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] truncate" style={{ color: 'var(--fg-2)' }}>
                {s?.connected ? (s.identity ?? 'connected') : 'not connected'}
              </div>
            </Row>
          )
        })}
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto bg-[var(--bg-0)]">
        {selected ? (
          <ConnectorDetail
            key={selected.id}
            manifest={selected}
            state={states[selected.id] ?? null}
            onChanged={() => void load()}
          />
        ) : null}
      </div>
    </div>
  )
}

function ConnectorDetail({
  manifest,
  state,
  onChanged
}: {
  manifest: ConnectorManifest
  state: ConnectorState | null
  onChanged: () => void
}): React.JSX.Element {
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ConnectorTestResult | null>(null)

  const connected = state?.connected ?? false

  const run = (fn: () => Promise<ConnectorTestResult>): void => {
    setBusy(true)
    setResult(null)
    fn()
      .then((r) => {
        setResult(r)
        onChanged()
      })
      .catch((e: Error) =>
        setResult({ ok: false, status: null, identity: null, detail: null, error: e.message, raw: '' })
      )
      .finally(() => setBusy(false))
  }

  return (
    <div className="max-w-[80ch] px-6 py-5">
      <div className="flex items-baseline gap-2">
        <span style={{ color: 'var(--fg-0)' }}>
          {manifest.icon} {manifest.name}
        </span>
        <span style={{ color: 'var(--fg-2)' }}>{manifest.authType.replace('_', ' ')}</span>
        <button
          className="ml-auto underline"
          style={{ color: 'var(--accent)' }}
          onClick={() => void window.devhub.app.openExternal(manifest.docsUrl)}
        >
          how to get this
        </button>
      </div>
      <p className="mt-1" style={{ color: 'var(--fg-2)' }}>
        {manifest.blurb}
      </p>

      <div className="mt-4" style={{ color: 'var(--fg-2)' }}>
        test call ·{' '}
        <code style={{ color: 'var(--fg-1)' }}>
          {manifest.test.method} {manifest.test.url}
        </code>
      </div>

      {connected ? (
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Dot state={state?.ok === true ? 'ok' : state?.ok === false ? 'bad' : 'warn'} />
            <span style={{ color: 'var(--fg-1)' }}>
              {state?.identity ? `signed in as ${state.identity}` : 'credential stored'}
              {state?.detail ? ` · ${state.detail}` : ''}
            </span>
            {state?.lastTestAt && (
              <span style={{ color: 'var(--fg-2)' }}>tested {timeAgo(state.lastTestAt)} ago</span>
            )}
          </div>
          {state?.error && <div style={{ color: 'var(--bad)' }}>{state.error}</div>}
          <div className="flex gap-1">
            <Button
              kind="accent"
              disabled={busy}
              onClick={() => run(() => window.devhub.connectors.test(manifest.id))}
            >
              {busy ? 'calling the API…' : 'test connection'}
            </Button>
            <Button
              kind="danger"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                window.devhub.connectors
                  .remove(manifest.id)
                  .then(() => {
                    setResult(null)
                    onChanged()
                  })
                  .finally(() => setBusy(false))
              }}
            >
              remove credential
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {manifest.fields.map((f) => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <Input
                value={values[f.key] ?? ''}
                type={f.secret ? 'password' : 'text'}
                placeholder={f.placeholder}
                onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
              />
              {f.help && (
                <div className="mt-1" style={{ color: 'var(--fg-2)' }}>
                  {f.help}
                </div>
              )}
            </div>
          ))}
          <div>
            <Button
              kind="accent"
              disabled={busy || manifest.fields.some((f) => !(values[f.key] ?? '').trim())}
              onClick={() => run(() => window.devhub.connectors.connect(manifest.id, values))}
            >
              {busy ? 'calling the API…' : 'connect'}
            </Button>
          </div>
          <div style={{ color: 'var(--fg-2)' }}>
            The credential is only saved if this call succeeds.
          </div>
        </div>
      )}

      {result && (
        <div className="mt-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-2)] mb-2">Real Response</div>
          <div style={{ color: result.ok ? 'var(--ok)' : 'var(--bad)' }}>
            {result.status !== null ? `HTTP ${result.status}` : 'no response'}
            {result.ok
              ? ` · ${result.identity ?? 'ok'}${result.detail ? ` · ${result.detail}` : ''}`
              : ` · ${result.error ?? 'failed'}`}
          </div>
          {result.raw && (
            <pre
              className="mt-2 max-h-[240px] overflow-auto whitespace-pre-wrap break-all bg-[var(--bg-2)] px-3 py-2"
              style={{ color: 'var(--fg-2)' }}
            >
              {result.raw}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
