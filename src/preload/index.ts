import { contextBridge, ipcRenderer } from 'electron'
console.log('[preload] Preload script starting...');
window.addEventListener('error', (e) => console.error('[preload error]', e.error));
import type {
  AgentId,
  AgentInfo,
  AppSettings,
  ConnectorManifest,
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
  VaultEntry,
  BridgeEvent,
  ClaudeSessionMetadata
} from '@shared/types'

/**
 * Every channel below is a literal. There is deliberately no
 * `invoke(channel, ...)` escape hatch: renderer code cannot reach an IPC
 * channel that is not named here.
 */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as Result<T>
  if (!res.ok) throw new Error(res.error)
  return res.value
}

type Unsubscribe = () => void

function on<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  app: {
    info: () =>
      call<{
        platform: string
        versions: { electron: string; node: string; chrome: string; app: string }
        userData: string
        home: string
      }>('app:info'),
    minimize: () => call<void>('window:minimize'),
    toggleMaximize: () => call<boolean>('window:maximize'),
    close: () => call<void>('window:close'),
    openExternal: (url: string) => call<void>('shell:openExternal', url),
    showItemInFolder: (path: string) => call<void>('shell:showItem', path),
    pickDirectory: () => call<string | null>('dialog:pickDirectory'),
    setTheme: (isLight: boolean) => call<void>('window:setTheme', isLight),
    onWindowState: (cb: (s: { maximized: boolean }) => void) => on('window:state', cb)
  },

  agents: {
    list: (force?: boolean) => call<AgentInfo[]>('agents:list', force ?? false),
    readConfig: (id: AgentId) =>
      call<{ path: string | null; exists: boolean; content: string }>('agents:readConfig', id),
    writeConfig: (id: AgentId, content: string) =>
      call<{ path: string }>('agents:writeConfig', id, content),
    launchApp: (id: AgentId) => call<{ launched: string }>('agents:launchApp', id),
    install: (id: AgentId) => call<PtySession>('pty:createInstall', id),
    onChanged: (cb: (agents: AgentInfo[]) => void) => on('agents:changed', cb)
  },

  pty: {
    create: (req: PtySpawnRequest) => call<PtySession>('pty:create', req),
    write: (id: string, data: string) => call<void>('pty:write', id, data),
    resize: (id: string, cols: number, rows: number) => call<void>('pty:resize', id, cols, rows),
    kill: (id: string) => call<void>('pty:kill', id),
    list: () => call<PtySession[]>('pty:list'),
    restorable: () => call<PtySession[]>('pty:restorable'),
    onData: (cb: (e: { id: string; data: string }) => void) => on('pty:data', cb),
    onExit: (cb: (e: { id: string; code: number }) => void) => on('pty:exit', cb)
  },

  layout: {
    get: () => call<TerminalLayout | null>('layout:get'),
    save: (layout: TerminalLayout) => call<void>('layout:save', layout)
  },

  mail: {
    clientStatus: () => call<{ gmail: boolean; outlook: boolean }>('mail:clientStatus'),
    saveClient: (
      provider: 'gmail' | 'outlook',
      input: { clientId: string; clientSecret?: string; tenant?: string }
    ) => call<void>('mail:saveClient', provider, input),
    accounts: () => call<MailAccount[]>('mail:accounts'),
    connect: (provider: 'gmail' | 'outlook') => call<MailAccount>('mail:connect', provider),
    disconnect: (accountId: string) => call<void>('mail:disconnect', accountId),
    labels: (accountId: string) => call<any[]>('mail:labels', accountId),
    cachedFolder: (accountId: string, labelId: string) => call<MailHeader[]>('mail:cachedFolder', accountId, labelId),
    folder: (accountId: string, labelId: string) => call<MailHeader[]>('mail:folder', accountId, labelId),
    search: (accountId: string, query: string) => call<MailHeader[]>('mail:search', accountId, query),
    drafts: (accountId: string) => call<MailHeader[]>('mail:drafts', accountId),
    body: (accountId: string, messageId: string) => call<MailBody>('mail:body', accountId, messageId),
    send: (req: SendMailRequest) => call<void>('mail:send', req),
    markRead: (accountId: string, messageId: string) =>
      call<void>('mail:markRead', accountId, messageId),
    star: (accountId: string, messageId: string, add: boolean) =>
      call<void>('mail:star', accountId, messageId, add),
    trash: (accountId: string, messageId: string) =>
      call<void>('mail:trash', accountId, messageId),
    archive: (accountId: string, messageId: string) =>
      call<void>('mail:archive', accountId, messageId),
    onNew: (cb: (e: { accountId: string; headers: MailHeader[] }) => void) => on('mail:new', cb)
  },

  connectors: {
    manifests: () => call<ConnectorManifest[]>('connectors:manifests'),
    states: () => call<ConnectorState[]>('connectors:states'),
    connect: (id: string, values: Record<string, string>) =>
      call<ConnectorTestResult>('connectors:connect', id, values),
    test: (id: string) => call<ConnectorTestResult>('connectors:test', id),
    remove: (id: string) => call<void>('connectors:remove', id)
  },

  vault: {
    list: () => call<VaultEntry[]>('vault:list'),
    remove: (key: string) => call<boolean>('vault:remove', key)
  },

  settings: {
    get: () => call<AppSettings>('settings:get'),
    set: (patch: Partial<AppSettings>) => call<AppSettings>('settings:set', patch),
    onChanged: (cb: (s: AppSettings) => void) => on('settings:changed', cb)
  },

  status: {
    get: () => call<StatusSnapshot>('status:get'),
    onChanged: (cb: (s: StatusSnapshot) => void) => on('status:changed', cb)
  },

  logs: {
    recent: (limit?: number) => call<LogEntry[]>('logs:recent', limit),
    clear: () => call<void>('logs:clear')
  },

  commands: {
    list: () => call<SavedCommand[]>('cmd:list'),
    save: (c: SavedCommand) => call<void>('cmd:save', c),
    remove: (id: string) => call<void>('cmd:delete', id)
  },

  palette: {
    onOpen: (cb: () => void) => on<void>('palette:open', cb)
  },

  claude: {
    query: (text: string, cwd: string, resumeId?: string, permissionMode?: string) => call<void>('claude:query', text, cwd, resumeId, permissionMode),
    interrupt: () => ipcRenderer.send('claude:interrupt'),
    allowTool: (id: string, allow: boolean, reason?: string) => call<void>('claude:allowTool', id, allow, reason),
    getSessions: () => call<ClaudeSessionMetadata[]>('claude:getSessions'),
    getSessionMessages: (sessionId: string) => call<any[]>('claude:getSessionMessages', sessionId),
    deleteSession: (sessionId: string) => call<any[]>('claude:deleteSession', sessionId),
    clearAllSessions: () => call<any[]>('claude:clearAllSessions'),
    getModels: (baseUrl: string, apiKey: string) => call<string[]>('claude:getModels', baseUrl, apiKey),
    onEvent: (cb: (e: BridgeEvent) => void) => on('claude:event', cb)
  },

  antigravity: {
    query: (text: string, cwd: string, resumeId?: string, model?: string, mode?: string) => call<void>('antigravity:query', text, cwd, resumeId, model, mode),
    clear: () => ipcRenderer.send('antigravity:clear'),
    interrupt: () => ipcRenderer.send('antigravity:interrupt'),
    login: () => call<{ success: boolean }>('antigravity:login'),
    authStatus: () => call<boolean>('antigravity:authStatus'),
    getModels: () => call<string[]>('antigravity:getModels'),
    getQuota: () => call<{ quota: string, cost: string }>('antigravity:getQuota'),
    getSessions: () => call<any[]>('antigravity:getSessions'),
    getSessionHistory: (sessionId: string) => call<any[]>('antigravity:getSessionHistory', sessionId),
    deleteSession: (sessionId: string) => call<any[]>('antigravity:deleteSession', sessionId),
    clearAllSessions: () => call<any[]>('antigravity:clearAllSessions'),
    onEvent: (cb: (e: BridgeEvent) => void) => on('antigravity:event', cb)
  },

  codex: {
    runQuery: (prompt: string, model?: string, effort?: string, approvalPolicy?: string, sessionId?: string) => call<{ sessionId: string }>('codex:runQuery', prompt, model, effort, approvalPolicy, sessionId),
    interrupt: () => ipcRenderer.send('codex:interrupt'),
    getModels: () => call<string[]>('codex:getModels'),
    checkAuth: () => call<{ authenticated: boolean; evidence: string }>('codex:checkAuth'),
    loginOAuth: () => call<{ success: boolean }>('codex:loginOAuth'),
    loginApiKey: (apiKey: string) => call<{ success: boolean }>('codex:loginApiKey', apiKey),
    logout: () => call<{ success: boolean }>('codex:logout'),
    checkInstalled: () => call<boolean>('codex:checkInstalled'),
    getInstallCommand: () => call<{ command: string; args: string[]; display: string }>('codex:getInstallCommand'),
    getSessions: () => call<any[]>('codex:getSessions'),
    getSessionHistory: (sessionId: string) => call<any[]>('codex:getSessionHistory', sessionId),
    deleteSession: (sessionId: string) => call<any[]>('codex:deleteSession', sessionId),
    clearAllSessions: () => call<void>('codex:clearAllSessions'),
    onEvent: (cb: (e: BridgeEvent) => void) => on('codex:event', cb)
  },

  github: {
    deviceCode: (clientId: string, scope: string) => call<any>('github:deviceCode', clientId, scope),
    accessToken: (clientId: string, deviceCode: string) => call<any>('github:accessToken', clientId, deviceCode),
    request: (endpoint: string, options?: any) => call<{ data: any; status: number; headers: Record<string, string> }>('github:request', endpoint, options),
    graphql: (query: string, variables?: any) => call<{ data: any; errors?: any[] }>('github:graphql', query, variables),
    getRateLimit: () => call<{ rest: any; graphql: any }>('github:rateLimit'),
    getToken: () => call<string | null>('github:getToken'),
    saveToken: (token: string) => call<void>('github:saveToken', token),
    logout: () => call<void>('github:logout'),
    encryptSecret: (secretValue: string, publicKeyBase64: string) => call<string>('github:encryptSecret', secretValue, publicKeyBase64)
  }
}

export type DevHubApi = typeof api

contextBridge.exposeInMainWorld('devhub', api)
