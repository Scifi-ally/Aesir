import {
  PublicClientApplication,
  LogLevel,
  type AccountInfo,
  type Configuration,
  type TokenCacheContext
} from '@azure/msal-node'
import type { MailBody, MailHeader, OAuthClientInput } from '@shared/types'
import { runLoopbackFlow } from '../oauth'
import { vaultDelete, vaultGet, vaultGetJson, vaultKey, vaultSet, vaultSetJson } from '../vault'
import { log } from '../db'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const SCOPES = ['Mail.ReadWrite', 'Mail.Send', 'User.Read', 'offline_access']
/** MSAL's serialized token cache — one blob for every Outlook account. */
const CACHE_KEY = 'mail:outlook:cache'

interface StoredClient {
  clientId: string
  tenant: string
}

export function outlookClientConfig(): StoredClient | null {
  return vaultGetJson<StoredClient>(vaultKey.oauthClient('outlook'))
}

export function saveOutlookClientConfig(input: OAuthClientInput & { tenant?: string }): void {
  if (!input.clientId.trim()) throw new Error('application (client) ID is required')
  vaultSetJson(vaultKey.oauthClient('outlook'), {
    clientId: input.clientId.trim(),
    tenant: input.tenant?.trim() || 'common'
  })
}

function pca(): PublicClientApplication {
  const cfg = outlookClientConfig()
  if (!cfg) throw new Error('no Azure app registration saved — finish the Outlook setup wizard first')

  const config: Configuration = {
    auth: {
      clientId: cfg.clientId,
      authority: `https://login.microsoftonline.com/${cfg.tenant}`
    },
    cache: {
      cachePlugin: {
        // MSAL's cache holds refresh tokens, so it lives encrypted in the vault
        beforeCacheAccess: async (ctx: TokenCacheContext) => {
          const blob = vaultGet(CACHE_KEY)
          if (blob) ctx.tokenCache.deserialize(blob)
        },
        afterCacheAccess: async (ctx: TokenCacheContext) => {
          if (ctx.cacheHasChanged) vaultSet(CACHE_KEY, ctx.tokenCache.serialize())
        }
      }
    },
    system: {
      loggerOptions: {
        loggerCallback: (level, message) => {
          if (level === LogLevel.Error) log('error', 'msal', message)
        },
        piiLoggingEnabled: false,
        logLevel: LogLevel.Error
      }
    }
  }
  return new PublicClientApplication(config)
}

export async function connectOutlook(): Promise<{ email: string }> {
  const app = pca()
  const cfg = outlookClientConfig()!

  const outcome = await runLoopbackFlow(({ redirectUri, state, codeChallenge }) => {
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: SCOPES.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account'
    })
    return `https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/authorize?${params.toString()}`
  })

  const result = await app.acquireTokenByCode({
    code: outcome.code,
    redirectUri: outcome.redirectUri,
    scopes: SCOPES,
    codeVerifier: outcome.codeVerifier
  })

  const email = result.account?.username
  if (!email) throw new Error('Microsoft did not return an account username')
  log('info', 'outlook', `connected ${email}`)
  return { email }
}

async function accountFor(email: string): Promise<{ app: PublicClientApplication; account: AccountInfo }> {
  const app = pca()
  const accounts = await app.getTokenCache().getAllAccounts()
  const account = accounts.find((a) => a.username.toLowerCase() === email.toLowerCase())
  if (!account) throw new Error(`no cached Microsoft session for ${email} — reconnect the account`)
  return { app, account }
}

async function token(email: string): Promise<string> {
  const { app, account } = await accountFor(email)
  try {
    const res = await app.acquireTokenSilent({ account, scopes: SCOPES })
    return res.accessToken
  } catch (e) {
    throw new Error(
      `Microsoft refused to refresh the token for ${email} (${(e as Error).message}). Reconnect the account.`
    )
  }
}

