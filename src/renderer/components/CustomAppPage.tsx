import React from 'react'
import { useApp } from '../state'
import { Rocket, Box } from 'lucide-react'

export default function CustomAppPage({ agentId }: { agentId: string }) {
  const { agents } = useApp()
  const agent = agents.find(a => a.id === agentId)

  const handleLaunch = () => {
    if (agent?.id) {
      window.devhub.agents.launchApp(agent.id as any)
    }
  }

  if (!agent) return null

  if (agent.url) {
    return (
      <div className="w-full h-full bg-[#000000]">
        <iframe 
          src={agent.url} 
          className="w-full h-full border-none" 
          title={agent.name}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-[#000000] text-zinc-200">
      <div className="flex flex-col items-center max-w-md p-10 bg-zinc-900/50 rounded-2xl border border-zinc-800 shadow-2xl backdrop-blur-sm">
        <div className="w-20 h-20 bg-zinc-800 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
          <Box className="w-10 h-10 text-zinc-400" />
        </div>
        
        <h1 className="text-2xl font-bold text-white mb-2">{agent.name}</h1>
        
        <p className="text-zinc-400 text-center mb-8 text-sm leading-relaxed">
          This is a custom desktop application registered in your workspace settings.
          <br />
          <span className="font-mono text-xs opacity-75 mt-2 block break-all bg-black/40 p-2 rounded">{agent.appPath}</span>
        </p>
        
        <button
          onClick={handleLaunch}
          className="flex items-center gap-2 px-8 py-3 bg-zinc-100 hover:bg-white text-zinc-900 rounded-full font-semibold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-white/10"
        >
          <Rocket className="w-5 h-5" />
          Launch Application
        </button>
      </div>
    </div>
  )
}
