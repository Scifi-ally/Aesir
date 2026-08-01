import * as React from 'react'
import { useEffect, useState, useRef } from 'react'
import { useApp, type View } from '../state'
import { Reorder, AnimatePresence, motion } from 'framer-motion'
import { Check, RotateCcw, X, EyeOff } from 'lucide-react'

import claudeIconUrl from '../../../icons/claude-code-color-32px.png'
import codexIconUrl from '../../../icons/codex-dark-32px.png'
import antigravityIconUrl from '../../../icons/google-antigravity-32px.png'
import gmailIconUrl from '../../../icons/gmail-2026-32px.png'
import githubIconUrl from '../../../icons/github-dark-32px.png'
import mimirIconUrl from '../../../icons/mimiricon.png'

function MimirIcon({ className }: { className?: string }) {
  return <img src={mimirIconUrl} className={className} />
}

function ClaudeIcon({ className }: { className?: string }) {
  return <img src={claudeIconUrl} className={className} />
}

function CodexIcon({ className }: { className?: string }) {
  return <img src={codexIconUrl} className={className} />
}

function AntigravityIcon({ className }: { className?: string }) {
  return <img src={antigravityIconUrl} className={className} />
}

function GmailIcon({ className }: { className?: string }) {
  return <img src={gmailIconUrl} className={className} />
}

function GithubIcon({ className }: { className?: string }) {
  return <img src={githubIconUrl} className={className} />
}

interface NavTabItem {
  id: string
  label: string
  view: View
  accentColor: string
  renderIcon: () => React.JSX.Element
  badge?: string | number | null
}

const DEFAULT_ORDER = [
  'agent:mimir',
  'agent:codex',
  'agent:claude',
  'agent:antigravity',
  'static:github',
  'static:inbox'
]

/** Whether a tab is the currently-active view. */
function isTabActive(view: View, item: NavTabItem): boolean {
  if (item.view.kind === 'agent') {
    return view.kind === 'agent' && view.agentId === item.view.agentId
  }
  return view.kind === item.view.kind
}

