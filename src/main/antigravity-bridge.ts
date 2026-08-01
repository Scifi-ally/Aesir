import { app, ipcMain } from 'electron'
import { spawn, exec } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runLoopbackFlow } from './oauth'
import type { BridgeEvent } from '@shared/types'
import { currentAgents } from './ipc'
import { getSettings, setSettings } from './settings'

type BridgeEventCallback = (e: BridgeEvent) => void

let broadcastCallback: BridgeEventCallback | null = null

export function setAntigravityCallback(cb: BridgeEventCallback) {
  broadcastCallback = cb
}

function sendToUI(event: BridgeEvent) {
  if (broadcastCallback) broadcastCallback(event)
}

let activeSessionId: string | null = null
let currentProc: ReturnType<typeof spawn> | null = null

ipcMain.on('antigravity:interrupt', () => {
  if (currentProc) {
    try {
      currentProc.kill('SIGINT')
    } catch {
      /* ignore */
    }
    currentProc = null
  }
})

export interface PersistedAntigravitySession {
  sessionId: string
  firstPrompt: string
  cwd: string
  startedAt: number
}

import {
  saveAgentSession,
  getAgentSessions,
  deleteAgentSession,
  saveAgentTurn,
  getAgentTurns,
  saveAgentToolCall
} from './db'

function getSessionsPath() {
  return join(app.getPath('userData'), 'antigravity-sessions.json')
}

export function getSavedAntigravitySessions(): PersistedAntigravitySession[] {
  const sqliteSessions = getAgentSessions('antigravity')
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

export function getAntigravitySessionHistory(sessionId: string) {
  return getAgentTurns(sessionId)
}

function saveSession(session: PersistedAntigravitySession) {
  saveAgentSession({
    id: session.sessionId,
    agentType: 'antigravity',
    title: session.firstPrompt || 'Antigravity Session',
    cwd: session.cwd || process.cwd(),
    model: 'gemini-3.6-flash',
    status: 'active',
    createdAt: session.startedAt || Date.now(),
    updatedAt: Date.now()
  })

  const sessions = getSavedAntigravitySessions()
  const existingIndex = sessions.findIndex(s => s.sessionId === session.sessionId)
  if (existingIndex >= 0) {
    sessions[existingIndex] = session
  } else {
    sessions.push(session)
  }
  try {
    writeFileSync(getSessionsPath(), JSON.stringify(sessions, null, 2), 'utf8')
  } catch (e) {
    console.error('Failed to save antigravity session:', e)
  }
}

export async function loginWithGoogle(): Promise<{ success: boolean }> {
  try {
    const clientId = '593551851517-h76nfa1288uug0ofe3gfo5levatq49v6.apps.googleusercontent.com'
    const clientSecret = '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'

    const outcome = await runLoopbackFlow(({ redirectUri, state, codeChallenge }) => {
      const scope = encodeURIComponent('email profile')
      return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`
    })
    
    console.log('Received auth code, exchanging for tokens...')
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: outcome.code,
        code_verifier: outcome.codeVerifier,
        redirect_uri: outcome.redirectUri,
        grant_type: 'authorization_code'
      }).toString()
    })

    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`)
    }
    
    console.log('Successfully authenticated with Google!')
    setSettings({ antigravityAuthenticated: true })
    return { success: true }
  } catch (err) {
    console.error('OAuth flow failed:', err)
    return { success: false }
  }
}

export async function getAuthStatus(): Promise<boolean> {
  return getSettings().antigravityAuthenticated === true
}

export function clearAntigravitySession() {
  activeSessionId = null
}

export async function runAntigravityQuery(userInput: string, cwd: string, resumeId?: string, model?: string, mode?: string) {
  try {
    const agents = currentAgents()
    const antigravityAgent = agents.find(a => a.id === 'antigravity')

    if (!antigravityAgent || !antigravityAgent.binPath) {
      throw new Error('Google Antigravity CLI (agy) is not installed on your system PATH.')
    }

    let isFirstMessage = false
    if (resumeId) {
      activeSessionId = resumeId
    }
    if (!activeSessionId) {
      activeSessionId = crypto.randomUUID()
      isFirstMessage = true
    }

    const args = [
      '-p', userInput,
      '--add-dir', cwd,
      '--mode', mode || 'accept-edits',
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions'
    ]

    if (!isFirstMessage) {
      args.push('-c')
    }
    if (model) {
      args.push('--model', model)
    }

    if (process.platform === 'win32') {
      const escapedArgs = args.map(a => /\s/.test(a) || a.includes('"') ? `"${a.replace(/"/g, '\\"')}"` : a).join(' ')
      const commandStr = `"${antigravityAgent.binPath}" ${escapedArgs}`
      currentProc = spawn(commandStr, { cwd, windowsHide: true, shell: true })
    } else {
      currentProc = spawn(antigravityAgent.binPath, args, { cwd, windowsHide: true })
    }

    let sessionSaved = false
    let buffer = ''
    let stderrBuffer = ''

    currentProc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const json = JSON.parse(line.trim())
          handleStreamJsonEvent(json, userInput, cwd, () => {
            if (!sessionSaved && activeSessionId) {
              saveSession({
                sessionId: activeSessionId,
                firstPrompt: userInput,
                cwd,
                startedAt: Date.now()
              })
              sessionSaved = true
            }
          })
        } catch {
          sendToUI({ kind: 'text_delta', text: line + '\n' })
        }
      }
    })

    currentProc.stderr?.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf8')
    })

    currentProc.on('close', (code) => {
      currentProc = null
      if (buffer.trim()) {
        try {
          const json = JSON.parse(buffer.trim())
          handleStreamJsonEvent(json, userInput, cwd, () => {})
        } catch {
          sendToUI({ kind: 'text_delta', text: buffer.trim() + '\n' })
        }
      }
      if (code !== 0 && code !== null && stderrBuffer.trim()) {
        sendToUI({ kind: 'text_delta', text: `\n\n[ Interrupted: CLI exited with code ${code}\n${stderrBuffer.trim()} ]` })
      }
      sendToUI({ kind: 'done' })
    })

    currentProc.on('error', (err) => {
      currentProc = null
      sendToUI({ kind: 'text_delta', text: `\n\n[ Interrupted by process error: ${err.message} ]` })
      sendToUI({ kind: 'done' })
    })

  } catch (error: any) {
    currentProc = null
    sendToUI({ kind: 'text_delta', text: `\n\n[ Interrupted: ${error.message} ]` })
    sendToUI({ kind: 'done' })
  }
}

