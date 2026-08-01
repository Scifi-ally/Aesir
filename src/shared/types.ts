/**
 * Contracts shared by main, preload and renderer.
 * Nothing here may import from electron or node — it is bundled into all three.
 */

/* ── agents ───────────────────────────────────────────────────────────── */

export type AgentId = 'claude' | 'codex' | 'antigravity' | (string & {})

export interface CustomApp {
  id: string
  name: string
  appPath?: string
  url?: string
  iconUrl?: string
}

/**
 * `unknown_auth` exists on purpose: some tools keep credentials somewhere we
 * cannot read without spending a token (Claude Code on Windows uses the OS
 * credential store). Reporting "unknown" is the honest answer — we never
 * upgrade a guess to "authenticated".
 */
export type AgentAuthState = 'authenticated' | 'unauthenticated' | 'unknown_auth'

export interface AgentInfo {
  id: AgentId
  name: string
  /** cli = embeddable in a pty, gui = launched as a desktop app */
  kind: 'cli' | 'gui' | 'gui+cli'
  installed: boolean
  /** absolute path of the CLI binary, if one is on PATH */
  binPath: string | null
  /** absolute path of the desktop app executable, for gui agents */
  appPath: string | null
  url?: string
  iconUrl?: string
  version: string | null
  auth: AgentAuthState
  /** human readable evidence for `auth` — shown in the UI, never invented */
  authEvidence: string
  /** real config file this tool reads, absolute path */
  configPath: string | null
  configExists: boolean
  /** argv used to install the tool when missing */
  installArgv: string[] | null
  installHint: string | null
  detectedAt: number
}

/* ── pty ──────────────────────────────────────────────────────────────── */

export interface PtySpawnRequest {
  cwd: string
  /** null = user's default shell from settings */
  agentId?: AgentId | null
  /** explicit argv; when omitted a shell is started */
  argv?: string[] | null
  title?: string
  cols?: number
  rows?: number
  /** marks the session as an installer run, for status reporting */
  purpose?: 'shell' | 'agent' | 'install'
}

export interface PtySession {
  id: string
  title: string
  cwd: string
  /** argv[0] actually spawned */
  program: string
  argv: string[]
  agentId: AgentId | null
  purpose: 'shell' | 'agent' | 'install'
  createdAt: number
  /** set once the process ends; live sessions have null */
  exit: { code: number; signal?: number; at: number } | null
  /** true when this row was restored from a previous run and has no live process */
  restored: boolean
}

export interface PtyExitEvent {
  id: string
  code: number
  signal?: number
}

/* ── layout (tmux-style tabs + splits) ────────────────────────────────── */

export type PaneNode =
  | { type: 'leaf'; sessionId: string }
  | { type: 'split'; dir: 'h' | 'v'; ratio: number; a: PaneNode; b: PaneNode }

export interface TerminalTab {
  id: string
  title: string
  root: PaneNode | null
  activeSessionId: string | null
  agentId: AgentId | null
}

export interface TerminalLayout {
  tabs: TerminalTab[]
  activeTabId: string | null
}

/* ── mail ─────────────────────────────────────────────────────────────── */

export type MailProvider = 'gmail' | 'outlook'

export interface MailAccount {
  id: string
  provider: MailProvider
  email: string
  addedAt: number
  unread: number
  lastSyncAt: number | null
  lastError: string | null
}

export interface MailHeader {
  id: string
  accountId: string
  threadId: string
  subject: string
  from: string
  to: string
  snippet: string
  date: number
  unread: boolean
  labels: string[]
}

export interface MailBody {
  id: string
  threadId: string
  accountId: string
  subject: string
  from: string
  to: string
  cc?: string | null
  bcc?: string | null
  date: number
  html: string | null
  text: string | null
}

export interface SendMailRequest {
  accountId: string
  to: string
  cc?: string
  subject: string
  body: string
}

export type MailAction = 'trash' | 'archive'


export interface OAuthClientInput {
  clientId: string
  clientSecret?: string
}

/* ── connectors ───────────────────────────────────────────────────────── */

export interface ConnectorField {
  key: string
  label: string
  placeholder?: string
  secret: boolean
  help?: string
}

/** JSON path; numbers index arrays. */
export type JsonPath = (string | number)[]

