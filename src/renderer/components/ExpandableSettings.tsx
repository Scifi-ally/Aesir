import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, ChevronUp, ChevronDown, Palette, Type, Link as LinkIcon, Key, SlidersHorizontal, Check, Terminal } from 'lucide-react'
import { useApp } from '../state'
import type { AccentName } from '@shared/types'

export function ExpandableSettings() {
  const { settings, setSettings } = useApp()
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'api' | 'appearance' | 'advanced'>('api')
  
  const [localBaseUrl, setLocalBaseUrl] = useState('')
  const [localApiKey, setLocalApiKey] = useState('')
  const [didSave, setDidSave] = useState(false)

  const isDirty = settings ? (localBaseUrl !== (settings.claudeBaseUrl || '') || localApiKey !== (settings.claudeApiKey || '')) : false

  const ref = React.useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    function click(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsExpanded(false)
    }
    if (isExpanded) document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [isExpanded])

  useEffect(() => {
    if (settings) {
      setLocalBaseUrl(settings.claudeBaseUrl || '')
      setLocalApiKey(settings.claudeApiKey || '')
    }
  }, [settings])

  const handleApiSave = () => {
    if (!isDirty) return
    setSettings({ claudeBaseUrl: localBaseUrl, claudeApiKey: localApiKey })
    setDidSave(true)
    setTimeout(() => setDidSave(false), 2000)
  }

  if (!settings) return null

  return (
    <div className="relative font-mono" ref={ref}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-center p-1.5 text-white/30 hover:text-white transition-colors rounded-full outline-none"
        title="Settings"
      >
        <Settings className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute bottom-[calc(100%+8px)] left-0 w-[280px] bg-[#0a0a0b]/95 backdrop-blur-xl border border-[#27272a] rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col p-3"
          >
            <div className="w-full flex flex-col gap-4">
              
              {/* Tabs */}
              <div className="flex items-center gap-4 text-xs shrink-0">
                <Tab active={activeTab === 'api'} onClick={() => setActiveTab('api')} label="api" />
                <Tab active={activeTab === 'appearance'} onClick={() => setActiveTab('appearance')} label="theme" />
              </div>

              {/* Content */}
              <div className="relative overflow-hidden text-xs">
                <AnimatePresence mode="wait">
                  {activeTab === 'api' && (
                    <motion.div
                      key="api"
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.15 }}
                      className="flex flex-col gap-4"
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-[#52525b]">url</label>
                          <motion.input 
                            type="text" 
                            placeholder="https://cc.freemodel.dev"
                            animate={didSave ? { color: '#22c55e' } : {}}
                            transition={{ duration: 0.3 }}
                            className="w-full bg-transparent border-none px-0 py-1 text-xs text-[#e4e4e7] outline-none font-mono placeholder:text-[#27272a] transition-colors"
                            value={localBaseUrl}
                            onChange={(e) => setLocalBaseUrl(e.target.value)}
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-[#52525b]">key</label>
                          <motion.input 
                            type="password" 
                            placeholder="sk-ant-..."
                            animate={didSave ? { color: '#22c55e' } : {}}
                            transition={{ duration: 0.3, delay: 0.05 }}
                            className="w-full bg-transparent border-none px-0 py-1 text-xs text-[#e4e4e7] outline-none font-mono placeholder:text-[#27272a] transition-colors"
                            value={localApiKey}
                            onChange={(e) => setLocalApiKey(e.target.value)}
                          />
                        </div>
                      </div>

                      <motion.button
                        whileTap={isDirty ? { scale: 0.98 } : {}}
                        onClick={handleApiSave}
                        disabled={!isDirty && !didSave}
                        animate={
                          didSave 
                            ? { color: '#22c55e' } 
                            : isDirty 
                              ? { color: '#e4e4e7' } 
                              : { color: '#52525b' }
                        }
                        transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.8 }}
                        className={`w-fit py-1 text-xs flex items-center justify-start ${
                          isDirty ? 'cursor-pointer hover:text-white' : 'cursor-not-allowed'
                        }`}
                      >
                        <AnimatePresence mode="popLayout">
                          {didSave ? (
                            <motion.span
                              key="saved"
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="font-bold text-[#22c55e]"
                            >
                              saved
                            </motion.span>
                          ) : (
                            <motion.span
                              key="save"
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 5 }}
                              className={isDirty ? "font-bold text-white" : ""}
                            >
                              save
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    </motion.div>
                  )}

                  {activeTab === 'appearance' && (
                    <motion.div
                      key="appearance"
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.15 }}
                      className="flex flex-col gap-4 justify-start"
                    >
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] text-[#52525b]">font</label>
                        <div className="flex gap-4">
                          <FontOption active={settings.fontFamily === 'geist'} onClick={() => setSettings({ fontFamily: 'geist' })} label="geist" />
                          <FontOption active={settings.fontFamily === 'inter'} onClick={() => setSettings({ fontFamily: 'inter' })} label="inter" />
                          <FontOption active={settings.fontFamily === 'system'} onClick={() => setSettings({ fontFamily: 'system' })} label="sys" />
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] text-[#52525b]">accent</label>
                        <div className="flex gap-4 items-center">
                          {(['amber', 'green', 'blue', 'cyan', 'violet'] as AccentName[]).map(c => {
                            const colors: Record<AccentName, string> = {
                              amber: '#f59e0b', green: '#10b981', blue: '#3b82f6', cyan: '#06b6d4', violet: '#a855f7'
                            }
                            return (
                              <button 
                                key={c} 
                                onClick={() => setSettings({ accent: c })}
                                className={`w-3 h-3 rounded-full cursor-pointer transition-transform hover:scale-125 ${
                                  settings.accent === c ? 'scale-125 ring-1 ring-white/50 ring-offset-2 ring-offset-black' : ''
                                }`} 
                                style={{ backgroundColor: colors[c] }} 
                              />
                            )
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Tab({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`transition-colors text-xs ${
        active 
          ? 'text-[#e4e4e7] font-bold' 
          : 'text-[#52525b] hover:text-[#a1a1aa]'
      }`}
    >
      {label}
    </button>
  )
}

function FontOption({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs transition-colors ${
        active 
          ? 'text-[#e4e4e7] font-bold' 
          : 'text-[#52525b] hover:text-[#a1a1aa]'
      }`}
    >
      {label}
    </button>
  )
}
