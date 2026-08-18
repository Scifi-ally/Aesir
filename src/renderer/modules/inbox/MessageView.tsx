import { useCallback, useEffect, useState } from 'react'
import type { MailBody, MailHeader } from '@shared/types'
import { ErrorState, Loading } from '../../components/ui'
import { useApp } from '../../state'
import { 
  Reply, ReplyAll, Forward, Star, Download, MoreVertical, ChevronDown,
  ArrowLeft, Archive, AlertOctagon, Trash2, Mail, Clock, Tag, Sun, Cloud
} from 'lucide-react'

export default function MessageView({
  header,
  accountColors,
  onReply,
  onStar
}: {
  header: MailHeader
  accountColors: string[]
  onReply?: (to: string, subject: string) => void
  onStar?: (id: string) => void
}): React.JSX.Element {
  const { toast } = useApp()
  const [body, setBody] = useState<MailBody | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)

  const load = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setBody(null)

    void window.devhub.mail
      .body(header.accountId, header.id)
      .then((nextBody) => {
        if (active) setBody(nextBody)
      })
      .catch((e: Error) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [header.accountId, header.id, reloadToken])

  useEffect(() => {
    if (header.unread) {
      window.devhub.mail.markRead(header.accountId, header.id).catch(() => undefined)
    }
  }, [header.accountId, header.id, header.unread])

  if (loading) return <div className="flex-1 flex items-center justify-center text-[#5A5A5A] bg-[#000000]"><Loading what="loading message..." /></div>
  if (error) return <ErrorState title="could not load this message" detail={error} retry={load} />
  if (!body) return <ErrorState title="no body returned" />

  const senderName = body.from.split('<')[0].trim().replace(/"/g, '')
  const senderEmail = body.from.match(/<(.+)>/)?.[1] || body.from

  const plainText = body.text || ''
  const systemFont = "'Geist Mono', monospace"

  return (
    <div 
      className="flex flex-col h-full w-full bg-[#000000] text-[#8A8A8A] antialiased"
      style={{ fontFamily: systemFont }}
    >

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden">
        <div className="flex flex-col w-full mx-auto px-10 xl:px-12 pt-12 pb-24" style={{ maxWidth: '850px' }}>
          
          {/* Header Area */}
          <div className="flex flex-col gap-8 mb-12">
            
            {/* Subject and Top Right Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h1 className="text-[28px] text-[#FFFFFF] tracking-tight">
                  {body.subject || '(no subject)'}
                </h1>
              </div>

              <div className="flex items-center gap-4 text-[#8A8A8A]">
                <Sun className="w-4 h-4 text-[#5A5A5A]" />
                <span className="text-[12px]">{new Date(body.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                <button onClick={() => onStar?.(header.id)} className="outline-none focus:outline-none ml-2"><Star className="w-[15px] h-[15px] hover:text-[#FFFFFF] transition-colors" /></button>
                <button onClick={() => onReply?.(header.from, `Re: ${header.subject}`)} className="outline-none focus:outline-none"><Reply className="w-[15px] h-[15px] hover:text-[#FFFFFF] transition-colors" style={{ transform: 'scaleX(-1)' }} /></button>
                <button className="outline-none focus:outline-none"><MoreVertical className="w-[15px] h-[15px] hover:text-[#FFFFFF] transition-colors" /></button>
              </div>
            </div>

            {/* Sender Metadata */}
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-[#27272a] flex items-center justify-center overflow-hidden shrink-0">
                <svg className="w-6 h-6 text-[#5A5A5A]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 text-[15px]">
                  <span className="text-[#FFFFFF]">{senderName}</span>
                  <span className="text-[#5A5A5A]">{senderEmail}</span>
                </div>
                <div className="flex items-center gap-1 text-[12px] text-[#5A5A5A]">
                  <span>to me</span>
                  <ChevronDown className="w-3 h-3" />
                </div>
              </div>
            </div>

          </div>

          {/* Message Body */}
          <div className="text-[16px] text-[#8A8A8A] leading-[32px] whitespace-pre-wrap flex-1">
            {body.html ? (
              <iframe
                srcDoc={(body.html.includes('<head>') ? body.html.replace('<head>', '<head><base target="_blank">') : `<head><base target="_blank"></head>${body.html}`)}
                sandbox="allow-popups allow-popups-to-escape-sandbox allow-scripts"
                className="w-full min-h-[600px] border-none bg-white"
                title="Message Body"
              />
            ) : (
              <div className="mt-4">{plainText}</div>
            )}
          </div>

          {/* Inline Reply Area */}
          <div className="mt-20 pt-8 flex items-center gap-6 text-[13px] text-[#8A8A8A]">
            <button onClick={() => onReply?.(header.from, `Re: ${header.subject}`)} className="flex items-center gap-2 hover:text-[#FFFFFF] transition-colors outline-none"><Reply className="w-4 h-4" style={{ transform: 'scaleX(-1)' }} /> Reply</button>
            <button onClick={() => onReply?.(header.from, `Re: ${header.subject}`)} className="flex items-center gap-2 hover:text-[#FFFFFF] transition-colors outline-none"><ReplyAll className="w-4 h-4" style={{ transform: 'scaleX(-1)' }} /> Reply all</button>
            <button onClick={() => onReply?.(header.from, `Fwd: ${header.subject}`)} className="flex items-center gap-2 hover:text-[#FFFFFF] transition-colors outline-none"><Forward className="w-4 h-4" /> Forward</button>
          </div>

        </div>
      </div>
    </div>
  )
}
