import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp, type PaletteAction } from '../../state'
import { SvgIcon } from '../../components/SvgIcon'

/** Subsequence match with a positional score; consecutive hits rank higher. */
function fuzzy(query: string, text: string): { hit: boolean; score: number } {
  if (!query) return { hit: true, score: 0 }
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let ti = 0
  let score = 0
  let streak = 0
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return { hit: false, score: 0 }
    if (found === ti) streak += 1
    else streak = 0
    score += streak * 4 - Math.min(found - ti, 12)
    if (found === 0) score += 8
    ti = found + 1
  }
  score -= Math.max(0, t.length - q.length) * 0.05
  return { hit: true, score }
}

export default function Palette(): React.JSX.Element | null {
  const { paletteOpen, setPaletteOpen, actions, setView } = useApp()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (paletteOpen) {
      setQuery('')
      setIndex(0)
    }
  }, [paletteOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (e.repeat) return
        setPaletteOpen(!paletteOpen)
      }
      if (e.key === 'Escape' && paletteOpen) {
        e.preventDefault()
        setPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [paletteOpen, setPaletteOpen])

  useEffect(() => window.devhub.palette.onOpen(() => setPaletteOpen(true)), [setPaletteOpen])

  const defaultNavActions: PaletteAction[] = useMemo(() => [
    { id: 'nav.mimir', label: 'Go to Mimir Intelligence Dashboard', group: 'navigation', glyph: 'activity', run: () => setView({ kind: 'agent', agentId: 'mimir' }) },
    { id: 'nav.codex', label: 'Go to Codex Agent Workspace', group: 'navigation', glyph: 'zap', run: () => setView({ kind: 'agent', agentId: 'codex' }) },
    { id: 'nav.claude', label: 'Go to Claude Code Workspace', group: 'navigation', glyph: 'square', run: () => setView({ kind: 'agent', agentId: 'claude' }) },
    { id: 'nav.antigravity', label: 'Go to Antigravity Workspace', group: 'navigation', glyph: 'diamond', run: () => setView({ kind: 'agent', agentId: 'antigravity' }) },
    { id: 'nav.github', label: 'Go to GitHub Hub', group: 'navigation', glyph: 'github', run: () => setView({ kind: 'github' }) },
    { id: 'nav.inbox', label: 'Go to Inbox & Mail Center', group: 'navigation', glyph: 'inbox', run: () => setView({ kind: 'inbox' }) },
    { id: 'nav.terminal', label: 'Go to Terminal Hub', group: 'navigation', glyph: 'terminal', run: () => setView({ kind: 'terminal' }) },
    { id: 'nav.settings', label: 'Go to Application Settings', group: 'navigation', glyph: 'settings', run: () => setView({ kind: 'settings' }) },
  ], [setView])

  const results = useMemo(() => {
    const combined = [...defaultNavActions, ...actions]
    const byId = new Map<string, typeof combined[0]>()
    for (const a of combined) {
      if (!byId.has(a.id)) byId.set(a.id, a)
    }
    const allActions = Array.from(byId.values())

    const scored = allActions
      .map((a) => {
        const best = Math.max(
          fuzzy(query, a.label).hit ? fuzzy(query, a.label).score + 6 : -Infinity,
          fuzzy(query, `${a.group} ${a.label}`).hit ? fuzzy(query, `${a.group} ${a.label}`).score : -Infinity,
          a.hint && fuzzy(query, a.hint).hit ? fuzzy(query, a.hint).score - 4 : -Infinity
        )
        return { a, score: best }
      })
      .filter((r) => r.score !== -Infinity)
    scored.sort((x, y) => y.score - x.score)
    return scored.slice(0, 60).map((r) => r.a)
  }, [actions, defaultNavActions, query])

  useEffect(() => {
    if (index >= results.length) setIndex(0)
  }, [results.length, index])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!paletteOpen) return null

  const run = (i: number): void => {
    const action = results[i]
    if (!action) return
    setPaletteOpen(false)
    void action.run()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh]"
      style={{ background: 'rgba(6,6,8,0.55)', backdropFilter: 'blur(10px)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setPaletteOpen(false)
      }}
    >
      <div className="overlay-in w-[min(680px,88vw)]">
        <input
          autoFocus
          value={query}
          spellCheck={false}
          placeholder="Type a command, agent, email, or connector…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndex((i) => Math.min(i + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              run(index)
            }
          }}
          className="w-full bg-transparent px-4 py-3 outline-none"
          style={{ fontSize: 15, caretColor: 'var(--accent)' }}
        />
        <div className="divider-x" />
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-[var(--fg-2)]">no matching action</div>
          ) : (
            results.map((a, i) => (
              <div
                key={a.id}
                data-i={i}
                onMouseEnter={() => setIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  run(i)
                }}
                className="flex cursor-pointer items-baseline gap-3 px-4 py-1.5 transition-colors duration-150"
                style={{
                  background: i === index ? 'var(--bg-2)' : 'transparent',
                  backgroundImage:
                    i === index
                      ? 'linear-gradient(to right, var(--accent) 0 2px, var(--bg-2) 2px)'
                      : undefined
                }}
              >
                <span className="w-[3ch] flex-none text-center" style={{ color: 'var(--fg-2)' }}>
                  <SvgIcon name={a.glyph ?? 'chevron-right'} />
                </span>
                <span className="truncate" style={{ color: i === index ? 'var(--fg-0)' : 'var(--fg-1)' }}>
                  {a.label}
                </span>
                {a.hint && (
                  <span className="ml-auto truncate pl-4 text-right" style={{ color: 'var(--fg-2)' }}>
                    {a.hint}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
