import { BrowserWindow, Notification, app, dialog, ipcMain, shell } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type {
  AgentId,
  AgentInfo,
  AppSettings,
  ConnectorState,
  ConnectorTestResult,
  LogEntry,
  MailAccount,
  MailBody,
  MailHeader,
  PtySession,
  PtySpawnRequest,
  Result,
  SavedCommand,
  SendMailRequest,
  StatusSnapshot,
  TerminalLayout,
  VaultEntry
} from '@shared/types'
import { CONNECTOR_MANIFESTS } from '@shared/connectors'
import { detectAgents } from './agents'
import * as connectors from './connectors'
import {
  clearLogs,
  deleteSavedCommand,
  loadLayout,
  log,
  recentLogs,
  saveLayout,
  savedCommands,
  storedSessions,
  upsertSavedCommand
} from './db'
import * as mail from './mail'
import { gmailClientConfig, saveGmailClientConfig } from './mail/gmail'
import { outlookClientConfig, saveOutlookClientConfig } from './mail/outlook'
import { ptys } from './pty'
import { getSettings, setSettings } from './settings'
import { vaultDelete, vaultEntries } from './vault'
import { runClaudeQuery, resolveApproval, setBroadcastCallback, getSavedSessions, fetchModels, getSessionHistory, deleteClaudeSession, clearAllClaudeSessions } from './claude-bridge'
import { getAntigravityModels, getAntigravityQuota, getAuthStatus, loginWithGoogle, runAntigravityQuery, setAntigravityCallback, clearAntigravitySession, getSavedAntigravitySessions, getAntigravitySessionHistory, deleteAntigravitySession, clearAllAntigravitySessions } from './antigravity-bridge'
import { runCodexCliStream, interruptCodex, fetchCodexCliModels, setCodexCallback, getSavedCodexSessions, getCodexSessionHistory, deleteCodexSession, clearAllCodexSessions, checkCodexAuthStatus, spawnCodexOAuthLogin, loginWithApiKey, logoutCodex, getCodexBinPath, getCodexInstallCommand } from './codex-bridge'
import * as github from './github-bridge'

let agentCache: AgentInfo[] = []

export function currentAgents(): AgentInfo[] {
  return agentCache
}

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

function snapshot(): StatusSnapshot {
  return {
    mail: mail.accounts().map((a) => ({
      accountId: a.id,
      email: a.email,
      unread: a.unread,
      error: a.lastError
    })),
    sessions: ptys.list().map((s) => ({
      id: s.id,
      title: s.title,
      agentId: s.agentId,
      alive: s.exit === null
    })),
    connectors: connectors.states().map((c) => ({
      id: c.id,
      name: CONNECTOR_MANIFESTS.find((m) => m.id === c.id)?.name ?? c.id,
      ok: c.ok,
      error: c.error
    }))
  }
}

export function emitStatus(): void {
  broadcast('status:changed', snapshot())
}

function notify(title: string, body: string): void {
  if (!getSettings().notifications) return
  if (!Notification.isSupported()) return
  new Notification({ title, body, silent: false }).show()
}

/** Every handler funnels through here so the renderer always gets a Result. */
function handle<T>(channel: string, fn: (...args: never[]) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_e, ...args): Promise<Result<T>> => {
    try {
      return { ok: true, value: await fn(...(args as never[])) }
    } catch (e) {
      const message = (e as Error).message || String(e)
      log('error', channel, message)
      return { ok: false, error: message }
    }
  })
}

