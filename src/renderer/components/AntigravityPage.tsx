import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Check, ShieldAlert, Paperclip, Server, Square, ChevronDown, History, Plus, Clock, Trash2, Search, Folder, PanelRight, Zap, ArrowUp, Sparkles } from 'lucide-react'
import { PremiumModelSelector, GenericModeToggle, WorkspaceSelector } from './ComposerComponents'
import type { BridgeEvent } from '@shared/types'
import { useApp } from '../state'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import TypewriterHeader from './TypewriterHeader'
import antigravityLogo from '../../../icons/google-antigravity-32px.png'

const AVAILABLE_COMMANDS = [
  { cmd: '/clear', desc: 'Clear conversation history' },
  { cmd: '/compact', desc: 'Compact conversation context' },
  { cmd: '/cost', desc: 'View session cost and usage' },
  { cmd: '/context', desc: 'Show current token usage' },
  { cmd: '/resume', desc: 'List or switch sessions' },
  { cmd: '/help', desc: 'Show available commands' }
]

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
  "Pondering", "Simmering", "Noodling", "Percolating", "Marinating",
  "Cogitating", "Ruminating", "Musing", "Brewing", "Cerebrating",
  "Contemplating", "Deciphering", "Synthesizing", "Puzzling", "Tinkering",
  "Wrangling", "Orchestrating", "Sketching", "Untangling", "Forging",
]

function ThinkingIndicator({ startedAt, tokenCount, doneSeconds }: {
  startedAt: number
  tokenCount: number
  doneSeconds?: number
}) {
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
    <div className="flex items-center gap-2 mt-2 font-mono text-[14px] text-[#4285f4]">
      <span className="inline-flex w-4 justify-center"><Sparkles size={14} className="animate-pulse" aria-hidden="true" /></span>
      <span>{verb}…</span>
      <span className="text-[#71717a]">
        (esc to interrupt · {elapsedStr})
      </span>
    </div>
  )
}

const sessionMessageCache = new Map<string, Message[]>()

