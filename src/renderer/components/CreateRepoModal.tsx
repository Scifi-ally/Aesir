import React, { useState, useEffect } from 'react'
import { X, Book, Lock, Globe, Plus, AlertCircle } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

interface CreateRepoModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (repo: any) => void
}

export function CreateRepoModal({ isOpen, onClose, onCreated }: CreateRepoModalProps): React.JSX.Element | null {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [autoInit, setAutoInit] = useState(true)
  const [gitignoreTemplate, setGitignoreTemplate] = useState('')
  const [licenseTemplate, setLicenseTemplate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [gitignoreTemplates, setGitignoreTemplates] = useState<string[]>([])
  const [licenseTemplates, setLicenseTemplates] = useState<any[]>([])

  useEffect(() => {
    if (!isOpen) return
    let active = true

    async function loadTemplates() {
      try {
        const [giRes, licRes] = await Promise.all([
          window.devhub.github.request('/gitignore/templates').catch(() => ({ data: [] })),
          window.devhub.github.request('/licenses').catch(() => ({ data: [] }))
        ])
        if (active) {
          setGitignoreTemplates(giRes.data || [])
          setLicenseTemplates(licRes.data || [])
        }
      } catch (e) {
        console.error(e)
      }
    }

    loadTemplates()
    return () => { active = false }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError(null)

    try {
      const payload: any = {
        name: name.trim(),
        description: description.trim(),
        private: isPrivate,
        auto_init: autoInit
      }

      if (gitignoreTemplate) payload.gitignore_template = gitignoreTemplate
      if (licenseTemplate) payload.license_template = licenseTemplate

      const res = await window.devhub.github.request('/user/repos', {
        method: 'POST',
        body: payload
      })

      queryClient.invalidateQueries({ queryKey: ['github', 'repos'] })
      onCreated(res.data)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create repository')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#000000]/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-[500px] bg-[#0d1117] border border-[#30363d] rounded-xl shadow-2xl overflow-hidden text-[#c9d1d9] font-sans">
        <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#161b22]">
          <div className="flex items-center gap-2">
            <Book className="w-5 h-5 text-[#58a6ff]" />
            <h3 className="font-semibold text-sm text-[#f0f6fc]">Create a new repository</h3>
          </div>
          <button onClick={onClose} className="text-[#8b949e] hover:text-[#f0f6fc] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-[#3d1308] border border-[#f85149]/40 rounded text-[#f85149] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-[#8b949e] font-semibold mb-1 uppercase tracking-wider text-[11px]">
              Repository name <span className="text-[#f85149]">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. my-awesome-project"
              className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]"
            />
          </div>

          <div>
            <label className="block text-[#8b949e] font-semibold mb-1 uppercase tracking-wider text-[11px]">
              Description <span className="text-[#8b949e] font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary of your project"
              className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]"
            />
          </div>

          <div className="pt-2 border-t border-[#30363d]/50 space-y-2">
            <label className="block text-[#8b949e] font-semibold mb-1 uppercase tracking-wider text-[11px]">Visibility</label>
            <div className="grid grid-cols-2 gap-3">
              <label
                onClick={() => setIsPrivate(false)}
                className={`flex items-start gap-3 p-3 border rounded cursor-pointer transition-colors ${
                  !isPrivate ? 'bg-[#161b22] border-[#58a6ff]' : 'bg-[#000000] border-[#30363d]'
                }`}
              >
                <Globe className="w-4 h-4 text-[#3fb950] shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-[#c9d1d9]">Public</div>
                  <div className="text-[11px] text-[#8b949e]">Anyone can see this repo</div>
                </div>
              </label>

              <label
                onClick={() => setIsPrivate(true)}
                className={`flex items-start gap-3 p-3 border rounded cursor-pointer transition-colors ${
                  isPrivate ? 'bg-[#161b22] border-[#58a6ff]' : 'bg-[#000000] border-[#30363d]'
                }`}
              >
                <Lock className="w-4 h-4 text-[#e3b341] shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-[#c9d1d9]">Private</div>
                  <div className="text-[11px] text-[#8b949e]">Only you control access</div>
                </div>
              </label>
            </div>
          </div>

          <div className="pt-2 border-t border-[#30363d]/50 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoInit}
                onChange={(e) => setAutoInit(e.target.checked)}
                className="rounded border-[#30363d] bg-[#000000] text-[#58a6ff] focus:ring-0"
              />
              <span className="text-[#c9d1d9]">Add a README file</span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#8b949e] mb-1 text-[11px]">.gitignore template</label>
                <select
                  value={gitignoreTemplate}
                  onChange={(e) => setGitignoreTemplate(e.target.value)}
                  className="w-full bg-[#000000] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#c9d1d9] focus:outline-none"
                >
                  <option value="">None</option>
                  {gitignoreTemplates.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#8b949e] mb-1 text-[11px]">License template</label>
                <select
                  value={licenseTemplate}
                  onChange={(e) => setLicenseTemplate(e.target.value)}
                  className="w-full bg-[#000000] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#c9d1d9] focus:outline-none"
                >
                  <option value="">None</option>
                  {licenseTemplates.map((l) => (
                    <option key={l.key} value={l.key}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#30363d] flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] rounded font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white rounded font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create repository
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
