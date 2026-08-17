import { spawn, exec } from 'node:child_process'
import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { BridgeEvent } from '@shared/types'
import { which } from './lib/which'

type BridgeEventCallback = (e: BridgeEvent) => void

let broadcastCallback: BridgeEventCallback | null = null

export function setCodexCallback(cb: BridgeEventCallback) {
  broadcastCallback = cb
}

function sendToUI(event: BridgeEvent) {
  if (broadcastCallback) broadcastCallback(event)
}

export interface PersistedCodexSession {
  sessionId: string
  firstPrompt: string
  cwd: string
  startedAt: number
  model?: string
}

function getSessionsPath() {
  return join(app.getPath('userData'), 'codex-sessions.json')
}

import {
  saveAgentSession,
  getAgentSessions,
  deleteAgentSession,
  saveAgentTurn,
  getAgentTurns,
  saveAgentToolCall
} from './db'

export function getSavedCodexSessions(): PersistedCodexSession[] {
  const sqliteSessions = getAgentSessions('codex')
  if (sqliteSessions.length > 0) {
    return sqliteSessions.map((s) => ({
      sessionId: s.id,
      firstPrompt: s.title,
      cwd: s.cwd,
      startedAt: s.createdAt,
      model: s.model
    }))
  }
  const path = getSessionsPath()
  if (!existsSync(path)) return []
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return []
  }
}

export function getCodexSessionHistory(sessionId: string) {
  return getAgentTurns(sessionId)
}

function saveSession(session: PersistedCodexSession) {
  saveAgentSession({
    id: session.sessionId,
    agentType: 'codex',
    title: session.firstPrompt || 'Codex Session',
    cwd: session.cwd || process.cwd(),
    model: session.model || 'gpt-4o',
    status: 'active',
    createdAt: session.startedAt || Date.now(),
    updatedAt: Date.now()
  })

  const sessions = getSavedCodexSessions()
  const idx = sessions.findIndex((s) => s.sessionId === session.sessionId)
  if (idx >= 0) {
    sessions[idx] = session
  } else {
    sessions.push(session)
  }
  try {
    writeFileSync(getSessionsPath(), JSON.stringify(sessions, null, 2), 'utf8')
  } catch (e) {
    console.error('Failed to save codex session:', e)
  }
}

export function deleteCodexSession(sessionId: string) {
  deleteAgentSession(sessionId)
  const sessions = getSavedCodexSessions().filter((s) => s.sessionId !== sessionId)
  try {
    writeFileSync(getSessionsPath(), JSON.stringify(sessions, null, 2), 'utf8')
  } catch (e) {
    console.error('Failed to delete codex session:', e)
  }
  return sessions
}

export function clearAllCodexSessions() {
  try {
    writeFileSync(getSessionsPath(), '[]', 'utf8')
  } catch (e) {
    console.error('Failed to clear codex sessions:', e)
  }
}

/* ── 1. Codex CLI Detection ───────────────────────────────────────────── */

export function getCodexBinPath(): string | null {
  if (process.platform === 'win32') {
    const appDataCmd = join(process.env.APPDATA || '', 'npm', 'codex.cmd')
    if (existsSync(appDataCmd)) return appDataCmd
    const bin = which('codex')
    if (bin) {
      if (existsSync(`${bin}.cmd`)) return `${bin}.cmd`
      if (existsSync(`${bin}.exe`)) return `${bin}.exe`
      return bin
    }
    return null
  }
  return which('codex')
}

export function getCodexInstallCommand(): { command: string; args: string[]; display: string } {
  if (process.platform === 'win32') {
    return {
      command: 'powershell',
      args: ['-NoProfile', '-Command', 'irm https://chatgpt.com/codex/install.ps1 | iex'],
      display: 'irm https://chatgpt.com/codex/install.ps1 | iex'
    }
  }
  return {
    command: 'bash',
    args: ['-lc', 'curl -fsSL https://chatgpt.com/codex/install.sh | bash'],
    display: 'curl -fsSL https://chatgpt.com/codex/install.sh | bash'
  }
}

/* ── 2. Real Auth Check & Login via `codex login status` ─────────────── */

export async function checkCodexAuthStatus(): Promise<{ authenticated: boolean; evidence: string }> {
  const bin = getCodexBinPath()
  if (!bin) return { authenticated: false, evidence: 'Codex CLI is not installed on PATH' }

  return new Promise((resolve) => {
    exec(`"${bin}" login status`, { timeout: 8000, windowsHide: true }, (err, stdout, stderr) => {
      const out = `${stdout}${stderr}`.trim()
      if (!err && out.toLowerCase().includes('logged in') || err === null) {
        resolve({ authenticated: true, evidence: out || 'Authenticated via codex login status' })
      } else {
        // Fallback check: check if ~/.codex/auth.json exists or OPENAI_API_KEY is set
        const authFile = join(homedir(), '.codex', 'auth.json')
        if (existsSync(authFile) || Boolean(process.env.OPENAI_API_KEY)) {
          resolve({ authenticated: true, evidence: 'Credential store present (~/.codex/auth.json or OPENAI_API_KEY)' })
        } else {
          resolve({ authenticated: false, evidence: out || 'Unauthenticated (exit non-zero)' })
        }
      }
    })
  })
}

