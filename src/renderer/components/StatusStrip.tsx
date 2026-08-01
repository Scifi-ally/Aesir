import { Dot } from './ui'
import { useApp } from '../state'
import { TerminalSquare, Mail, Link2 } from 'lucide-react'

export default function StatusStrip(): React.JSX.Element {
  const { status, setView } = useApp()
  const mail = status?.mail ?? []
  const sessions = (status?.sessions ?? []).filter((s) => s.alive)
  const connectors = status?.connectors ?? []

  return (
    <div className="flex h-8 flex-none items-center gap-6 overflow-hidden px-6 bg-[var(--bg-1)] font-sans text-xs font-medium text-[var(--fg-2)] border-t border-[#27272a]">
      
      {/* Sessions */}
      <button
        className="flex items-center gap-2 transition-colors hover:text-[var(--fg-0)]"
        onClick={() => setView({ kind: 'terminal' })}
      >
        <TerminalSquare className="w-3.5 h-3.5" />
        <span>{sessions.length > 0 ? 'Running' : 'Disconnected'}</span>
        {sessions.length > 0 && <span className="opacity-50">({sessions.length})</span>}
      </button>

      {/* Inbox */}
      {mail.map((m) => (
        <button
          key={m.accountId}
          className="flex items-center gap-2 transition-colors hover:text-[var(--fg-0)]"
          onClick={() => setView({ kind: 'inbox', accountId: m.accountId })}
        >
          <Mail className="w-3.5 h-3.5" />
          <span className="truncate max-w-[200px]">{m.email}</span>
          <span className={m.error ? 'text-[var(--bad)]' : 'text-[var(--ok)]'}>
            {m.error ? 'Error' : 'Connected'}
          </span>
          {m.unread > 0 && (
            <span className="ml-1 text-[var(--accent)] font-semibold">
              {m.unread} unread
            </span>
          )}
        </button>
      ))}

      <div className="flex-1" />

      {/* Connectors */}
      {connectors.map((c) => (
        <button
          key={c.id}
          className="flex items-center gap-2 transition-colors hover:text-[var(--fg-0)]"
          onClick={() => setView({ kind: 'connectors', focus: c.id })}
        >
          <Link2 className="w-3.5 h-3.5" />
          <span>{c.name}</span>
          <span className={c.ok === true ? 'text-[var(--ok)]' : c.ok === false ? 'text-[var(--bad)]' : 'text-[var(--warn)]'}>
            {c.ok === true ? 'Connected' : c.ok === false ? 'Disconnected' : 'Pending'}
          </span>
        </button>
      ))}
      
    </div>
  )
}
