import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MailAccount, MailHeader, MailProvider } from '@shared/types'
import { Button, ErrorState, Loading } from '../../components/ui'
import { useApp } from '../../state'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  RefreshCw, Edit2, Star, Clock, Send, File, Archive, Trash2, 
  Plus, ChevronDown, AlertOctagon, Mail, Tag,
  CheckSquare, Search, Filter, FolderInput, Paperclip, 
  Inbox as InboxIcon, PlayCircle, StickyNote, Box, LayoutGrid,
  ShoppingBag, Users, Info, MessageSquare, X
} from 'lucide-react'
import Composer from './Composer'
import MessageView from './MessageView'
import SetupWizard from './SetupWizard'

export default function Inbox(): React.JSX.Element {
  const { toast, view, setView } = useApp()
  const [clients, setClients] = useState<{ gmail: boolean; outlook: boolean } | null>(null)
  const [accounts, setAccounts] = useState<MailAccount[]>([])
  const [headers, setHeaders] = useState<MailHeader[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string | null>(() => localStorage.getItem('devhub_inbox_account') || null)
  const [selected, setSelected] = useState<MailHeader | null>(null)
  const [query, setQuery] = useState(() => localStorage.getItem('devhub_inbox_query') || '')
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('devhub_inbox_tab') || 'inbox')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [connecting, setConnecting] = useState<MailProvider | null>(null)
  const [wizard, setWizard] = useState<MailProvider | null>(null)
  const [composing, setComposing] = useState(false)
  const [composingTo, setComposingTo] = useState('')
  const [composingSubject, setComposingSubject] = useState('')
  const [renderLimit, setRenderLimit] = useState(30)

  const [labels, setLabels] = useState<any[]>([])
  const folderRequestRef = useRef(0)
  
  useEffect(() => {
    let interval = setInterval(() => {
      if (selectedAccount && !query) {
        // Background sync
        void loadFolder(selectedAccount, activeTab, query, true)
        window.devhub.mail.labels(selectedAccount).then(setLabels).catch(console.error)
      }
    }, 60000)
    return () => clearInterval(interval)
  }, [selectedAccount, activeTab, query])
  useEffect(() => {
    localStorage.setItem('devhub_inbox_query', query)
    setSelected(null)
  }, [query])

  useEffect(() => {
    localStorage.setItem('devhub_inbox_tab', activeTab)
    setSelected(null)
  }, [activeTab])

  useEffect(() => {
    if (selectedAccount) {
      localStorage.setItem('devhub_inbox_account', selectedAccount)
    }
    setSelected(null)
  }, [selectedAccount])

  const accountIds = useMemo(
    () => (selectedAccount ? [selectedAccount] : accounts.map((a) => a.id)),
    [accounts, selectedAccount]
  )

  const loadAccounts = useCallback(async () => {
    const [status, list] = await Promise.all([
      window.devhub.mail.clientStatus(),
      window.devhub.mail.accounts()
    ])
    setClients(status)
    setAccounts(list)
    return list
  }, [])

  const loadFolder = useCallback(
    (acctId: string | null, tabId: string, q: string, background = false) => {
      const requestId = ++folderRequestRef.current
      const isCurrent = () => requestId === folderRequestRef.current
      if (!acctId) {
        setHeaders([])
        return
      }
      
      void (async () => {
        try {
          if (q) {
            if (!background) setSyncing(true)
            const res = await window.devhub.mail.search(acctId, q)
            if (isCurrent()) setHeaders(res)
            if (!background && isCurrent()) setSyncing(false)
            return
          }
          if (tabId === 'draft' || tabId === 'drafts') {
            const cached = await window.devhub.mail.cachedFolder(acctId, 'DRAFT')
            if (Array.isArray(cached) && cached.length > 0) {
              if (isCurrent()) setHeaders(cached)
            } else if (!background && isCurrent()) {
              setSyncing(true)
            }
            const res = await window.devhub.mail.drafts(acctId)
            if (Array.isArray(res) && res.length > 0 && isCurrent()) setHeaders(res)
            if (isCurrent()) setSyncing(false)
            return
          }
          
          let labelId = tabId
          if (tabId === 'inbox') labelId = 'INBOX'
          else if (tabId === 'sent') labelId = 'SENT'
          else if (tabId === 'spam') labelId = 'SPAM'
          else if (tabId === 'bin' || tabId === 'trash') labelId = 'TRASH'
          else if (tabId === 'starred') labelId = 'STARRED'
          else if (tabId === 'important') labelId = 'IMPORTANT'
          else if (tabId === 'snoozed') labelId = 'SNOOZED'
          else if (tabId === 'all') labelId = ''

          // 1. Instant load from SQLite database (0ms delay)
          const cached = await window.devhub.mail.cachedFolder(acctId, labelId)
          const hasCached = Array.isArray(cached) && cached.length > 0
          if (hasCached) {
            if (isCurrent()) setHeaders(cached)
          }

          // 2. Fetch fresh mails in background & prepend new mails to SQLite DB
          if (!hasCached && !background) setSyncing(true)

          const fresh = labelId === '' 
            ? await window.devhub.mail.search(acctId, 'in:anywhere')
            : await window.devhub.mail.folder(acctId, labelId)
          
          if (Array.isArray(fresh) && fresh.length > 0 && isCurrent()) {
            setHeaders(fresh)
          }
        } catch (e) {
          if (isCurrent()) setError((e as Error).message)
        } finally {
          if (isCurrent()) setSyncing(false)
        }
      })()
    },
    []
  )

  useEffect(() => {
    void (async () => {
      try {
        const list = await loadAccounts()
        const savedAccountExists = Boolean(selectedAccount && list.some((account) => account.id === selectedAccount))
        const acctId = savedAccountExists ? selectedAccount : (list.length > 0 ? list[0].id : null)
        if (acctId !== selectedAccount) {
          setSelectedAccount(acctId)
          if (!acctId) localStorage.removeItem('devhub_inbox_account')
        }
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    })()
  }, [loadAccounts])

  useEffect(() => {
    if (!selectedAccount) return
    window.devhub.mail.labels(selectedAccount).then(setLabels).catch(console.error)
    void loadFolder(selectedAccount, activeTab, query)
    setRenderLimit(30)
  }, [selectedAccount, activeTab, query, loadFolder])

  useEffect(() => {
    if (view.kind !== 'inbox') return
    if (view.accountId) setSelectedAccount(view.accountId)
    if (view.messageId) {
      const h = headers.find((x) => x.id === view.messageId)
      if (h) setSelected(h)
    }
  }, [view, headers])

  const sync = useCallback(
    async (id?: string) => {
      setSyncing(true)
      try {
        const targets = id ? [id] : accounts.map((a) => a.id)
        if (selectedAccount) {
          window.devhub.mail.labels(selectedAccount).then(setLabels).catch(console.error)
          await loadFolder(selectedAccount, activeTab, query)
        }
      } catch (e) {
        toast((e as Error).message, 'error')
      } finally {
        setSyncing(false)
      }
    },
    [accountIds, accounts, loadAccounts, loadFolder, query, toast, selectedAccount, activeTab]
  )

  const connect = useCallback(
    async (provider: MailProvider) => {
      setConnecting(provider)
      try {
        const acct = await window.devhub.mail.connect(provider)
        toast(`connected ${acct.email}`)
        setWizard(null)
        await loadAccounts()
        setSelectedAccount(acct.id)
        if (selectedAccount) {
          window.devhub.mail.labels(selectedAccount).then(setLabels).catch(console.error)
          await loadFolder(selectedAccount, activeTab, query)
        }
      } catch (e) {
        toast((e as Error).message, 'error')
      } finally {
        setConnecting(null)
      }
    },
    [loadAccounts, loadFolder, activeTab, query, toast, selectedAccount]
  )

  if (loading) return <Loading what="loading mail accounts" />
  if (error && accounts.length === 0)
    return <ErrorState title="inbox failed to load" detail={error} retry={() => location.reload()} />

  if (wizard) {
    return (
      <div className="h-full overflow-y-auto bg-[#000000] text-white font-sans">
        <div className="px-8 pt-4">
          <Button onClick={() => setWizard(null)}>← back</Button>
        </div>
        <SetupWizard
          provider={wizard}
          configured={wizard === 'gmail' ? !!clients?.gmail : !!clients?.outlook}
          busy={connecting === wizard}
          onSaved={() => {
            void loadAccounts()
            toast('client saved — connect an account to run the real OAuth flow')
          }}
          onConnect={() => void connect(wizard)}
        />
      </div>
    )
  }

  const accountColors = ['#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#f97316']
  const systemFont = "'Geist Mono', monospace"

  return (
    <div 
      className="flex h-full w-full bg-[#000000] text-[#8A8A8A] overflow-hidden antialiased" 
      style={{ fontFamily: systemFont }}
    >
      {/* Left Sidebar (Full Height) */}
      <div className="shrink-0 flex flex-col border-r border-[#18181b] h-full py-5 bg-[#000000]" style={{ width: '240px' }}>
        
        {/* Compose Button */}
        <div className="px-6 mb-8 mt-2">
          <button 
            onClick={() => {
              setComposingTo('')
              setComposingSubject('')
              setComposing(true)
            }}
            className="flex items-center justify-center w-full h-11 bg-[#FFFFFF] text-[#000000] rounded-xl hover:bg-[#E0E0E0] transition-colors outline-none font-medium shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-[16px] h-[16px] stroke-[2.5]" />
              <span className="text-[14px] tracking-wide">Compose</span>
            </div>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden pb-8 px-3 text-[13px]">
          {/* Navigation */}
          <div className="flex flex-col gap-1 mb-8">
            {(() => {
              const sysMap = {
                'INBOX': { label: 'Inbox', icon: InboxIcon },
                'STARRED': { label: 'Starred', icon: Star },
                'SNOOZED': { label: 'Snoozed', icon: Clock },
                'IMPORTANT': { label: 'Important', icon: PlayCircle },
                'SENT': { label: 'Sent', icon: Send },
                'DRAFT': { label: 'Drafts', icon: File },
                'SPAM': { label: 'Spam', icon: AlertOctagon },
                'TRASH': { label: 'Trash', icon: Trash2 },
              }
              const sysIds = ['INBOX', 'STARRED', 'SNOOZED', 'IMPORTANT', 'SENT', 'DRAFT', 'SPAM', 'TRASH']
              
              const renderLabel = (id: string, name: string, icon: any, unread?: number) => {
                const isActive = activeTab?.toLowerCase() === id.toLowerCase() && !query
                const Icon = icon
                return (
                  <button 
                    key={id}
                    onClick={() => {
                      setQuery('')
                      setActiveTab(id.toLowerCase())
                      setSelected(null)
                      setHeaders([])
                    }}
                    style={isActive ? { backgroundColor: 'rgba(255, 255, 255, 0.05)', fontWeight: 500, color: '#FFFFFF' } : undefined}
                    className={`flex items-center justify-between px-3 h-8 rounded transition-colors outline-none w-full ${
                      !isActive ? 'text-[#8A8A8A] hover:text-[#FFFFFF]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-[14px] h-[14px]" strokeWidth={2} />
                      <span className="tracking-wide">{name}</span>
                    </div>
                    {unread && unread > 0 ? (
                      <span className="text-[11px] bg-[#18181b] px-1.5 rounded">{unread}</span>
                    ) : null}
                  </button>
                )
              }

              return (
                <>
                  {sysIds.map(sid => {
                    const l = labels.find(x => x.id === sid) || { messagesUnread: 0 }
                    const def = (sysMap as any)[sid]
                    return renderLabel(sid, def.label, def.icon, l.messagesUnread)
                  })}
                  {renderLabel('all', 'All Mail', Mail)}
                  
                  {labels.filter(l => l.type === 'user').length > 0 && (
                    <div className="mt-6 mb-2 text-[10px] uppercase font-bold tracking-wider text-[#5A5A5A] pl-3">
                      Labels
                    </div>
                  )}
                  {labels.filter(l => l.type === 'user').map(l => 
                    renderLabel(l.id, l.name, Tag, l.messagesUnread)
                  )}
                </>
              )
            })()}
          </div>

        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        
        {/* Top Action Bar (Accounts & Global Tools) */}
        <div className="flex items-center justify-between px-6 border-b border-[#18181b] shrink-0 w-full" style={{ height: '52px' }}>
          
          {/* Left: Accounts */}
          <div className="flex items-center gap-4 overflow-x-auto [&::-webkit-scrollbar]:hidden h-full">
            {accounts.map((a, i) => {
              const isActive = selectedAccount === a.id
              const color = accountColors[i % accountColors.length]
              return (
                <button
                  key={a.id}
                  onClick={() => {
                    if (selectedAccount !== a.id) {
                      setSelectedAccount(a.id)
                      setSelected(null)
                      setHeaders([])
                    }
                  }}
                  className={`relative flex items-center gap-2 h-full transition-colors outline-none px-2 ${
                    isActive ? 'text-[#FFFFFF]' : 'text-[#8A8A8A] hover:text-[#FFFFFF]'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className={`text-[13px] tracking-wide ${isActive ? 'font-medium' : ''}`}>{a.email}</span>
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF6B1A]" />
                  )}
                </button>
              )
            })}
            <button 
              onClick={() => {
                if (clients?.gmail) void connect('gmail')
                else setWizard('gmail')
              }}
              className="flex items-center h-full text-[#5A5A5A] hover:text-[#8A8A8A] transition-colors outline-none ml-2"
            >
              <Plus className="w-[14px] h-[14px]" />
            </button>
          </div>

          {/* Right: Global Toolbar */}
          <div className="flex items-center gap-4 text-[#5A5A5A]">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-2.5 text-[#5A5A5A]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search mail…"
                className="bg-[#18181b] text-[12px] text-white pl-8 pr-7 py-1 rounded-lg outline-none border border-[#27272a] focus:border-[#5A5A5A] w-52 transition-all"
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-2 text-[#5A5A5A] hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button onClick={() => void loadFolder(selectedAccount, activeTab, query)} disabled={syncing} title="Refresh mail" className="p-0 bg-transparent hover:bg-transparent text-[#5A5A5A] hover:text-[#FFFFFF] outline-none">
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        {/* 2-Column Split */}
        <div className="flex flex-1 min-h-0">
          
          {/* Middle Column (Inbox List) */}
          <div className="shrink-0 flex flex-col border-r border-[#18181b] h-full bg-[#000000]" style={{ width: '650px' }}>


            {/* Messages */}
            <div 
              className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden pb-8"
              onScroll={(e) => {
                const target = e.target as HTMLDivElement
                if (target.scrollHeight - target.scrollTop <= target.clientHeight + 400) {
                  setRenderLimit(prev => Math.min(prev + 30, headers.length))
                }
              }}
            >
              {headers.length === 0 ? (
                <div className="py-16 text-center text-[#5A5A5A] text-[13px]">
                  {syncing ? `Loading...` : (query ? 'No results found' : 'No messages')}
                </div>
              ) : (
                <div className="flex flex-col">
                  {/* Mocked Group Headers based on reference image */}
                  <div className="px-6 py-4 text-[10px] text-[#5A5A5A] tracking-widest uppercase mt-2">Today</div>
                  <AnimatePresence initial={false}>
                    {headers.slice(0, Math.min(renderLimit, 3)).map((h, i) => (
                      <MessageRow 
                        key={h.id} 
                        h={h} 
                        isActive={selected?.id === h.id} 
                        onSelect={() => { setSelected(h); setComposing(false); }} 
                        accountColors={accountColors}
                        index={i}
                      />
                    ))}
                  </AnimatePresence>
                  
                  {headers.length > 3 && (
                    <>
                      <div className="px-6 py-4 text-[10px] text-[#5A5A5A] tracking-widest uppercase mt-4">Yesterday</div>
                      <AnimatePresence initial={false}>
                        {headers.slice(3, renderLimit).map((h, i) => (
                          <MessageRow 
                            key={h.id} 
                            h={h} 
                            isActive={selected?.id === h.id} 
                            onSelect={() => { setSelected(h); setComposing(false); }} 
                            accountColors={accountColors}
                            index={i}
                          />
                        ))}
                      </AnimatePresence>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Reading Pane */}
          <div className="flex-1 min-w-0 h-full flex flex-col relative bg-[#000000] overflow-y-auto [&::-webkit-scrollbar]:hidden">
            {composing ? (
              <div className="p-10 w-full h-full xl:pl-16">
                <button 
                  onClick={() => {
                    const next = selectedAccount === accounts[0].id ? accounts[1].id : accounts[0].id
                    setSelectedAccount(next)
                    window.devhub.mail.labels(next).then(setLabels).catch(console.error)
                    void loadFolder(next, activeTab, query)
                  }}
                  disabled={syncing}
                  className="bg-transparent text-[var(--fg-2)] border-0 hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)] ml-4"
                >
                  Switch Account
                </button>
                <Composer
                  accounts={accounts}
                  from={selectedAccount ?? (accounts.length > 0 ? accounts[0].id : '')}
                  onFrom={setSelectedAccount}
                  initialTo={composingTo}
                  initialSubject={composingSubject}
                  onSent={() => {
                    setComposing(false)
                    toast('sent')
                  }}
                  onCancel={() => setComposing(false)}
                />
              </div>
            ) : selected ? (
              <MessageView
                header={selected}
                accountColors={accountColors}
                onReply={(to, subject) => {
                  setComposingTo(to)
                  setComposingSubject(subject)
                  setComposing(true)
                }}
                onStar={(id) => {
                  window.devhub.mail.star(selected.accountId, id, true)
                    .then(() => toast('Starred message'))
                    .catch((e: Error) => toast(`Failed to star: ${e.message}`, 'error'))
                }}
              />
            ) : null}
          </div>
        </div>

      </div>
    </div>
  )
}

function MessageRow({ h, isActive, onSelect, accountColors, index }: { h: MailHeader, isActive: boolean, onSelect: () => void, accountColors: string[], index?: number }) {
  const senderName = h.from.split('<')[0].trim()

  return (
    <div
      onClick={() => {
        onSelect()
        if (h.unread) {
          window.devhub.mail.markRead(h.accountId, h.id).catch(console.error)
          h.unread = false
        }
      }}
      className={`relative flex flex-col justify-center px-6 py-3 border-b border-[#18181b] transition-colors text-left w-full outline-none cursor-pointer ${
        !isActive ? 'hover:bg-white/5' : ''
      }`}
      style={{ height: '78px' }}
    >
      {isActive && (
        <div
          className="absolute inset-0 bg-[#18181b] z-0"
        />
      )}
      
      <div className="relative z-10 w-full flex items-start gap-4">
        {/* Unread Indicator */}
        <div className="w-[8px] shrink-0 flex items-center justify-center pt-[10px]">
          {h.unread && (
            <div className={`w-2 h-2 rounded-full ${h.labels?.includes('IMPORTANT') ? 'bg-[#ea4335]' : 'bg-[#10b981]'}`} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between w-full mb-1">
            <span className={`text-[15px] truncate ${h.unread ? 'text-[#FFFFFF] font-medium' : 'text-[#8A8A8A]'}`}>
              {senderName}
            </span>
            <span className={`text-[12px] ${isActive ? 'text-[#8A8A8A]' : 'text-[#5A5A5A]'}`}>
              {new Date(h.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex flex-col overflow-hidden w-full gap-0.5">
              <div className={`text-[13px] truncate ${h.unread ? 'text-[#E0E0E0] font-medium' : 'text-[#707070]'}`}>
                {h.subject || '(no subject)'}
              </div>
              <div className="text-[13px] truncate text-[#5A5A5A]">
                {h.snippet}
              </div>
            </div>
            {/* Right Actions */}
            <div className="flex items-center gap-3 shrink-0 ml-4">
              <button 
                className="hover:scale-110 transition-transform"
                onClick={(e) => {
                  e.stopPropagation()
                  const isStarred = h.labels?.includes('STARRED')
                  window.devhub.mail.star(h.accountId, h.id, !isStarred).catch(console.error)
                  if (isStarred) {
                    h.labels = h.labels.filter(l => l !== 'STARRED')
                  } else {
                    h.labels = [...(h.labels || []), 'STARRED']
                  }
                }}
              >
                <Star className={`w-[14px] h-[14px] shrink-0 transition-colors ${h.labels?.includes('STARRED') ? 'text-[#FFD700] fill-[#FFD700]' : (isActive ? 'text-[#8A8A8A]' : 'text-[#27272a]')}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Fallback icons for navigation items not explicitly imported initially
function CalendarIcon(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
}
function MessageSquareIcon(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
}
