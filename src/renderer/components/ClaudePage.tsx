import React, { useEffect, useState, useRef } from 'react'
import { Check, ShieldAlert, Paperclip, Server, Square, ChevronDown, History, Plus, Clock, Trash2, Search, Folder, PanelRight, ArrowUp } from 'lucide-react'
import { ExpandableSettings } from './ExpandableSettings'
import type { BridgeEvent, ClaudeSessionMetadata } from '@shared/types'
import { PremiumModelSelector, ReasoningSelector, GenericModeToggle, WorkspaceSelector } from './ComposerComponents'
import { useApp } from '../state'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import TypewriterHeader from './TypewriterHeader'
import claudeIconUrl from '../../../icons/claude-code-color-32px.png'

const AVAILABLE_COMMANDS = [
  { cmd: '/clear', desc: 'Clear conversation history' },
  { cmd: '/compact', desc: 'Compact conversation context' },
  { cmd: '/cost', desc: 'View session cost and usage' },
  { cmd: '/context', desc: 'Show current token usage' },
  { cmd: '/resume', desc: 'List or switch sessions' },
  { cmd: '/help', desc: 'Show available commands' },
  { cmd: '/doctor', desc: 'Check environment health' },
  { cmd: '/review', desc: 'Review code changes' },
  { cmd: '/bug', desc: 'Find and fix bugs' },
  { cmd: '/deep-research', desc: 'Run deep research' },
  { cmd: '/goal', desc: 'Set an overarching goal' },
  { cmd: '/context', desc: 'Show current context window size' }
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
  role: 'user' | 'claude'
  text: string
  steps?: Step[]
}

const VERBS = [
  "Pondering", "Simmering", "Noodling", "Percolating", "Marinating",
  "Cogitating", "Ruminating", "Musing", "Brewing", "Cerebrating",
  "Contemplating", "Deciphering", "Synthesizing", "Puzzling", "Tinkering",
  "Wrangling", "Orchestrating", "Sketching", "Untangling", "Forging",
]
const SPINNER_FRAMES = ["✶", "✻", "✽", "✢"]

function ThinkingIndicator({ startedAt, tokenCount, doneSeconds }: {
  startedAt: number
  tokenCount: number
  doneSeconds?: number
}) {
  const [frame, setFrame] = useState(0)
  const [verb] = useState(() => VERBS[Math.floor(Math.random() * VERBS.length)])
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (doneSeconds != null) return
    const spin = setInterval(() => setFrame(f => (f + 1) % SPINNER_FRAMES.length), 120)
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => { clearInterval(spin); clearInterval(tick); }
  }, [startedAt, doneSeconds])

  const mm = Math.floor(elapsed / 60), ss = elapsed % 60
  const elapsedStr = mm > 0 ? `${mm}m ${ss}s` : `${ss}s`
  const tokenStr = tokenCount >= 1000 ? `${(tokenCount / 1000).toFixed(1)}k` : `${tokenCount}`

  if (doneSeconds != null) {
    return (
      <div className="flex items-center gap-2 mt-2 font-mono text-[13px] text-[#71717a]">
        <span className="inline-block w-4 text-center">✳</span>
        <span>thought for {doneSeconds}s</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 mt-2 font-mono text-[13px]" style={{ color: "var(--accent)" }}>
      <span className="inline-block w-4 text-center">{SPINNER_FRAMES[frame]}</span>
      <span>{verb}…</span>
      <span className="text-[#71717a]">
        (esc to interrupt · {elapsedStr} · ↓ {tokenStr} tokens)
      </span>
    </div>
  )
}

const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)

