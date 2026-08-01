import { useApp } from '../state'
import type { AgentInfo } from '@shared/types'

export default function AgentSetupBar({ agentId }: { agentId: string }): React.JSX.Element | null {
  const { agents, refreshAgents } = useApp()

  const agent = agents.find(a => a.id === agentId)
  if (!agent) return null

  const onInstall = () => {
    window.dispatchEvent(new CustomEvent('devhub:install-agent', { detail: agent.id }))
  }

  const onConfig = () => {
    window.dispatchEvent(new CustomEvent('devhub:edit-config', { detail: agent }))
  }

  return (
    <div className="flex items-center gap-4 font-sans text-[13px]">
      {/* Agent Badge */}
      <div className="flex items-center gap-2">
        <span className="font-semibold text-[var(--fg-0)] tracking-wide">{agent.name}</span>
      </div>

      {/* Status Pill */}
      <div className="flex items-center ml-2">
        {agent.installed ? (
          agent.auth === 'authenticated' ? (
            <span className="flex items-center gap-1.5 text-[var(--ok)] text-[11px] font-bold uppercase tracking-wider">
              operational
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[var(--warn)] text-[11px] font-bold uppercase tracking-wider">
              auth pending
            </span>
          )
        ) : (
          <span className="flex items-center gap-1.5 text-[#98989f] text-[11px] font-bold uppercase tracking-wider">
            not installed
          </span>
        )}
      </div>

      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-4">
        {agent.installed ? (
          agent.configExists && (
            <button 
              className="text-[#5A5A5A] text-[11px] uppercase font-bold tracking-wider transition-colors hover:text-[#FFFFFF]"
              onClick={onConfig}
            >
              configure
            </button>
          )
        ) : (
          agent.installArgv && (
            <button 
              className="text-[var(--accent)] text-[11px] uppercase font-bold tracking-wider transition-colors hover:brightness-110"
              onClick={onInstall}
            >
              install agent
            </button>
          )
        )}
        
        <button 
          className="text-[#5A5A5A] text-[11px] uppercase font-bold tracking-wider transition-colors hover:text-[#FFFFFF]"
          onClick={() => void refreshAgents(true)}
        >
          scan system
        </button>
      </div>
    </div>
  )
}
