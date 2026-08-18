import { app } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import type {
  ConnectorState,
  LogEntry,
  MailAccount,
  MailHeader,
  PtySession,
  SavedCommand,
  TerminalLayout
} from '@shared/types'

/**
 * node:sqlite (Node 24, bundled with Electron 43) instead of better-sqlite3:
 * identical synchronous prepare/run/get/all surface, but zero native rebuild —
 * this machine has no MSVC C++ workload, so any node-gyp module is unbuildable.
 * Secrets never land here; see vault.ts.
 */
let db: DatabaseSync

export function openDb(): void {
  const file = join(app.getPath('userData'), 'devhub.sqlite')
  db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  migrate()
}

export function dbFilePath(): string {
  return join(app.getPath('userData'), 'devhub.sqlite')
}

function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_accounts (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      email TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      last_sync_at INTEGER,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS mail_headers (
      account_id TEXT NOT NULL,
      id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      from_addr TEXT NOT NULL,
      to_addr TEXT NOT NULL,
      snippet TEXT NOT NULL,
      date INTEGER NOT NULL,
      unread INTEGER NOT NULL,
      labels TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (account_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_headers_date ON mail_headers (account_id, date DESC);

    CREATE TABLE IF NOT EXISTS mail_bodies (
      account_id TEXT NOT NULL,
      id TEXT NOT NULL,
      subject TEXT NOT NULL,
      from_addr TEXT NOT NULL,
      to_addr TEXT NOT NULL,
      cc_addr TEXT,
      bcc_addr TEXT,
      date INTEGER NOT NULL,
      text_body TEXT,
      html_body TEXT,
      PRIMARY KEY (account_id, id)
    );

    CREATE TABLE IF NOT EXISTS connectors (
      id TEXT PRIMARY KEY,
      connected_at INTEGER,
      last_test_at INTEGER,
      ok INTEGER,
      identity TEXT,
      detail TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS pty_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      cwd TEXT NOT NULL,
      program TEXT NOT NULL,
      argv TEXT NOT NULL,
      agent_id TEXT,
      purpose TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kv (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_commands (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      argv TEXT NOT NULL,
      cwd TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY,
      agent_type TEXT NOT NULL,
      title TEXT,
      cwd TEXT,
      model TEXT,
      status TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_agent_sessions_type ON agent_sessions (agent_type, updated_at DESC);

    CREATE TABLE IF NOT EXISTS agent_turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT,
      thinking TEXT,
      tokens_in INTEGER,
      tokens_out INTEGER,
      cost_usd REAL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_turns_session ON agent_turns (session_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS agent_tool_calls (
      id TEXT PRIMARY KEY,
      turn_id TEXT NOT NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
      tool_name TEXT NOT NULL,
      input_json TEXT,
      output_text TEXT,
      exit_code INTEGER,
      duration_ms INTEGER,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      level TEXT NOT NULL,
      source TEXT NOT NULL,
      message TEXT NOT NULL
    );
  `)
  try {
    db.exec("ALTER TABLE mail_headers ADD COLUMN labels TEXT NOT NULL DEFAULT '[]'")
  } catch {}
}

/* ── logs ─────────────────────────────────────────────────────────────── */

export function log(level: LogEntry['level'], source: string, message: string): void {
  try {
    db.prepare('INSERT INTO logs (ts, level, source, message) VALUES (?,?,?,?)').run(
      Date.now(),
      level,
      source,
      message.slice(0, 4000)
    )
  } catch {
    /* logging must never break a feature */
  }
  const line = `[${source}] ${message}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export function recentLogs(limit = 100): LogEntry[] {
  return db
    .prepare('SELECT id, ts, level, source, message FROM logs ORDER BY id DESC LIMIT ?')
    .all(limit) as unknown as LogEntry[]
}

export function clearLogs(): void {
  db.exec('DELETE FROM logs')
}

/* ── kv (layout, misc app state) ──────────────────────────────────────── */

export function kvGet<T>(key: string): T | null {
  const row = db.prepare('SELECT v FROM kv WHERE k = ?').get(key) as { v: string } | undefined
  if (!row) return null
  try {
    return JSON.parse(row.v) as T
  } catch {
    return null
  }
}

export function kvSet(key: string, value: unknown): void {
  db.prepare('INSERT INTO kv (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(
    key,
    JSON.stringify(value)
  )
}

export function saveLayout(layout: TerminalLayout): void {
  kvSet('terminal.layout', layout)
}

export function loadLayout(): TerminalLayout | null {
  return kvGet<TerminalLayout>('terminal.layout')
}

/* ── pty sessions (for reattach after restart) ────────────────────────── */

export function persistSession(s: PtySession): void {
  db.prepare(
    `INSERT INTO pty_sessions (id, title, cwd, program, argv, agent_id, purpose, created_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, cwd = excluded.cwd`
  ).run(s.id, s.title, s.cwd, s.program, JSON.stringify(s.argv), s.agentId, s.purpose, s.createdAt)
}

export function forgetSession(id: string): void {
  db.prepare('DELETE FROM pty_sessions WHERE id = ?').run(id)
}

export function storedSessions(): PtySession[] {
  const rows = db
    .prepare(
      'SELECT id, title, cwd, program, argv, agent_id, purpose, created_at FROM pty_sessions ORDER BY created_at'
    )
    .all() as unknown as {
    id: string
    title: string
    cwd: string
    program: string
    argv: string
    agent_id: string | null
    purpose: string
    created_at: number
  }[]
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    cwd: r.cwd,
    program: r.program,
    argv: JSON.parse(r.argv) as string[],
    agentId: (r.agent_id as PtySession['agentId']) ?? null,
    purpose: r.purpose as PtySession['purpose'],
    createdAt: r.created_at,
    exit: null,
    restored: true
  }))
}

/* ── mail ─────────────────────────────────────────────────────────────── */

export function upsertAccount(a: {
  id: string
  provider: string
  email: string
  addedAt: number
}): void {
  db.prepare(
    `INSERT INTO mail_accounts (id, provider, email, added_at) VALUES (?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET email = excluded.email`
  ).run(a.id, a.provider, a.email, a.addedAt)
}

export function deleteAccount(id: string): void {
  db.prepare('DELETE FROM mail_headers WHERE account_id = ?').run(id)
  db.prepare('DELETE FROM mail_accounts WHERE id = ?').run(id)
}

export function listAccounts(): MailAccount[] {
  const rows = db
    .prepare(
      `SELECT a.id, a.provider, a.email, a.added_at, a.last_sync_at, a.last_error,
              (SELECT COUNT(*) FROM mail_headers h WHERE h.account_id = a.id AND h.unread = 1) AS unread
       FROM mail_accounts a ORDER BY a.added_at`
    )
    .all() as unknown as {
    id: string
    provider: string
    email: string
    added_at: number
    last_sync_at: number | null
    last_error: string | null
    unread: number
  }[]
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider as MailAccount['provider'],
    email: r.email,
    addedAt: r.added_at,
    unread: r.unread,
    lastSyncAt: r.last_sync_at,
    lastError: r.last_error
  }))
}

export function setAccountSync(id: string, at: number | null, error: string | null): void {
  db.prepare('UPDATE mail_accounts SET last_sync_at = ?, last_error = ? WHERE id = ?').run(
    at,
    error,
    id
  )
}

export function saveMailHeaders(accountId: string, headers: MailHeader[]): void {
  if (!headers || headers.length === 0) return
  const stmt = db.prepare(`
    INSERT INTO mail_headers (account_id, id, thread_id, subject, from_addr, to_addr, snippet, date, unread, labels)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, id) DO UPDATE SET
      thread_id = excluded.thread_id,
      subject = excluded.subject,
      from_addr = excluded.from_addr,
      to_addr = excluded.to_addr,
      snippet = excluded.snippet,
      date = excluded.date,
      unread = excluded.unread,
      labels = excluded.labels
  `)
  for (const h of headers) {
    stmt.run(
      accountId,
      h.id,
      h.threadId || h.id,
      h.subject || '(no subject)',
      h.from || '',
      h.to || '',
      h.snippet || '',
      h.date || Date.now(),
      h.unread ? 1 : 0,
      JSON.stringify(h.labels || [])
    )
  }
}

export function getMailHeaders(accountId: string, labelId?: string, query?: string): MailHeader[] {
  let sql = `SELECT account_id, id, thread_id, subject, from_addr, to_addr, snippet, date, unread, labels
             FROM mail_headers WHERE account_id = ?`
  const params: (string | number | null)[] = [accountId]

  if (query) {
    sql += ` AND (subject LIKE ? OR from_addr LIKE ? OR snippet LIKE ?)`
    const q = `%${query}%`
    params.push(q, q, q)
  } else if (labelId) {
    const norm = labelId.toUpperCase()
    if (norm === 'INBOX') {
      sql += ` AND labels LIKE '%"INBOX"%'`
    } else if (norm === 'STARRED') {
      sql += ` AND labels LIKE '%"STARRED"%'`
    } else if (norm === 'IMPORTANT') {
      sql += ` AND labels LIKE '%"IMPORTANT"%'`
    } else if (norm === 'SENT') {
      sql += ` AND labels LIKE '%"SENT"%'`
    } else if (norm === 'DRAFT' || norm === 'DRAFTS') {
      sql += ` AND labels LIKE '%"DRAFT"%'`
    } else if (norm === 'SPAM') {
      sql += ` AND labels LIKE '%"SPAM"%'`
    } else if (norm === 'TRASH' || norm === 'BIN') {
      sql += ` AND labels LIKE '%"TRASH"%'`
    } else if (norm === 'UNREAD') {
      sql += ` AND unread = 1`
    } else if (norm !== 'ALL' && norm !== '') {
      sql += ` AND labels LIKE ?`
      params.push(`%"${labelId}"%`)
    }
  }

  sql += ` ORDER BY date DESC LIMIT 200`
  const rows = db.prepare(sql).all(...params) as unknown as {
    account_id: string
    id: string
    thread_id: string
    subject: string
    from_addr: string
    to_addr: string
    snippet: string
    date: number
    unread: number
    labels: string
  }[]

  return rows.map((r) => {
    let parsedLabels: string[] = []
    try {
      parsedLabels = JSON.parse(r.labels)
    } catch {}
    return {
      id: r.id,
      accountId: r.account_id,
      threadId: r.thread_id,
      subject: r.subject,
      from: r.from_addr,
      to: r.to_addr,
      snippet: r.snippet,
      date: r.date,
      unread: r.unread === 1,
      labels: parsedLabels
    }
  })
}

export function cacheFolderHeaders(accountId: string, labelId: string, headers: MailHeader[]): void {
  saveMailHeaders(accountId, headers)
  kvSet(`mail_folder:${accountId}:${labelId}`, headers)
}

export function getCachedFolderHeaders(accountId: string, labelId: string): MailHeader[] {
  const sqliteHeaders = getMailHeaders(accountId, labelId)
  if (sqliteHeaders && sqliteHeaders.length > 0) return sqliteHeaders
  return kvGet<MailHeader[]>(`mail_folder:${accountId}:${labelId}`) || []
}

export function markReadInDb(accountId: string, id: string): void {
  db.prepare('UPDATE mail_headers SET unread = 0 WHERE account_id = ? AND id = ?').run(accountId, id)
}

export function starInDb(accountId: string, id: string, add: boolean): void {
  updateMailLabelsInDb(accountId, id, add ? [] : ['STARRED'], add ? ['STARRED'] : [])
}

export function updateMailLabelsInDb(accountId: string, id: string, remove: string[], add: string[]): void {
  const row = db.prepare('SELECT labels FROM mail_headers WHERE account_id = ? AND id = ?').get(accountId, id) as { labels: string } | undefined
  if (!row) return

  let labelsArr: string[] = []
  try { labelsArr = JSON.parse(row.labels) } catch {}
  const removeSet = new Set(remove.map((label) => label.toUpperCase()))
  labelsArr = labelsArr.filter((label) => !removeSet.has(label.toUpperCase()))
  for (const label of add) {
    if (!labelsArr.includes(label)) labelsArr.push(label)
  }
  db.prepare('UPDATE mail_headers SET labels = ? WHERE account_id = ? AND id = ?').run(JSON.stringify(labelsArr), accountId, id)
}

/* ── connectors ───────────────────────────────────────────────────────── */

export function connectorStates(): ConnectorState[] {
  const rows = db
    .prepare(
      'SELECT id, connected_at, last_test_at, ok, identity, detail, error FROM connectors'
    )
    .all() as unknown as {
    id: string
    connected_at: number | null
    last_test_at: number | null
    ok: number | null
    identity: string | null
    detail: string | null
    error: string | null
  }[]
  return rows.map((r) => ({
    id: r.id,
    connected: r.connected_at !== null,
    connectedAt: r.connected_at,
    lastTestAt: r.last_test_at,
    ok: r.ok === null ? null : r.ok === 1,
    identity: r.identity,
    detail: r.detail,
    error: r.error
  }))
}

export function upsertConnector(s: {
  id: string
  connectedAt?: number | null
  lastTestAt: number | null
  ok: boolean | null
  identity: string | null
  detail: string | null
  error: string | null
}): void {
  db.prepare(
    `INSERT INTO connectors (id, connected_at, last_test_at, ok, identity, detail, error)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       connected_at = COALESCE(excluded.connected_at, connectors.connected_at),
       last_test_at = excluded.last_test_at,
       ok = excluded.ok,
       identity = excluded.identity,
       detail = excluded.detail,
       error = excluded.error`
  ).run(
    s.id,
    s.connectedAt ?? null,
    s.lastTestAt,
    s.ok === null ? null : s.ok ? 1 : 0,
    s.identity,
    s.detail,
    s.error
  )
}

export function deleteConnector(id: string): void {
  db.prepare('DELETE FROM connectors WHERE id = ?').run(id)
}

/* ── saved commands (palette actions) ─────────────────────────────────── */

export function savedCommands(): SavedCommand[] {
  const rows = db
    .prepare('SELECT id, label, argv, cwd FROM saved_commands ORDER BY label')
    .all() as unknown as { id: string; label: string; argv: string; cwd: string | null }[]
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    argv: JSON.parse(r.argv) as string[],
    cwd: r.cwd
  }))
}

