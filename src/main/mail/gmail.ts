import http from 'node:http'
import https from 'node:https'
import { google } from 'googleapis'
import type { MailBody, MailHeader, OAuthClientInput } from '@shared/types'
import { runLoopbackFlow } from '../oauth'
import { vaultGetJson, vaultKey, vaultSetJson } from '../vault'
import { log } from '../db'

// Keep socket pool bounded to avoid SSL handshake / net_error -183 in Chromium
if (https.globalAgent) {
  https.globalAgent.maxSockets = 12
}
if (http.globalAgent) {
  http.globalAgent.maxSockets = 12
}

/** googleapis bundles its own google-auth-library copy; take the type from there
 *  so the client we build is the exact one gmail() accepts. */
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>

const SCOPES = [
  // modify covers read + label changes (mark read, archive); send is separate
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send'
]

interface StoredClient {
  clientId: string
  clientSecret?: string
}

interface StoredTokens {
  access_token?: string | null
  refresh_token?: string | null
  expiry_date?: number | null
  scope?: string
  token_type?: string | null
}

export function gmailClientConfig(): StoredClient | null {
  return {
    clientId: '593551851517-h76nfa1288uug0ofe3gfo5levatq49v6.apps.googleusercontent.com',
    clientSecret: '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'
  }
}

export function saveGmailClientConfig(input: OAuthClientInput): void {
  if (!input.clientId.trim()) throw new Error('client ID is required')
  vaultSetJson(vaultKey.oauthClient('gmail'), {
    clientId: input.clientId.trim(),
    clientSecret: input.clientSecret?.trim() || undefined
  })
}

function newOAuthClient(redirectUri: string): OAuth2Client {
  const cfg = gmailClientConfig()
  if (!cfg) throw new Error('no Google OAuth client saved — finish the Gmail setup wizard first')
  return new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, redirectUri)
}

/** Full connect flow: browser consent, token exchange, real profile fetch. */
export async function connectGmail(): Promise<{ email: string }> {
  // fail before a port is bound and a browser opens
  if (!gmailClientConfig()) {
    throw new Error('no Google OAuth client saved — finish the Gmail setup wizard first')
  }
  let client: OAuth2Client | null = null

  const outcome = await runLoopbackFlow(({ redirectUri, state, codeChallenge }) => {
    client = newOAuthClient(redirectUri)
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state,
      code_challenge_method: 'S256' as never,
      code_challenge: codeChallenge
    })
  })

  if (!client) throw new Error('OAuth client was never built')
  const oauth = client as OAuth2Client

  const { tokens } = await oauth.getToken({
    code: outcome.code,
    redirect_uri: outcome.redirectUri,
    codeVerifier: outcome.codeVerifier
  })
  if (!tokens.refresh_token) {
    throw new Error(
      'Google returned no refresh token. Remove DevHub at myaccount.google.com/permissions and connect again so the consent screen reappears.'
    )
  }
  oauth.setCredentials(tokens)

  const gmail = google.gmail({ version: 'v1', auth: oauth })
  const profile = await gmail.users.getProfile({ userId: 'me' })
  const email = profile.data.emailAddress
  if (!email) throw new Error('Gmail did not return an email address for this account')

  vaultSetJson(vaultKey.mailTokens('gmail', email), tokens)
  log('info', 'gmail', `connected ${email}`)
  return { email }
}

/** Authorized client for an existing account; refreshed tokens are re-persisted. */
export function gmailFor(email: string): OAuth2Client {
  const cfg = gmailClientConfig()
  if (!cfg) throw new Error('Google OAuth client config is missing from the vault')
  const tokens = vaultGetJson<StoredTokens>(vaultKey.mailTokens('gmail', email))
  if (!tokens) throw new Error(`no stored Gmail tokens for ${email} — reconnect the account`)

  const client = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret)
  client.setCredentials(tokens)
  client.on('tokens', (fresh) => {
    const merged = { ...tokens, ...fresh }
    if (!merged.refresh_token) merged.refresh_token = tokens.refresh_token
    vaultSetJson(vaultKey.mailTokens('gmail', email), merged)
  })
  return client
}

function headerValue(
  headers: { name?: string | null; value?: string | null }[] | undefined,
  name: string
): string {
  const hit = headers?.find((h) => (h.name ?? '').toLowerCase() === name.toLowerCase())
  return hit?.value ?? ''
}

async function _fetchMessageBatch(gmail: any, accountId: string, messages: any[] | undefined): Promise<MailHeader[]> {
  const ids = (messages ?? []).map((m: any) => m.id!).filter(Boolean)
  if (ids.length === 0) return []

  const results: any[] = []
  const CHUNK = 10
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = await Promise.all(
      ids.slice(i, i + CHUNK).map((id) =>
        gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'To', 'Date']
        }).catch((err: any) => {
          log('warn', 'gmail', `failed to fetch message ${id}: ${err?.message || err}`)
          return null
        })
      )
    )
    results.push(...batch)
  }

  const headers: MailHeader[] = []
  for (const res of results) {
    if (!res || !res.data) continue
    const m = res.data
    headers.push({
      id: m.id!,
      accountId,
      threadId: m.threadId ?? m.id!,
      subject: headerValue(m.payload?.headers ?? undefined, 'Subject') || '(no subject)',
      from: headerValue(m.payload?.headers ?? undefined, 'From'),
      to: headerValue(m.payload?.headers ?? undefined, 'To'),
      snippet: decodeEntities(m.snippet ?? ''),
      date: Number(m.internalDate ?? Date.now()),
      unread: (m.labelIds ?? []).includes('UNREAD'),
      labels: m.labelIds ?? []
    })
  }
  return headers.sort((a: MailHeader, b: MailHeader) => b.date - a.date)
}

