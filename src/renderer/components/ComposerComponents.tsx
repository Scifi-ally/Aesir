import React, { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronDown, Search, Sparkles, Cpu, Code2, Zap, Settings2, Box, Brain, Terminal, Paperclip, ArrowUp, Wrench, Folder } from 'lucide-react'

// Helper to format model names (similar to what was in ClaudePage)
function formatModelName(id: string) {
  let name = id.replace(/-/g, ' ').replace(/_/g, ' ')
  name = name.replace(/\bclaude\b/i, 'Claude')
  name = name.replace(/\bopus\b/i, 'Opus')
  name = name.replace(/\bsonnet\b/i, 'Sonnet')
  name = name.replace(/\bhaiku\b/i, 'Haiku')
  name = name.replace(/(\d)\s(\d)/g, '$1.$2')
  name = name.replace(/\s\d{8}\b/, '')
  
  if (!id.toLowerCase().includes('claude')) {
    name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }
  return name.trim()
}

// Model Categories
const categorizeModel = (id: string) => {
  const lower = id.toLowerCase()
  if (lower.includes('claude')) return 'Claude'
  if (lower.includes('gpt') || lower.includes('o1') || lower.includes('openai')) return 'OpenAI'
  if (lower.includes('gemini')) return 'Gemini'
  if (lower.includes('llama') || lower.includes('mistral') || lower.includes('local')) return 'Local Models'
  return 'Experimental'
}

const getModelMetadata = (id: string) => {
  const lower = id.toLowerCase()
  let context = '128K'
  let tags: string[] = []
  let latency = 'Medium'
  
  if (lower.includes('claude')) {
    context = '200K'
    if (lower.includes('opus')) { tags = ['Premium', 'Reasoning']; latency = 'Slow' }
    if (lower.includes('sonnet')) { tags = ['Coding', 'Fast']; latency = 'Fast' }
    if (lower.includes('haiku')) { tags = ['Ultra Fast']; latency = 'Ultra Fast' }
  } else if (lower.includes('gemini')) {
    context = lower.includes('pro') ? '2M' : '1M'
    if (lower.includes('flash')) { tags = ['Ultra Fast']; latency = 'Ultra Fast' }
    else { tags = ['Reasoning', 'Multimodal']; latency = 'Medium' }
  } else if (lower.includes('gpt-4') || lower.includes('o1')) {
    context = '128K'
    if (lower.includes('o1')) { tags = ['Thinking', 'Coding']; latency = 'Slow' }
    else { tags = ['Fast', 'Coding']; latency = 'Fast' }
  }
  
  return { context, tags, latency }
}

