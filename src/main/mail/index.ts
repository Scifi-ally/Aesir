import { EventEmitter } from 'node:events'
import type { MailAccount, MailBody, MailHeader, MailProvider, SendMailRequest } from '@shared/types'
import {
  deleteAccount,
  listAccounts,
  log,
  setAccountSync,
  upsertAccount,
  cacheFolderHeaders,
  getCachedFolderHeaders,
  getCachedBody,
  cacheBody,
  markReadInDb,
  starInDb
} from '../db'
import { vaultDelete, vaultKey } from '../vault'
import {
  connectGmail,
  gmailArchive,
  gmailTrash,
  gmailBody,
  gmailFolder,
  gmailDrafts,
  gmailSearch,
  gmailLabels,
  gmailMarkRead,
  gmailSend,
  gmailStar
} from './gmail'
import {
  connectOutlook,
  outlookArchive,
  outlookTrash,
  outlookBody,
  outlookForget,
  outlookList,
  outlookMarkRead,
  outlookSend,
  outlookStar,
  outlookLabels
} from './outlook'


export const mailEvents = new EventEmitter()

function accountId(provider: MailProvider, email: string): string {
  return `${provider}:${email}`
}

function split(id: string): { provider: MailProvider; email: string } {
  const idx = id.indexOf(':')
  return { provider: id.slice(0, idx) as MailProvider, email: id.slice(idx + 1) }
}

export function accounts(): MailAccount[] {
  return listAccounts()
}

export async function connect(provider: MailProvider): Promise<MailAccount> {
  const { email } = provider === 'gmail' ? await connectGmail() : await connectOutlook()
  const id = accountId(provider, email)
  upsertAccount({ id, provider, email, addedAt: Date.now() })
  await folder(id, 'INBOX').catch((e: Error) => log('warn', 'mail', `initial sync failed: ${e.message}`))
  return listAccounts().find((a) => a.id === id)!
}

export async function disconnect(id: string): Promise<void> {
  const { provider, email } = split(id)
  if (provider === 'gmail') vaultDelete(vaultKey.mailTokens('gmail', email))
  else await outlookForget(email).catch(() => undefined)
  deleteAccount(id)
  log('info', 'mail', `disconnected ${id}`)
}

export async function labels(id: string): Promise<any[]> {
  const { provider, email } = split(id)
  if (provider === 'gmail') return gmailLabels(email)
  return outlookLabels(email)
}

export function cachedFolder(id: string, labelId: string): MailHeader[] {
  return getCachedFolderHeaders(id, labelId) || []
}

export async function folder(id: string, labelId: string): Promise<MailHeader[]> {
  const { provider, email } = split(id)
  let headers: MailHeader[] = []
  if (provider === 'gmail') {
    headers = await gmailFolder(id, email, labelId)
  } else {
    headers = await outlookList(id, email) // Fallback for outlook
  }
  cacheFolderHeaders(id, labelId, headers)
  return getCachedFolderHeaders(id, labelId)
}

export async function search(id: string, query: string): Promise<MailHeader[]> {
  const { provider, email } = split(id)
  if (provider === 'gmail') return gmailSearch(id, email, query)
  return outlookList(id, email, { query })
}

export async function drafts(id: string): Promise<MailHeader[]> {
  const { provider, email } = split(id)
  let headers: MailHeader[] = []
  if (provider === 'gmail') headers = await gmailDrafts(id, email)
  else headers = await outlookList(id, email, { query: 'is:draft' })
  
  cacheFolderHeaders(id, 'DRAFT', headers)
  return getCachedFolderHeaders(id, 'DRAFT')
}

/** Bodies are fetched live if not cached, then cached. */
export async function body(id: string, messageId: string): Promise<MailBody> {
  const cached = getCachedBody(id, messageId)
  if (cached) return cached

  const { provider, email } = split(id)
  const b = provider === 'gmail' ? await gmailBody(id, email, messageId) : await outlookBody(id, email, messageId)
  
  cacheBody(id, messageId, b)
  return b
}

export async function send(req: SendMailRequest): Promise<void> {
  const { provider, email } = split(req.accountId)
  if (!req.to.trim()) throw new Error('a recipient is required')
  if (provider === 'gmail') await gmailSend(email, req)
  else await outlookSend(email, req)
  log('info', 'mail', `sent from ${email} to ${req.to}`)
}

export async function markRead(id: string, messageId: string): Promise<void> {
  markReadInDb(id, messageId)
  const { provider, email } = split(id)
  if (provider === 'gmail') await gmailMarkRead(email, messageId)
  else await outlookMarkRead(email, messageId)
}

export async function archive(id: string, messageId: string): Promise<void> {
  const { provider, email } = split(id)
  if (provider === 'gmail') await gmailArchive(email, messageId)
  else await outlookArchive(email, messageId)
}

export async function star(id: string, messageId: string, add: boolean): Promise<void> {
  starInDb(id, messageId, add)
  const { provider, email } = split(id)
  if (provider === 'gmail') await gmailStar(email, messageId, add)
  else await outlookStar(email, messageId, add)
}

export async function trash(id: string, messageId: string): Promise<void> {
  const { provider, email } = split(id)
  if (provider === 'gmail') await gmailTrash(email, messageId)
  else await outlookTrash(email, messageId)
}

export async function syncAll(): Promise<void> {
  const labelsToSync = ['INBOX', 'SENT', 'SPAM', 'TRASH', 'STARRED', 'IMPORTANT']
  for (const acc of accounts()) {
    try {
      // Sync Inbox (and emit new mail events)
      const oldInbox = cachedFolder(acc.id, 'INBOX')
      const freshInbox = await folder(acc.id, 'INBOX')
      const newMails = freshInbox.filter(
        (f) => f.unread && !oldInbox.find((o) => o.id === f.id && o.unread)
      )
      if (newMails.length > 0) {
        mailEvents.emit('new-mail', acc.id, newMails)
        // Prefetch bodies for new unread mails in background so they are ready to open
        for (const m of newMails) {
          try {
            await body(acc.id, m.id)
          } catch (err) {
            log('warn', 'mail:sync', `failed to prefetch body for ${m.id}: ${(err as Error).message}`)
          }
        }
      }

      // Sync other common labels in the background so they're instantly ready
      for (const label of labelsToSync) {
        if (label === 'INBOX') continue
        await folder(acc.id, label)
      }
      
      // Sync drafts
      await drafts(acc.id)
      
    } catch (e) {
      log('warn', 'mail:sync', `background sync failed for ${acc.id}: ${(e as Error).message}`)
    }
  }
}