async function graph<T>(
  email: string,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const accessToken = await token(email)
  const res = await fetch(`${GRAPH}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: init.body ? JSON.stringify(init.body) : undefined
  })
  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!res.ok) {
    let msg = text.slice(0, 400)
    try {
      const j = JSON.parse(text) as { error?: { message?: string; code?: string } }
      if (j.error?.message) msg = `${j.error.code ?? res.status}: ${j.error.message}`
    } catch {
      /* non-JSON error body, use the raw text */
    }
    throw new Error(`Graph ${res.status} — ${msg}`)
  }
  return (text ? JSON.parse(text) : undefined) as T
}

interface GraphMessage {
  id: string
  conversationId?: string
  subject?: string
  bodyPreview?: string
  isRead?: boolean
  receivedDateTime?: string
  from?: { emailAddress?: { name?: string; address?: string } }
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[]
  body?: { contentType?: string; content?: string }
}

function addr(p?: { emailAddress?: { name?: string; address?: string } }): string {
  if (!p?.emailAddress) return ''
  const { name, address } = p.emailAddress
  return name && address ? `${name} <${address}>` : (address ?? name ?? '')
}

export async function outlookList(
  accountId: string,
  email: string,
  opts: { query?: string; max?: number; folderId?: string; label?: string; filter?: string } = {}
): Promise<MailHeader[]> {
  const max = Math.min(Math.max(opts.max ?? 40, 1), 100)
  const select = '$select=id,conversationId,subject,bodyPreview,isRead,receivedDateTime,from,toRecipients'
  const q = opts.query?.trim()
  const folderPath = opts.folderId ? `/me/mailFolders/${encodeURIComponent(opts.folderId)}/messages` : '/me/messages'
  const filter = opts.filter ? `&$filter=${encodeURIComponent(opts.filter)}` : ''
  const path = q
    ? `${folderPath}?$search=${encodeURIComponent(`"${q}"`)}&$top=${max}&${select}`
    : `${folderPath}?$top=${max}&$orderby=receivedDateTime desc&${select}${filter}`

  const res = await graph<{ value: GraphMessage[] }>(email, path)
  return res.value.map((m) => ({
    id: m.id,
    accountId,
    threadId: m.conversationId ?? m.id,
    subject: m.subject || '(no subject)',
    from: addr(m.from),
    to: (m.toRecipients ?? []).map(addr).join(', '),
    snippet: m.bodyPreview ?? '',
    date: m.receivedDateTime ? Date.parse(m.receivedDateTime) : Date.now(),
    unread: m.isRead === false,
    labels: opts.label ? [opts.label] : []
  }))
}

export async function outlookBody(accountId: string, email: string, id: string): Promise<MailBody> {
  const m = await graph<GraphMessage>(
    email,
    `/me/messages/${encodeURIComponent(id)}?$select=id,conversationId,subject,from,toRecipients,receivedDateTime,body`
  )
  const isHtml = (m.body?.contentType ?? '').toLowerCase() === 'html'
  return {
    id: m.id,
    threadId: m.conversationId ?? m.id,
    accountId,
    subject: m.subject || '(no subject)',
    from: addr(m.from),
    to: (m.toRecipients ?? []).map(addr).join(', '),
    date: m.receivedDateTime ? Date.parse(m.receivedDateTime) : Date.now(),
    html: isHtml ? (m.body?.content ?? null) : null,
    text: isHtml ? null : (m.body?.content ?? null)
  }
}

export async function outlookSend(
  email: string,
  msg: { to: string; cc?: string; subject: string; body: string }
): Promise<void> {
  const recipients = (v: string) =>
    v
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((address) => ({ emailAddress: { address } }))

  await graph<void>(email, '/me/sendMail', {
    method: 'POST',
    body: {
      message: {
        subject: msg.subject,
        body: { contentType: 'Text', content: msg.body },
        toRecipients: recipients(msg.to),
        ...(msg.cc?.trim() ? { ccRecipients: recipients(msg.cc) } : {})
      },
      saveToSentItems: true
    }
  })
}

export async function outlookMarkRead(email: string, id: string): Promise<void> {
  await graph<void>(email, `/me/messages/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { isRead: true }
  })
}

export async function outlookArchive(email: string, id: string): Promise<void> {
  await graph<void>(email, `/me/messages/${encodeURIComponent(id)}/move`, {
    method: 'POST',
    body: { destinationId: 'archive' }
  })
}

export async function outlookStar(email: string, id: string, add: boolean): Promise<void> {
  await graph<void>(email, `/me/messages/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { flag: { flagStatus: add ? 'flagged' : 'notFlagged' } }
  })
}

export async function outlookTrash(email: string, id: string): Promise<void> {
  await graph<void>(email, `/me/messages/${encodeURIComponent(id)}/move`, {
    method: 'POST',
    body: { destinationId: 'deleteditems' }
  })
}

export async function outlookLabels(email: string): Promise<any[]> {
  const res = await graph<{ value: { id: string; displayName: string }[] }>(
    email,
    '/me/mailFolders?$select=id,displayName&$top=100'
  )
  return res.value.map((f) => ({ id: f.id, name: f.displayName }))
}

/** Drops the MSAL account from the shared cache; deletes the blob when empty. */
export async function outlookForget(email: string): Promise<void> {
  const app = pca()
  const cache = app.getTokenCache()
  const accounts = await cache.getAllAccounts()
  const account = accounts.find((a) => a.username.toLowerCase() === email.toLowerCase())
  if (account) await cache.removeAccount(account)
  const left = await cache.getAllAccounts()
  if (left.length === 0) vaultDelete(CACHE_KEY)
}