function handleStreamJsonEvent(json: any, userInput: string, cwd: string, onInitSession: () => void) {
  if (json.event === 'init') {
    const initData = json.init || {}
    if (json.conversation_id) {
      activeSessionId = json.conversation_id
      if (userInput) {
        saveAntigravitySession({
          sessionId: json.conversation_id,
          firstPrompt: userInput,
          cwd: cwd,
          startedAt: Date.now()
        })
      }
    }
    onInitSession()
    sendToUI({
      kind: 'init',
      sessionId: activeSessionId || '',
      model: json.model || 'Gemini 3.6 Flash',
      mcp: (initData.tools || []).map((t: string) => ({ name: t, status: 'ready' }))
    })
  } else if (json.event === 'step_update') {
    const step = json.step_update || {}
    
    // Check for text delta
    if (step.text_delta) {
      sendToUI({ kind: 'text_delta', text: step.text_delta })
    }

    // Check for tool execution step
    if (step.step_type === 'tool' || step.step_type === 'tool_call' || step.tool_info || step.tool_call) {
      const toolName = step.tool_name || step.tool_info?.name || step.tool_call?.name || 'Tool Execution'
      const toolId = step.step_index != null ? `step-${step.step_index}` : crypto.randomUUID()
      const params = step.tool_info?.parameters || step.tool_call?.input || {}
      const targetParam = params.DirectoryPath || params.TargetFile || params.CommandLine || params.Query || (typeof params === 'object' && Object.keys(params).length > 0 ? JSON.stringify(params) : '')

      if (step.state === 'ACTIVE' || step.state === 'RUNNING') {
        sendToUI({
          kind: 'tool_start',
          id: toolId,
          name: `${toolName}${targetParam ? ' · ' + targetParam : ''}`,
          input: params
        })
      } else if (step.state === 'DONE' || step.state === 'FINISHED') {
        sendToUI({
          kind: 'tool_done',
          id: toolId,
          ok: true,
          output: step.tool_info?.output || step.tool_call?.output || step.text_delta || 'Completed'
        })
      }
    }

    // Usage reporting
    if (step.usage) {
      sendToUI({
        kind: 'usage',
        inputTokens: step.usage.input_tokens || 0,
        outputTokens: step.usage.output_tokens || 0,
        contextTokens: step.usage.total_tokens || 0,
        costUsd: 0,
        durationMs: 0
      })
    }
  } else if (json.event === 'result') {
    const res = json.result || {}
    if (res.status === 'ERROR' && res.error) {
      sendToUI({ kind: 'text_delta', text: `\n\n[ Error: ${res.error} ]` })
    }
    if (res.usage) {
      sendToUI({
        kind: 'usage',
        inputTokens: res.usage.input_tokens || 0,
        outputTokens: res.usage.output_tokens || 0,
        contextTokens: res.usage.total_tokens || 0,
        costUsd: 0,
        durationMs: Math.round((res.duration_seconds || 0) * 1000)
      })
    }
  }
}