function formatSessionMessages(rawMsgs: any[], fallbackPrompt?: string): Message[] {
  if (!Array.isArray(rawMsgs) || rawMsgs.length === 0) {
    if (fallbackPrompt) {
      return [{ id: 'prompt-only', role: 'user', text: fallbackPrompt, steps: [] }]
    }
    return []
  }

  const parsed: Message[] = []

  for (const rm of rawMsgs) {
    if (!rm) continue
    
    if (rm.type === 'system' || rm.message?.role === 'system') continue
    
    const role: 'user' | 'claude' = (rm.type === 'user' || rm.message?.role === 'user') ? 'user' : 'claude'
    const content = rm.message?.content ?? rm.content ?? rm.text
    
    let text = ''
    const steps: { id: string; name: string; input: any; text: string; status: 'done' | 'working' | 'failed'; output?: any }[] = []
    
    if (typeof content === 'string') {
      text = content
    } else if (Array.isArray(content)) {
      const textParts: string[] = []
      for (const block of content) {
        if (!block) continue
        if (typeof block === 'string') {
          textParts.push(block)
        } else if (block.type === 'text' && typeof block.text === 'string') {
          textParts.push(block.text)
        } else if (block.type === 'tool_use') {
          steps.push({
            id: block.id || crypto.randomUUID(),
            name: block.name || 'Tool',
            input: block.input,
            text: block.input?.description || block.input?.command || block.name || 'Tool Execution',
            status: 'done'
          })
        } else if (block.type === 'tool_result') {
          const matched = steps.find(s => s.id === block.tool_use_id)
          if (matched) {
            matched.output = block.content
            if (block.is_error) matched.status = 'failed'
          }
        }
      }
      text = textParts.join('\n\n')
    } else if (content && typeof content === 'object') {
      if (typeof content.text === 'string') text = content.text
    }

    if (!text.trim() && steps.length === 0) continue

    parsed.push({
      id: rm.uuid || rm.id || `hist-${parsed.length}`,
      role,
      text: text.trim(),
      steps
    })
  }

  if (fallbackPrompt && !parsed.some(m => m.role === 'user')) {
    parsed.unshift({
      id: 'first-prompt',
      role: 'user',
      text: fallbackPrompt,
      steps: []
    })
  }

  return parsed
}