export default function TopNav(): React.JSX.Element | null {
  const { view, setView, status, agents } = useApp()
  const isMimir = view.kind === 'agent' && (view.agentId === 'mimir' || view.agentId === 'mimir2')
  const [maximized, setMaximized] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const isMac = navigator.userAgent.toLowerCase().includes('mac')

  const unread = (status?.mail ?? []).reduce((n, m) => n + m.unread, 0)
  const badgeText = unread > 0 ? (unread > 99 ? '99+' : String(unread)) : null

  const [tabOrder, setTabOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('devhub_tab_order')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((id: string) => id !== 'static:terminal' && id !== 'static:settings')
        }
      }
    } catch {}
    return DEFAULT_ORDER
  })

  const [disabledTabs, setDisabledTabs] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('devhub_disabled_tabs')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}
    return []
  })

  useEffect(() => {
    return window.devhub.app.onWindowState((s) => setMaximized(s.maximized))
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        menuBtnRef.current && !menuBtnRef.current.contains(e.target as Node)
      ) {
        setIsMenuOpen(false)
      }
    }
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen])

  const handleReorder = (newOrder: string[]) => {
    setTabOrder(newOrder)
    try { localStorage.setItem('devhub_tab_order', JSON.stringify(newOrder)) } catch {}
  }

  const toggleTabDisabled = (id: string) => {
    const next = disabledTabs.includes(id) 
      ? disabledTabs.filter(item => item !== id)
      : [...disabledTabs, id]
    setDisabledTabs(next)
    try { localStorage.setItem('devhub_disabled_tabs', JSON.stringify(next)) } catch {}
  }

  const resetTabs = () => {
    setTabOrder(DEFAULT_ORDER)
    setDisabledTabs([])
    try {
      localStorage.removeItem('devhub_tab_order')
      localStorage.removeItem('devhub_disabled_tabs')
    } catch {}
  }

  // Tab accent colors:
  // Claude = orange, Antigravity = Google blue, Codex = purple, GitHub = white, Inbox/Gmail = Google red
  const allTabsMap: Record<string, NavTabItem> = {
    'agent:mimir': {
      id: 'agent:mimir',
      label: 'Mimir',
      view: { kind: 'agent', agentId: 'mimir' },
      accentColor: '#ffffff',
      renderIcon: () => <MimirIcon className="w-[18px] h-[18px] object-contain pointer-events-none" />
    },
    'agent:codex': {
      id: 'agent:codex',
      label: 'Codex',
      view: { kind: 'agent', agentId: 'codex' },
      accentColor: '#a855f7',
      renderIcon: () => <CodexIcon className="w-[18px] h-[18px] object-contain pointer-events-none" />
    },
    'agent:claude': {
      id: 'agent:claude',
      label: 'Claude Code',
      view: { kind: 'agent', agentId: 'claude' },
      accentColor: '#f97316',
      renderIcon: () => <ClaudeIcon className="w-[18px] h-[18px] object-contain pointer-events-none" />
    },
    'agent:antigravity': {
      id: 'agent:antigravity',
      label: 'Antigravity',
      view: { kind: 'agent', agentId: 'antigravity' },
      accentColor: '#4285f4',
      renderIcon: () => <AntigravityIcon className="w-[18px] h-[18px] object-contain pointer-events-none" />
    },
    'static:github': {
      id: 'static:github',
      label: 'GitHub',
      view: { kind: 'github' },
      accentColor: '#e4e4e7',
      renderIcon: () => <GithubIcon className="w-[16px] h-[16px] object-contain pointer-events-none" />
    },
    'static:inbox': {
      id: 'static:inbox',
      label: 'Inbox',
      view: { kind: 'inbox' },
      accentColor: '#ea4335',
      renderIcon: () => <GmailIcon className="w-[16px] h-[16px] object-contain pointer-events-none" />
    }
  }

  agents.forEach(a => {
    if (a.id === 'mimir2') return;
    const id = `agent:${a.id}`
    if (!allTabsMap[id]) {
      let color = '#71717a'
      if (a.id === 'codex') color = '#a855f7' // Purple
      if (a.id === 'mimir') color = '#ffffff' // White

      allTabsMap[id] = {
        id,
        label: a.name,
        view: { kind: 'agent', agentId: a.id },
        accentColor: color,
        renderIcon: () => {
          if (a.id === 'mimir' || a.id === 'mimir2') return <MimirIcon className="w-[18px] h-[18px] object-contain pointer-events-none" />
          if (a.id === 'claude') return <ClaudeIcon className="w-[18px] h-[18px] object-contain pointer-events-none" />
          if (a.id === 'antigravity') return <AntigravityIcon className="w-[18px] h-[18px] object-contain pointer-events-none" />
          if (a.id === 'codex') return <CodexIcon className="w-[18px] h-[18px] object-contain pointer-events-none" />
          if (a.iconUrl) return <img src={a.iconUrl} alt={a.name} className="w-[18px] h-[18px] object-contain pointer-events-none rounded-sm" />
          return <span className="text-xs font-mono font-bold">{a.name.slice(0, 2)}</span>
        }
      }
    }
  })

  const fullTabOrder = [
    ...tabOrder.filter(id => allTabsMap[id]),
    ...Object.keys(allTabsMap).filter(id => !tabOrder.includes(id))
  ]

  const visibleTabIds = fullTabOrder.filter(id => !disabledTabs.includes(id))
  const visibleTabs = visibleTabIds.map(id => allTabsMap[id]).filter(Boolean)

  const isTabActive = (item: NavTabItem) => {
    if (item.view.kind === 'agent') {
      return view.kind === 'agent' && view.agentId === item.view.agentId
    }
    return view.kind === item.view.kind
  }

  // Tab key cycles through visible tabs in order
  useEffect(() => {
    const handleTabCycle = (e: KeyboardEvent) => {
      // Only trigger on bare Tab press. Ignore if Shift, Ctrl, Meta, or Alt are pressed.
      if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      
      e.preventDefault()
      const currentIdx = visibleTabs.findIndex(t => isTabActive(t))
      
      // Cycle forwards on Tab
      const nextIdx = (currentIdx + 1) % visibleTabs.length
      
      const next = visibleTabs[nextIdx]
      if (next) setView(next.view)
    }
    document.addEventListener('keydown', handleTabCycle)
    return () => document.removeEventListener('keydown', handleTabCycle)
  }, [visibleTabs, view, setView])

  return (
    <div 
      onContextMenu={(e) => {
        e.preventDefault()
        setIsMenuOpen(true)
      }}
      className={`drag flex shrink-0 w-full flex-col h-[64px] pt-4 justify-center font-sans text-sm relative select-none transition-colors duration-300 bg-[#000000]`}
    >
      <div className="flex items-center w-full px-6">
        
        {/* Left: Manage Tabs Button */}
        <div className="no-drag flex flex-1 min-w-0 items-center">
          <button
            ref={menuBtnRef}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            title="Manage tabs"
            className="text-[#5A5A5A] text-[11px] uppercase font-bold tracking-widest hover:text-[#FFFFFF] transition-colors outline-none"
          >
            settings
          </button>
        </div>

        {/* Center: Tabs */}
        <div className="no-drag flex shrink-0 items-center justify-center gap-[4px] relative">
          <Reorder.Group
            axis="x"
            values={visibleTabIds}
            onReorder={handleReorder}
            className="flex items-center gap-[10px]"
          >
            {visibleTabs.map((item) => {
              const active = isTabActive(item)
              return (
                <Reorder.Item
                  key={item.id}
                  value={item.id}
                  whileDrag={{ scale: 1.15, zIndex: 50 }}
                  className="cursor-grab active:cursor-grabbing relative flex flex-col items-center justify-center"
                >
                  <button
                    title={item.label}
                    onClick={() => setView(item.view)}
                    className="group relative flex items-center justify-center w-[36px] h-[36px] outline-none transition-all rounded-[10px]"
                  >
                    {active && (
                      <motion.div
                        layoutId="top-nav-active-bg"
                        className="absolute -bottom-[2px] left-[10px] right-[10px] h-[2px] rounded-t-full shadow-sm"
                        style={{ backgroundColor: item.accentColor, boxShadow: `0 -1px 4px ${item.accentColor}40` }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                      />
                    )}
                    <div className={`relative z-10 flex items-center justify-center transition-all duration-300 ${active ? 'text-white' : 'text-[#71717a] group-hover:text-[#a1a1aa]'}`}>
                      <motion.div 
                        initial={false}
                        animate={{ scale: active ? 1.15 : 1, rotate: active ? [0, -5, 5, 0] : 0 }}
                        transition={{ duration: 0.3 }}
                        className={`flex items-center justify-center drop-shadow-md`}
                      >
                        {item.renderIcon()}
                      </motion.div>

                      {item.badge && (
                        <span className="absolute -top-1 -right-2 px-1 py-0.5 bg-[#ea4335]/90 text-[#ffffff] rounded-full text-[8px] font-bold leading-none min-w-[14px] text-center">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </button>
                </Reorder.Item>
              )
            })}
          </Reorder.Group>
        </div>

        {/* Manage Nav Tabs Popover — anchored top-left */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: -4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-10 left-4 z-50 w-24 bg-[#000000] border border-[#ffffff10] rounded-lg shadow-2xl p-1.5 font-mono text-xs text-white origin-top-left"
            >
              <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto overflow-x-hidden">
                {fullTabOrder.map(id => {
                  const item = allTabsMap[id]
                  if (!item) return null
                  const isDisabled = disabledTabs.includes(id)

                  return (
                    <div
                      key={id}
                      onClick={() => toggleTabDisabled(id)}
                      className={`flex items-center gap-2 px-1.5 py-1.5 cursor-pointer rounded-md transition-all ${
                        isDisabled ? 'opacity-30 hover:bg-[#ffffff0a]' : 'opacity-100 hover:bg-[#ffffff15]'
                      }`}
                    >
                      <div className="w-3 h-3 flex items-center justify-center shrink-0">
                        {!isDisabled && <Check className="w-3 h-3 text-[#FFFFFF]" strokeWidth={4} />}
                      </div>
                      <div className="flex items-center justify-center scale-90">
                        {item.renderIcon()}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="pt-1 mt-1 border-t border-[#ffffff10]">
                <button
                  onClick={resetTabs}
                  className="flex items-center justify-center px-1 py-1.5 text-[#5A5A5A] hover:bg-[#ffffff0a] hover:text-[#FFFFFF] rounded-md transition-colors w-full text-center"
                  title="Reset Default"
                >
                  <RotateCcw className="w-3 h-3" strokeWidth={3} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right: Actions */}
        <div className="no-drag flex flex-1 min-w-0 justify-end items-center gap-4">

          <div className="flex items-center gap-2">
            {isMac && (
              <>
                <button 
                  title="Close" 
                  onClick={() => { if (window.devhub && window.devhub.app) window.devhub.app.close() }} 
                  className="rounded-full flex items-center justify-center outline-none transition-colors border border-[#e0443e] shadow-sm hover:bg-[#ff4444]"
                  style={{ width: '12px', height: '12px', backgroundColor: '#ff5f56' }}
                ></button>
                <button 
                  title="Minimize" 
                  onClick={() => { if (window.devhub && window.devhub.app) window.devhub.app.minimize() }} 
                  className="rounded-full flex items-center justify-center outline-none transition-colors border border-[#e1a325] shadow-sm hover:bg-[#ffb000]"
                  style={{ width: '12px', height: '12px', backgroundColor: '#ffbd2e' }}
                ></button>
                <button 
                  title={maximized ? 'Restore' : 'Maximize'} 
                  onClick={() => { if (window.devhub && window.devhub.app) window.devhub.app.toggleMaximize() }} 
                  className="rounded-full flex items-center justify-center outline-none transition-colors border border-[#23ab36] shadow-sm hover:bg-[#1aab29]"
                  style={{ width: '12px', height: '12px', backgroundColor: '#27c93f' }}
                ></button>
              </>
            )}
            {!isMac && (
              <div className="w-[130px] h-full shrink-0"></div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
