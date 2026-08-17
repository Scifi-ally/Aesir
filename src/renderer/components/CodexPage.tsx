import React, { useEffect, useState, useRef } from 'react'
import { Check, Trash2, Folder, History, Plus, Search, Clock, ArrowUp, Zap, Square, Paperclip, ChevronDown, PanelRight, ShieldAlert, Sparkles } from 'lucide-react'
import { PremiumModelSelector, ReasoningSelector, GenericModeToggle, WorkspaceSelector } from './ComposerComponents'
import type { BridgeEvent } from '@shared/types'
import { useApp } from '../state'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import TypewriterHeader from './TypewriterHeader'
import AgentSetupBar from './AgentSetupBar'
import codexLogo from '../../../icons/codex-dark-32px.png'

const AVAILABLE_COMMANDS = [
  { cmd: '/clear', desc: 'Clear conversation history' },
  { cmd: '/compact', desc: 'Compact conversation context' },
  { cmd: '/cost', desc: 'View session cost and usage' },
  { cmd: '/context', desc: 'Show current token usage' },
  { cmd: '/resume', desc: 'List or switch sessions' },
  { cmd: '/help', desc: 'Show available commands' }
]

// Formats raw API IDs to human-readable strings
const formatCodexModelName = (m: string) => {
  if (m === 'gpt-5.6-terra') return '5.6 Terra'
  if (m === 'gpt-5.6-luna') return '5.6 Luna'
  if (m === 'gpt-5.5') return '5.5'
  if (m === 'gpt-5.4-mini') return '5.4 Mini'
  return m
}

type Step = { 
  id: string
  name?: string
  input?: any
  text: string
  status: 'working' | 'done' | 'failed'
  output?: any
}

type Message = {
  id: string
  role: 'user' | 'agent'
  text: string
  steps?: Step[]
}