export function PremiumModelSelector({ 
  models, 
  modelValue, 
  onModelChange
}: { 
  models: string[]
  modelValue: string
  onModelChange: (m: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
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

  const categorized = useMemo(() => {
    const filtered = models.filter(m => formatModelName(m).toLowerCase().includes(search.toLowerCase()) || m.toLowerCase().includes(search.toLowerCase()))
    
    const groups: Record<string, string[]> = {
      'Claude': [],
      'OpenAI': [],
      'Gemini': [],
      'Local Models': [],
      'Experimental': []
    }
    
    filtered.forEach(m => {
      const cat = categorizeModel(m)
      if (groups[cat]) groups[cat].push(m)
      else groups['Experimental'].push(m)
    })
    
    return groups
  }, [models, search])

  const [selectedIndex, setSelectedIndex] = useState(0)
  const flatModels = useMemo(() => Object.values(categorized).flat(), [categorized])

  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(flatModels.length - 1, prev + 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(0, prev - 1))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (flatModels[selectedIndex]) {
        onModelChange(flatModels[selectedIndex])
        setOpen(false)
      }
    }
  }

  return (
    <div className="relative font-mono" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-[#131313] transition-colors border border-transparent hover:border-[#ffffff05] group"
      >
        <span className="text-[14px] text-white font-medium">
          {modelValue && modelValue !== 'Select Model...' ? formatModelName(modelValue) : 'Select Model'}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-white/30 group-hover:text-white/70 transition-colors" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 5 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute bottom-full left-0 mb-2 w-[420px] bg-[#0A0A0A] border border-[#ffffff05] rounded-[22px] shadow-2xl overflow-hidden z-50 flex flex-col"
          >
            <div className="p-3 border-b border-[#ffffff05]">
              <div className="relative flex items-center bg-[#050505] rounded-[14px] px-3 py-2 border border-[#ffffff05]">
                <Search className="w-4 h-4 text-white/30 mr-2 shrink-0" />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search models..."
                  className="bg-transparent border-none outline-none text-[14px] text-white placeholder-white/30 w-full"
                />
              </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto p-2 flex flex-col gap-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {Object.entries(categorized).map(([category, catModels]) => {
                if (catModels.length === 0) return null
                return (
                  <div key={category} className="flex flex-col">
                    <div className="px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-white/30 font-semibold">
                      {category}
                    </div>
                    <div className="flex flex-col gap-1 mt-1">
                      {catModels.map(m => {
                        const index = flatModels.indexOf(m)
                        const isSelected = index === selectedIndex
                        const isActive = modelValue === m
                        const meta = getModelMetadata(m)
                        
                        return (
                          <button
                            key={m}
                            onMouseEnter={() => setSelectedIndex(index)}
                            onClick={() => { onModelChange(m); setOpen(false) }}
                            className={`w-full text-left flex flex-col px-3 py-2 rounded-[12px] transition-colors ${
                              isSelected ? 'bg-[#131313]' : 'bg-transparent hover:bg-[#131313]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`text-[15px] font-[600] ${isActive ? 'text-white' : 'text-white/80'}`}>
                                  {formatModelName(m)}
                                </span>
                              </div>
                              <span className="text-[11px] text-white/30">{meta.context}</span>
                            </div>
                            
                            <div className="flex items-center gap-2 mt-1.5">
                              {meta.tags.map(t => (
                                <span key={t} className="px-2 py-0.5 rounded-full bg-[#ffffff05] border border-[#ffffff05] text-[10px] text-white/50">
                                  {t}
                                </span>
                              ))}
                              <div className="flex-1" />
                              <span className="text-[10px] text-white/40 flex items-center gap-1">
                                <Zap className="w-3 h-3" /> {meta.latency}
                              </span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {flatModels.length === 0 && (
                <div className="p-4 text-center text-[13px] text-white/30">
                  No models found
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function ReasoningSelector({ value, onChange }: { value: string, onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function click(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [open])

  const options = ['low', 'medium', 'high', 'x high', 'max']
  
  return (
    <div className="relative font-mono" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-[#131313] transition-colors border border-transparent hover:border-[#ffffff05] group outline-none"
      >
        <Brain className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" />
        <span className="text-[14px] text-white font-medium capitalize">
          {value}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-white/30 group-hover:text-white/70 transition-colors" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            className="absolute bottom-[calc(100%+8px)] left-0 w-[140px] bg-[#0a0a0b]/95 backdrop-blur-xl border border-[#27272a] rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col p-1.5"
          >
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false) }}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs capitalize transition-colors ${
                  value === opt ? 'bg-[#131313] text-white font-semibold' : 'text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#e4e4e7]'
                }`}
              >
                {opt}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function GenericModeToggle({ value, onChange, modes }: { value: string, onChange: (v: string) => void, modes: {id: string, label: string}[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function click(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [open])

  const currentModeObj = modes.find(m => m.id === value) || modes[0]
  const currentMode = currentModeObj.label

  return (
    <div className="relative font-mono" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-[#131313] transition-colors border border-transparent hover:border-[#ffffff05] group outline-none"
      >
        <span className="text-[14px] text-white font-medium">
          {currentMode}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-white/30 group-hover:text-white/70 transition-colors" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            className="absolute bottom-[calc(100%+8px)] left-0 w-[160px] bg-[#0a0a0b]/95 backdrop-blur-xl border border-[#27272a] rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col p-1.5"
          >
            {modes.map((mode) => (
              <button
                key={mode.label}
                onClick={() => { onChange(mode.id); setOpen(false) }}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                  value === mode.id ? 'bg-[#131313] text-white font-semibold' : 'text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#e4e4e7]'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function WorkspaceSelector({ cwd, onChange }: { cwd: string, onChange: (v: string) => void }) {
  return (
    <button
      onClick={() => {
        window.devhub.app.pickDirectory().then((d) => {
          if (d) onChange(d)
        })
      }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-[13px] transition-colors border bg-[#050505] text-white/50 border-[#ffffff05] hover:text-white/80 hover:bg-[#131313] truncate max-w-[200px]"
      title={cwd || 'Select Workspace'}
    >
      <span className="truncate">{cwd ? cwd.split(/[\\/]/).pop() : 'Select Workspace'}</span>
    </button>
  )
}
