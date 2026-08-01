import { query, type SDKUserMessage, getSessionMessages } from '@anthropic-ai/claude-agent-sdk'
import { app, ipcMain } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { BridgeEvent } from '@shared/types'
import { getSettings } from './settings'

type BridgeEventCallback = (e: BridgeEvent) => void

let broadcastCallback: BridgeEventCallback | null = null

export function setBroadcastCallback(cb: BridgeEventCallback) {
  broadcastCallback = cb
}

function sendToUI(event: BridgeEvent) {
  if (broadcastCallback) broadcastCallback(event)
}

function makePermissionBridge() {
  const pending = new Map<string, (r: { behavior: 'allow' } | { behavior: 'deny', message: string } | null) => void>()

  function resolveApproval(id: string, allow: boolean, reason?: string) {
    const resolve = pending.get(id)
    if (resolve) {
      resolve(
        allow
          ? { behavior: 'allow' }
          : { behavior: 'deny', message: reason ?? 'User denied' }
      )
      pending.delete(id)
    }
  }

  const canUseTool = async (toolName: string, input: unknown): Promise<{ behavior: 'allow' } | { behavior: 'deny', message: string } | null> => {
    const id = crypto.randomUUID()
    sendToUI({ kind: 'permission_request', id, tool: toolName, input })
    return new Promise((resolve) => pending.set(id, resolve))
  }

  return { canUseTool, resolveApproval }
}

const { canUseTool, resolveApproval } = makePermissionBridge()

export { resolveApproval }

interface PersistedSession {
  sessionId: string
  firstPrompt: string
  cwd: string
  startedAt: number
}

function getSessionsPath() {
  return join(app.getPath('userData'), 'claude-sessions.json')
}

import {
  saveAgentSession,
  getAgentSessions,
  deleteAgentSession,
  saveAgentTurn,
  getAgentTurns,
  saveAgentToolCall
} from './db'

export function getSavedSessions(): PersistedSession[] {
  const sqliteSessions = getAgentSessions('claude')
  if (sqliteSessions.length > 0) {
    return sqliteSessions.map((s) => ({
      sessionId: s.id,
      firstPrompt: s.title,
      cwd: s.cwd,
      startedAt: s.createdAt
    }))
  }
  const path = getSessionsPath()
  if (!existsSync(path)) return []
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    return []
  }
}

export async function getSessionHistory(sessionId: string) {
  try {
    const turns = getAgentTurns(sessionId)
    if (turns && turns.length > 0) return turns
    return await getSessionMessages(sessionId)
  } catch (e) {
    console.error('Failed to get session messages:', e)
    return []
  }
}

function saveSession(session: PersistedSession) {
  if (!session.sessionId) return
  saveAgentSession({
    id: session.sessionId,
    agentType: 'claude',
    title: session.firstPrompt || 'Claude Session',
    cwd: session.cwd || process.cwd(),
    model: 'claude-3-5-sonnet',
    status: 'active',
    createdAt: session.startedAt || Date.now(),
    updatedAt: Date.now()
  })

  const sessions = getSavedSessions()
  const existingIndex = sessions.findIndex(s => s.sessionId === session.sessionId)
  if (existingIndex >= 0) {
    sessions[existingIndex] = session
  } else {
    sessions.unshift(session)
  }
  writeFileSync(getSessionsPath(), JSON.stringify(sessions, null, 2), 'utf8')
}

export function deleteClaudeSession(sessionId: string): PersistedSession[] {
  if (!sessionId) return getSavedSessions()
  deleteAgentSession(sessionId)
  const sessions = getSavedSessions().filter(s => s && s.sessionId !== sessionId)
  writeFileSync(getSessionsPath(), JSON.stringify(sessions, null, 2), 'utf8')
  return sessions
}

export function clearAllClaudeSessions(): PersistedSession[] {
  writeFileSync(getSessionsPath(), JSON.stringify([], null, 2), 'utf8')
  return []
}