export async function spawnCodexOAuthLogin(): Promise<{ success: boolean }> {
  const bin = getCodexBinPath()
  if (!bin) throw new Error('Codex CLI is not installed')

  return new Promise((resolve) => {
    let spawnBin = bin
    let spawnArgs = ['login']
    if (process.platform === 'win32') {
      spawnBin = process.env.comspec || 'cmd.exe'
      spawnArgs = ['/d', '/s', '/c', `"${bin}"`, 'login']
    }
    const proc = spawn(spawnBin, spawnArgs, { stdio: 'inherit', windowsHide: true })
    
    let isDone = false

    const pollInterval = setInterval(async () => {
      const status = await checkCodexAuthStatus()
      if (status.authenticated && !isDone) {
        isDone = true
        clearInterval(pollInterval)
        try { proc.kill() } catch { /* ignore */ }
        resolve({ success: true })
      }
    }, 2000)

    proc.on('exit', async (code) => {
      if (!isDone) {
        isDone = true
        clearInterval(pollInterval)
        const finalStatus = await checkCodexAuthStatus()
        resolve({ success: finalStatus.authenticated || code === 0 })
      }
    })

    // Timeout after 3 minutes
    setTimeout(() => {
      if (!isDone) {
        isDone = true
        clearInterval(pollInterval)
        try { proc.kill() } catch { /* ignore */ }
        resolve({ success: false })
      }
    }, 180000)
  })
}

export async function loginWithApiKey(apiKey: string): Promise<{ success: boolean }> {
  const bin = getCodexBinPath()
  if (!bin) throw new Error('Codex CLI is not installed')

  return new Promise((resolve, reject) => {
    let spawnBin = bin
    let spawnArgs = ['login', '--with-api-key']
    if (process.platform === 'win32') {
      spawnBin = process.env.comspec || 'cmd.exe'
      spawnArgs = ['/d', '/s', '/c', `"${bin}"`, 'login', '--with-api-key']
    }
    const proc = spawn(spawnBin, spawnArgs, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    proc.stdin.write(`${apiKey}\n`)
    proc.stdin.end()

    let out = ''
    proc.stdout.on('data', (d) => { out += d.toString() })
    proc.stderr.on('data', (d) => { out += d.toString() })

    proc.on('exit', (code) => {
      if (code === 0) {
        resolve({ success: true })
      } else {
        reject(new Error(`codex login --with-api-key failed: ${out}`))
      }
    })
  })
}

export async function logoutCodex(): Promise<{ success: boolean }> {
  const bin = getCodexBinPath()
  if (!bin) return { success: true }

  return new Promise((resolve) => {
    exec(`"${bin}" logout`, { windowsHide: true }, () => {
      resolve({ success: true })
    })
  })
}

/* ── 3. Runtime Model & Reasoning Effort Introspection ───────────────── */

export async function fetchCodexCliModels(): Promise<string[]> {
  const bin = getCodexBinPath()
  const fallback = [
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.5',
    'gpt-5.4-mini',
    'gpt-4o',
    'o3-mini',
    'o1'
  ]

  if (!bin) return fallback

  return new Promise((resolve) => {
    exec(`"${bin}" models`, { timeout: 6000, windowsHide: true }, (err, stdout) => {
      if (!err && stdout && stdout.trim().length > 0) {
        const parsed = stdout
          .split(/\r?\n/)
          .map((l) => l.trim().replace(/^[\*\-\s]+/, '').split(/\s+/)[0])
          .filter((m) => m && m.length > 1 && !m.startsWith('#'))

        if (parsed.length > 0) return resolve(parsed)
      }

      // Try reading ~/.codex/config.toml
      const cfgPath = join(homedir(), '.codex', 'config.toml')
      if (existsSync(cfgPath)) {
        try {
          const content = readFileSync(cfgPath, 'utf8')
          const m = content.match(/model\s*=\s*"([^"]+)"/)
          if (m && m[1]) return resolve([m[1], ...fallback.filter((x) => x !== m[1])])
        } catch {
          /* ignore */
        }
      }

      resolve(fallback)
    })
  })
}

/* ── 4. Execution Stream & Tool Trace Parsing ────────────────────────── */

let activeProc: ReturnType<typeof spawn> | null = null

export function interruptCodex() {
  if (activeProc) {
    try {
      activeProc.kill('SIGINT')
    } catch {
      /* ignore */
    }
    activeProc = null
  }
}