export interface ConnectorTest {
  method: 'GET' | 'POST'
  /** may contain {{field}} placeholders, substituted in main only */
  url: string
  headers?: Record<string, string>
  body?: string
  /** path to a human identity in the response, e.g. ['login'] */
  identityPath: JsonPath
  /** optional secondary label, e.g. account name */
  detailPath?: JsonPath
  /** response is only a success if this path is truthy (Slack returns 200 + ok:false) */
  okPath?: JsonPath
  /** where the API puts its error message */
  errorPath?: JsonPath
}

export interface ConnectorOAuth {
  authUrl: string
  tokenUrl: string
  scopes: string[]
  /** which collected field holds the client id / secret */
  clientIdField: string
  clientSecretField?: string
  usePkce: boolean
  /** header value template once a token is obtained */
  tokenHeaderTemplate: string
}

export interface ConnectorManifest {
  id: string
  name: string
  /** monospace glyph — this app ships no icon font */
  icon: string
  blurb: string
  docsUrl: string
  authType: 'api_key' | 'oauth2'
  fields: ConnectorField[]
  oauth?: ConnectorOAuth
  test: ConnectorTest
}

export interface ConnectorState {
  id: string
  connected: boolean
  connectedAt: number | null
  lastTestAt: number | null
  ok: boolean | null
  identity: string | null
  detail: string | null
  error: string | null
}

export interface ConnectorTestResult {
  ok: boolean
  status: number | null
  identity: string | null
  detail: string | null
  error: string | null
  /** raw response, truncated — shown so the user sees the actual API answer */
  raw: string
}

/* ── vault ────────────────────────────────────────────────────────────── */

export interface VaultEntry {
  key: string
  kind: 'mail' | 'connector' | 'oauth-client' | 'other'
  label: string
  masked: string
  createdAt: number
}

/* ── settings ─────────────────────────────────────────────────────────── */

export type AccentName = 'blue' | 'green' | 'amber' | 'cyan' | 'violet'
export type FontName = 'geist' | 'inter' | 'system'

export interface AppSettings {
  accent: AccentName
  fontFamily: FontName
  claudeApiKey: string
  claudeBaseUrl: string
  claudeModel: string
  claudeEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  claudeTemperature?: number
  claudeMaxTokens?: number
  claudeSystemPrompt?: string
  /** absolute path of the shell used for plain pty sessions */
  shellPath: string | null
  defaultCwd: string | null
  /** grab Cmd/Ctrl+K system-wide while DevHub is in the background */
  globalPalette: boolean
  mailPollSeconds: number
  notifications: boolean
  blockRemoteImages: boolean
  antigravityAuthenticated?: boolean
  githubToken?: string | null
  toolsEnabled?: boolean
  customApps: CustomApp[]
}

/* ── status / logs ────────────────────────────────────────────────────── */

export interface StatusSnapshot {
  mail: { accountId: string; email: string; unread: number; error: string | null }[]
  sessions: { id: string; title: string; agentId: AgentId | null; alive: boolean }[]
  connectors: { id: string; name: string; ok: boolean | null; error: string | null }[]
}

export interface LogEntry {
  id: number
  ts: number
  level: 'info' | 'warn' | 'error'
  source: string
  message: string
}

export interface SavedCommand {
  id: string
  label: string
  /** argv array — never a concatenated shell string */
  argv: string[]
  cwd: string | null
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/* ── claude sdk bridge ────────────────────────────────────────────────── */

export type BridgeEvent =
  | { kind: "init"; sessionId: string; model: string; mcp: { name: string; status: "connected" | "failed" }[] }
  | { kind: 'text_delta'; text: string }
  | { kind: "tool_start"; id: string; name: string; input: unknown }
  | { kind: "tool_done"; id: string; ok: boolean; output?: any }
  | { kind: "permission_request"; id: string; tool: string; input: unknown }
  | { kind: "usage"; inputTokens: number; outputTokens: number; contextTokens: number; costUsd: number; durationMs: number }
  | { kind: "compact_boundary"; trigger: "manual" | "auto"; preTokens: number; postTokens: number }
  | { kind: "done" }

export interface ClaudeSessionMetadata {
  sessionId: string
  firstPrompt: string
  cwd: string
  startedAt: number
}