export function upsertSavedCommand(c: SavedCommand): void {
  db.prepare(
    `INSERT INTO saved_commands (id, label, argv, cwd) VALUES (?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET label = excluded.label, argv = excluded.argv, cwd = excluded.cwd`
  ).run(c.id, c.label, JSON.stringify(c.argv), c.cwd)
}

export function deleteSavedCommand(id: string): void {
  db.prepare('DELETE FROM saved_commands WHERE id = ?').run(id)
}

export function getCachedBody(accountId: string, messageId: string): import('@shared/types').MailBody | null {
  const stmt = db.prepare(`SELECT * FROM mail_bodies WHERE account_id = ? AND id = ?`)
  const row = stmt.get(accountId, messageId) as any
  if (!row) return null
  return {
    id: row.id,
    threadId: row.id,
    accountId: accountId,
    subject: row.subject,
    from: row.from_addr,
    to: row.to_addr,
    cc: row.cc_addr || undefined,
    bcc: row.bcc_addr || undefined,
    date: new Date(row.date).getTime(),
    text: row.text_body || undefined,
    html: row.html_body || undefined
  }
}

export function cacheBody(accountId: string, messageId: string, body: import('@shared/types').MailBody): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO mail_bodies 
    (account_id, id, subject, from_addr, to_addr, cc_addr, bcc_addr, date, text_body, html_body)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    accountId,
    messageId,
    body.subject || '',
    body.from || '',
    body.to || '',
    body.cc || null,
    body.bcc || null,
    new Date(body.date).getTime(),
    body.text || null,
    body.html || null
  )
}