export async function runCodexCliStream(
  prompt: string,
  model = 'gpt-4o',
  effort = 'medium',
  approvalPolicy = 'on_demand',
  sessionId?: string
): Promise<{ sessionId: string }> {
  const bin = getCodexBinPath()
  const currentSessionId = sessionId || `codex-${Date.now()}`

  saveSession({
    sessionId: currentSessionId,
    firstPrompt: prompt,
    cwd: process.cwd(),
    startedAt: Date.now(),
    model
  })

  const userTurnId = `turn-user-${Date.now()}`
  const assistantTurnId = `turn-agent-${Date.now() + 1}`

  saveAgentTurn({
    id: userTurnId,
    sessionId: currentSessionId,
    role: 'user',
    content: prompt,
    createdAt: Date.now()
  })

  let accumulatedText = ''

  sendToUI({ kind: 'init', sessionId: currentSessionId, model, mcp: [] })

  if (!bin) {
    const installCmd = getCodexInstallCommand().display
    const notFoundText = `⚠️ **Codex CLI Not Found**\n\nCodex CLI is not installed on system PATH.\nRun the official installer in terminal:\n\`\`\`bash\n${installCmd}\n\`\`\``
    saveAgentTurn({
      id: assistantTurnId,
      sessionId: currentSessionId,
      role: 'assistant',
      content: notFoundText,
      createdAt: Date.now()
    })
    sendToUI({
      kind: 'text_delta',
      text: notFoundText
    })
    sendToUI({ kind: 'done' })
    return { sessionId: currentSessionId }
  }

  const args: string[] = ['exec', prompt, '-m', model, '--skip-git-repo-check']

  if (effort) {
    args.push('-c', `model_reasoning_effort="${effort}"`)
  }

  if (approvalPolicy === 'never' || approvalPolicy === 'yolo') {
    args.push('--dangerously-bypass-approvals-and-sandbox')
  }

  return new Promise((resolve) => {
    let proc: import('child_process').ChildProcess
    if (process.platform === 'win32') {
      const escapedArgs = args.map(a => /\s/.test(a) || a.includes('"') ? `"${a.replace(/"/g, '\\"')}"` : a).join(' ')
      const commandStr = `"${bin}" ${escapedArgs}`
      proc = spawn(commandStr, { 
        cwd: process.cwd(), 
        env: process.env, 
        windowsHide: true,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } else {
      proc = spawn(bin, args, { 
        cwd: process.cwd(), 
        env: process.env, 
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    }
    activeProc = proc

    let currentToolId: string | null = null
    let toolStartTime = Date.now()

    proc.stdout?.on('data', (chunk: Buffer) => {
      const str = chunk.toString('utf8')

      // Parse CLI tool calls & steps (e.g., executing command, editing file, diffs)
      const toolMatch = str.match(/^(?:>\s*)?(Tool|Running|Executing|Reading|Writing|Editing|Patching)\s+(.*)$/im)
      if (toolMatch) {
        const toolAction = toolMatch[1]
        const toolTarget = toolMatch[2]
        currentToolId = `tool-${Date.now()}`
        toolStartTime = Date.now()

        saveAgentToolCall({
          id: currentToolId,
          turnId: assistantTurnId,
          toolName: toolAction,
          inputJson: JSON.stringify({ target: toolTarget }),
          status: 'running',
          createdAt: Date.now()
        })

        sendToUI({
          kind: 'tool_start',
          id: currentToolId,
          name: toolAction,
          input: { target: toolTarget }
        })
      } else {
        accumulatedText += str
        saveAgentTurn({
          id: assistantTurnId,
          sessionId: currentSessionId,
          role: 'assistant',
          content: accumulatedText,
          createdAt: Date.now()
        })
        sendToUI({ kind: 'text_delta', text: str })
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      const str = chunk.toString('utf8')
      console.log('[CODEX STDERR]', str)
    })

    proc.on('exit', (code) => {
      activeProc = null
      if (currentToolId) {
        saveAgentToolCall({
          id: currentToolId,
          turnId: assistantTurnId,
          toolName: 'Tool Execution',
          inputJson: '{}',
          outputText: 'Executed successfully',
          exitCode: code || 0,
          durationMs: Date.now() - toolStartTime,
          status: code === 0 ? 'success' : 'error',
          createdAt: Date.now()
        })
        sendToUI({ kind: 'tool_done', id: currentToolId, ok: code === 0, output: 'Executed successfully' })
      }
      sendToUI({ kind: 'done' })
      resolve({ sessionId: currentSessionId })
    })

    proc.on('error', (err) => {
      activeProc = null
      const errText = `\n\n**Execution Error**: ${err.message}`
      accumulatedText += errText
      saveAgentTurn({
        id: assistantTurnId,
        sessionId: currentSessionId,
        role: 'assistant',
        content: accumulatedText,
        createdAt: Date.now()
      })
      sendToUI({ kind: 'text_delta', text: errText })
      sendToUI({ kind: 'done' })
      resolve({ sessionId: currentSessionId })
    })
  })
}