export default function ClaudePage(): React.JSX.Element {
  const { view, settings, setSettings } = useApp()
  const [inputValue, setInputValue] = useState('')
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)

  
  useEffect(() => {
    setSelectedCommandIndex(0)
  }, [inputValue])
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const promptInputRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  
  const [messages, setMessages] = useState<Message[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState('')
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const [inputDraft, setInputDraft] = useState<string>('')
  const [cwd, setCwd] = useState('/')
  const [permissionMode, setPermissionMode] = useState<string>('acceptEdits')

  // Status metrics
  const [mcpServers, setMcpServers] = useState<{name: string, status: string}[]>([])
  const [permissionRequest, setPermissionRequest] = useState<{id: string, tool: string, input: any} | null>(null)
  const [isThinking, setIsThinking] = useState(false)
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null)
  const [turnDoneAt, setTurnDoneAt] = useState<number | null>(null)
  const [usage, setUsage] = useState({ cost: 0, turns: 0, inputTokens: 0, outputTokens: 0, contextTokens: 0 })
  const [availableSessions, setAvailableSessions] = useState<ClaudeSessionMetadata[]>([])
  const [showHistoryMenu, setShowHistoryMenu] = useState(false)
  
  // Fetch sessions on mount
  useEffect(() => {
    window.devhub.claude.getSessions().then(setAvailableSessions).catch(console.error)
  }, [])
  
  const [detectedModels, setDetectedModels] = useState<string[]>([])

  // Auto-detect models
  useEffect(() => {
    if (settings?.claudeApiKey) {
      window.devhub.claude.getModels(settings.claudeBaseUrl, settings.claudeApiKey)
        .then((models: string[]) => {
           if (models.length > 0) {
             setDetectedModels(models)
             window.devhub.settings.get().then(currentSettings => {
               if (!currentSettings.claudeModel || !models.includes(currentSettings.claudeModel)) {
                 setSettings({ claudeModel: models[0] })
               }
             })
           } else {
             const defaultModels = ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
             setDetectedModels(defaultModels)
             window.devhub.settings.get().then(currentSettings => {
               if (!currentSettings.claudeModel || !defaultModels.includes(currentSettings.claudeModel)) {
                 setSettings({ claudeModel: defaultModels[0] })
               }
             })
           }
        })
        .catch(() => {
           const defaultModels = ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
           setDetectedModels(defaultModels)
           window.devhub.settings.get().then(currentSettings => {
             if (!currentSettings.claudeModel || !defaultModels.includes(currentSettings.claudeModel)) {
               setSettings({ claudeModel: defaultModels[0] })
             }
           })
        })
    } else {
       const defaultModels = ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
       setDetectedModels(defaultModels)
       window.devhub.settings.get().then(currentSettings => {
         if (!currentSettings.claudeModel || !defaultModels.includes(currentSettings.claudeModel)) {
           setSettings({ claudeModel: defaultModels[0] })
         }
       })
    }
  }, [settings?.claudeApiKey, settings?.claudeBaseUrl])

  // Initialize data
  useEffect(() => {
    let active = true
    const init = async () => {
      const info = await window.devhub.app.info()
      if (active) setCwd(info.home)
      
      await window.devhub.claude.getSessions()
    }
    void init()
    return () => { active = false }
  }, [])

  // Listen to Claude SDK events over IPC bridge
  useEffect(() => {
    return window.devhub.claude.onEvent((e: BridgeEvent) => {
      switch (e.kind) {
        case 'init':
          setActiveSessionId(e.sessionId)
          setMcpServers(e.mcp)
          window.devhub.claude.getSessions().then(setAvailableSessions).catch(() => {})
          break
        case 'text_delta':
          setMessages(prev => {
            const newMsgs = [...prev]
            const lastIdx = newMsgs.length - 1
            const last = newMsgs[lastIdx]
            
            if (!last || last.role === 'user') {
              newMsgs.push({ id: Date.now().toString(), role: 'claude', text: (e as any).text, steps: [] })
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
              last = { id: Date.now().toString(), role: 'claude', text: '', steps: [] }
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
                text: `Running ${e.name}...`, 
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
            
            if (last && last.role === 'claude' && last.steps) {
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
        case 'compact_boundary':
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'claude',
            text: `\`compacted context · ${e.trigger} · ${(e.preTokens / 1000).toFixed(1)}k → ${(e.postTokens / 1000).toFixed(1)}k tokens\``
          }])
          break
        case 'permission_request':
          setIsThinking(false)
          setPermissionRequest({ id: e.id, tool: e.tool, input: e.input })
          break
        case 'done':
          setIsThinking(false)
          setTurnDoneAt(Date.now())
          window.devhub.claude.getSessions().then((s: any) => {
            if (Array.isArray(s)) setAvailableSessions(s)
          }).catch(() => {})
          break
      }
    })

    window.devhub.claude.getSessions().then((s: any) => {
      if (Array.isArray(s)) {
        setAvailableSessions(s)
        if (s.length > 0 && !activeSessionId) {
          setActiveSessionId(s[0].sessionId)
        }
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!activeSessionId) return
    window.devhub.claude.getSessionMessages(activeSessionId).then((turns) => {
      if (Array.isArray(turns) && turns.length > 0) {
        const loadedMsgs: Message[] = turns.map((t: any) => ({
          id: t.id,
          role: t.role === 'user' ? 'user' : 'claude',
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

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Global typing focus & Escape to interrupt & Shift+Tab to cycle permission modes
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cycle permission modes on Shift+Tab
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        setPermissionMode(prev => {
          if (prev === 'acceptEdits') return 'bypassPermissions'
          if (prev === 'bypassPermissions') return 'plan'
          if (prev === 'plan') return 'default'
          if (prev === 'default') return 'dontAsk'
          return 'acceptEdits'
        })
        return
      }

      if (e.key === 'Escape' && isThinking) {
        window.devhub.claude.interrupt()
        setIsThinking(false)
        setMessages(prev => {
          const newMsgs = [...prev]
          const lastIdx = newMsgs.length - 1
          const last = newMsgs[lastIdx]
          if (last && last.role === 'claude') {
            newMsgs[lastIdx] = { ...last, text: (last.text ? last.text + '\n\n' : '') + '[ Interrupted by user (Esc) ]' }
          } else {
            newMsgs.push({ id: Date.now().toString(), role: 'claude', text: '[ Interrupted by user (Esc) ]', steps: [] })
          }
          return newMsgs
        })
        return
      }
      
      // Don't intercept if ctrl/cmd/alt is pressed, or if already focused on an input/textarea
      if (e.ctrlKey || e.metaKey || e.altKey) return
      
      const activeTag = document.activeElement?.tagName.toLowerCase()
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return
      
      // If it's a printable character
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

    // Intercept slash commands client-side
    if (rawInput.startsWith('/')) {
      const [cmd, ...args] = rawInput.slice(1).split(' ')
      switch (cmd) {
        case 'resume':
          if (args[0]) {
            const id = args[0]
            setActiveSessionId(id)
            window.devhub.claude.getSessionMessages(id).then(rawMsgs => {
              const matchedSession = availableSessions.find(s => s.sessionId === id)
              const newMsgs = formatSessionMessages(rawMsgs, matchedSession?.firstPrompt)
              setMessages(newMsgs)
            }).catch(console.error)
          } else {
            const list = availableSessions.map(s => `- \`${s.sessionId}\`: ${s.firstPrompt || 'Untitled Session'}`).join('\n')
            setMessages(prev => [...prev, 
              { id: Date.now().toString(), role: 'user', text: rawInput },
              { id: (Date.now()+1).toString(), role: 'claude', text: `**Available Sessions:**\n\n${list || 'No sessions found.'}\n\nUse \`/resume <id>\` to switch.` }
            ])
          }
          setInputValue('')
          return
        case 'clear':
          setMessages([])
          setActiveSessionId(undefined)
          setInputValue('')
          return

        case 'cost':
          setMessages(prev => [...prev, 
            { id: Date.now().toString(), role: 'user', text: rawInput },
            { id: (Date.now() + 1).toString(), role: 'claude', text: `**Session Cost:** $${usage.cost.toFixed(4)}\n**Total Turns:** ${usage.turns}` }
          ])
          setInputValue('')
          return
        case 'doctor':
          setMessages(prev => [...prev, 
            { id: Date.now().toString(), role: 'user', text: rawInput },
            { id: (Date.now() + 1).toString(), role: 'claude', text: `🩺 **Environment Health Check**:\n- Node.js: v24.x\n- Electron: 43.x\n- Working Dir: \`${cwd}\`\n- Permission Mode: \`${permissionMode}\`\n- System Status: Healthy` }
          ])
          setInputValue('')
          return
        case 'review':
        case 'bug':
        case 'deep-research':
        case 'goal':
          // Pass command to query execution for real prompt processing
          break
        default:
          break
      }
    }

    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: rawInput }])
    setIsThinking(true)
    setTurnStartedAt(Date.now())
    setTurnDoneAt(null)
    void window.devhub.claude.query(rawInput, cwd, activeSessionId, permissionMode)
    setInputValue('')
  }

  const handleFileUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.onchange = (e: any) => {
      const file = e.target.files[0]
      if (file && file.path) {
        setInputValue(prev => prev + (prev ? ' ' : '') + `"${file.path}" `)
        promptInputRef.current?.focus()
      }
    }
    input.click()
  }

  const handleApprove = (allow: boolean) => {
    if (permissionRequest) {
      void window.devhub.claude.allowTool(permissionRequest.id, allow, allow ? undefined : 'User denied')
      setPermissionRequest(null)
    }
  }

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
            text="Claude Code"
            accentColor="#f97316"
            resetKey={view}
            icon={
              <div className="w-10 h-10 text-[#f97316] flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
                  <path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M4.9 19.1l14.2-14.2" />
                </svg>
              </div>
            }
          />


        </motion.div>
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-7 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-4 max-w-5xl w-full mx-auto px-4">
          {messages.map(msg => (
            <div key={msg.id} className="flex flex-col gap-3">
              {msg.role === 'user' ? (
                <div className="flex items-start gap-2 font-mono text-[14px]">
                  <img src={claudeIconUrl} className="w-4 h-4 object-contain shrink-0 mt-[2px] opacity-90" alt="Claude" />
                  <span className="text-white font-medium leading-relaxed">{msg.text}</span>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {msg.steps && msg.steps.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {msg.steps.map((step) => (
                        <div key={step.id} className="flex items-start gap-2 text-[#a1a1aa] w-full font-mono text-[14px]">
                          <img src={claudeIconUrl} className="w-4 h-4 object-contain shrink-0 mt-[2px] opacity-70" alt="Claude Step" />
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[#e4e4e7] font-medium">{step.name || step.text}</span>
                              {step.input && (
                                <span className="truncate text-[#71717a] max-w-[280px]">
                                  {step.input.command || step.input.script || step.input.file_path || step.input.path || step.input.TargetFile || JSON.stringify(step.input).slice(0, 60)}
                                </span>
                              )}
                              {step.status === 'working' && <div className="w-4 h-4 rounded-full border-2 border-[#f97316]/30 border-t-[#f97316] animate-spin shrink-0" />}
                              {step.status === 'done' && <Check className="w-4 h-4 text-[#22c55e] shrink-0" />}
                              {step.status === 'failed' && <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />}
                            </div>
                            {step.output && step.status === 'failed' && (
                              <div className="mt-2 text-[12px] text-red-400/80 whitespace-pre-wrap max-h-[180px] overflow-y-auto bg-red-950/20 px-3 py-2 rounded">
                                {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
                              </div>
                            )}
                            {step.output && step.status !== 'failed' && (step.name === 'Bash' || step.name === 'Command' || step.name?.toLowerCase().includes('bash')) && (
                              <div className="mt-2 text-[12px] text-[#71717a] whitespace-pre-wrap max-h-[240px] overflow-y-auto">
                                {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.text && (() => {
                    const interruptMatch = msg.text.match(/^([\s\S]*?)(\[ Interrupted[^\]]*\])$/m)
                    const contentToRender = interruptMatch ? interruptMatch[1].trim() : msg.text

                    const parts = contentToRender.split(/(<thinking>[\s\S]*?<\/thinking>)/)
                    const renderedContent = parts.map((part, i) => {
                      if (part.startsWith('<thinking>')) {
                        const inner = part.replace('<thinking>', '').replace('</thinking>', '').trim()
                        if (!inner) return null
                        return (
                          <motion.div 
                            key={i}
                            initial={{ opacity: 0, y: 10 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            className="my-3 py-2 pl-4"
                          >
                            <div className="font-mono text-[13px] leading-relaxed text-[#71717A] uppercase tracking-widest mb-2 flex items-center gap-2">
                              reasoning
                            </div>
                            <div className="text-[#f97316]/90 text-[13px] italic leading-relaxed whitespace-pre-wrap font-mono">
                              {inner}
                            </div>
                          </motion.div>
                        )
                      }
                      return part.trim() ? (
                        <div key={i} className="text-[#e4e4e7] prose prose-invert max-w-none font-mono text-[14px] leading-relaxed">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{part}</ReactMarkdown>
                        </div>
                      ) : null
                    })

                    return (
                      <>
                        {renderedContent}
                        {interruptMatch && interruptMatch[2] && (
                          <div className="flex items-center gap-2 text-red-400 font-mono text-[13px] mt-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                            {interruptMatch[2]}
                          </div>
                        )}
                      </>
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
                let dynamicCommands = AVAILABLE_COMMANDS
                if (inputValue.startsWith('/resume ') || inputValue.trim() === '/resume') {
                  dynamicCommands = [
                    ...AVAILABLE_COMMANDS.filter(c => c.cmd !== '/resume'),
                    ...availableSessions.map(s => ({
                      cmd: `/resume ${s.sessionId}`,
                      desc: `"${s.firstPrompt}" - ${new Date(s.startedAt).toLocaleDateString()}`
                    }))
                  ]
                }
                
                const searchTerms = inputValue.toLowerCase().split(' ')
                const filteredCommands = dynamicCommands.filter(c => 
                  searchTerms.every(term => c.cmd.toLowerCase().includes(term) || c.desc.toLowerCase().includes(term))
                )

                if (filteredCommands.length === 0 && !inputValue.startsWith('/resume')) return null

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
                onClick={handleFileUpload}
                className="p-2.5 text-white/30 hover:text-white hover:bg-[#131313] rounded-[16px] transition-colors shrink-0 mr-2"
                title="Attach file"
              >
                <Paperclip className="w-5 h-5" />
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
                  if (inputValue.startsWith('/')) {
                    const dynamicCommands = inputValue.startsWith('/resume') 
                      ? availableSessions.map(s => ({ cmd: `/resume ${s.sessionId}`, desc: s.firstPrompt }))
                      : AVAILABLE_COMMANDS
                    const searchTerms = inputValue.toLowerCase().split(' ')
                    const filteredCommands = dynamicCommands.filter(c => 
                      searchTerms.every(term => c.cmd.toLowerCase().includes(term) || c.desc.toLowerCase().includes(term))
                    )

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

                  if (e.key === 'Tab') {
                    e.preventDefault()
                    return
                  }

                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Ask anything..."
                className="flex-1 w-full bg-transparent border-none outline-none text-white text-[16px] placeholder:text-white/30 font-mono leading-relaxed resize-none py-0.5"
                style={{ minHeight: '28px', maxHeight: '300px' }}
              />

              {isThinking ? (
                <button 
                  onClick={() => {
                    window.devhub.claude.interrupt()
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
                   models={detectedModels} 
                   modelValue={settings?.claudeModel || 'Select Model...'} 
                   onModelChange={(m) => setSettings({ claudeModel: m })} 
                 />

                 <div className="w-[1px] h-4 bg-white/10 mx-1" />

                 <ReasoningSelector 
                   value={(settings?.claudeEffort || 'medium').toLowerCase()} 
                   onChange={(e) => setSettings({ claudeEffort: e as any })} 
                 />

                 <div className="w-[1px] h-4 bg-white/10 mx-1" />

                 <GenericModeToggle
                   value={permissionMode === 'bypassPermissions' ? 'acceptEdits' : permissionMode}
                   onChange={setPermissionMode}
                   modes={[
                     { id: '', label: 'Manual' },
                     { id: 'acceptEdits', label: 'Auto Execute' }
                   ]}
                 />

                 <div className="w-[1px] h-4 bg-white/10 mx-1" />

                 <WorkspaceSelector
                   cwd={cwd || settings?.defaultCwd || ''}
                   onChange={(d) => setCwd(d)}
                 />
                 
                 <div className="w-[1px] h-4 bg-white/10 mx-1" />
                 
                 <ExpandableSettings />
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

      {/* Permission Approval Modal */}
      {permissionRequest && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm z-50">
          <div className="bg-[#0a0a0b] border border-[#27272a]/60 rounded-lg p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-center gap-3 text-[#f97316] mb-4">
              <ShieldAlert className="w-6 h-6" />
              <h2 className="text-lg font-bold text-white">Tool Execution Request</h2>
            </div>
            
            <p className="text-[#a1a1aa] mb-4">
              Claude is requesting permission to execute <span className="font-bold text-white">{permissionRequest.tool}</span>.
            </p>
            
            <div className="bg-[#000000] p-4 rounded border border-[#27272a]/40 mb-6 overflow-x-auto">
              <pre className="text-xs text-[#e4e4e7]">
                {JSON.stringify(permissionRequest.input, null, 2)}
              </pre>
            </div>
            
            <div className="flex justify-end gap-3">
              <button 
                className="px-4 py-2 rounded text-[#a1a1aa] hover:bg-[#27272a]/40 transition-colors"
                onClick={() => handleApprove(false)}
              >
                Deny
              </button>
              <button 
                className="px-4 py-2 rounded bg-[#f97316] text-black font-bold hover:bg-[#fb923c] transition-colors"
                onClick={() => handleApprove(true)}
              >
                Allow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatModelName(id: string) {
  let name = id.replace(/[-_]/g, ' ')
  name = name.replace(/\bclaude\b/i, 'Claude')
  name = name.replace(/\bopus\b/i, 'Opus')
  name = name.replace(/\bsonnet\b/i, 'Sonnet')
  name = name.replace(/\bhaiku\b/i, 'Haiku')
  name = name.replace(/(\d)\s(\d)/g, '$1.$2') // e.g., 3 5 -> 3.5
  name = name.replace(/\s\d{8}\b/, '') // remove trailing dates like 20240620
  
  if (!id.toLowerCase().includes('claude')) {
    // Basic capitalization for non-claude models like OpenAI, Gemini etc.
    name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }
  return name.trim()
}

function UnifiedModelSelector({ 
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
    function click(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [open])

  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) window.addEventListener('keydown', keyHandler)
    return () => window.removeEventListener('keydown', keyHandler)
  }, [open])

  const effortOptions = ['low', 'medium', 'high', 'xhigh', 'max']

  return (
    <div className="relative font-mono" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] text-[#5A5A5A] hover:text-[#FFFFFF] transition-colors outline-none"
      >
        <span className="font-bold tracking-widest uppercase">{formatModelName(modelValue)}</span>
        <span className="uppercase tracking-widest">/ {effortValue}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            className="absolute bottom-[calc(100%+8px)] left-0 w-[340px] bg-[#0a0a0b]/95 backdrop-blur-xl border border-[#27272a] rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col p-1.5"
          >
            <div className="px-3 py-2 text-[10px] font-bold text-[#71717a] uppercase tracking-wider">
              Claude Models
            </div>
            <div className="max-h-[220px] overflow-y-auto flex flex-col space-y-0.5">
              {models.map(m => {
                const isSelected = modelValue === m
                return (
                  <button
                    key={m}
                    onClick={() => { onModelChange(m); setOpen(false) }}
                    className={`w-full flex items-center justify-between px-2 py-1 text-xs text-left transition-colors uppercase tracking-widest font-bold ${isSelected ? 'text-[#FFFFFF]' : 'text-[#5A5A5A] hover:text-[#FFFFFF]'}`}
                  >
                    <span>{formatModelName(m)}</span>
                  </button>
                )
              })}
            </div>

            <div className="mt-2 flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-widest text-[#5A5A5A] font-bold">Reasoning Effort</div>
              <div className="flex gap-2 relative">
                {effortOptions.map(e => {
                  const isSelected = effortValue === e
                  return (
                    <button
                      key={e}
                      onClick={() => { onEffortChange(e) }}
                      className={`text-[10px] uppercase tracking-widest transition-colors font-bold ${
                        isSelected 
                          ? 'text-[#FFFFFF]' 
                          : 'text-[#5A5A5A] hover:text-[#FFFFFF]'
                      }`}
                    >
                      {e}
                    </button>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ClaudeModeSelector({ value, onChange }: { value: string, onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function click(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [open])

  const MODES: { id: string, label: string, desc: string, color: string, activeClass: string, dotClass: string }[] = [
    { 
      id: 'acceptEdits', 
      label: 'Auto Accept', 
      desc: 'Auto-accept file edits without prompting',
      color: 'text-red-400',
      activeClass: 'bg-red-500/15 text-red-400',
      dotClass: 'bg-red-400'
    },
    { 
      id: 'bypassPermissions', 
      label: 'Bypass Permissions', 
      desc: 'Skip all permission checks dangerously',
      color: 'text-red-500 font-bold',
      activeClass: 'bg-red-600/20 text-red-400',
      dotClass: 'bg-red-500 animate-pulse'
    },
    { 
      id: 'plan', 
      label: 'Plan Mode', 
      desc: 'Architectural planning without tool execution',
      color: 'text-yellow-400',
      activeClass: 'bg-yellow-500/15 text-yellow-400',
      dotClass: 'bg-yellow-400'
    },
    { 
      id: 'default', 
      label: 'Manual Approval', 
      desc: 'Prompt for confirmation before tool execution',
      color: 'text-emerald-400',
      activeClass: 'bg-emerald-500/15 text-emerald-400',
      dotClass: 'bg-emerald-400'
    },
    { 
      id: 'dontAsk', 
      label: "Don't Ask", 
      desc: "Deny unapproved actions without prompting",
      color: 'text-purple-400',
      activeClass: 'bg-purple-500/15 text-purple-400',
      dotClass: 'bg-purple-400'
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
            className="absolute bottom-[calc(100%+8px)] left-0 w-[320px] bg-[#0a0a0b]/95 backdrop-blur-xl border border-[#27272a] rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col p-1.5"
          >
            <div className="px-3 py-2 text-[10px] font-bold text-[#71717a] uppercase tracking-wider flex items-center justify-between">
              <span>Claude Permission Mode</span>
              <span className="text-[10px] text-[#71717a]/70 font-mono">Shift+Tab to cycle</span>
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