export function saveAntigravitySession(session: PersistedAntigravitySession) {
  if (!session.sessionId) return
  const sessions = getSavedAntigravitySessions()
  const existingIndex = sessions.findIndex(s => s.sessionId === session.sessionId)
  if (existingIndex >= 0) {
    sessions[existingIndex] = session
  } else {
    sessions.unshift(session)
  }
  writeFileSync(getSessionsPath(), JSON.stringify(sessions, null, 2), 'utf8')
}

export function deleteAntigravitySession(sessionId: string): PersistedAntigravitySession[] {
  if (!sessionId) return getSavedAntigravitySessions()
  deleteAgentSession(sessionId)
  const sessions = getSavedAntigravitySessions().filter(s => s && s.sessionId !== sessionId)
  writeFileSync(getSessionsPath(), JSON.stringify(sessions, null, 2), 'utf8')
  return sessions
}

export function clearAllAntigravitySessions(): PersistedAntigravitySession[] {
  if (existsSync(getSessionsPath())) {
    writeFileSync(getSessionsPath(), JSON.stringify([], null, 2), 'utf8')
  }
  return []
}

export async function getAntigravityModels(): Promise<string[]> {
  return new Promise((resolve) => {
    exec('agy models', { timeout: 3000, windowsHide: true }, (error, stdout) => {
      const advancedFallback = [
        'Gemini 3.6 Flash (High)',
        'Gemini 3.6 Flash (Medium)',
        'Gemini 3.6 Flash (Low)',
        'Gemini 3.5 Flash (High)',
        'Gemini 3.5 Flash (Medium)',
        'Gemini 3.5 Flash (Low)',
        'Gemini 3.1 Pro (High)',
        'Gemini 3.1 Pro (Low)',
        'Claude Sonnet 4.6 (Thinking)',
        'Claude Opus 4.6 (Thinking)',
        'GPT-OSS 120B (Medium)'
      ]
      
      if (error || !stdout) {
        return resolve(advancedFallback)
      }
      
      const lines = stdout.split('\n').map(l => l.trim()).filter(l => l && !l.includes('Available models:'))
      resolve(lines.length > 0 ? lines : advancedFallback)
    })
  })
}

export async function getAntigravityQuota(): Promise<{ quota: string, cost: string }> {
  return new Promise((resolve) => {
    exec('agy quota', { timeout: 2000, windowsHide: true }, (error, stdout) => {
      resolve({ quota: 'Unlimited (Pro)', cost: '$0.00' })
    })
  })
}
