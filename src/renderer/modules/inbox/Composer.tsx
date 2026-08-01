import { useState } from 'react'
import type { MailAccount } from '@shared/types'
import { Send, X, Paperclip, Image as ImageIcon, Link, Smile, MoreVertical, Trash2 } from 'lucide-react'

export default function Composer({
  accounts,
  from,
  onFrom,
  onSent,
  onCancel,
  initialTo = '',
  initialSubject = ''
}: {
  accounts: MailAccount[]
  from: string
  onFrom: (id: string) => void
  onSent: () => void
  onCancel: () => void
  initialTo?: string
  initialSubject?: string
}): React.JSX.Element {
  const [to, setTo] = useState(initialTo)
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [showCc, setShowCc] = useState(false)

  const send = (): void => {
    setError(null)
    if (!to.trim()) return setError('a recipient is required')
    setSending(true)
    window.devhub.mail
      .send({ accountId: from, to: to.trim(), cc: cc.trim() || undefined, subject, body })
      .then(onSent)
      .catch((e: Error) => setError(e.message))
      .finally(() => setSending(false))
  }

  return (
    <div className="flex h-full flex-col bg-[#050505] text-[#e4e4e7] p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[22px] font-semibold text-white">New Message</h2>
        <div className="flex items-center gap-4">
          <button onClick={onCancel} className="text-[#a1a1aa] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-[#ef4444]/10 border-solid border-[1px] border-[#ef4444]/30 text-[#ef4444] rounded-lg text-[13px]">
          {error}
        </div>
      )}

      <div className="flex flex-col rounded-xl border-solid border-[1px] border-[#27272a]/50 bg-[#0d0d12] shadow-xl overflow-hidden flex-1">
        {/* Headers */}
        <div className="flex flex-col divide-y divide-[#27272a]/30 text-[14px]">
          <div className="flex items-center px-4 py-3 group focus-within:bg-[#121216]">
            <label className="w-16 text-[#71717a] font-medium">From</label>
            <select
              value={from}
              onChange={(e) => onFrom(e.target.value)}
              className="flex-1 bg-transparent outline-none text-[#e4e4e7] cursor-pointer appearance-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id} className="bg-[#0d0d12]">
                  {a.email}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center px-4 py-3 group focus-within:bg-[#121216]">
            <label className="w-16 text-[#71717a] font-medium">To</label>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="flex-1 bg-transparent outline-none text-[#e4e4e7] placeholder-[#3f3f46]"
              placeholder="recipient@example.com"
            />
            {!showCc && (
              <button 
                onClick={() => setShowCc(true)} 
                className="text-[12px] text-[#71717a] hover:text-white transition-colors"
              >
                Cc/Bcc
              </button>
            )}
          </div>

          {showCc && (
            <div className="flex items-center px-4 py-3 group focus-within:bg-[#121216]">
              <label className="w-16 text-[#71717a] font-medium">Cc</label>
              <input
                type="text"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                className="flex-1 bg-transparent outline-none text-[#e4e4e7] placeholder-[#3f3f46]"
              />
            </div>
          )}

          <div className="flex items-center px-4 py-3 group focus-within:bg-[#121216]">
            <label className="w-16 text-[#71717a] font-medium">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex-1 bg-transparent outline-none text-white font-medium placeholder-[#3f3f46]"
              placeholder="Subject"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="flex-1 bg-transparent outline-none text-[#e4e4e7] p-6 resize-none font-sans text-[14px] leading-relaxed placeholder-[#3f3f46]"
            placeholder="Type your message here..."
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#121216] border-solid border-t-[1px] border-[#27272a]/30">
          <div className="flex items-center gap-4">
            <button 
              onClick={send} 
              disabled={sending}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-medium transition-all ${
                sending 
                  ? 'bg-[#a855f7]/50 text-white/50 cursor-not-allowed' 
                  : 'bg-[#a855f7] hover:bg-[#9333ea] text-white shadow-[0_0_12px_rgba(168,85,247,0.4)]'
              }`}
            >
              <Send className="w-4 h-4" />
              {sending ? 'Sending...' : 'Send'}
            </button>
            
            <div className="w-[1px] h-6 bg-[#27272a] mx-2" />
            
            <button className="p-2 text-[#71717a] hover:text-[#e4e4e7] hover:bg-[#27272a]/50 rounded transition-colors"><Paperclip className="w-4 h-4" /></button>
            <button className="p-2 text-[#71717a] hover:text-[#e4e4e7] hover:bg-[#27272a]/50 rounded transition-colors"><Link className="w-4 h-4" /></button>
            <button className="p-2 text-[#71717a] hover:text-[#e4e4e7] hover:bg-[#27272a]/50 rounded transition-colors"><ImageIcon className="w-4 h-4" /></button>
            <button className="p-2 text-[#71717a] hover:text-[#e4e4e7] hover:bg-[#27272a]/50 rounded transition-colors"><Smile className="w-4 h-4" /></button>
          </div>
          
          <div className="flex items-center gap-2">
            <button className="p-2 text-[#71717a] hover:text-[#e4e4e7] hover:bg-[#27272a]/50 rounded transition-colors"><MoreVertical className="w-4 h-4" /></button>
            <button onClick={onCancel} className="p-2 text-[#71717a] hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </div>
  )
}
