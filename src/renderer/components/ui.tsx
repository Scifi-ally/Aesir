import type { ReactNode } from 'react'

/* Shared primitives. No component here draws a border or a box-shadow —
   surfaces are separated by background luminance and by whitespace. */

export function Divider({ vertical = false }: { vertical?: boolean }): React.JSX.Element {
  return <div className={vertical ? 'divider-y' : 'divider-x'} />
}

export function Label({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-2)] mb-2">{children}</div>
}

export function Dot({
  state
}: {
  state: 'ok' | 'bad' | 'warn' | 'idle' | 'busy'
}): React.JSX.Element {
  const color =
    state === 'ok'
      ? 'var(--ok)'
      : state === 'bad'
        ? 'var(--bad)'
        : state === 'warn'
          ? 'var(--warn)'
          : state === 'busy'
            ? 'var(--accent)'
            : 'var(--fg-2)'
  return (
    <span
      aria-hidden
      style={{
        width: 6,
        height: 6,
        borderRadius: 999,
        background: color,
        display: 'inline-block',
        flex: 'none',
        opacity: state === 'idle' ? 0.5 : 1
      }}
    />
  )
}

export function Button({
  children,
  onClick,
  kind = 'ghost',
  disabled,
  title,
  full
}: {
  children: ReactNode
  onClick?: () => void
  kind?: 'ghost' | 'accent' | 'danger'
  disabled?: boolean
  title?: string
  full?: boolean
}): React.JSX.Element {
  const base = 'px-3 py-1.5 transition-colors duration-150 disabled:opacity-40 text-left'
  const style =
    kind === 'accent'
      ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
      : kind === 'danger'
        ? { color: 'var(--bad)' }
        : { color: 'var(--fg-1)' }
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${full ? 'w-full' : ''} hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)]`}
      style={style}
    >
      {children}
    </button>
  )
}

export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  onEnter,
  autoFocus,
  mono = true
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'text' | 'password'
  onEnter?: () => void
  autoFocus?: boolean
  mono?: boolean
}): React.JSX.Element {
  return (
    <input
      type={type}
      value={value}
      autoFocus={autoFocus}
      spellCheck={false}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onEnter) onEnter()
      }}
      className={`w-full bg-[var(--bg-1)] px-3 py-2 outline-none focus:bg-[var(--bg-2)] transition-colors duration-150 ${
        mono ? '' : 'font-sans'
      }`}
    />
  )
}

export function TextArea({
  value,
  onChange,
  rows = 8,
  placeholder
}: {
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
}): React.JSX.Element {
  return (
    <textarea
      value={value}
      rows={rows}
      spellCheck={false}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full resize-none bg-[var(--bg-1)] px-3 py-2 outline-none focus:bg-[var(--bg-2)] transition-colors duration-150"
    />
  )
}

/* ── the four states every module must show ─────────────────────────────── */

export function Loading({ what }: { what: string }): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <span className="text-[var(--accent)]">
          <Ellipsis />
        </span>
        <div className="mt-2 text-[var(--fg-2)]">{what}</div>
      </div>
    </div>
  )
}

/** Text-only progress: a boxless UI cannot lean on a spinner in a card. */
function Ellipsis(): React.JSX.Element {
  return (
    <span>
      <style>{`@keyframes dots{0%{opacity:.25}50%{opacity:1}100%{opacity:.25}}
        .d1{animation:dots 1.2s infinite}.d2{animation:dots 1.2s .2s infinite}.d3{animation:dots 1.2s .4s infinite}`}</style>
      <span className="d1">·</span>
      <span className="d2">·</span>
      <span className="d3">·</span>
    </span>
  )
}

export function Empty({
  title,
  hint,
  action
}: {
  title: string
  hint?: string
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center px-8">
      <div className="max-w-[52ch] text-center">
        <div className="text-[var(--fg-1)]">{title}</div>
        {hint && <div className="mt-2 text-[var(--fg-2)]">{hint}</div>}
        {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
      </div>
    </div>
  )
}

export function ErrorState({
  title,
  detail,
  retry
}: {
  title: string
  detail?: string | null
  retry?: () => void
}): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center px-8">
      <div className="max-w-[70ch]">
        <div style={{ color: 'var(--bad)' }}>{title}</div>
        {detail && (
          <pre className="mt-2 whitespace-pre-wrap break-words text-[var(--fg-2)]">{detail}</pre>
        )}
        {retry && (
          <div className="mt-3">
            <Button onClick={retry}>retry</Button>
          </div>
        )}
      </div>
    </div>
  )
}

export function InlineError({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="px-3 py-2" style={{ background: 'var(--bg-1)', color: 'var(--bad)' }}>
      {message}
    </div>
  )
}

export function Row({
  active,
  onClick,
  children,
  title
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  title?: string
}): React.JSX.Element {
  return (
    <div
      title={title}
      onClick={onClick}
      className={`cursor-pointer px-3 py-2 transition-colors duration-150 ${
        active ? 'bg-[var(--bg-2)]' : 'hover:bg-[var(--bg-1)]'
      }`}
      style={
        active
          ? {
              // the 2px accent edge is painted, not outlined
              backgroundImage: 'linear-gradient(to right, var(--accent) 0 2px, transparent 2px)'
            }
          : undefined
      }
    >
      {children}
    </div>
  )
}

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}
