import { EventEmitter } from 'node:events'
import type { BridgeEvent } from '@shared/types'
import {
  saveAgentSession,
  getAgentSessions,
  deleteAgentSession,
  saveAgentTurn,
  getAgentTurns,
  saveAgentToolCall,
  type AgentSessionRecord,
  type AgentTurnRecord,
  type AgentToolCallRecord
} from './db'

export type AgentType = 'codex' | 'claude' | 'antigravity'

export interface SessionStreamEvent {
  sessionId: string
  agentType: AgentType
  event: BridgeEvent
}

export class BaseAgentBridge extends EventEmitter {
  public readonly agentType: AgentType
  private broadcastCallback: ((e: BridgeEvent) => void) | null = null

  constructor(agentType: AgentType) {
    super()
    this.agentType = agentType
  }

  public setCallback(cb: (e: BridgeEvent) => void): void {
    this.broadcastCallback = cb
  }

  public sendToUI(event: BridgeEvent): void {
    if (this.broadcastCallback) {
      this.broadcastCallback(event)
    }
  }

  public getSessions(): AgentSessionRecord[] {
    return getAgentSessions(this.agentType)
  }

  public createOrUpdateSession(session: AgentSessionRecord): void {
    saveAgentSession(session)
  }

  public removeSession(sessionId: string): void {
    deleteAgentSession(sessionId)
  }

  public getSessionHistory(sessionId: string) {
    return getAgentTurns(sessionId)
  }

  public recordTurn(turn: AgentTurnRecord): void {
    saveAgentTurn(turn)
  }

  public recordToolCall(toolCall: AgentToolCallRecord): void {
    saveAgentToolCall(toolCall)
  }
}