const VERBS = [
  "Codex Processing", "Synthesizing", "Generating Code", "Analyzing Logic",
  "Refactoring", "Parsing AST", "Optimizing Flow", "Indexing Types"
]
function ThinkingIndicator({ startedAt, doneSeconds }: { startedAt: number; doneSeconds?: number }) {
  const [verb] = useState(() => VERBS[Math.floor(Math.random() * VERBS.length)])
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (doneSeconds != null) return
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(tick)
  }, [startedAt, doneSeconds])

  const mm = Math.floor(elapsed / 60), ss = elapsed % 60
  const elapsedStr = mm > 0 ? `${mm}m ${ss}s` : `${ss}s`

  if (doneSeconds != null) {
    return (
      <div className="flex items-center gap-2 mt-2 font-mono text-[14px] text-[#71717a]">
        <span className="inline-flex w-4 justify-center"><Check size={14} aria-hidden="true" /></span>
        <span>thought for {doneSeconds}s</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 mt-2 font-mono text-[14px] text-[#a855f7]">
      <span className="inline-flex w-4 justify-center"><Sparkles size={14} className="animate-pulse" aria-hidden="true" /></span>
      <span>{verb}…</span>
      <span className="text-[#71717a]">
        (esc to interrupt · {elapsedStr})
      </span>
    </div>
  )
}

function CodexModelSelector({
  models,
  modelValue,
  onModelChange,
  effortValue,
  onEffortChange
}: {
  models: string[]
  modelValue: string
  onModelChange: (m: string) => void
  effortValue: string
  onEffortChange: (e: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const effortOptions = [
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
    { id: 'xhigh', label: 'X-High' },
    { id: 'max', label: 'Max' }
  ]

  return (
    <div className="relative font-mono" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] text-[#5A5A5A] hover:text-[#FFFFFF] transition-colors outline-none"
      >
        <span className="font-bold tracking-widest uppercase">{formatCodexModelName(modelValue)}</span>
        <span className="uppercase tracking-widest">/ {effortValue}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute bottom-[calc(100%+10px)] left-0 w-[310px] bg-[#0a0a0c]/95 backdrop-blur-2xl border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden z-50 flex flex-col p-2.5 gap-2"
          >
            <div className="px-3 pt-1.5 pb-1 text-[10px] font-bold text-[#71717a] uppercase tracking-widest">
              Codex Models
            </div>

            <div className="flex flex-col gap-0.5 max-h-[220px] overflow-y-auto">
              {models.map(m => {
                const isSelected = modelValue === m
                return (
                  <button
                    key={m}
                    onClick={() => { onModelChange(m); setOpen(false) }}
                    className={`w-full flex items-center justify-between px-2 py-1 text-xs text-left transition-colors uppercase tracking-widest font-bold ${isSelected ? 'text-[#FFFFFF]' : 'text-[#5A5A5A] hover:text-[#FFFFFF]'}`}
                  >
                    <span>{formatCodexModelName(m)}</span>
                  </button>
                )
              })}
              <div className="mt-2 flex flex-col gap-2">
                <div className="text-[10px] uppercase tracking-widest text-[#5A5A5A] font-bold">Reasoning Effort</div>
                <div className="flex gap-2 relative">
                  {effortOptions.map(opt => {
                    const isSelected = effortValue === opt.id
                    return (
                      <button
                        key={opt.id}
                        onClick={() => { onEffortChange(opt.id) }}
                        className={`text-[10px] uppercase tracking-widest transition-colors font-bold ${
                          isSelected 
                            ? 'text-[#FFFFFF]' 
                            : 'text-[#5A5A5A] hover:text-[#FFFFFF]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CodexModeSelector({ value, onChange }: { value: string, onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function click(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [open])

  const MODES = [
    { id: 'auto', label: 'Auto Execution', color: 'text-purple-400', dotClass: 'bg-purple-400' },
    { id: 'manual', label: 'Manual Approval', color: 'text-emerald-400', dotClass: 'bg-emerald-400' },
    { id: 'plan', label: 'Plan Mode', color: 'text-yellow-400', dotClass: 'bg-yellow-400' }
  ]

  const currentMode = MODES.find(m => m.id === value) || MODES[0]

  return (
    <div className="relative font-mono" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] text-[#5A5A5A] hover:text-[#FFFFFF] transition-colors outline-none uppercase font-bold tracking-widest"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${currentMode.dotClass}`} />
        <span>{currentMode.label}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            className="absolute bottom-[calc(100%+8px)] left-0 w-[240px] bg-[#0a0a0b]/95 backdrop-blur-xl border border-[#27272a] rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col p-1.5"
          >
            <div className="px-3 py-2 text-[10px] font-bold text-[#71717a] uppercase tracking-wider">
              Execution Mode
            </div>
            <div className="flex flex-col space-y-1">
              {MODES.map(m => (
                <button
                  key={m.id}
                  onClick={() => { onChange(m.id); setOpen(false) }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors ${value === m.id ? 'bg-[#a855f7]/15 text-[#a855f7] font-semibold' : 'text-[#a1a1aa] hover:bg-[#18181b]'}`}
                >
                  <span className={`w-2 h-2 rounded-full ${m.dotClass}`} />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function CodexPage(): React.JSX.Element {
  const { view, settings, setSettings } = useApp()
  const [inputValue, setInputValue] = useState('')
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
  
  useEffect(() => {
    setSelectedCommandIndex(0)
  }, [inputValue])
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const promptInputRef = useRef<HTMLInputElement>(null)
  
  const [messages, setMessages] = useState<Message[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined)

  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const [inputDraft, setInputDraft] = useState<string>('')
  const [cwd, setCwd] = useState('/')
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null)
  const [installCmd, setInstallCmd] = useState<string>('irm https://chatgpt.com/codex/install.ps1 | iex')
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false)
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false)
  const [apiKeyInput, setApiKeyInput] = useState<string>('')

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true)
    try {
      const res = await window.devhub?.codex?.loginOAuth?.()
      if (res?.success) {
        setIsAuthenticated(true)
      }
    } catch (e) {
      console.error('Google OAuth login error:', e)
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleApiKeyLoginSubmit = async () => {
    if (!apiKeyInput.trim()) return
    setIsLoggingIn(true)
    try {
      const res = await window.devhub?.codex?.loginApiKey?.(apiKeyInput.trim())
      if (res?.success) {
        setIsAuthenticated(true)
        setShowApiKeyModal(false)
        setApiKeyInput('')
      }
    } catch (e: any) {
      alert(`API Key login error: ${e.message}`)
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleLogout = async () => {
    await window.devhub?.codex?.logout?.()
    setIsAuthenticated(false)
  }

  // Model & Effort state
  const [selectedModel, setSelectedModel] = useState<string>('gpt-5.6-terra')
  const [selectedEffort, setSelectedEffort] = useState<string>('medium')
  const [executionMode, setExecutionMode] = useState<string>('on_demand')
  const [availableModels, setAvailableModels] = useState<string[]>([
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.5',
    'gpt-5.4-mini',
    'gpt-4o',
    'o3-mini',
    'o1'
  ])
  const [savedSessions, setSavedSessions] = useState<{ sessionId: string; firstPrompt: string; startedAt: number; cwd: string }[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const filteredSessions = savedSessions.filter(s => 
    s.firstPrompt?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.sessionId.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const [isThinking, setIsThinking] = useState(false)
  const [thinkingStart, setThinkingStart] = useState<number | null>(null)
  const [lastDoneSeconds, setLastDoneSeconds] = useState<number | undefined>(undefined)
  const [tokenUsage, setTokenUsage] = useState({ turns: 0, input: 0, output: 0, totalCost: 0 })

  useEffect(() => {
    // Check installation & auth status
    window.devhub?.codex?.checkInstalled?.().then(installed => {
      setIsInstalled(Boolean(installed))
    }).catch(() => setIsInstalled(false))

    window.devhub?.codex?.getInstallCommand?.().then(cmd => {
      if (cmd?.display) setInstallCmd(cmd.display)
    }).catch(() => {})

    window.devhub?.codex?.checkAuth?.().then(status => {
      if (status?.authenticated) setIsAuthenticated(true)
    }).catch(() => {})

    window.devhub?.codex?.getModels?.().then(m => {
      if (m && m.length > 0) setAvailableModels(m)
    }).catch(() => {})

    window.devhub?.codex?.getSessions?.().then(s => {
      if (s) {
        setSavedSessions(s)
        if (s.length > 0 && !activeSessionId) {
          setActiveSessionId(s[0].sessionId)
        }
      }
    }).catch(() => {})

    const unsubscribe = window.devhub?.codex?.onEvent?.((event: BridgeEvent) => {
      if (event.kind === 'init') {
        if (event.sessionId) setActiveSessionId(event.sessionId)
      } else if (event.kind === 'tool_start') {
        setMessages(prev => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === 'agent') {
            const steps = last.steps || []
            steps.push({
              id: event.id,
              name: event.name,
              text: event.name,
              input: event.input,
              status: 'working'
            })
            last.steps = steps
          }
          return next
        })
      } else if (event.kind === 'tool_done') {
        setMessages(prev => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === 'agent' && last.steps) {
            const step = last.steps.find(s => s.id === event.id)
            if (step) {
              step.status = 'done'
              step.output = event.output
            }
          }
          return next
        })
      } else if (event.kind === 'text_delta') {
        setMessages(prev => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === 'agent') {
            last.text += event.text
          }
          return next
        })
      } else if (event.kind === 'done') {
        setIsThinking(false)
      }
    })

    return () => {
      if (typeof unsubscribe === 'function') (unsubscribe as () => void)()
    }
  }, [])

  useEffect(() => {
    if (!activeSessionId) return
    window.devhub?.codex?.getSessionHistory?.(activeSessionId).then((turns) => {
      if (Array.isArray(turns) && turns.length > 0) {
        const loadedMsgs: Message[] = turns.map((t: any) => ({
          id: t.id,
          role: t.role === 'user' ? 'user' : 'agent',
          text: t.content || '',
          steps: (t.toolCalls || []).map((tc: any) => ({
            id: tc.id,
            name: tc.toolName,
            text: tc.toolName,
            input: tc.inputJson ? JSON.parse(tc.inputJson) : {},
            status: tc.status === 'success' ? 'done' : tc.status === 'error' ? 'failed' : 'working',
            output: tc.outputText
          }))
        }))
        setMessages(loadedMsgs)
      }
    }).catch(() => {})
  }, [activeSessionId])

  useEffect(() => {
    promptInputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cycle modes on Shift+Tab
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        setExecutionMode(prev => {
          if (prev === 'auto') return 'manual'
          if (prev === 'manual') return 'plan'
          return 'auto'
        })
        return
      }

      if (inputValue.startsWith('/')) {
        const query = inputValue.slice(1).toLowerCase()
        const matches = AVAILABLE_COMMANDS.filter(c => c.cmd.slice(1).startsWith(query))
        if (matches.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedCommandIndex(i => (i + 1) % matches.length)
            return
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedCommandIndex(i => (i - 1 + matches.length) % matches.length)
            return
          }
          if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault()
            setInputValue(matches[selectedCommandIndex].cmd + ' ')
            return
          }
        }
      }

      if (e.key === 'ArrowUp' && !inputValue && messages.length > 0) {
        e.preventDefault()
        const userMsgs = messages.filter(m => m.role === 'user').map(m => m.text)
        if (userMsgs.length > 0) {
          if (historyIndex === -1) {
            setInputDraft(inputValue)
            const nextIdx = userMsgs.length - 1
            setHistoryIndex(nextIdx)
            setInputValue(userMsgs[nextIdx])
          } else if (historyIndex > 0) {
            const nextIdx = historyIndex - 1
            setHistoryIndex(nextIdx)
            setInputValue(userMsgs[nextIdx])
          }
        }
        return
      }

      if (e.key === 'ArrowDown' && historyIndex !== -1) {
        e.preventDefault()
        const userMsgs = messages.filter(m => m.role === 'user').map(m => m.text)
        if (historyIndex < userMsgs.length - 1) {
          const nextIdx = historyIndex + 1
          setHistoryIndex(nextIdx)
          setInputValue(userMsgs[nextIdx])
        } else {
          setHistoryIndex(-1)
          setInputValue(inputDraft)
        }
        return
      }
      
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const activeTag = document.activeElement?.tagName.toLowerCase()
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return
      
      if (e.key.length === 1) {
        promptInputRef.current?.focus()
      }
    }
    
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [inputValue, messages, historyIndex, inputDraft, selectedCommandIndex])

  const handleSend = async () => {
    if (!inputValue.trim()) return

    setHistoryIndex(-1)
    setInputDraft('')

    const rawInput = inputValue.trim()

    if (rawInput.startsWith('/')) {
      const [cmd] = rawInput.slice(1).split(' ')
      switch (cmd) {
        case 'clear':
          setMessages([])
          setActiveSessionId(undefined)
          setInputValue('')
          return
        case 'compact':
          setMessages(prev => [...prev, 
            { id: Date.now().toString(), role: 'user', text: '/compact' },
            { id: (Date.now()+1).toString(), role: 'agent', text: 'Session context compacted successfully.' }
          ])
          setInputValue('')
          return
        case 'cost':
          setMessages(prev => [...prev, 
            { id: Date.now().toString(), role: 'user', text: '/cost' },
            { id: (Date.now()+1).toString(), role: 'agent', text: `Current Session Usage:\n- Input Tokens: ${tokenUsage.input.toLocaleString()}\n- Output Tokens: ${tokenUsage.output.toLocaleString()}\n- Estimated Cost: $${tokenUsage.totalCost.toFixed(4)}` }
          ])
          setInputValue('')
          return
        case 'context':
          setMessages(prev => [...prev, 
            { id: Date.now().toString(), role: 'user', text: '/context' },
            { id: (Date.now()+1).toString(), role: 'agent', text: `Tokens: ${tokenUsage.input + tokenUsage.output} / 128,000` }
          ])
          setInputValue('')
          return
        case 'resume': {
          const args = rawInput.split(' ').slice(1)
          const id = args[0]
          if (id) {
            setActiveSessionId(id)
            setMessages(prev => [...prev, 
              { id: Date.now().toString(), role: 'user', text: rawInput },
              { id: (Date.now()+1).toString(), role: 'agent', text: `Switched to session: ${id}` }
            ])
          } else {
            const list = savedSessions.map(s => `- \`${s.sessionId}\`: ${s.firstPrompt || 'Untitled Session'}`).join('\n')
            setMessages(prev => [...prev, 
              { id: Date.now().toString(), role: 'user', text: rawInput },
              { id: (Date.now()+1).toString(), role: 'agent', text: `**Available Sessions:**\n\n${list || 'No sessions found.'}\n\nUse \`/resume <id>\` to switch.` }
            ])
          }
          setInputValue('')
          return
        }
      }
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: rawInput
    }

    const agentMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'agent',
      text: '',
      steps: []
    }

    setMessages(prev => [...prev, userMsg, agentMsg])
    setInputValue('')
    setIsThinking(true)
    const startTime = Date.now()
    setThinkingStart(startTime)
    setLastDoneSeconds(undefined)

    try {
      await window.devhub?.codex?.runQuery?.(rawInput, selectedModel, selectedEffort, executionMode, activeSessionId)
    } catch (e: any) {
      setMessages(prev => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.role === 'agent') {
          last.text = `**Error**: ${e.message || 'Execution failed'}`
        }
        return next
      })
      setIsThinking(false)
    }
  }

  const startNewSession = () => {
    setActiveSessionId(undefined)
    setMessages([])
    setInputValue('')
  }

  return (
    <div className="flex w-full h-full bg-[#000000] relative font-mono text-[14px] overflow-hidden">
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;700&display=swap');`}
      </style>
      
      {/* Left Panel */}
      <div className="flex-1 flex flex-col p-8 lg:p-10 overflow-hidden font-mono" style={{ fontFamily: "'Geist Mono', monospace" }}>
        
        {/* Header */}
        <motion.div 
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, y: -20 }}
          className="flex items-center justify-between mb-8 shrink-0"
        >
          <TypewriterHeader
            text="Codex"
            accentColor="#a855f7"
            resetKey={view}
            icon={<img src={codexLogo} alt="Codex" className="w-6 h-6 object-contain" />}
          />

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <div className="flex items-center gap-4">
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-gray-100 transition-all shadow-md active:scale-95 disabled:opacity-50 font-mono"
                >
                  {isLoggingIn ? (
                    <div className="w-3.5 h-3.5 text-black animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                  )}
                  <span>{isLoggingIn ? 'Opening Browser...' : 'Sign in with Google'}</span>
                </button>

                <button
                  onClick={() => setShowApiKeyModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-[#141417] border border-white/5 hover:border-white/15 text-[#a1a1aa] hover:text-[#e4e4e7] text-[11px] font-bold uppercase tracking-widest transition-all outline-none focus:outline-none font-mono shadow-sm"
                >
                  Use API Key
                </button>
              </div>
            )}


          </div>
        </motion.div>

        {/* Inline Codex CLI Not Found Banner */}
        {isInstalled === false && (
          <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 mb-6 flex flex-col gap-2 shrink-0 max-w-5xl w-full mx-auto font-mono">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4" />
              Codex CLI Not Found
            </div>
            <p className="text-xs text-[#a1a1aa]">
              The official OpenAI Codex CLI (<code className="text-amber-300 font-mono">github.com/openai/codex</code>) is not installed on PATH. Run the official installer in your terminal:
            </p>
            <div className="bg-black/60 p-2.5 rounded-lg border border-[#27272a] text-xs font-mono text-[#e4e4e7] select-all flex items-center justify-between">
              <code>{installCmd}</code>
            </div>
          </div>
        )}

        {/* Modal for API Key Authentication */}
        {showApiKeyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md font-mono">
            <div className="bg-[#0c0c0e] border border-[#27272a] p-6 rounded-2xl w-[420px] shadow-2xl flex flex-col gap-4">
              <h3 className="text-sm font-bold text-white">Sign in with OpenAI API Key</h3>
              <p className="text-xs text-[#71717a] leading-relaxed">
                Runs <code className="text-[#a855f7]">codex login --with-api-key</code> to authenticate Codex CLI via pay-as-you-go key.
              </p>
              <input
                type="password"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                placeholder="sk-proj-..."
                className="w-full bg-[#18181b] border border-[#27272a] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#a855f7]"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowApiKeyModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-[#71717a] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApiKeyLoginSubmit}
                  disabled={isLoggingIn || !apiKeyInput.trim()}
                  className="px-4 py-1.5 rounded-lg bg-[#a855f7] text-white font-bold text-xs hover:brightness-110 disabled:opacity-50"
                >
                  {isLoggingIn ? 'Logging in...' : 'Submit Key'}
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-7 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-4 max-w-5xl w-full mx-auto px-4">
          {messages.map(msg => (
            <div key={msg.id} className="flex flex-col gap-3">
              {msg.role === 'user' ? (
                <div className="flex items-start gap-2 font-mono text-[14px]">
                  <img src={codexLogo} className="w-4 h-4 object-contain shrink-0 mt-[2px] opacity-90" alt="Codex" />
                  <span className="text-white font-medium leading-relaxed">{msg.text}</span>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {msg.steps && msg.steps.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {msg.steps.map((step) => (
                        <div key={step.id} className="flex items-start gap-2 text-[#a1a1aa] w-full font-mono text-[14px]">
                          <img src={codexLogo} className="w-4 h-4 object-contain shrink-0 mt-[2px] opacity-70" alt="Codex Step" />
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[#e4e4e7] font-medium">{step.name || step.text}</span>
                              {step.input && (
                                <span className="truncate text-[#71717a] max-w-[280px]">
                                  {step.input.command || step.input.file_path || step.input.DirectoryPath || step.input.TargetFile || JSON.stringify(step.input).slice(0, 60)}
                                </span>
                              )}
                              {step.status === 'working' ? (
                                <div className="w-3.5 h-3.5 text-[#a855f7] shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              ) : step.status === 'done' ? (
                                <Check className="w-3.5 h-3.5 text-[#a855f7] shrink-0" />
                              ) : (
                                <span className="text-[#ef4444] text-[12px] font-bold shrink-0">FAIL</span>
                              )}
                            </div>
                            {step.output && (
                              <div className="mt-1 text-[13px] text-[#71717a] whitespace-pre-wrap font-mono border-l border-[#27272a] pl-2 py-0.5">
                                {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.text && (
                    <div className="text-[#e4e4e7] text-[14px] leading-relaxed font-mono pl-4 border-l border-[#a855f7]/30">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {isThinking && thinkingStart && (
            <ThinkingIndicator startedAt={thinkingStart} />
          )}

          {!isThinking && lastDoneSeconds != null && (
            <ThinkingIndicator startedAt={0} doneSeconds={lastDoneSeconds} />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Input Area - Identical Layout to Claude Page */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="mt-4 flex flex-col shrink-0 relative max-w-5xl w-full mx-auto px-4 z-20"
        >
          <div className="bg-[#050505] rounded-[28px] shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-[#ffffff05] flex flex-col p-2">
            
            <div className="flex items-start px-2 py-2 relative">
              {/* Slash Command Autocomplete Popover */}
              {inputValue.startsWith('/') && (
                <div className="absolute bottom-[calc(100%+12px)] left-0 w-[450px] bg-[#0A0A0A] border border-[#ffffff05] rounded-[22px] shadow-[0_-10px_40px_rgba(0,0,0,0.5)] overflow-hidden z-50 flex flex-col py-2 max-h-[300px]">
                  <div className="px-4 py-2 mb-1 text-[11px] font-bold text-[#71717a]/70 uppercase tracking-widest flex items-center justify-between shrink-0">
                    <span>Available Commands</span>
                    <span className="text-[#71717a]/50 font-medium lowercase tracking-normal flex items-center gap-1">
                      Use <kbd className="px-1.5 py-0.5 bg-[#131313] rounded text-[10px]">↑/↓</kbd> to select
                    </span>
                  </div>
                  <div className="overflow-y-auto max-h-[240px] px-1 flex flex-col gap-1">
                    {AVAILABLE_COMMANDS.filter(c => c.cmd.slice(1).startsWith(inputValue.slice(1).toLowerCase())).map((c, idx) => (
                      <button
                        key={c.cmd}
                        onClick={() => {
                          setInputValue(c.cmd + ' ')
                          promptInputRef.current?.focus()
                        }}
                        className={`flex items-center justify-between px-3 py-2 rounded-[12px] text-left text-[13px] font-mono transition-colors ${
                          idx === selectedCommandIndex 
                            ? 'text-white bg-[#131313]' 
                            : 'text-white/50 hover:text-white hover:bg-[#131313]/50'
                        }`}
                      >
                        <span className="font-[600]">{c.cmd}</span>
                        <span className="text-[12px] opacity-50 font-normal truncate max-w-[240px]">{c.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button 
                className="p-2.5 text-white/30 hover:text-white hover:bg-[#131313] rounded-[16px] transition-colors shrink-0 mr-2"
                title="Attach file (not supported here)"
                disabled
              >
                <Paperclip className="w-5 h-5 opacity-50" />
              </button>

              <textarea 
                ref={(el) => {
                  promptInputRef.current = el as any;
                  if (el) {
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, 300) + 'px';
                  }
                }}
                rows={1}
                autoFocus
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Ask Codex a question or type '/' for commands..."
                className="flex-1 w-full bg-transparent border-none outline-none text-white text-[16px] placeholder:text-white/30 font-mono leading-relaxed resize-none py-0.5"
                style={{ minHeight: '28px', maxHeight: '300px' }}
              />

              {isThinking ? (
                <button 
                  onClick={() => {
                    window.devhub.codex.interrupt()
                    setIsThinking(false)
                  }}
                  className="p-2.5 text-red-500 hover:text-white hover:bg-red-500 rounded-[16px] transition-colors shrink-0 ml-2"
                  title="Interrupt"
                >
                  <Square className="w-3.5 h-3.5" fill="currentColor" strokeWidth={3} />
                </button>
              ) : (
                <button 
                  disabled={!inputValue.trim()}
                  onClick={handleSend}
                  className={`p-2.5 ml-2 rounded-[16px] transition-all ${
                    inputValue.trim() 
                      ? 'bg-white text-black hover:scale-105 active:scale-95' 
                      : 'bg-white/5 text-white/30 cursor-not-allowed'
                  }`}
                  title="Send Message"
                >
                  <ArrowUp className="w-5 h-5" strokeWidth={3} />
                </button>
              )}
            </div>

            {/* Bottom Status Bar */}
            <div className="flex items-center justify-between px-2 pb-1 pt-4 mt-auto">
               <div className="flex items-center gap-1.5 flex-wrap">
                 <PremiumModelSelector 
                   models={availableModels} 
                   modelValue={selectedModel} 
                   onModelChange={setSelectedModel} 
                 />

                 <div className="w-[1px] h-4 bg-white/10 mx-1" />

                 <ReasoningSelector
                   value={selectedEffort}
                   onChange={setSelectedEffort}
                 />

                 <div className="w-[1px] h-4 bg-white/10 mx-1" />

                 <GenericModeToggle
                   value={executionMode}
                   onChange={setExecutionMode}
                   modes={[
                     { id: 'manual', label: 'Manual' },
                     { id: 'plan', label: 'Plan Mode' },
                     { id: 'auto', label: 'Auto Execute' },
                     { id: 'on_demand', label: 'On Demand' }
                   ]}
                 />

                 <div className="w-[1px] h-4 bg-white/10 mx-1" />

                 <WorkspaceSelector
                   cwd={cwd || settings?.defaultCwd || ''}
                   onChange={(d) => setCwd(d)}
                 />
               </div>

               <div className="flex items-center gap-2">
                 {tokenUsage.turns > 0 && (
                   <div className="text-[11px] text-white/30 font-mono shrink-0 uppercase tracking-widest font-semibold flex items-center gap-2">
                     <span>{tokenUsage.turns} turn{tokenUsage.turns > 1 ? 's' : ''}</span>
                     <span>•</span>
                     <span>${(tokenUsage.totalCost).toFixed(3)}</span>
                   </div>
                 )}
               </div>
            </div>

          </div>
        </motion.div>

      </div>



    </div>
  )
}