let currentAbortController: AbortController | null = null
ipcMain.on('claude:interrupt', () => {
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
})

export async function runClaudeQuery(userInput: string, cwd: string, resumeId?: string, permissionMode?: string) {

  const configuredMcpServers = {
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', cwd],
    },
    memory: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    }
  }

  const settings = getSettings()

  const customEnv: Record<string, string> = { ...(process.env as Record<string, string>) }
  if (settings.claudeApiKey) {
    process.env.ANTHROPIC_API_KEY = settings.claudeApiKey
    process.env.CLAUDE_API_KEY = settings.claudeApiKey
    customEnv.ANTHROPIC_API_KEY = settings.claudeApiKey
    customEnv.CLAUDE_API_KEY = settings.claudeApiKey
  }
  if (settings.claudeBaseUrl) {
    process.env.ANTHROPIC_BASE_URL = settings.claudeBaseUrl
    process.env.CLAUDE_BASE_URL = settings.claudeBaseUrl
    customEnv.ANTHROPIC_BASE_URL = settings.claudeBaseUrl
    customEnv.CLAUDE_BASE_URL = settings.claudeBaseUrl
  }
  if (settings.claudeModel) {
    process.env.ANTHROPIC_MODEL = settings.claudeModel
    process.env.CLAUDE_MODEL = settings.claudeModel
    customEnv.ANTHROPIC_MODEL = settings.claudeModel
    customEnv.CLAUDE_MODEL = settings.claudeModel
  }

  try {
    currentAbortController = new AbortController()
    
    const mode = permissionMode || 'acceptEdits'

    const options: Record<string, unknown> = {
      abortController: currentAbortController,
      includePartialMessages: true,
      permissionMode: mode,
      allowDangerouslySkipPermissions: mode === 'bypassPermissions',
      resume: resumeId,
      cwd: cwd,
      mcpServers: configuredMcpServers,
      canUseTool,
      settingSources: settings.claudeBaseUrl ? [] : ['user', 'project'],
      tools: { type: 'preset', preset: 'claude_code' },
      allowedTools: ["Read", "Grep", "Glob", "Bash", "Edit", "Write", "TodoWrite"],
      env: customEnv
    }
    if (settings.claudeModel) {
      options.model = settings.claudeModel
    }
    if (settings.claudeEffort) {
      options.effort = settings.claudeEffort
    }
    if (settings.claudeSystemPrompt && settings.claudeSystemPrompt.trim()) {
      options.systemPrompt = { type: 'preset', preset: 'claude_code', append: settings.claudeSystemPrompt }
    }
    // temperature/maxTokens not supported by query() Options — silently ignored, so not plumbed.

    const stream = query({ prompt: userInput, options: options as any })

    let firstPromptSaved = false
    let currentSessionId = resumeId || `claude-${Date.now()}`
    const userTurnId = `turn-user-${Date.now()}`
    const assistantTurnId = `turn-agent-${Date.now() + 1}`
    let accumulatedText = ''

    saveAgentTurn({
      id: userTurnId,
      sessionId: currentSessionId,
      role: 'user',
      content: userInput,
      createdAt: Date.now()
    })

    for await (const message of stream) {
      if (message.type === 'system' && (message as any).subtype === 'init') {
        const initData = message as any
        currentSessionId = initData.session_id || currentSessionId

        if (!firstPromptSaved && currentSessionId) {
          saveSession({
            sessionId: currentSessionId as string,
            firstPrompt: userInput,
            cwd,
            startedAt: Date.now()
          })
          firstPromptSaved = true
        }

        sendToUI({
          kind: 'init',
          sessionId: currentSessionId as string,
          model: initData.model || 'Unknown Model',
          mcp: (initData.mcp_servers || []).map((s: any) => ({
            name: s.name,
            status: s.status
          }))
        })
      } else if (message.type === 'system' && (message as any).subtype === 'compact_boundary') {
        const meta = (message as any).compact_metadata || {}
        sendToUI({
          kind: 'compact_boundary',
          trigger: meta.trigger || 'auto',
          preTokens: meta.pre_tokens || 0,
          postTokens: meta.post_tokens || 0
        })
      } else if (message.type === 'stream_event') {
        const evt = message as any
        const eventType = evt.event?.type
        if (eventType === 'content_block_delta') {
           const delta = evt.event?.delta
           if (delta?.type === 'text_delta' && delta.text) {
             accumulatedText += delta.text
             saveAgentTurn({
               id: assistantTurnId,
               sessionId: currentSessionId,
               role: 'assistant',
               content: accumulatedText,
               createdAt: Date.now()
             })
             sendToUI({ kind: 'text_delta', text: delta.text })
           }
        }
      } else if (message.type === 'assistant') {
        const msg = message as any
        if (msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'tool_use') {
              saveAgentToolCall({
                id: block.id,
                turnId: assistantTurnId,
                toolName: block.name,
                inputJson: JSON.stringify(block.input || {}),
                status: 'running',
                createdAt: Date.now()
              })
              sendToUI({
                kind: 'tool_start',
                id: block.id,
                name: block.name,
                input: block.input
              })
            }
          }
        }
      } else if (message.type === 'user') {
        // Tool results are echoed back as user messages
        const msg = message as any
        if (msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'tool_result') {
              saveAgentToolCall({
                id: block.tool_use_id,
                turnId: assistantTurnId,
                toolName: 'Tool Execution',
                inputJson: '{}',
                outputText: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
                status: block.is_error ? 'error' : 'success',
                createdAt: Date.now()
              })
              sendToUI({
                kind: 'tool_done',
                id: block.tool_use_id,
                ok: !block.is_error,
                output: block.content
              })
            }
          }
        }
      } else if (message.type === 'result') {
        const res = message as any
        saveAgentTurn({
          id: assistantTurnId,
          sessionId: currentSessionId,
          role: 'assistant',
          content: accumulatedText,
          tokensIn: res.usage?.input_tokens || 0,
          tokensOut: res.usage?.output_tokens || 0,
          costUsd: res.total_cost_usd || 0,
          createdAt: Date.now()
        })
        sendToUI({
          kind: 'usage',
          inputTokens: res.usage?.input_tokens || 0,
          outputTokens: res.usage?.output_tokens || 0,
          contextTokens: res.usage?.cache_read_input_tokens || 0,
          costUsd: res.total_cost_usd || 0,
          durationMs: res.duration_ms || 0
        })
      }
    }

    sendToUI({ kind: 'done' })

  } catch (error: any) {
    console.error('[claude-bridge] Error in query:', error)
    const isAbort = error?.name === 'AbortError' || currentAbortController?.signal?.aborted
    if (isAbort) {
      sendToUI({ kind: 'text_delta', text: '\n\n[ Interrupted by user (Esc) ]' })
    } else {
      sendToUI({ kind: 'text_delta', text: `\n\n[ Interrupted: ${error.message || String(error)} ]` })
    }
    sendToUI({ kind: 'done' })
  } finally {
    currentAbortController = null
  }
}

export async function fetchModels(baseUrl: string, apiKey: string): Promise<string[]> {
  try {
    let base = (baseUrl || 'https://api.anthropic.com/v1').replace(/\/$/, '')
    if (!base.endsWith('/v1')) base += '/v1'
    const url = base + '/models'
    
    // Electron's net module or global fetch works in main process without CORS
    const res = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
      }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    
    if (data && Array.isArray(data.data)) {
      return data.data.map((m: any) => m.id || m)
    } else if (data && Array.isArray(data.models)) {
      return data.models.map((m: any) => m.id || m)
    } else if (Array.isArray(data)) {
      return data.map((m: any) => m.id || m)
    }
    return []
  } catch (e) {
    console.error('[claude-bridge] Error fetching models:', e)
    return []
  }
}
