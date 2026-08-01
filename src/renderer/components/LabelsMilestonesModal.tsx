import React, { useState } from 'react'
import { Tag, Calendar, X, Plus, Trash2, Edit, AlertCircle } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

interface LabelsMilestonesModalProps {
  isOpen: boolean
  owner: string
  repo: string
  onClose: () => void
}

export function LabelsMilestonesModal({
  isOpen,
  owner,
  repo,
  onClose
}: LabelsMilestonesModalProps): React.JSX.Element | null {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'labels' | 'milestones'>('labels')

  // Label form state
  const [labelName, setLabelName] = useState('')
  const [labelColor, setLabelColor] = useState('58a6ff')
  const [labelDesc, setLabelDesc] = useState('')
  const [creatingLabel, setCreatingLabel] = useState(false)

  // Milestone form state
  const [milestoneTitle, setMilestoneTitle] = useState('')
  const [milestoneDesc, setMilestoneDesc] = useState('')
  const [milestoneDueDate, setMilestoneDueDate] = useState('')
  const [creatingMilestone, setCreatingMilestone] = useState(false)

  // Queries
  const { data: labels = [] } = useQuery({
    queryKey: ['github', 'labels', owner, repo],
    enabled: isOpen,
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/labels`)
      return res.data || []
    }
  })

  const { data: milestones = [] } = useQuery({
    queryKey: ['github', 'milestones', owner, repo],
    enabled: isOpen,
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/milestones?state=all`)
      return res.data || []
    }
  })

  if (!isOpen) return null

  // Label CRUD Handlers
  const handleCreateLabel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!labelName.trim()) return
    setCreatingLabel(true)

    try {
      await window.devhub.github.request(`/repos/${owner}/${repo}/labels`, {
        method: 'POST',
        body: {
          name: labelName.trim(),
          color: labelColor.replace('#', '').trim(),
          description: labelDesc.trim()
        }
      })
      queryClient.invalidateQueries({ queryKey: ['github', 'labels', owner, repo] })
      setLabelName('')
      setLabelDesc('')
    } catch (e: any) {
      alert(`Error creating label: ${e.message}`)
    } finally {
      setCreatingLabel(false)
    }
  }

  const handleDeleteLabel = async (name: string) => {
    if (!confirm(`Delete label "${name}"?`)) return
    try {
      await window.devhub.github.request(`/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`, {
        method: 'DELETE'
      })
      queryClient.invalidateQueries({ queryKey: ['github', 'labels', owner, repo] })
    } catch (e: any) {
      alert(`Error deleting label: ${e.message}`)
    }
  }

  // Milestone CRUD Handlers
  const handleCreateMilestone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!milestoneTitle.trim()) return
    setCreatingMilestone(true)

    try {
      const body: any = {
        title: milestoneTitle.trim(),
        description: milestoneDesc.trim()
      }
      if (milestoneDueDate) body.due_on = new Date(milestoneDueDate).toISOString()

      await window.devhub.github.request(`/repos/${owner}/${repo}/milestones`, {
        method: 'POST',
        body
      })
      queryClient.invalidateQueries({ queryKey: ['github', 'milestones', owner, repo] })
      setMilestoneTitle('')
      setMilestoneDesc('')
      setMilestoneDueDate('')
    } catch (e: any) {
      alert(`Error creating milestone: ${e.message}`)
    } finally {
      setCreatingMilestone(false)
    }
  }

  const handleDeleteMilestone = async (number: number) => {
    if (!confirm('Delete milestone?')) return
    try {
      await window.devhub.github.request(`/repos/${owner}/${repo}/milestones/${number}`, {
        method: 'DELETE'
      })
      queryClient.invalidateQueries({ queryKey: ['github', 'milestones', owner, repo] })
    } catch (e: any) {
      alert(`Error deleting milestone: ${e.message}`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#000000]/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-[560px] max-h-[85vh] bg-[#0d1117] border border-[#30363d] rounded-xl shadow-2xl flex flex-col overflow-hidden text-[#c9d1d9] font-sans">
        <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#161b22] shrink-0">
          <div className="flex border border-[#30363d] rounded overflow-hidden">
            <button
              onClick={() => setTab('labels')}
              className={`px-3 py-1 text-xs transition-colors flex items-center gap-1.5 ${tab === 'labels' ? 'bg-[#30363d] text-white' : 'text-[#8b949e]'}`}
            >
              <Tag className="w-3.5 h-3.5" /> Labels ({labels.length})
            </button>
            <button
              onClick={() => setTab('milestones')}
              className={`px-3 py-1 text-xs transition-colors flex items-center gap-1.5 ${tab === 'milestones' ? 'bg-[#30363d] text-white' : 'text-[#8b949e]'}`}
            >
              <Calendar className="w-3.5 h-3.5" /> Milestones ({milestones.length})
            </button>
          </div>

          <button onClick={onClose} className="text-[#8b949e] hover:text-[#f0f6fc]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6 scrollbar-hide text-xs">
          {tab === 'labels' ? (
            <>
              {/* Create Label Form */}
              <form onSubmit={handleCreateLabel} className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-xs text-[#8b949e] uppercase tracking-wider">Create New Label</h4>
                <div className="grid grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Label name"
                    value={labelName}
                    onChange={(e) => setLabelName(e.target.value)}
                    className="bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9]"
                  />
                  <input
                    type="text"
                    placeholder="Color (e.g. 58a6ff)"
                    value={labelColor}
                    onChange={(e) => setLabelColor(e.target.value)}
                    className="bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9] font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Description"
                    value={labelDesc}
                    onChange={(e) => setLabelDesc(e.target.value)}
                    className="bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9]"
                  />
                </div>
                <div className="flex justify-end">
                  <button type="submit" disabled={creatingLabel} className="px-3 py-1.5 bg-[#238636] text-white font-semibold rounded text-xs">
                    Save Label
                  </button>
                </div>
              </form>

              {/* Labels List */}
              <div className="space-y-2">
                {labels.map((l: any) => (
                  <div key={l.name} className="p-3 bg-[#161b22] border border-[#30363d] rounded flex items-center justify-between">
                    <span
                      className="px-2.5 py-0.5 rounded text-xs font-mono border"
                      style={{
                        backgroundColor: `#${l.color}20`,
                        borderColor: `#${l.color}`,
                        color: `#${l.color}`
                      }}
                    >
                      {l.name}
                    </span>
                    <span className="text-[#8b949e] text-xs truncate max-w-xs">{l.description || 'No description'}</span>
                    <button onClick={() => handleDeleteLabel(l.name)} className="text-[#8b949e] hover:text-[#f85149]">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Create Milestone Form */}
              <form onSubmit={handleCreateMilestone} className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-xs text-[#8b949e] uppercase tracking-wider">Create New Milestone</h4>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Milestone title"
                    value={milestoneTitle}
                    onChange={(e) => setMilestoneTitle(e.target.value)}
                    className="bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9]"
                  />
                  <input
                    type="date"
                    value={milestoneDueDate}
                    onChange={(e) => setMilestoneDueDate(e.target.value)}
                    className="bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9]"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Milestone description"
                  value={milestoneDesc}
                  onChange={(e) => setMilestoneDesc(e.target.value)}
                  className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9]"
                />
                <div className="flex justify-end">
                  <button type="submit" disabled={creatingMilestone} className="px-3 py-1.5 bg-[#238636] text-white font-semibold rounded text-xs">
                    Save Milestone
                  </button>
                </div>
              </form>

              {/* Milestones List */}
              <div className="space-y-2">
                {milestones.map((m: any) => (
                  <div key={m.number} className="p-3 bg-[#161b22] border border-[#30363d] rounded flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-[#f0f6fc]">{m.title}</div>
                      <div className="text-[11px] text-[#8b949e]">{m.open_issues} open · {m.closed_issues} closed</div>
                    </div>
                    <button onClick={() => handleDeleteMilestone(m.number)} className="text-[#8b949e] hover:text-[#f85149]">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
