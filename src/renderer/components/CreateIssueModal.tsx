import React, { useState, useEffect } from 'react'
import { CircleDot, X, Plus, Tag, User, Calendar, FileText, AlertCircle } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

interface CreateIssueModalProps {
  isOpen: boolean
  owner: string
  repo: string
  onClose: () => void
  onCreated: (issue: any) => void
}

export function CreateIssueModal({
  isOpen,
  owner,
  repo,
  onClose,
  onCreated
}: CreateIssueModalProps): React.JSX.Element | null {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [selectedLabels, setSelectedLabels] = useState<string[]>([])
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])
  const [selectedMilestone, setSelectedMilestone] = useState<number | ''>('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Template state
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null)

  // Labels Query
  const { data: labels = [] } = useQuery({
    queryKey: ['github', 'labels', owner, repo],
    enabled: isOpen,
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/labels`)
      return res.data || []
    }
  })

  // Milestones Query
  const { data: milestones = [] } = useQuery({
    queryKey: ['github', 'milestones', owner, repo],
    enabled: isOpen,
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/milestones?state=open`)
      return res.data || []
    }
  })

  // Assignees / Collaborators Query
  const { data: assignees = [] } = useQuery({
    queryKey: ['github', 'assignees', owner, repo],
    enabled: isOpen,
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/assignees`)
      return res.data || []
    }
  })

  // Issue Templates Query (.github/ISSUE_TEMPLATE)
  const { data: templates = [] } = useQuery({
    queryKey: ['github', 'issueTemplates', owner, repo],
    enabled: isOpen,
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/contents/.github/ISSUE_TEMPLATE`).catch(() => ({ data: [] }))
      if (Array.isArray(res.data)) {
        // Fetch content for each template file
        const fullTemplates = await Promise.all(
          res.data.map(async (f: any) => {
            const fRes = await window.devhub.github.request(`/repos/${owner}/${repo}/contents/${f.path}`).catch(() => ({ data: null }))
            if (fRes.data?.content) {
              let text = ''
              try { text = decodeURIComponent(escape(atob(fRes.data.content))) } catch { text = atob(fRes.data.content) }
              return { name: f.name, path: f.path, text }
            }
            return null
          })
        )
        return fullTemplates.filter(Boolean)
      }
      return []
    }
  })

  if (!isOpen) return null

  const handleSelectTemplate = (tpl: any) => {
    setSelectedTemplate(tpl)
    if (tpl?.text) {
      // Parse frontmatter if present
      const lines = tpl.text.split('\n')
      let bodyText = tpl.text
      if (lines[0]?.trim() === '---') {
        const endIdx = lines.slice(1).indexOf('---')
        if (endIdx !== -1) {
          bodyText = lines.slice(endIdx + 2).join('\n')
        }
      }
      setBody(bodyText)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setCreating(true)
    setError(null)

    try {
      const payload: any = {
        title: title.trim(),
        body: body.trim(),
        labels: selectedLabels,
        assignees: selectedAssignees
      }

      if (selectedMilestone) payload.milestone = selectedMilestone

      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        body: payload
      })

      queryClient.invalidateQueries({ queryKey: ['github', 'issues', owner, repo] })
      onCreated(res.data)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create issue')
    } finally {
      setCreating(false)
    }
  }

  const toggleLabel = (labelName: string) => {
    setSelectedLabels(prev =>
      prev.includes(labelName) ? prev.filter(l => l !== labelName) : [...prev, labelName]
    )
  }

  const toggleAssignee = (username: string) => {
    setSelectedAssignees(prev =>
      prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#000000]/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-[560px] max-h-[85vh] bg-[#0d1117] border border-[#30363d] rounded-xl shadow-2xl flex flex-col overflow-hidden text-[#c9d1d9] font-sans">
        <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#161b22] shrink-0">
          <div className="flex items-center gap-2">
            <CircleDot className="w-5 h-5 text-[#3fb950]" />
            <h3 className="font-semibold text-sm text-[#f0f6fc]">Create New Issue</h3>
          </div>
          <button onClick={onClose} className="text-[#8b949e] hover:text-[#f0f6fc] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1 scrollbar-hide">
          {error && (
            <div className="p-3 bg-[#3d1308] border border-[#f85149]/40 rounded text-[#f85149] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Issue Templates Selector */}
          {templates.length > 0 && (
            <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-lg">
              <label className="block text-[#8b949e] text-[10px] uppercase font-mono mb-1.5 font-semibold">
                Use an Issue Template
              </label>
              <div className="flex flex-wrap gap-2">
                {templates.map((tpl: any) => (
                  <button
                    key={tpl.name}
                    type="button"
                    onClick={() => handleSelectTemplate(tpl)}
                    className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                      selectedTemplate?.name === tpl.name
                        ? 'bg-[#58a6ff]/20 border-[#58a6ff] text-[#58a6ff]'
                        : 'bg-[#000000] border-[#30363d] text-[#c9d1d9] hover:border-[#8b949e]'
                    }`}
                  >
                    {tpl.name.replace(/\.md$/i, '')}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-[#8b949e] font-semibold mb-1 uppercase tracking-wider text-[11px]">
              Title <span className="text-[#f85149]">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title for your issue"
              className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]"
            />
          </div>

          <div>
            <label className="block text-[#8b949e] font-semibold mb-1 uppercase tracking-wider text-[11px]">
              Body (GFM Supported)
            </label>
            <textarea
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe the issue or feature request..."
              className="w-full bg-[#000000] border border-[#30363d] rounded p-3 text-xs text-[#c9d1d9] font-mono focus:outline-none focus:border-[#58a6ff] resize-y"
            />
          </div>

          {/* Labels & Metadata */}
          <div className="space-y-3 pt-2 border-t border-[#30363d]/50">
            {/* Labels */}
            {labels.length > 0 && (
              <div>
                <label className="block text-[#8b949e] mb-1.5 text-[11px] font-semibold">Labels</label>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {labels.map((l: any) => {
                    const isSelected = selectedLabels.includes(l.name)
                    return (
                      <span
                        key={l.name}
                        onClick={() => toggleLabel(l.name)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer transition-opacity border ${
                          isSelected ? 'opacity-100 ring-1 ring-white' : 'opacity-70 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: `#${l.color}20`,
                          borderColor: `#${l.color}`,
                          color: `#${l.color}`
                        }}
                      >
                        {l.name}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Assignees */}
            {assignees.length > 0 && (
              <div>
                <label className="block text-[#8b949e] mb-1.5 text-[11px] font-semibold">Assignees</label>
                <div className="flex flex-wrap gap-1.5">
                  {assignees.map((u: any) => {
                    const isSelected = selectedAssignees.includes(u.login)
                    return (
                      <span
                        key={u.login}
                        onClick={() => toggleAssignee(u.login)}
                        className={`px-2 py-0.5 rounded text-[11px] cursor-pointer border transition-colors ${
                          isSelected ? 'bg-[#161b22] border-[#58a6ff] text-[#58a6ff]' : 'bg-[#000000] border-[#30363d] text-[#8b949e]'
                        }`}
                      >
                        @{u.login}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Milestone */}
            {milestones.length > 0 && (
              <div>
                <label className="block text-[#8b949e] mb-1 text-[11px] font-semibold">Milestone</label>
                <select
                  value={selectedMilestone}
                  onChange={(e) => setSelectedMilestone(e.target.value ? parseInt(e.target.value, 10) : '')}
                  className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9]"
                >
                  <option value="">No Milestone</option>
                  {milestones.map((m: any) => (
                    <option key={m.number} value={m.number}>{m.title}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-[#30363d] flex justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-[#21262d] text-[#c9d1d9] rounded font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !title.trim()}
              className="px-4 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white rounded font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {creating ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CircleDot className="w-3.5 h-3.5" />}
              Submit Issue
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