export default function AntigravityPage(): React.JSX.Element {
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

  const [isThinking, setIsThinking] = useState(false)
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null)
  const [turnDoneAt, setTurnDoneAt] = useState<number | null>(null)
  const [usage, setUsage] = useState({ cost: 0, turns: 0, inputTokens: 0, outputTokens: 0, contextTokens: 0 })

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [model, setModel] = useState('Gemini 3.6 Flash (Medium)')
  const [mode, setMode] = useState<'accept-edits' | 'plan' | 'default'>('accept-edits')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [availableSessions, setAvailableSessions] = useState<any[]>([])

  useEffect(() => {
    if (activeSessionId && messages.length > 0) {
      sessionMessageCache.set(activeSessionId, messages)
    }
  }, [messages, activeSessionId])

  useEffect(() => {
    window.devhub.antigravity.authStatus().then(setIsAuthenticated)
    window.devhub.antigravity.getModels().then(models => {
      if (models.length > 0) setAvailableModels(models)
    })
    window.devhub.antigravity.getSessions().then(setAvailableSessions).catch(() => {})
  }, [])

  useEffect(() => {
    let active = true
    const init = async () => {
      const info = await window.devhub.app.info()
      if (active) setCwd(settings?.defaultCwd || info.home)
    }
    void init()
    return () => { active = false }
  }, [settings?.defaultCwd])

  useEffect(() => {
    return window.devhub.antigravity.onEvent((e: BridgeEvent) => {
      switch (e.kind) {
        case 'init':
          setActiveSessionId(e.sessionId)
          window.devhub.antigravity.getSessions().then(setAvailableSessions).catch(() => {})
          break
        case 'text_delta':
          setMessages(prev => {
            const newMsgs = [...prev]
            const lastIdx = newMsgs.length - 1
            const last = newMsgs[lastIdx]
            
            if (!last || last.role === 'user') {
              newMsgs.push({ id: Date.now().toString(), role: 'agent', text: (e as any).text, steps: [] })
            } else {
              newMsgs[lastIdx] = { ...last, text: last.text + (e as any).text }
            }
            return newMsgs
          })
          break
        case 'tool_start':
          setMessages(prev => {
            const newMsgs = [...prev]
            const lastIdx = newMsgs.length - 1
            let last = newMsgs[lastIdx]
            
            if (!last || last.role === 'user') {
              last = { id: Date.now().toString(), role: 'agent', text: '', steps: [] }
              newMsgs.push(last)
            } else {
              last = { ...last }
              newMsgs[lastIdx] = last
            }
            
            last.steps = [...(last.steps || [])]
            if (!last.steps.some(s => s.id === e.id)) {
              last.steps.push({ 
                id: e.id, 
                name: e.name, 
                input: e.input,
                text: e.name || 'Executing Tool...', 
                status: 'working' 
              })
            }
            return newMsgs
          })
          break
        case 'tool_done':
          setIsThinking(true)
          setMessages(prev => {
            const newMsgs = [...prev]
            const lastIdx = newMsgs.length - 1
            const last = newMsgs[lastIdx]
            
            if (last && last.role === 'agent' && last.steps) {
              const newSteps = [...last.steps]
              const stepIdx = newSteps.findIndex(s => s.id === e.id)
              if (stepIdx !== -1) {
                 newSteps[stepIdx] = {
                   ...newSteps[stepIdx],
                   status: e.ok ? 'done' : 'failed',
                   output: (e as any).output
                 }
              }
              newMsgs[lastIdx] = { ...last, steps: newSteps }
            }
            return newMsgs
          })
          break
        case 'usage':
          setUsage(prev => ({
            cost: prev.cost + e.costUsd,
            turns: prev.turns + 1,
            inputTokens: e.inputTokens,
            outputTokens: e.outputTokens,
            contextTokens: e.contextTokens
          }))
          break
        case 'done':
          setIsThinking(false)
          setTurnDoneAt(Date.now())
          window.devhub.antigravity.getSessions().then(setAvailableSessions).catch(() => {})
          break
      }
    })
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!activeSessionId) return
    window.devhub.antigravity.getSessionHistory?.(activeSessionId).then((turns) => {
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
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cycle modes on Shift+Tab
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        setMode(prev => {
          if (prev === 'accept-edits') return 'plan'
          if (prev === 'plan') return 'default'
          return 'accept-edits'
        })
        return
      }

      if (e.key === 'Escape' && isThinking) {
        window.devhub.antigravity.interrupt()
        setIsThinking(false)
        setMessages(prev => {
          const newMsgs = [...prev]
          const lastIdx = newMsgs.length - 1
          const last = newMsgs[lastIdx]
          if (last && last.role === 'agent') {
            newMsgs[lastIdx] = { ...last, text: (last.text ? last.text + '\n\n' : '') + '[ Interrupted by user (Esc) ]' }
          } else {
            newMsgs.push({ id: Date.now().toString(), role: 'agent', text: '[ Interrupted by user (Esc) ]', steps: [] })
          }
          return newMsgs
        })
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
  }, [isThinking])

  const handleSend = () => {
    if (!inputValue.trim()) return

    setHistoryIndex(-1)
    setInputDraft('')

    const rawInput = inputValue.trim()

    if (rawInput.startsWith('/')) {
      const parts = rawInput.split(' ')
      const cmd = parts[0]
      switch (cmd) {
        case '/clear':
          setMessages([])
          setActiveSessionId(undefined)
          window.devhub.antigravity.clear()
          setInputValue('')
          return
        case '/cost':
          setMessages(prev => [...prev, 
            { id: Date.now().toString(), role: 'user', text: rawInput },
            { id: (Date.now() + 1).toString(), role: 'agent', text: `**Session Usage**\n\n- Turns: ${usage.turns}\n- Input tokens: ${usage.inputTokens.toLocaleString()}\n- Output tokens: ${usage.outputTokens.toLocaleString()}\n- Context tokens: ${usage.contextTokens.toLocaleString()}\n- Cost: $${usage.cost.toFixed(4)}` }
          ])
          setInputValue('')
          return
        case '/context':
          setMessages(prev => [...prev, 
            { id: Date.now().toString(), role: 'user', text: rawInput },
            { id: (Date.now() + 1).toString(), role: 'agent', text: `**Context Window**\n\n- Context tokens: ${usage.contextTokens.toLocaleString()}\n- Last input: ${usage.inputTokens.toLocaleString()} tokens\n- Last output: ${usage.outputTokens.toLocaleString()} tokens` }
          ])
          setInputValue('')
          return
        case '/help':
          setMessages(prev => [...prev, 
            { id: Date.now().toString(), role: 'user', text: rawInput },
            { id: (Date.now() + 1).toString(), role: 'agent', text: `**Available Commands**\n\n- \`/clear\` — Clear current chat history\n- \`/compact\` — Compact conversation context\n- \`/cost\` — View session cost and usage\n- \`/context\` — Show current context window\n- \`/resume\` — List or switch sessions\n- \`/help\` — Show this help` }
          ])
          setInputValue('')
          return
        case '/resume': {
          const args = parts.slice(1)
          const id = args[0]
          if (id) {
            if (activeSessionId && messages.length > 0) {
              sessionMessageCache.set(activeSessionId, messages)
            }
            setActiveSessionId(id)
            if (sessionMessageCache.has(id)) {
              setMessages(sessionMessageCache.get(id)!)
            } else {
              const matchedSession = availableSessions.find(s => s.sessionId === id)
              if (matchedSession?.firstPrompt) {
                setMessages([{ id: 'prompt-only', role: 'user', text: matchedSession.firstPrompt }])
              } else {
                setMessages([])
              }
            }
          } else {
            const list = availableSessions.map(s => `- \`${s.sessionId}\`: ${s.firstPrompt || 'Untitled Session'}`).join('\n')
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

    setInputValue('')
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: rawInput }])
    setIsThinking(true)
    setTurnStartedAt(Date.now())
    setTurnDoneAt(null)

    const activeCwd = settings?.defaultCwd || cwd

    window.devhub.antigravity.query(
      rawInput,
      activeCwd,
      activeSessionId,
      model,
      mode
    ).catch(e => {
      setIsThinking(false)
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', text: `[ Error: ${e.message} ]` }])
    })
  }

  const handleLogin = async () => {
    const result = await window.devhub.antigravity.login()
    if (result.success) {
      setIsAuthenticated(true)
    }
  }

  const switchToSession = useCallback((session: any) => {
    if (activeSessionId && messages.length > 0) {
      sessionMessageCache.set(activeSessionId, messages)
    }
    
    setActiveSessionId(session.sessionId)
    
    const cached = sessionMessageCache.get(session.sessionId)
    if (cached && cached.length > 0) {
      setMessages(cached)
    } else if (session.firstPrompt) {
      setMessages([{ id: 'prompt-only', role: 'user', text: session.firstPrompt, steps: [] }])
    } else {
      setMessages([])
    }
  }, [activeSessionId, messages])

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
            text="Antigravity"
            accentColor="#4285f4"
            resetKey={view}
            icon={<img src={antigravityLogo} alt="Antigravity" className="w-8 h-8 object-contain" />}
          />


        </motion.div>
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-7 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-4 max-w-5xl w-full mx-auto px-4">
          {messages.map(msg => (
            <div key={msg.id} className="flex flex-col gap-3">
              {msg.role === 'user' ? (
                <div className="flex items-start gap-2 font-mono text-[14px]">
                  <img src={antigravityLogo} className="w-4 h-4 object-contain shrink-0 mt-[2px] opacity-90" alt="Antigravity" />
                  <span className="text-white font-medium leading-relaxed">{msg.text}</span>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {msg.steps && msg.steps.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {msg.steps.map((step) => (
                        <div key={step.id} className="flex items-start gap-2 text-[#a1a1aa] w-full font-mono text-[14px]">
                          <img src={antigravityLogo} className="w-4 h-4 object-contain shrink-0 mt-[2px] opacity-70" alt="Antigravity Step" />
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[#e4e4e7] font-medium">{step.name || step.text}</span>
                              {step.input && (
                                <span className="truncate text-[#71717a] max-w-[280px]">
                                  {step.input.command || step.input.file_path || step.input.DirectoryPath || step.input.TargetFile || JSON.stringify(step.input).slice(0, 60)}
                                </span>
                              )}
                              {step.status === 'working' && <div className="w-4 h-4 text-[#4285f4] shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                              {step.status === 'done' && <Check className="w-4 h-4 text-[#22c55e] shrink-0" />}
                              {step.status === 'failed' && <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />}
                            </div>
                            {step.output && step.status === 'failed' && (
                              <div className="mt-2 text-[12px] text-red-400/80 whitespace-pre-wrap max-h-[180px] overflow-y-auto bg-red-950/20 px-3 py-2 rounded">
                                {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.text && (() => {
                    const interruptMatch = msg.text.match(/^([\s\S]*?)(\[ Interrupted[^\]]*\])\s*$/m)
                    if (interruptMatch && interruptMatch[2]) {
                      const beforeText = interruptMatch[1].trim()
                      const interruptText = interruptMatch[2]
                      return (
                        <>
                          {beforeText && (
                            <div className="text-[#e4e4e7] prose prose-invert max-w-none font-mono text-[14px] leading-relaxed">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {beforeText}
                              </ReactMarkdown>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-red-400 font-mono text-[13px] mt-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                            {interruptText}
                          </div>
                        </>
                      )
                    }
                    return (
                      <div className="text-[#e4e4e7] prose prose-invert max-w-none font-mono text-[14px] leading-relaxed">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          ))}
          
          {isThinking && turnStartedAt && (
            <ThinkingIndicator 
              startedAt={turnStartedAt} 
              tokenCount={Math.floor((messages[messages.length - 1]?.text?.length || 0) / 4)} 
              doneSeconds={turnDoneAt ? Math.floor((turnDoneAt - turnStartedAt) / 1000) : undefined}
            />
          )}
          
          <div ref={messagesEndRef} />
        </div>
        
        {/* Bottom Input */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="mt-4 flex flex-col shrink-0 relative max-w-5xl w-full mx-auto px-4 z-20"
        >
          <div className="bg-[#050505] rounded-[28px] shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-[#ffffff05] flex flex-col p-2">
            
            <div className="flex items-start px-2 py-2 relative">
              {inputValue.startsWith('/') && (() => {
                const searchTerms = inputValue.toLowerCase().split(' ')
                const filteredCommands = AVAILABLE_COMMANDS.filter(c => 
                  searchTerms.every(term => c.cmd.toLowerCase().includes(term) || c.desc.toLowerCase().includes(term))
                )

                if (filteredCommands.length === 0) return null

                return (
                  <AnimatePresence>
                    <motion.div 
                      initial={{ opacity: 0, y: 15, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.98 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="absolute bottom-[calc(100%+12px)] left-0 w-[500px] bg-[#0A0A0A] border border-[#ffffff05] rounded-[22px] shadow-[0_-10px_40px_rgba(0,0,0,0.5)] overflow-hidden z-50 flex flex-col py-2 max-h-[400px]"
                    >
                      <div className="px-4 py-2 mb-1 text-[11px] font-bold text-[#71717a]/70 uppercase tracking-widest flex items-center justify-between shrink-0">
                        <span>Available Commands</span>
                        <span className="text-[#71717a]/50 font-medium lowercase tracking-normal flex items-center gap-1">
                          Use <kbd className="px-1.5 py-0.5 bg-[#131313] rounded text-[10px]">↑/↓</kbd> to select
                        </span>
                      </div>
                      <div className="overflow-y-auto max-h-[340px] px-1 flex flex-col gap-1">
                        {filteredCommands.map((c, idx) => (
                          <button
                            key={c.cmd}
                            onClick={() => {
                              if (inputValue.trim() === c.cmd) {
                                handleSend()
                              } else {
                                setInputValue(c.cmd)
                              }
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
                    </motion.div>
                  </AnimatePresence>
                )
              })()}

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
                  const searchTerms = inputValue.toLowerCase().split(' ')
                  const filteredCommands = AVAILABLE_COMMANDS.filter(c => searchTerms.every(term => c.cmd.toLowerCase().includes(term) || c.desc.toLowerCase().includes(term)))
                  const isPopupOpen = inputValue.startsWith('/') && filteredCommands.length > 0
                  
                  if (isPopupOpen) {
                    if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setSelectedCommandIndex(prev => Math.max(0, prev - 1))
                      return
                    }
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setSelectedCommandIndex(prev => Math.min(filteredCommands.length - 1, prev + 1))
                      return
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (inputValue.trim() === filteredCommands[selectedCommandIndex]?.cmd) {
                        handleSend()
                      } else if (filteredCommands[selectedCommandIndex]) {
                        setInputValue(filteredCommands[selectedCommandIndex].cmd)
                      }
                      return
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setInputValue('')
                      return
                    }
                  }

                  if (e.key === 'ArrowUp') {
                    const userPrompts = messages.filter(m => m.role === 'user').map(m => m.text)
                    if (userPrompts.length > 0) {
                      e.preventDefault()
                      const nextIndex = historyIndex === -1 ? 0 : Math.min(historyIndex + 1, userPrompts.length - 1)
                      if (historyIndex === -1) {
                        setInputDraft(inputValue)
                      }
                      setHistoryIndex(nextIndex)
                      setInputValue(userPrompts[userPrompts.length - 1 - nextIndex])
                    }
                    return
                  }

                  if (e.key === 'ArrowDown') {
                    const userPrompts = messages.filter(m => m.role === 'user').map(m => m.text)
                    if (historyIndex >= 0) {
                      e.preventDefault()
                      const nextIndex = historyIndex - 1
                      setHistoryIndex(nextIndex)
                      if (nextIndex >= 0) {
                        setInputValue(userPrompts[userPrompts.length - 1 - nextIndex])
                      } else {
                        setInputValue(inputDraft)
                      }
                    }
                    return
                  }

                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Ask Antigravity..."
                className="flex-1 w-full bg-transparent border-none outline-none text-white text-[16px] placeholder:text-white/30 font-mono leading-relaxed resize-none py-0.5"
                style={{ minHeight: '28px', maxHeight: '300px' }}
              />

              {isThinking ? (
                <button 
                  onClick={() => {
                    window.devhub.antigravity.interrupt()
                    setIsThinking(false)
                  }}
                  className="p-2.5 text-red-500 hover:text-white hover:bg-red-500 rounded-[16px] transition-colors shrink-0 ml-2"
                  title="Interrupt Antigravity"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button 
                  disabled={!inputValue.trim()}
                  onClick={handleSend}
                  className={`p-2.5 rounded-full transition-all ml-2 ${
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
                   modelValue={model} 
                   onModelChange={setModel} 
                 />

                 <div className="w-[1px] h-4 bg-white/10 mx-1" />

                 <GenericModeToggle
                   value={mode}
                   onChange={(v) => setMode(v as any)}
                   modes={[
                     { id: 'default', label: 'Manual' },
                     { id: 'plan', label: 'Plan Mode' },
                     { id: 'accept-edits', label: 'Auto Accept' }
                   ]}
                 />

                 <div className="w-[1px] h-4 bg-white/10 mx-1" />

                 <WorkspaceSelector
                   cwd={cwd || settings?.defaultCwd || ''}
                   onChange={(d) => setCwd(d)}
                 />
               </div>

               <div className="flex items-center gap-2">
                 {usage.turns > 0 && (
                   <div className="text-[11px] text-white/30 font-mono shrink-0 uppercase tracking-widest font-semibold flex items-center gap-2">
                     <span>{usage.turns} turn{usage.turns > 1 ? 's' : ''}</span>
                     <span>•</span>
                     <span>${(usage.cost).toFixed(3)}</span>
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

function AntigravityModelSelector({ models, value, onChange }: { models: string[], value: string, onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function click(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [open])

  const shortName = (m: string) => {
    const match = m.match(/^(.+?)\s*\(/)
    return match ? match[1].trim() : m
  }

  return (
    <div className="relative font-mono" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] text-[#5A5A5A] hover:text-[#FFFFFF] transition-colors outline-none"
      >
        <span className="font-bold uppercase tracking-widest">{shortName(value)}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            className="absolute bottom-[calc(100%+8px)] left-0 w-[260px] bg-[#0a0a0b]/95 backdrop-blur-xl border border-[#27272a] rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col py-1.5"
          >
            <div className="px-3 py-1.5 text-[11px] font-bold text-[#71717a] uppercase tracking-wider flex items-center justify-between">
              <span>Model</span>
            </div>
            <div className="max-h-[280px] overflow-y-auto">
              {models.map(m => {
                const isSelected = value === m
                return (
                  <button
                    key={m}
                    onClick={() => { onChange(m); setOpen(false) }}
                    className={`w-full flex items-center justify-between px-2 py-1 text-xs text-left transition-colors uppercase tracking-widest font-bold ${
                      isSelected ? 'text-[#FFFFFF]' : 'text-[#5A5A5A] hover:text-[#FFFFFF]'
                    }`}
                  >
                    <span>{m}</span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function AntigravityModeSelector({ value, onChange }: { value: 'accept-edits' | 'plan' | 'default', onChange: (v: 'accept-edits' | 'plan' | 'default') => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function click(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [open])

  const MODES: { id: 'accept-edits' | 'plan' | 'default', label: string, desc: string, color: string, activeClass: string, dotClass: string }[] = [
    { 
      id: 'accept-edits', 
      label: 'Auto Accept', 
      desc: 'Automatically execute file edits & commands',
      color: 'text-red-400',
      activeClass: 'bg-red-500/15 text-red-400',
      dotClass: 'bg-red-400'
    },
    { 
      id: 'plan', 
      label: 'Plan Mode', 
      desc: 'Draft architectural plans without editing code',
      color: 'text-yellow-400',
      activeClass: 'bg-yellow-500/15 text-yellow-400',
      dotClass: 'bg-yellow-400'
    },
    { 
      id: 'default', 
      label: 'Manual Approval', 
      desc: 'Ask for confirmation before running tools',
      color: 'text-emerald-400',
      activeClass: 'bg-emerald-500/15 text-emerald-400',
      dotClass: 'bg-emerald-400'
    },
  ]

  const currentMode = MODES.find(m => m.id === value) || MODES[0]

  return (
    <div className="relative font-mono" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] text-[#5A5A5A] hover:text-[#FFFFFF] transition-colors outline-none"
        title="Press Shift+Tab to cycle modes"
      >
        <span className="font-bold uppercase tracking-widest">{currentMode.label}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            className="absolute bottom-[calc(100%+8px)] left-0 w-[300px] bg-[#0a0a0b]/95 backdrop-blur-xl border border-[#27272a] rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col p-1.5"
          >
            <div className="px-3 py-2 text-[11px] font-bold text-[#71717a] uppercase tracking-wider flex items-center justify-between">
              <span>Execution Mode</span>
              <span className="text-[11px] text-[#71717a]/70 font-mono">Shift+Tab to cycle</span>
            </div>
            <div className="flex flex-col space-y-1">
              {MODES.map(m => {
                const isSelected = value === m.id
                return (
                  <button
                    key={m.id}
                    onClick={() => { onChange(m.id); setOpen(false) }}
                    className={`w-full flex flex-col px-2 py-1 text-xs text-left transition-colors uppercase tracking-widest ${isSelected ? 'font-bold text-[#FFFFFF]' : 'text-[#5A5A5A] hover:text-[#FFFFFF]'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{m.label}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
