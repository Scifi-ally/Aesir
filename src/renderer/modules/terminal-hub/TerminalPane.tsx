import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { PtySession } from '@shared/types'

/**
 * One xterm instance bound to one live pty in the main process.
 * Output arrives via the pty:data event; keystrokes go back over pty:write.
 */
export default function TerminalPane({
  session,
  focused,
  onFocus,
  onExit
}: {
  session: PtySession
  focused: boolean
  onFocus: () => void
  onExit: (code: number) => void
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const [exited, setExited] = useState<number | null>(session.exit?.code ?? null)
  const [showSearch, setShowSearch] = useState(false)
  const [needle, setNeedle] = useState('')

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      fontFamily: "'JetBrains Mono','IBM Plex Mono','Cascadia Mono',Consolas,ui-monospace,monospace",
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorInactiveStyle: 'none',
      // spec: terminal cursor blinks at 530ms — xterm's built-in interval
      scrollback: 10000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      theme: {
        background: '#0a0a0b',
        foreground: '#e7e7ea',
        cursor: getAccent(),
        cursorAccent: '#0a0a0b',
        selectionBackground: '#2a2a33',
        black: '#0a0a0b',
        red: '#f0563e',
        green: '#3ef07a',
        yellow: '#f0b93e',
        blue: '#1d9bf0',
        magenta: '#c78bf7',
        cyan: '#4dd0e1',
        white: '#e7e7ea',
        brightBlack: '#63636d',
        brightRed: '#ff7b66',
        brightGreen: '#6cf79a',
        brightYellow: '#ffd27a',
        brightBlue: '#5ab8f7',
        brightMagenta: '#dcaeff',
        brightCyan: '#7de5f2',
        brightWhite: '#ffffff'
      }
    })

    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    term.loadAddon(
      new WebLinksAddon((_e, uri) => {
        void window.devhub.app.openExternal(uri).catch(() => undefined)
      })
    )
    term.open(host)
    termRef.current = term
    fitRef.current = fit
    searchRef.current = search

    try {
      fit.fit()
      void window.devhub.pty.resize(session.id, term.cols, term.rows)
    } catch {
      /* host has no size yet; the ResizeObserver below will retry */
    }

    const offData = window.devhub.pty.onData(({ id, data }) => {
      if (id === session.id) term.write(data)
    })
    const offExit = window.devhub.pty.onExit(({ id, code }) => {
      if (id !== session.id) return
      setExited(code)
      term.write(`\r\n\x1b[38;5;242m── process exited (code ${code}) ──\x1b[0m\r\n`)
      onExit(code)
    })

    const dataSub = term.onData((d) => {
      void window.devhub.pty.write(session.id, d).catch(() => undefined)
    })

    // ctrl/cmd+F opens in-pane search; ctrl+shift+C copies the selection
    const keySub = term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'f') {
        setShowSearch(true)
        return false
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'c') {
        const sel = term.getSelection()
        if (sel) void navigator.clipboard.writeText(sel)
        return false
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'v') {
        void navigator.clipboard.readText().then((t) => {
          if (t) void window.devhub.pty.write(session.id, t)
        })
        return false
      }
      return true
    })
    void keySub

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        void window.devhub.pty.resize(session.id, term.cols, term.rows)
      } catch {
        /* zero-size during layout transitions is expected */
      }
    })
    ro.observe(host)

    return () => {
      ro.disconnect()
      dataSub.dispose()
      offData()
      offExit()
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  useEffect(() => {
    if (focused) termRef.current?.focus()
  }, [focused])

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden bg-[var(--bg-0)]"
      onMouseDown={onFocus}
      style={{
        backgroundImage: focused
          ? 'linear-gradient(to bottom, var(--accent) 0 1px, transparent 1px)'
          : 'none'
      }}
    >
      {showSearch && (
        <div className="flex items-center gap-2 bg-[var(--bg-1)] px-2 py-1">
          <span style={{ color: 'var(--fg-2)' }}>/</span>
          <input
            autoFocus
            value={needle}
            spellCheck={false}
            placeholder="find in scrollback"
            onChange={(e) => {
              setNeedle(e.target.value)
              if (e.target.value) searchRef.current?.findNext(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') searchRef.current?.findNext(needle)
              if (e.key === 'Escape') {
                setShowSearch(false)
                searchRef.current?.clearDecorations()
                termRef.current?.focus()
              }
            }}
            className="flex-1 bg-transparent outline-none"
          />
          <button
            onClick={() => searchRef.current?.findPrevious(needle)}
            style={{ color: 'var(--fg-2)' }}
          >
            ↑
          </button>
          <button onClick={() => searchRef.current?.findNext(needle)} style={{ color: 'var(--fg-2)' }}>
            ↓
          </button>
          <button
            onClick={() => {
              setShowSearch(false)
              termRef.current?.focus()
            }}
            style={{ color: 'var(--fg-2)' }}
          >
            ×
          </button>
        </div>
      )}
      <div ref={hostRef} className="min-h-0 flex-1" />
      {exited !== null && (
        <div
          className="px-3 py-1"
          style={{ background: 'var(--bg-1)', color: exited === 0 ? 'var(--fg-2)' : 'var(--bad)' }}
        >
          exited with code {exited} · close this pane or open a new session
        </div>
      )}
    </div>
  )
}

function getAccent(): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1d9bf0'
  )
}