export function registerIpc(): void {
  /* ── app / window ───────────────────────────────────────────────────── */

  handle('app:info', () => ({
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      app: app.getVersion()
    },
    userData: app.getPath('userData'),
    home: app.getPath('home')
  }))

  handle('window:minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })
  handle('window:maximize', () => {
    const w = BrowserWindow.getFocusedWindow()
    if (!w) return false
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
    return w.isMaximized()
  })
  handle('window:setTheme', (isLight: boolean) => {
    const w = BrowserWindow.getFocusedWindow()
    if (!w) return
    if (process.platform !== 'darwin') {
      w.setTitleBarOverlay({
        color: isLight ? '#FFFFFF' : '#000000',
        symbolColor: isLight ? '#52525b' : '#a1a1aa',
        height: 40
      })
    }
  })
  handle('window:close', () => {
    BrowserWindow.getFocusedWindow()?.close()
  })

  handle('shell:openExternal', async (url: string) => {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol)) throw new Error('only http(s) links can be opened')
    await shell.openExternal(u.toString())
  })

  handle('shell:showItem', (path: string) => {
    shell.showItemInFolder(path)
  })

  handle('dialog:pickDirectory', async (): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory', 'promptToCreate']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  /* ── agents ─────────────────────────────────────────────────────────── */

  handle('agents:list', async (force?: boolean): Promise<AgentInfo[]> => {
    if (force || agentCache.length === 0) agentCache = await detectAgents()
    return agentCache
  })

  handle('agents:readConfig', (id: AgentId): { path: string | null; exists: boolean; content: string } => {
    const agent = agentCache.find((a) => a.id === id)
    if (!agent) throw new Error(`unknown agent ${id}`)
    if (!agent.configPath) throw new Error(`${agent.name} has no config file DevHub knows about`)
    const exists = existsSync(agent.configPath)
    return {
      path: agent.configPath,
      exists,
      content: exists ? readFileSync(agent.configPath, 'utf8') : ''
    }
  })

  handle('agents:writeConfig', (id: AgentId, content: string): { path: string } => {
    const agent = agentCache.find((a) => a.id === id)
    if (!agent?.configPath) throw new Error(`unknown config target for ${id}`)
    if (typeof content !== 'string') throw new Error('config content must be a string')
    if (agent.configPath.endsWith('.json')) {
      try {
        JSON.parse(content)
      } catch (e) {
        throw new Error(`refusing to write invalid JSON: ${(e as Error).message}`)
      }
    }
    mkdirSync(dirname(agent.configPath), { recursive: true })
    writeFileSync(agent.configPath, content, 'utf8')
    log('info', 'agents', `wrote ${agent.configPath}`)
    return { path: agent.configPath }
  })

  handle('agents:launchApp', (id: AgentId): { launched: string } => {
    const agent = agentCache.find((a) => a.id === id)
    if (!agent) throw new Error(`unknown agent ${id}`)
    if (!agent.appPath) throw new Error(`${agent.name} desktop app was not found on this machine`)

    if (process.platform === 'darwin') {
      spawn('/usr/bin/open', ['-a', agent.appPath], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn(agent.appPath, [], { detached: true, stdio: 'ignore' }).unref()
    }
    log('info', 'agents', `launched app ${agent.appPath}`)
    return { launched: agent.appPath }
  })

  /* ── pty ────────────────────────────────────────────────────────────── */

  handle('pty:create', (req: PtySpawnRequest): PtySession => {
    const s = ptys.create(req, agentCache)
    emitStatus()
    return s
  })

  handle('pty:createInstall', (id: AgentId): PtySession => {
    const agent = agentCache.find((a) => a.id === id)
    if (!agent) throw new Error(`unknown agent ${id}`)
    if (!agent.installArgv)
      throw new Error(`${agent.name} has no scripted installer — ${agent.installHint ?? ''}`.trim())
    const s = ptys.create(
      {
        cwd: getSettings().defaultCwd ?? app.getPath('home'),
        argv: agent.installArgv,
        title: `install ${agent.name}`,
        purpose: 'install'
      },
      agentCache
    )
    emitStatus()
    return s
  })

  handle('pty:write', (id: string, data: string) => {
    ptys.write(id, data)
  })
  handle('pty:resize', (id: string, cols: number, rows: number) => {
    ptys.resize(id, cols, rows)
  })
  handle('pty:kill', (id: string) => {
    ptys.kill(id)
    emitStatus()
  })
  handle('pty:list', (): PtySession[] => ptys.list())
  handle('pty:restorable', (): PtySession[] => {
    const liveIds = new Set(ptys.list().map((s) => s.id))
    return storedSessions().filter((s) => !liveIds.has(s.id))
  })

  /* ── layout ─────────────────────────────────────────────────────────── */

  handle('layout:get', (): TerminalLayout | null => loadLayout())
  handle('layout:save', (layout: TerminalLayout) => {
    saveLayout(layout)
  })

  /* ── mail ───────────────────────────────────────────────────────────── */

  handle('mail:clientStatus', () => ({
    gmail: Boolean(gmailClientConfig()),
    outlook: Boolean(outlookClientConfig())
  }))

  handle('mail:saveClient', (provider: 'gmail' | 'outlook', input: { clientId: string; clientSecret?: string; tenant?: string }) => {
    if (provider === 'gmail') saveGmailClientConfig(input)
    else saveOutlookClientConfig(input)
  })

  handle('mail:accounts', (): MailAccount[] => mail.accounts())

  handle('mail:connect', async (provider: 'gmail' | 'outlook'): Promise<MailAccount> => {
    const account = await mail.connect(provider)
    emitStatus()
    return account
  })

  handle('mail:disconnect', async (id: string) => {
    await mail.disconnect(id)
    emitStatus()
  })

  handle('mail:labels', async (id: string) => mail.labels(id))

  handle('mail:cachedFolder', (id: string, labelId: string): MailHeader[] =>
    mail.cachedFolder(id, labelId)
  )

  handle('mail:folder', async (id: string, labelId: string): Promise<MailHeader[]> => {
    const fresh = await mail.folder(id, labelId)
    emitStatus()
    return fresh
  })

  handle('mail:search', async (id: string, query: string): Promise<MailHeader[]> => 
    mail.search(id, query)
  )

  handle('mail:drafts', async (id: string): Promise<MailHeader[]> => 
    mail.drafts(id)
  )

  handle('mail:body', async (accountId: string, messageId: string): Promise<MailBody> =>
    mail.body(accountId, messageId)
  )

  handle('mail:send', async (req: SendMailRequest) => {
    await mail.send(req)
  })

  handle('mail:markRead', async (accountId: string, messageId: string) => {
    await mail.markRead(accountId, messageId)
    emitStatus()
  })

  handle('mail:star', async (accountId: string, messageId: string, add: boolean) => {
    await mail.star(accountId, messageId, add)
    emitStatus()
  })

  handle('mail:trash', async (accountId: string, messageId: string) => {
    await mail.trash(accountId, messageId)
    emitStatus()
  })

  handle('mail:archive', async (accountId: string, messageId: string) => {
    await mail.archive(accountId, messageId)
    emitStatus()
  })

  /* ── connectors ─────────────────────────────────────────────────────── */

  handle('connectors:manifests', () => CONNECTOR_MANIFESTS)
  handle('connectors:states', (): ConnectorState[] => connectors.states())
  handle('connectors:connect', async (id: string, values: Record<string, string>): Promise<ConnectorTestResult> => {
    const r = await connectors.connect(id, values)
    emitStatus()
    return r
  })
  handle('connectors:test', async (id: string): Promise<ConnectorTestResult> => {
    const r = await connectors.test(id)
    emitStatus()
    return r
  })
  handle('connectors:remove', (id: string) => {
    connectors.remove(id)
    emitStatus()
  })

  /* ── vault ──────────────────────────────────────────────────────────── */

  handle('vault:list', (): VaultEntry[] => vaultEntries())
  handle('vault:remove', async (key: string): Promise<boolean> => {
    // removing mail credentials must also drop the account row, or the UI lies
    if (key.startsWith('mail:')) {
      const [, provider, email] = key.split(':')
      await mail.disconnect(`${provider}:${email}`).catch(() => undefined)
    }
    const removed = vaultDelete(key)
    emitStatus()
    return removed
  })

  /* ── settings ───────────────────────────────────────────────────────── */

  handle('settings:get', (): AppSettings => getSettings())
  handle('settings:set', (patch: Partial<AppSettings>): AppSettings => {
    const next = setSettings(patch)
    broadcast('settings:changed', next)
    return next
  })

  /* ── status, logs, saved commands ───────────────────────────────────── */

  handle('status:get', (): StatusSnapshot => snapshot())
  handle('logs:recent', (limit?: number): LogEntry[] => recentLogs(limit ?? 100))
  handle('logs:clear', () => clearLogs())
  handle('cmd:list', (): SavedCommand[] => savedCommands())
  handle('cmd:save', (c: SavedCommand) => {
    if (!Array.isArray(c.argv) || c.argv.length === 0) throw new Error('a command needs at least one argv entry')
    upsertSavedCommand(c)
  })
  handle('cmd:delete', (id: string) => deleteSavedCommand(id))

  function assertString(val: unknown, name: string, maxLen = 100000): string {
    if (typeof val !== 'string') throw new Error(`Invalid IPC payload: ${name} must be a string`)
    if (val.length > maxLen) throw new Error(`Invalid IPC payload: ${name} exceeds maximum length (${maxLen})`)
    return val
  }

  /* ── claude sdk bridge ──────────────────────────────────────────────── */
  handle('claude:query', (text: string, cwd: string, resumeId?: string, permissionMode?: string) => {
    const validText = assertString(text, 'text')
    const validCwd = assertString(cwd, 'cwd')
    runClaudeQuery(validText, validCwd, resumeId, permissionMode).catch(console.error)
  })

  handle('claude:allowTool', (id: string, allow: boolean, reason?: string) => {
    resolveApproval(assertString(id, 'id'), Boolean(allow), reason ? String(reason) : undefined)
  })
  handle('claude:getSessions', () => getSavedSessions())
  handle('claude:getSessionMessages', async (sessionId: string) => await getSessionHistory(assertString(sessionId, 'sessionId')))
  handle('claude:deleteSession', (sessionId: string) => deleteClaudeSession(assertString(sessionId, 'sessionId')))
  handle('claude:clearAllSessions', () => clearAllClaudeSessions())
  handle('claude:getModels', async (baseUrl: string, apiKey: string) => {
    return await fetchModels(assertString(baseUrl, 'baseUrl'), assertString(apiKey, 'apiKey'))
  })

  /* ── antigravity ──────────────────────────────────────────────────────── */

  handle('antigravity:query', async (text: string, cwd: string, resumeId?: string, model?: string, mode?: string) => {
    const validText = assertString(text, 'text')
    const validCwd = assertString(cwd, 'cwd')
    return await runAntigravityQuery(validText, validCwd, resumeId, model, mode)
  })

  ipcMain.on('antigravity:clear', () => {
    clearAntigravitySession()
  })

  handle('antigravity:login', async () => {
    return await loginWithGoogle()
  })

  handle('antigravity:authStatus', async () => {
    return await getAuthStatus()
  })
  
  handle('antigravity:getModels', async () => {
    return await getAntigravityModels()
  })

  handle('antigravity:getQuota', async () => {
    return await getAntigravityQuota()
  })

  handle('antigravity:getSessions', async () => {
    return getSavedAntigravitySessions()
  })
  handle('antigravity:getSessionHistory', async (sessionId: string) => getAntigravitySessionHistory(assertString(sessionId, 'sessionId')))
  handle('antigravity:deleteSession', (sessionId: string) => deleteAntigravitySession(assertString(sessionId, 'sessionId')))
  handle('antigravity:clearAllSessions', () => clearAllAntigravitySessions())

  /* ── codex ───────────────────────────────────────────────────────────── */

  handle('codex:runQuery', async (prompt: string, model?: string, effort?: string, approvalPolicy?: string, sessionId?: string) => {
    const validPrompt = assertString(prompt, 'prompt')
    return await runCodexCliStream(validPrompt, model, effort, approvalPolicy, sessionId)
  })
  handle('codex:interrupt', () => interruptCodex())
  handle('codex:getModels', async () => fetchCodexCliModels())
  handle('codex:checkAuth', async () => checkCodexAuthStatus())
  handle('codex:loginOAuth', async () => spawnCodexOAuthLogin())
  handle('codex:loginApiKey', async (apiKey: string) => loginWithApiKey(apiKey))
  handle('codex:logout', async () => logoutCodex())
  handle('codex:checkInstalled', () => Boolean(getCodexBinPath()))
  handle('codex:getInstallCommand', () => getCodexInstallCommand())
  handle('codex:getSessions', async () => getSavedCodexSessions())
  handle('codex:getSessionHistory', async (sessionId: string) => getCodexSessionHistory(sessionId))
  handle('codex:deleteSession', (sessionId: string) => deleteCodexSession(sessionId))
  handle('codex:clearAllSessions', () => clearAllCodexSessions())

  /* ── github ───────────────────────────────────────────────────────────── */
  handle('github:deviceCode', async (clientId: string, scope: string) => {
    return await github.requestDeviceCode(clientId, scope)
  })

  handle('github:accessToken', async (clientId: string, deviceCode: string) => {
    return await github.requestAccessToken(clientId, deviceCode)
  })

  handle('github:request', async (endpoint: string, options?: any) => {
    return await github.requestRest(endpoint, options)
  })

  handle('github:graphql', async (query: string, variables?: any) => {
    return await github.requestGraphQL(query, variables)
  })

  handle('github:rateLimit', () => {
    return github.getRateLimit()
  })

  handle('github:getToken', () => {
    return github.getStoredGithubToken()
  })

  handle('github:saveToken', (token: string) => {
    github.saveGithubToken(token)
  })

  handle('github:logout', () => {
    github.clearGithubToken()
  })

  handle('github:encryptSecret', (secretValue: string, publicKeyBase64: string) => {
    return github.encryptGithubSecret(secretValue, publicKeyBase64)
  })
}

/* ── event wiring: real process/network events, never timers ───────────── */

export function wireEvents(): void {
  ptys.on('data', (id: string, data: string) => broadcast('pty:data', { id, data }))

  ptys.on('exit', (id: string, code: number, _signal: number | undefined, meta: PtySession) => {
    broadcast('pty:exit', { id, code })
    emitStatus()
    if (meta.purpose === 'agent' || meta.purpose === 'install') {
      notify(
        code === 0 ? `${meta.title} finished` : `${meta.title} exited with code ${code}`,
        `${meta.program} · ${meta.cwd}`
      )
    }
    if (meta.purpose === 'install') void refreshAgents()
  })

  mail.mailEvents.on('new-mail', (accountId: string, headers: MailHeader[]) => {
    broadcast('mail:new', { accountId, headers })
    emitStatus()
    const first = headers[0]
    if (first) {
      notify(
        headers.length === 1 ? `New mail · ${first.from}` : `${headers.length} new messages`,
        headers.length === 1 ? first.subject : `${first.from}: ${first.subject}`
      )
    }
  })

  setBroadcastCallback((event) => broadcast('claude:event', event))
  setAntigravityCallback((event) => broadcast('antigravity:event', event))
  setCodexCallback((event) => broadcast('codex:event', event))
}

export async function refreshAgents(): Promise<AgentInfo[]> {
  agentCache = await detectAgents()
  broadcast('agents:changed', agentCache)
  return agentCache
}