export async function gmailLabels(email: string) {
  const gmail = google.gmail({ version: 'v1', auth: gmailFor(email) })
  const res = await gmail.users.labels.list({ userId: 'me' })
  return res.data.labels || []
}

export async function gmailFolder(accountId: string, email: string, labelId: string, max = 40): Promise<MailHeader[]> {
  const gmail = google.gmail({ version: 'v1', auth: gmailFor(email) })
  const list = await gmail.users.messages.list({
    userId: 'me',
    maxResults: Math.min(Math.max(max, 1), 500),
    labelIds: labelId ? [labelId] : undefined,
    includeSpamTrash: true
  })
  return _fetchMessageBatch(gmail, accountId, list.data.messages)
}

export async function gmailSearch(accountId: string, email: string, query: string, max = 40): Promise<MailHeader[]> {
  const gmail = google.gmail({ version: 'v1', auth: gmailFor(email) })
  const list = await gmail.users.messages.list({
    userId: 'me',
    maxResults: Math.min(Math.max(max, 1), 500),
    q: query,
    includeSpamTrash: true
  })
  return _fetchMessageBatch(gmail, accountId, list.data.messages)
}

export async function gmailDrafts(accountId: string, email: string, max = 40): Promise<MailHeader[]> {
  const gmail = google.gmail({ version: 'v1', auth: gmailFor(email) })
  const list = await gmail.users.drafts.list({
    userId: 'me',
    maxResults: Math.min(Math.max(max, 1), 500)
  })
  // Drafts contain {id, message: {id}}
  const messages = (list.data.drafts || []).map(d => ({ id: d.message?.id }))
  return _fetchMessageBatch(gmail, accountId, messages)
}

export async function gmailBody(accountId: string, email: string, id: string): Promise<MailBody> {
  const gmail = google.gmail({ version: 'v1', auth: gmailFor(email) })
  const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
  const m = res.data
  const parts = flattenParts(m.payload ?? undefined)
  const html = parts.find((p) => p.mimeType === 'text/html')
  const text = parts.find((p) => p.mimeType === 'text/plain')
  return {
    id: m.id!,
    threadId: m.threadId ?? m.id!,
    accountId,
    subject: headerValue(m.payload?.headers ?? undefined, 'Subject') || '(no subject)',
    from: headerValue(m.payload?.headers ?? undefined, 'From'),
    to: headerValue(m.payload?.headers ?? undefined, 'To'),
    date: Number(m.internalDate ?? Date.now()),
    html: html ? decodeB64Url(html.data) : null,
    text: text ? decodeB64Url(text.data) : null
  }
}

interface FlatPart {
  mimeType: string
  data: string | null | undefined
}

function flattenParts(payload?: {
  mimeType?: string | null
  body?: { data?: string | null } | null
  parts?: unknown[] | null
}): FlatPart[] {
  if (!payload) return []
  const out: FlatPart[] = []
  if (payload.body?.data) out.push({ mimeType: payload.mimeType ?? 'text/plain', data: payload.body.data })
  for (const p of (payload.parts ?? []) as Parameters<typeof flattenParts>[0][]) {
    out.push(...flattenParts(p))
  }
  return out
}

function decodeB64Url(data: string | null | undefined): string | null {
  if (!data) return null
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export async function gmailSend(
  email: string,
  msg: { to: string; cc?: string; subject: string; body: string }
): Promise<string> {
  const gmail = google.gmail({ version: 'v1', auth: gmailFor(email) })
  const raw = buildRfc822({ from: email, ...msg })
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: Buffer.from(raw, 'utf8').toString('base64url') }
  })
  return res.data.id ?? ''
}

export function buildRfc822(msg: {
  from: string
  to: string
  cc?: string
  subject: string
  body: string
}): string {
  const lines = [
    `From: ${sanitizeHeader(msg.from)}`,
    `To: ${sanitizeHeader(msg.to)}`,
    ...(msg.cc?.trim() ? [`Cc: ${sanitizeHeader(msg.cc)}`] : []),
    `Subject: ${encodeSubject(msg.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    msg.body.replace(/\r?\n/g, '\r\n')
  ]
  return lines.join('\r\n')
}

/** CR/LF in a header value would let a body be smuggled into the envelope. */
function sanitizeHeader(v: string): string {
  return v.replace(/[\r\n]+/g, ' ').trim()
}

function encodeSubject(s: string): string {
  const clean = sanitizeHeader(s)
  // eslint-disable-next-line no-control-regex
  return /[^\x20-\x7e]/.test(clean)
    ? `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`
    : clean
}

export async function gmailMarkRead(email: string, id: string): Promise<void> {
  const gmail = google.gmail({ version: 'v1', auth: gmailFor(email) })
  await gmail.users.messages.modify({ userId: 'me', id, requestBody: { removeLabelIds: ['UNREAD'] } })
}

export async function gmailArchive(email: string, id: string): Promise<void> {
  const gmail = google.gmail({ version: 'v1', auth: gmailFor(email) })
  await gmail.users.messages.modify({ userId: 'me', id, requestBody: { removeLabelIds: ['INBOX'] } })
}

export async function gmailStar(email: string, id: string, add: boolean): Promise<void> {
  const gmail = google.gmail({ version: 'v1', auth: gmailFor(email) })
  await gmail.users.messages.modify({ 
    userId: 'me', 
    id, 
    requestBody: { 
      addLabelIds: add ? ['STARRED'] : [],
      removeLabelIds: add ? [] : ['STARRED']
    } 
  })
}

export async function gmailTrash(email: string, id: string): Promise<void> {
  const gmail = google.gmail({ version: 'v1', auth: gmailFor(email) })
  await gmail.users.messages.trash({ userId: 'me', id })
}