/* ── agent sessions & turns ───────────────────────────────────────────── */

export interface AgentSessionRecord {
  id: string
  agentType: 'codex' | 'claude' | 'antigravity'
  title: string
  cwd: string
  model: string
  status: string
  createdAt: number
  updatedAt: number
}

export interface AgentTurnRecord {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string
  tokensIn?: number
  tokensOut?: number
  costUsd?: number
  createdAt: number
}

export interface AgentToolCallRecord {
  id: string
  turnId: string
  toolName: string
  inputJson: string
  outputText?: string
  exitCode?: number
  durationMs?: number
  status: 'running' | 'success' | 'error'
  createdAt: number
}

export function saveAgentSession(session: AgentSessionRecord): void {
  db.prepare(`
    INSERT INTO agent_sessions (id, agent_type, title, cwd, model, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      cwd = excluded.cwd,
      model = excluded.model,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(
    session.id,
    session.agentType,
    session.title || 'Untitled Session',
    session.cwd || process.cwd(),
    session.model || '',
    session.status || 'idle',
    session.createdAt || Date.now(),
    session.updatedAt || Date.now()
  )
}

export function getAgentSessions(agentType: 'codex' | 'claude' | 'antigravity'): AgentSessionRecord[] {
  const rows = db.prepare(`
    SELECT id, agent_type, title, cwd, model, status, created_at, updated_at
    FROM agent_sessions
    WHERE agent_type = ?
    ORDER BY updated_at DESC
  `).all(agentType) as unknown as {
    id: string
    agent_type: string
    title: string
    cwd: string
    model: string
    status: string
    created_at: number
    updated_at: number
  }[]

  return rows.map((r) => ({
    id: r.id,
    agentType: r.agent_type as AgentSessionRecord['agentType'],
    title: r.title,
    cwd: r.cwd,
    model: r.model,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }))
}

export function deleteAgentSession(id: string): void {
  db.prepare('DELETE FROM agent_sessions WHERE id = ?').run(id)
}

export function saveAgentTurn(turn: AgentTurnRecord): void {
  db.prepare(`
    INSERT INTO agent_turns (id, session_id, role, content, thinking, tokens_in, tokens_out, cost_usd, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      content = excluded.content,
      thinking = excluded.thinking,
      tokens_in = excluded.tokens_in,
      tokens_out = excluded.tokens_out,
      cost_usd = excluded.cost_usd
  `).run(
    turn.id,
    turn.sessionId,
    turn.role,
    turn.content || '',
    turn.thinking || null,
    turn.tokensIn ?? null,
    turn.tokensOut ?? null,
    turn.costUsd ?? null,
    turn.createdAt || Date.now()
  )

  db.prepare('UPDATE agent_sessions SET updated_at = ? WHERE id = ?').run(Date.now(), turn.sessionId)
}

export function getAgentTurns(sessionId: string): (AgentTurnRecord & { toolCalls?: AgentToolCallRecord[] })[] {
  const turns = db.prepare(`
    SELECT id, session_id, role, content, thinking, tokens_in, tokens_out, cost_usd, created_at
    FROM agent_turns
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(sessionId) as unknown as {
    id: string
    session_id: string
    role: string
    content: string
    thinking: string | null
    tokens_in: number | null
    tokens_out: number | null
    cost_usd: number | null
    created_at: number
  }[]

  return turns.map((t) => {
    const toolRows = db.prepare(`
      SELECT id, turn_id, tool_name, input_json, output_text, exit_code, duration_ms, status, created_at
      FROM agent_tool_calls
      WHERE turn_id = ?
      ORDER BY created_at ASC
    `).all(t.id) as unknown as {
      id: string
      turn_id: string
      tool_name: string
      input_json: string
      output_text: string | null
      exit_code: number | null
      duration_ms: number | null
      status: string
      created_at: number
    }[]

    return {
      id: t.id,
      sessionId: t.session_id,
      role: t.role as AgentTurnRecord['role'],
      content: t.content,
      thinking: t.thinking || undefined,
      tokensIn: t.tokens_in ?? undefined,
      tokensOut: t.tokens_out ?? undefined,
      costUsd: t.cost_usd ?? undefined,
      createdAt: t.created_at,
      toolCalls: toolRows.map((tc) => ({
        id: tc.id,
        turnId: tc.turn_id,
        toolName: tc.tool_name,
        inputJson: tc.input_json,
        outputText: tc.output_text || undefined,
        exitCode: tc.exit_code ?? undefined,
        durationMs: tc.duration_ms ?? undefined,
        status: tc.status as AgentToolCallRecord['status'],
        createdAt: tc.created_at
      }))
    }
  })
}

export function saveAgentToolCall(toolCall: AgentToolCallRecord): void {
  db.prepare(`
    INSERT INTO agent_tool_calls (id, turn_id, tool_name, input_json, output_text, exit_code, duration_ms, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      output_text = excluded.output_text,
      exit_code = excluded.exit_code,
      duration_ms = excluded.duration_ms,
      status = excluded.status
  `).run(
    toolCall.id,
    toolCall.turnId,
    toolCall.toolName,
    toolCall.inputJson || '{}',
    toolCall.outputText || null,
    toolCall.exitCode ?? null,
    toolCall.durationMs ?? null,
    toolCall.status || 'running',
    toolCall.createdAt || Date.now()
  )
}
