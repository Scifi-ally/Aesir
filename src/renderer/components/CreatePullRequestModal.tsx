import React, { useState } from 'react'
import { GitPullRequest, X, ArrowRight, AlertCircle, Plus } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

interface CreatePullRequestModalProps {
  isOpen: boolean
  owner: string
  repo: string
  defaultBranch: string
  onClose: () => void
  onCreated: (pr: any) => void
}

export function CreatePullRequestModal({
  isOpen,
  owner,
  repo,
  defaultBranch,
  onClose,
  onCreated
}: CreatePullRequestModalProps): React.JSX.Element | null {
  const queryClient = useQueryClient()
  const [baseBranch, setBaseBranch] = useState(defaultBranch || 'main')
  const [headBranch, setHeadBranch] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [isDraft, setIsDraft] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Branches Query
  const { data: branches = [] } = useQuery({
    queryKey: ['github', 'branches', owner, repo],
    enabled: isOpen,
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/branches?per_page=100`)
      return res.data || []
    }
  })

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !headBranch) return
    setCreating(true)
    setError(null)

    try {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/pulls`, {
        method: 'POST',
        body: {
          title: title.trim(),
          body: body.trim(),
          head: headBranch,
          base: baseBranch,
          draft: isDraft
        }
      })

      queryClient.invalidateQueries({ queryKey: ['github', 'prs', owner, repo] })
      onCreated(res.data)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create pull request')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#000000]/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-[540px] bg-[#0d1117] border border-[#30363d] rounded-xl shadow-2xl overflow-hidden text-[#c9d1d9] font-sans">
        <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#161b22]">
          <div className="flex items-center gap-2">
            <GitPullRequest className="w-5 h-5 text-[#3fb950]" />
            <h3 className="font-semibold text-sm text-[#f0f6fc]">Open a Pull Request</h3>
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

          {/* Branch Selectors */}
          <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-lg flex items-center justify-between">
            <div>
              <label className="block text-[#8b949e] text-[10px] uppercase font-mono mb-1">base branch</label>
              <select
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                className="bg-[#000000] border border-[#30363d] rounded px-2.5 py-1 text-xs text-[#58a6ff] font-mono focus:outline-none"
              >
                {branches.map((b: any) => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>

            <ArrowRight className="w-4 h-4 text-[#8b949e] shrink-0 mt-3" />

            <div>
              <label className="block text-[#8b949e] text-[10px] uppercase font-mono mb-1">compare branch</label>
              <select
                value={headBranch}
                onChange={(e) => setHeadBranch(e.target.value)}
                className="bg-[#000000] border border-[#30363d] rounded px-2.5 py-1 text-xs text-[#58a6ff] font-mono focus:outline-none"
              >
                <option value="">Select branch...</option>
                {branches.filter((b: any) => b.name !== baseBranch).map((b: any) => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[#8b949e] font-semibold mb-1 uppercase tracking-wider text-[11px]">
              Title <span className="text-[#f85149]">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title for your pull request"
              className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]"
            />
          </div>

          <div>
            <label className="block text-[#8b949e] font-semibold mb-1 uppercase tracking-wider text-[11px]">Description (GFM supported)</label>
            <textarea
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Explain the changes in this PR..."
              className="w-full bg-[#000000] border border-[#30363d] rounded p-3 text-xs text-[#c9d1d9] font-mono focus:outline-none focus:border-[#58a6ff] resize-y"
            />
          </div>

          <div className="pt-2 border-t border-[#30363d]/50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isDraft}
                onChange={(e) => setIsDraft(e.target.checked)}
                className="rounded border-[#30363d] bg-[#000000]"
              />
              <span className="text-[#c9d1d9]">Create as draft PR (cannot be merged until marked ready)</span>
            </label>
          </div>

          <div className="pt-4 border-t border-[#30363d] flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-[#21262d] text-[#c9d1d9] rounded font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !title.trim() || !headBranch}
              className="px-4 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white rounded font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {creating ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <GitPullRequest className="w-3.5 h-3.5" />}
              Create Pull Request
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
