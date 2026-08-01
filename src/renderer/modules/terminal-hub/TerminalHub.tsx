import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentInfo, PaneNode, PtySession, SavedCommand, TerminalLayout } from '@shared/types'
import { Button } from '../../components/ui'
import { useApp, usePaletteActions } from '../../state'
import ConfigEditor from './ConfigEditor'
import TerminalPane from './TerminalPane'
import { collectSessionIds, cyclePane, leaf, removePane, splitPane } from './panes'
import { TerminalSquare, Bot, Zap, Code, Search, Plus, Columns, Rows } from 'lucide-react'
import AgentSetupBar from '../../components/AgentSetupBar'

const uid = (): string => Math.random().toString(36).slice(2, 10)

export default function TerminalHub(): React.JSX.Element {
  const { settings, toast, view, setView, refreshAgents, agents, setPaletteOpen } = useApp()
  const [layout, setLayout] = useState<TerminalLayout>({ tabs: [], activeTabId: null })
  const [sessions, setSessions] = useState<Record<string, PtySession>>({})
  const [stale, setStale] = useState<Record<string, PtySession>>({})
  const [cwd, setCwd] = useState<string>('')
  const [configAgent, setConfigAgent] = useState<AgentInfo | null>(null)
  const [savedCmds, setSavedCmds] = useState<SavedCommand[]>([])
  const [ready, setReady] = useState(false)
  const saveTimer = useRef<number | null>(null)

  const activeAgentId = view.kind === 'agent' ? view.agentId : null

  /* ── boot: live sessions, saved layout, restorable rows ─────────────── */
  useEffect(() => {
    void (async () => {
      try {
        const [live, restorable, saved] = await Promise.all([
          window.devhub.pty.list(),
          window.devhub.pty.restorable(),
          window.devhub.layout.get()
        ])
        setSessions(Object.fromEntries(live.map((s) => [s.id, s])))
        setStale(Object.fromEntries(restorable.map((s) => [s.id, s])))
        if (saved && saved.tabs.length) setLayout(saved)
      } catch (e) {
        toast(`could not restore terminal layout: ${(e as Error).message}`, 'error')
      } finally {
        setReady(true)
      }
    })()
  }, [toast])

  useEffect(() => {
    if (settings?.defaultCwd && !cwd) setCwd(settings.defaultCwd)
  }, [settings, cwd])

  /* saved commands feed the palette; the palette itself knows nothing about them */
  useEffect(() => {
    window.devhub.commands.list().then(setSavedCmds).catch(() => undefined)
  }, [view.kind])

  /* ── global events from TopNav ──────────────────────────────────────── */
  useEffect(() => {
    const onInstall = (e: Event) => {
      const agentId = (e as CustomEvent<string>).detail
      const agent = agents.find((a) => a.id === agentId)
      if (!agent) return
      
      window.devhub.agents
        .install(agent.id)
        .then((s) => {
          setSessions((prev) => ({ ...prev, [s.id]: s }))
          const tabId = uid()
          setLayout((l) => ({
            activeTabId: tabId,
            tabs: [...l.tabs, { id: tabId, title: s.title, root: leaf(s.id), activeSessionId: s.id, agentId: agent.id }]
          }))
          toast('installer running — watch the terminal for its real output')
        })
        .catch((err: Error) => toast(err.message, 'error'))
    }

    const onConfig = (e: Event) => {
      const agent = (e as CustomEvent<AgentInfo>).detail
      setView({ kind: 'terminal' })
      setConfigAgent(agent)
    }

    window.addEventListener('devhub:install-agent', onInstall)
    window.addEventListener('devhub:edit-config', onConfig)

    return () => {
      window.removeEventListener('devhub:install-agent', onInstall)
      window.removeEventListener('devhub:edit-config', onConfig)
    }
  }, [agents, setView, toast])

  /* ── persist layout (debounced) ─────────────────────────────────────── */
  useEffect(() => {
    if (!ready) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void window.devhub.layout.save(layout).catch(() => undefined)
    }, 300)
  }, [layout, ready])

  useEffect(() => {
    return window.devhub.pty.onExit(({ id, code }) => {
      setSessions((prev) => {
        const s = prev[id]
        if (!s) return prev
        return { ...prev, [id]: { ...s, exit: { code, at: Date.now() } } }
      })
    })
  }, [])

  const activeTab = layout.tabs.find((t) => t.id === layout.activeTabId) ?? null

  const patchTab = useCallback(
    (tabId: string, fn: (t: TerminalLayout['tabs'][number]) => TerminalLayout['tabs'][number]) => {
      setLayout((l) => ({ ...l, tabs: l.tabs.map((t) => (t.id === tabId ? fn(t) : t)) }))
    },
    []
  )

  const spawn = useCallback(
    async (opts: { agentId?: AgentInfo['id']; title?: string; useCwd?: string }) => {
      const target = opts.useCwd || cwd || settings?.defaultCwd || ''
      const s = await window.devhub.pty.create({
        cwd: target,
        agentId: opts.agentId ?? null,
        title: opts.title,
        purpose: opts.agentId ? 'agent' : 'shell'
      })
      setSessions((prev) => ({ ...prev, [s.id]: s }))
      return s
    },
    [cwd, settings]
  )

  const newTab = useCallback(
    async (opts: { agentId?: AgentInfo['id']; title?: string } = {}) => {
      try {
        const targetAgent = opts.agentId ?? activeAgentId
        const s = await spawn({ agentId: targetAgent ?? undefined, title: opts.title })
        const tabId = uid()
        setLayout((l) => ({
          activeTabId: tabId,
          tabs: [
            ...l.tabs,
            { id: tabId, title: s.title, root: leaf(s.id), activeSessionId: s.id, agentId: targetAgent }
          ]
        }))
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    },
    [spawn, toast]
  )

  const split = useCallback(
    async (dir: 'h' | 'v') => {
      if (!activeTab?.root || !activeTab.activeSessionId) return void newTab()
      try {
        const s = await spawn({})
        patchTab(activeTab.id, (t) => ({
          ...t,
          root: splitPane(t.root as PaneNode, t.activeSessionId as string, dir, s.id),
          activeSessionId: s.id
        }))
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    },
    [activeTab, newTab, patchTab, spawn, toast]
  )

  const closePane = useCallback(
    (sessionId: string) => {
      void window.devhub.pty.kill(sessionId).catch(() => undefined)
      setSessions((prev) => {
        const next = { ...prev }
        delete next[sessionId]
        return next
      })
      setStale((prev) => {
        const next = { ...prev }
        delete next[sessionId]
        return next
      })
      setLayout((l) => {
        const tabs = l.tabs
          .map((t) => {
            const root = removePane(t.root, sessionId)
            const ids = collectSessionIds(root)
            return {
              ...t,
              root,
              activeSessionId: ids.includes(t.activeSessionId ?? '') ? t.activeSessionId : (ids[0] ?? null)
            }
          })
          .filter((t) => t.root !== null)
        const activeTabId = tabs.some((t) => t.id === l.activeTabId)
          ? l.activeTabId
          : (tabs[tabs.length - 1]?.id ?? null)
        return { tabs, activeTabId }
      })
    },
    []
  )

  const closeTab = useCallback(
    (tabId: string) => {
      const tab = layout.tabs.find((t) => t.id === tabId)
      for (const id of collectSessionIds(tab?.root ?? null)) {
        void window.devhub.pty.kill(id).catch(() => undefined)
      }
      setLayout((l) => {
        const tabs = l.tabs.filter((t) => t.id !== tabId)
        return {
          tabs,
          activeTabId: l.activeTabId === tabId ? (tabs[tabs.length - 1]?.id ?? null) : l.activeTabId
        }
      })
    },
    [layout.tabs]
  )

  /** Restart a pane whose process died with the previous app run. */
  const reattach = useCallback(
    async (oldId: string) => {
      const meta = stale[oldId]
      if (!meta) return
      try {
        const s = await window.devhub.pty.create({
          cwd: meta.cwd,
          agentId: meta.agentId,
          argv: meta.agentId ? null : meta.argv,
          title: meta.title,
          purpose: meta.purpose
        })
        setSessions((prev) => ({ ...prev, [s.id]: s }))
        setStale((prev) => {
          const next = { ...prev }
          delete next[oldId]
          return next
        })
        setLayout((l) => ({
          ...l,
          tabs: l.tabs.map((t) => ({
            ...t,
            root: replaceLeaf(t.root, oldId, s.id),
            activeSessionId: t.activeSessionId === oldId ? s.id : t.activeSessionId
          }))
        }))
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    },
    [stale, toast]
  )

  const launchAgent = useCallback(
    (agent: AgentInfo) => {
      if (!agent.installed) return toast('install this agent first', 'error')
      setView({ kind: 'agent', agentId: agent.id })
    },
    [setView, toast]
  )

  /** Runs a saved command as its own tab — argv array, never a shell string. */
  const runSaved = useCallback(
    async (c: SavedCommand) => {
      try {
        const s = await window.devhub.pty.create({
          cwd: c.cwd || cwd || settings?.defaultCwd || '',
          argv: c.argv,
          title: c.label,
          purpose: 'shell'
        })
        setSessions((prev) => ({ ...prev, [s.id]: s }))
        const tabId = uid()
        setLayout((l) => ({
          activeTabId: tabId,
          tabs: [...l.tabs, { id: tabId, title: s.title, root: leaf(s.id), activeSessionId: s.id, agentId: null }]
        }))
        setView({ kind: 'terminal' })
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    },
    [cwd, settings, setView, toast]
  )

  /* ── keyboard: tmux-ish bindings ────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return
      const k = e.key.toLowerCase()
      if (k === 'd') {
        e.preventDefault()
        void split('h')
      } else if (k === 'e') {
        e.preventDefault()
        void split('v')
      } else if (k === 't') {
        e.preventDefault()
        void newTab()
      } else if (k === 'w' && activeTab?.activeSessionId) {
        e.preventDefault()
        closePane(activeTab.activeSessionId)
      } else if (k === 'arrowright' || k === 'arrowleft') {
        e.preventDefault()
        if (!activeTab) return
        const next = cyclePane(activeTab.root, activeTab.activeSessionId, k === 'arrowright' ? 1 : -1)
        if (next) patchTab(activeTab.id, (t) => ({ ...t, activeSessionId: next }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTab, closePane, newTab, patchTab, split])

  /* ── palette actions ────────────────────────────────────────────────── */
  usePaletteActions(
    () => [
      {
        id: 'term.new',
        label: 'New terminal tab',
        hint: 'Ctrl+Shift+T',
        group: 'terminal',
        glyph: '▊',
        run: () => void newTab()
      },
      {
        id: 'term.split.h',
        label: 'Split pane — side by side',
        hint: 'Ctrl+Shift+D',
        group: 'terminal',
        glyph: '▊',
        run: () => void split('h')
      },
      {
        id: 'term.split.v',
        label: 'Split pane — stacked',
        hint: 'Ctrl+Shift+E',
        group: 'terminal',
        glyph: '▊',
        run: () => void split('v')
      },
      {
        id: 'term.cwd',
        label: 'Choose working directory',
        group: 'terminal',
        glyph: '▊',
        run: async () => {
          const dir = await window.devhub.app.pickDirectory()
          if (dir) setCwd(dir)
        }
      },
      {
        id: 'agents.refresh',
        label: 'Re-detect installed agents',
        group: 'agents',
        glyph: '↻',
        run: () => void refreshAgents(true)
      },
      ...agents
        .filter((a) => a.binPath)
        .map((a) => ({
          id: `agents.launch.${a.id}`,
          label: `Launch ${a.name}`,
          hint: cwd,
          group: 'agents',
          glyph: '▶',
          run: () => launchAgent(a)
        })),
      ...agents
        .filter((a) => a.appPath)
        .map((a) => ({
          id: `agents.app.${a.id}`,
          label: `Open ${a.name} desktop app`,
          group: 'agents',
          glyph: '▶',
          run: () =>
            void window.devhub.agents
              .launchApp(a.id)
              .then((r) => toast(`launched ${r.launched}`))
              .catch((e: Error) => toast(e.message, 'error'))
        })),
      ...agents
        .filter((a) => a.configPath)
        .map((a) => ({
          id: `agents.config.${a.id}`,
          label: `Edit ${a.name} config`,
          hint: a.configPath ?? undefined,
          group: 'agents',
          glyph: '⚙',
          run: () => {
            setView({ kind: 'terminal' })
            setConfigAgent(a)
          }
        })),
      ...savedCmds.map((c) => ({
        id: `cmd.${c.id}`,
        label: c.label,
        hint: c.argv.join(' '),
        group: 'commands',
        glyph: '›',
        run: () => void runSaved(c)
      }))
    ],
    [agents, cwd, launchAgent, newTab, refreshAgents, runSaved, savedCmds, setView, split, toast]
  )

  const visibleTabs = useMemo(() => layout.tabs.filter(t => t.agentId === activeAgentId), [layout.tabs, activeAgentId])
  const activeTabInView = visibleTabs.some(t => t.id === layout.activeTabId) ? layout.activeTabId : (visibleTabs[visibleTabs.length - 1]?.id ?? null)

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col bg-transparent">
        {configAgent ? (
          <ConfigEditor
            agentId={configAgent.id}
            name={configAgent.name}
            onClose={() => setConfigAgent(null)}
          />
        ) : (
          <>
            <div className="flex flex-none items-center gap-1 px-4 overflow-x-auto bg-transparent no-scrollbar border-b border-[#27272a]/50">
              {visibleTabs.map((t) => {
                const active = t.id === activeTabInView
                return (
                  <div
                    key={t.id}
                    onMouseDown={() => setLayout((l) => ({ ...l, activeTabId: t.id }))}
                    className={`group relative flex cursor-pointer items-center gap-2 px-3 py-2 text-[12px] font-sans transition-colors duration-200 outline-none flex-shrink-0 whitespace-nowrap ${
                      active
                        ? 'text-[var(--fg-0)] bg-[var(--bg-1)]'
                        : 'text-[var(--fg-2)] hover:text-[var(--fg-1)] hover:bg-white/5'
                    }`}
                  >
                    {active && <div className="absolute top-0 left-0 right-0 h-px bg-[var(--accent)]" />}
                    <span className="max-w-[22ch] truncate font-medium">{t.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        closeTab(t.id)
                      }}
                      className={`flex h-4 w-4 items-center justify-center rounded transition-all duration-150 ${active ? 'opacity-100 hover:bg-white/10' : 'opacity-0 group-hover:opacity-100 hover:bg-white/10'}`}
                      title="Close Tab"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
                    </button>
                  </div>
                )
              })}
              <button
                onClick={() => void newTab()}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[#98989f] transition-all duration-150 hover:bg-white/5 hover:text-[var(--fg-0)] ml-1 flex-shrink-0"
                title="New Tab — Ctrl+Shift+T"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.5"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>
              </button>
              <div className="flex-1" />
              {activeTabInView && (
                <div className="flex flex-none items-center gap-1 pr-2">
                  <button
                    onClick={() => void split('h')}
                    title="split side by side — Ctrl+Shift+D"
                    className="p-1.5 text-[var(--fg-2)] transition-colors hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] rounded"
                  >
                    <Columns className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => void split('v')}
                    title="split stacked — Ctrl+Shift+E"
                    className="p-1.5 text-[var(--fg-2)] transition-colors hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] rounded"
                  >
                    <Rows className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1">
              {visibleTabs.length === 0 ? (
                <WorkspaceEmptyState 
                  onNewTab={() => void newTab()} 
                  onOpenPalette={() => setPaletteOpen(true)} 
                />
              ) : (
                visibleTabs.map((tab) => {
                  const visible = tab.id === activeTabInView
                  return (
                    <div
                      key={tab.id}
                      className="h-full w-full"
                      style={{ display: visible ? 'block' : 'none' }}
                    >
                      {tab.root ? (
                        <PaneTree
                          node={tab.root}
                          path=""
                          sessions={sessions}
                          stale={stale}
                          activeId={tab.activeSessionId}
                          onFocus={(id) => patchTab(tab.id, (t) => ({ ...t, activeSessionId: id }))}
                          onClose={closePane}
                          onReattach={reattach}
                          onRatio={(p, r) =>
                            patchTab(tab.id, (t) => ({ ...t, root: setRatioAt(t.root as PaneNode, p, r) }))
                          }
                        />
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ── recursive pane rendering with draggable splitters ──────────────────── */

function PaneTree({
  node,
  path,
  sessions,
  stale,
  activeId,
  onFocus,
  onClose,
  onReattach,
  onRatio
}: {
  node: PaneNode
  path: string
  sessions: Record<string, PtySession>
  stale: Record<string, PtySession>
  activeId: string | null
  onFocus: (id: string) => void
  onClose: (id: string) => void
  onReattach: (id: string) => void
  onRatio: (path: string, ratio: number) => void
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  if (node.type === 'leaf') {
    const live = sessions[node.sessionId]
    if (live) {
      return (
        <div className="relative h-full w-full">
          <TerminalPane
            session={live}
            focused={activeId === node.sessionId}
            onFocus={() => onFocus(node.sessionId)}
            onExit={() => undefined}
          />
          <button
            onClick={() => onClose(node.sessionId)}
            title="close pane — Ctrl+Shift+W"
            className="absolute right-1 top-1 px-1 opacity-0 transition-opacity duration-150 hover:opacity-100"
            style={{ color: 'var(--fg-2)' }}
          >
            ×
          </button>
        </div>
      )
    }

    const old = stale[node.sessionId]
    return (
      <div className="flex h-full w-full items-center justify-center px-6 text-center">
        <div>
          <div style={{ color: 'var(--fg-1)' }}>
            {old ? old.title : 'session'} ended when DevHub last closed
          </div>
          <div className="mt-1" style={{ color: 'var(--fg-2)' }}>
            {old
              ? `a real OS process cannot survive an app restart — reattach starts a fresh ${old.agentId ?? 'shell'} in ${old.cwd}`
              : 'this pane has no process'}
          </div>
          <div className="mt-3 flex justify-center gap-2">
            {old && (
              <Button kind="accent" onClick={() => onReattach(node.sessionId)}>
                reattach fresh session
              </Button>
            )}
            <Button onClick={() => onClose(node.sessionId)}>remove pane</Button>
          </div>
        </div>
      </div>
    )
  }

  const horizontal = node.dir === 'h'
  const startDrag = (e: React.MouseEvent): void => {
    e.preventDefault()
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const move = (ev: MouseEvent): void => {
      const ratio = horizontal
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height
      onRatio(path, ratio)
    }
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize'
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full"
      style={{ flexDirection: horizontal ? 'row' : 'column' }}
    >
      <div style={{ flex: `${node.ratio} 1 0`, minWidth: 0, minHeight: 0 }}>
        <PaneTree
          node={node.a}
          path={`${path}a`}
          sessions={sessions}
          stale={stale}
          activeId={activeId}
          onFocus={onFocus}
          onClose={onClose}
          onReattach={onReattach}
          onRatio={onRatio}
        />
      </div>
      <div
        onMouseDown={startDrag}
        className="flex flex-none items-stretch justify-center"
        style={{
          width: horizontal ? 5 : undefined,
          height: horizontal ? undefined : 5,
          cursor: horizontal ? 'col-resize' : 'row-resize'
        }}
      >
        <div className={horizontal ? 'divider-y' : 'divider-x'} style={{ margin: 'auto' }} />
      </div>
      <div style={{ flex: `${1 - node.ratio} 1 0`, minWidth: 0, minHeight: 0 }}>
        <PaneTree
          node={node.b}
          path={`${path}b`}
          sessions={sessions}
          stale={stale}
          activeId={activeId}
          onFocus={onFocus}
          onClose={onClose}
          onReattach={onReattach}
          onRatio={onRatio}
        />
      </div>
    </div>
  )
}

function setRatioAt(node: PaneNode, path: string, ratio: number): PaneNode {
  const walk = (n: PaneNode, cur: string): PaneNode => {
    if (n.type === 'leaf') return n
    if (cur === path) return { ...n, ratio: Math.max(0.12, Math.min(0.88, ratio)) }
    return { ...n, a: walk(n.a, `${cur}a`), b: walk(n.b, `${cur}b`) }
  }
  return walk(node, '')
}

function replaceLeaf(node: PaneNode | null, oldId: string, newId: string): PaneNode | null {
  if (!node) return null
  if (node.type === 'leaf') return node.sessionId === oldId ? leaf(newId) : node
  return { ...node, a: replaceLeaf(node.a, oldId, newId)!, b: replaceLeaf(node.b, oldId, newId)! }
}

function WorkspaceEmptyState({ onNewTab, onOpenPalette }: { onNewTab: () => void; onOpenPalette: () => void }) {
  return (
    <div className="flex h-full w-full items-center justify-center font-sans text-xs text-[var(--fg-2)] select-none">
      <div className="flex flex-col items-center gap-3">
        <button className="transition-colors hover:text-[var(--fg-0)] outline-none flex items-center" onClick={onNewTab}>
          Press <kbd className="border border-[#27272a] bg-[var(--bg-1)] rounded px-1.5 py-0.5 mx-1.5 font-mono text-[10px] text-[var(--fg-1)]">Ctrl+Shift+T</kbd> to start session
        </button>
        <button className="transition-colors hover:text-[var(--fg-0)] outline-none flex items-center" onClick={onOpenPalette}>
          Press <kbd className="border border-[#27272a] bg-[var(--bg-1)] rounded px-1.5 py-0.5 mx-1.5 font-mono text-[10px] text-[var(--fg-1)]">⌘K</kbd> to open command palette
        </button>
      </div>
    </div>
  )
}
