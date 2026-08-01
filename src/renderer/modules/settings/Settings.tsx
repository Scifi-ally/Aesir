import { useCallback, useEffect, useState } from 'react'
import type { AccentName, LogEntry, SavedCommand, VaultEntry } from '@shared/types'
import { Button, Dot, Input, Label, Loading, Row, timeAgo } from '../../components/ui'
import { useApp, usePaletteActions } from '../../state'
import Connectors from '../connectors/Connectors'

type Section = 'general' | 'vault' | 'connections' | 'logs'
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'general', label: 'general' },
  { id: 'vault', label: 'credential vault' },
  { id: 'connections', label: 'connections' },
  { id: 'logs', label: 'activity log' }
]

export default function Settings(): React.JSX.Element {
  const { view, setView } = useApp()
  const [section, setSection] = useState<Section>('general')

  useEffect(() => {
    if (view.kind === 'settings' && view.section) setSection(view.section)
  }, [view])

  usePaletteActions(
    () =>
      SECTIONS.map((s) => ({
        id: `settings.${s.id}`,
        label: `Settings — ${s.label}`,
        group: 'settings',
        glyph: '⚙',
        run: () => {
          setView({ kind: 'settings', section: s.id })
          setSection(s.id)
        }
      })),
    [setView]
  )

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[200px] flex-none overflow-y-auto bg-[var(--bg-1)] py-4 border-r border-[#27272a]">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-2)] px-4 mb-2">Settings</div>
        {SECTIONS.map((s) => (
          <Row key={s.id} active={section === s.id} onClick={() => setSection(s.id)}>
            <span style={{ color: section === s.id ? 'var(--fg-0)' : 'var(--fg-1)' }}>{s.label}</span>
          </Row>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto bg-[var(--bg-0)]">
        {section === 'general' && <General />}
        {section === 'vault' && <Vault />}
        {section === 'connections' && <Connectors />}
        {section === 'logs' && <Logs />}
      </div>
    </div>
  )
}

/* ── general ────────────────────────────────────────────────────────────── */

const ACCENTS: { id: AccentName; swatch: string; label: string }[] = [
  { id: 'blue', swatch: '#1d9bf0', label: 'twitter blue' },
  { id: 'green', swatch: '#3ef07a', label: 'green' },
  { id: 'amber', swatch: '#f0b93e', label: 'amber' },
  { id: 'cyan', swatch: '#4dd0e1', label: 'cyan' },
  { id: 'violet', swatch: '#a855f7', label: 'violet' }
]

function General(): React.JSX.Element {
  const { settings, setSettings, toast } = useApp()
  const [info, setInfo] = useState<{
    platform: string
    versions: { electron: string; node: string; chrome: string; app: string }
    userData: string
    home: string
  } | null>(null)
  const [commands, setCommands] = useState<SavedCommand[]>([])
  const [label, setLabel] = useState('')
  const [line, setLine] = useState('')

  const loadCommands = useCallback(() => {
    window.devhub.commands.list().then(setCommands).catch(() => undefined)
  }, [])

  useEffect(() => {
    window.devhub.app.info().then(setInfo).catch(() => undefined)
    loadCommands()
  }, [loadCommands])

  if (!settings) return <Loading what="loading settings" />

  const addCommand = (): void => {
    const argv = line.trim().split(/\s+/).filter(Boolean)
    if (!label.trim() || argv.length === 0) return
    window.devhub.commands
      .save({ id: `${Date.now()}`, label: label.trim(), argv, cwd: settings.defaultCwd })
      .then(() => {
        setLabel('')
        setLine('')
        loadCommands()
      })
      .catch((e: Error) => toast(e.message, 'error'))
  }

  return (
    <div className="max-w-[80ch] px-6 py-5">
      <Label>accent</Label>
      <div className="flex gap-1">
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            onClick={() => void setSettings({ accent: a.id })}
            className="flex items-center gap-2 px-3 py-1.5 transition-colors duration-150 hover:bg-[var(--bg-2)]"
            style={{
              color: settings.accent === a.id ? 'var(--fg-0)' : 'var(--fg-2)',
              background: settings.accent === a.id ? 'var(--bg-2)' : 'transparent'
            }}
          >
            <span
              style={{ width: 8, height: 8, borderRadius: 999, background: a.swatch, display: 'inline-block' }}
            />
            {a.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <Label>default working directory</Label>
        <div className="flex items-center gap-2">
          <span className="truncate" style={{ color: 'var(--fg-1)' }}>
            {settings.defaultCwd ?? info?.home ?? '(home)'}
          </span>
          <Button
            onClick={() =>
              void window.devhub.app.pickDirectory().then((d) => {
                if (d) void setSettings({ defaultCwd: d })
              })
            }
          >
            choose…
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <Label>shell for plain terminal sessions</Label>
        <Input
          value={settings.shellPath ?? ''}
          onChange={(v) => void setSettings({ shellPath: v.trim() || null })}
          placeholder="auto-detected (pwsh → powershell → cmd)"
        />
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <Label>behaviour</Label>
        <Toggle
          on={settings.globalPalette}
          label="global Ctrl+K — opens the palette while DevHub is in the background"
          onChange={(v) => void setSettings({ globalPalette: v })}
        />
        <Toggle
          on={settings.notifications}
          label="desktop notifications for new mail and finished agent sessions"
          onChange={(v) => void setSettings({ notifications: v })}
        />
        <Toggle
          on={settings.blockRemoteImages}
          label="block remote images in email until asked"
          onChange={(v) => void setSettings({ blockRemoteImages: v })}
        />
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--fg-1)' }}>mail poll interval</span>
          <input
            type="number"
            min={30}
            max={3600}
            value={settings.mailPollSeconds}
            onChange={(e) => void setSettings({ mailPollSeconds: Number(e.target.value) || 90 })}
            className="w-24 bg-[var(--bg-2)] px-2 py-1 outline-none"
          />
          <span style={{ color: 'var(--fg-2)' }}>seconds</span>
        </div>
      </div>

      <div className="mt-6">
        <Label>saved commands — runnable from the palette</Label>
        {commands.length === 0 ? (
          <div style={{ color: 'var(--fg-2)' }}>none saved yet</div>
        ) : (
          commands.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-1">
              <span style={{ color: 'var(--fg-1)' }}>{c.label}</span>
              <code className="truncate" style={{ color: 'var(--fg-2)' }}>
                {c.argv.join(' ')}
              </code>
              <button
                className="ml-auto"
                style={{ color: 'var(--bad)' }}
                onClick={() => void window.devhub.commands.remove(c.id).then(loadCommands)}
              >
                remove
              </button>
            </div>
          ))
        )}
        <div className="mt-2 flex gap-2">
          <div className="w-[24ch]">
            <Input value={label} onChange={setLabel} placeholder="label" />
          </div>
          <div className="flex-1">
            <Input value={line} onChange={setLine} placeholder="git status --short" onEnter={addCommand} />
          </div>
          <Button kind="accent" onClick={addCommand}>
            add
          </Button>
        </div>
        <div className="mt-1" style={{ color: 'var(--fg-2)' }}>
          Split on whitespace into an argv array — nothing is passed through a shell string.
        </div>
      </div>

      {info && (
        <div className="mt-8" style={{ color: 'var(--fg-2)' }}>
          DevHub {info.versions.app} · Electron {info.versions.electron} · Node {info.versions.node} ·
          Chromium {info.versions.chrome} · {info.platform}
          <div className="mt-1 break-all">data: {info.userData}</div>
        </div>
      )}
    </div>
  )
}

function Toggle({
  on,
  label,
  onChange
}: {
  on: boolean
  label: string
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <button
      onClick={() => onChange(!on)}
      className="flex items-center gap-2 py-0.5 text-left transition-colors duration-150"
      style={{ color: on ? 'var(--fg-1)' : 'var(--fg-2)' }}
    >
      <span style={{ color: on ? 'var(--accent)' : 'var(--fg-2)' }}>{on ? '[x]' : '[ ]'}</span>
      {label}
    </button>
  )
}

/* ── vault ──────────────────────────────────────────────────────────────── */

function Vault(): React.JSX.Element {
  const { toast } = useApp()
  const [entries, setEntries] = useState<VaultEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    window.devhub.vault
      .list()
      .then(setEntries)
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(load, [load])

  if (error)
    return (
      <div className="px-6 py-5" style={{ color: 'var(--bad)' }}>
        {error}
      </div>
    )
  if (!entries) return <Loading what="reading the encrypted vault" />

  return (
    <div className="max-w-[90ch] px-6 py-5">
      <div style={{ color: 'var(--fg-0)' }}>credential vault</div>
      <p className="mt-1" style={{ color: 'var(--fg-2)' }}>
        Every secret DevHub holds, encrypted at rest by the OS (DPAPI on Windows, Keychain on macOS,
        libsecret on Linux). Values are never shown in full and never touch SQLite.
      </p>
      {entries.length === 0 ? (
        <div className="mt-6" style={{ color: 'var(--fg-2)' }}>
          nothing stored yet
        </div>
      ) : (
        <div className="mt-4 flex flex-col">
          {entries.map((e) => (
            <div key={e.key} className="flex items-baseline gap-3 py-1.5">
              <Dot state="ok" />
              <span className="w-[16ch] flex-none" style={{ color: 'var(--fg-2)' }}>
                {e.kind}
              </span>
              <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--fg-1)' }} title={e.key}>
                {e.label}
              </span>
              <code className="w-[24ch] flex-none truncate" style={{ color: 'var(--fg-2)' }}>
                {e.masked}
              </code>
              <span className="w-[6ch] flex-none" style={{ color: 'var(--fg-2)' }}>
                {e.createdAt ? timeAgo(e.createdAt) : ''}
              </span>
              <button
                style={{ color: 'var(--bad)' }}
                onClick={() =>
                  window.devhub.vault
                    .remove(e.key)
                    .then(() => {
                      toast(`removed ${e.label}`)
                      load()
                    })
                    .catch((err: Error) => toast(err.message, 'error'))
                }
              >
                remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── logs ───────────────────────────────────────────────────────────────── */

function Logs(): React.JSX.Element {
  const [logs, setLogs] = useState<LogEntry[] | null>(null)

  const load = useCallback(() => {
    window.devhub.logs.recent(300).then(setLogs).catch(() => setLogs([]))
  }, [])

  useEffect(load, [load])
  if (!logs) return <Loading what="reading the activity log" />

  return (
    <div className="px-6 py-5">
      <div className="flex items-baseline gap-3">
        <span style={{ color: 'var(--fg-0)' }}>activity log</span>
        <Button onClick={load}>refresh</Button>
        <Button
          kind="danger"
          onClick={() => void window.devhub.logs.clear().then(() => setLogs([]))}
        >
          clear
        </Button>
      </div>
      {logs.length === 0 ? (
        <div className="mt-4" style={{ color: 'var(--fg-2)' }}>
          nothing logged yet
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-0.5">
          {logs.map((l) => (
            <div key={l.id} className="flex gap-3">
              <span className="flex-none" style={{ color: 'var(--fg-2)' }}>
                {new Date(l.ts).toLocaleTimeString()}
              </span>
              <span
                className="w-[5ch] flex-none"
                style={{
                  color:
                    l.level === 'error' ? 'var(--bad)' : l.level === 'warn' ? 'var(--warn)' : 'var(--fg-2)'
                }}
              >
                {l.level}
              </span>
              <span className="w-[12ch] flex-none" style={{ color: 'var(--fg-2)' }}>
                {l.source}
              </span>
              <span className="min-w-0 flex-1 break-words" style={{ color: 'var(--fg-1)' }}>
                {l.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
