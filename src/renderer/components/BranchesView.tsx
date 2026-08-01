import React, { useState } from 'react'
import { GitBranch, Shield, Trash2, Plus, GitMerge, AlertCircle, Check, Lock } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loading, Empty, ErrorState } from './ui'

interface BranchesViewProps {
  owner: string
  repo: string
  defaultBranch: string
  onSelectBranch: (branch: string) => void
}

export function BranchesView({ owner, repo, defaultBranch, onSelectBranch }: BranchesViewProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [sourceBranch, setSourceBranch] = useState(defaultBranch || 'main')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Branch Protection modal
  const [protectBranchTarget, setProtectBranchTarget] = useState<string | null>(null)
  const [requiredReviews, setRequiredReviews] = useState(1)
  const [enforceAdmins, setEnforceAdmins] = useState(true)
  const [savingProtection, setSavingProtection] = useState(false)
  const [protectionMessage, setProtectionMessage] = useState<string | null>(null)

  // Branches Query
  const { data: branches = [], isLoading, error } = useQuery({
    queryKey: ['github', 'branches', owner, repo],
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/branches?per_page=100`)
      return res.data || []
    }
  })

  // Create Branch handler
  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBranchName.trim()) return
    setCreating(true)
    setCreateError(null)

    try {
      // 1. Get SHA of source branch
      const refRes = await window.devhub.github.request(`/repos/${owner}/${repo}/git/ref/heads/${sourceBranch}`)
      const sha = refRes.data.object.sha

      // 2. Create new branch ref
      await window.devhub.github.request(`/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        body: {
          ref: `refs/heads/${newBranchName.trim()}`,
          sha
        }
      })

      queryClient.invalidateQueries({ queryKey: ['github', 'branches', owner, repo] })
      setIsCreateModalOpen(false)
      setNewBranchName('')
      onSelectBranch(newBranchName.trim())
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create branch')
    } finally {
      setCreating(false)
    }
  }

  // Delete Branch handler
  const handleDeleteBranch = async (branchName: string) => {
    if (branchName === defaultBranch) return
    if (!confirm(`Are you sure you want to delete branch "${branchName}"?`)) return

    try {
      await window.devhub.github.request(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`, {
        method: 'DELETE'
      })
      queryClient.invalidateQueries({ queryKey: ['github', 'branches', owner, repo] })
    } catch (err: any) {
      alert(`Failed to delete branch: ${err.message}`)
    }
  }

  // Save Branch Protection Rules
  const handleSaveProtection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!protectBranchTarget) return
    setSavingProtection(true)
    setProtectionMessage(null)

    try {
      await window.devhub.github.request(`/repos/${owner}/${repo}/branches/${protectBranchTarget}/protection`, {
        method: 'PUT',
        body: {
          required_status_checks: null,
          enforce_admins: enforceAdmins,
          required_pull_request_reviews: {
            required_approving_review_count: requiredReviews,
            dismiss_stale_reviews: true
          },
          restrictions: null
        }
      })
      setProtectionMessage('Branch protection rules saved!')
      queryClient.invalidateQueries({ queryKey: ['github', 'branches', owner, repo] })
    } catch (err: any) {
      setProtectionMessage(`Error: ${err.message}`)
    } finally {
      setSavingProtection(false)
    }
  }

  if (isLoading) return <Loading what="Loading Repository Branches..." />
  if (error) return <ErrorState title="Failed to Load Branches" detail={(error as Error).message} />

  return (
    <div className="flex flex-col gap-6 text-xs text-[#c9d1d9] font-sans pb-16">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between border-b border-[#30363d] pb-4">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-[#58a6ff]" />
          <h2 className="text-base font-semibold text-[#f0f6fc]">Branches ({branches.length})</h2>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold rounded text-xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New branch
        </button>
      </div>

      {/* Branches List */}
      <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]/40">
        {branches.map((b: any) => {
          const isDefault = b.name === defaultBranch
          const isProtected = b.protected

          return (
            <div key={b.name} className="p-4 hover:bg-[#161b22] transition-colors flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <GitBranch className="w-4 h-4 text-[#58a6ff] shrink-0" />
                <span
                  onClick={() => onSelectBranch(b.name)}
                  className="font-mono text-xs font-semibold text-[#f0f6fc] hover:text-[#58a6ff] cursor-pointer truncate"
                >
                  {b.name}
                </span>

                {isDefault && (
                  <span className="bg-[#161b22] border border-[#58a6ff]/40 text-[#58a6ff] text-[10px] px-2 py-0.2 rounded font-mono">
                    Default
                  </span>
                )}

                {isProtected && (
                  <span className="flex items-center gap-1 bg-[#30363d]/40 text-[#e3b341] text-[10px] px-2 py-0.2 rounded font-mono">
                    <Lock className="w-3 h-3" /> Protected
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setProtectBranchTarget(b.name)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-[#161b22] hover:bg-[#30363d] text-[#c9d1d9] rounded border border-[#30363d] text-xs transition-colors"
                >
                  <Shield className="w-3.5 h-3.5 text-[#e3b341]" /> Protection
                </button>

                {!isDefault && (
                  <button
                    onClick={() => handleDeleteBranch(b.name)}
                    className="p-1 text-[#8b949e] hover:text-[#f85149] hover:bg-[#3d1308] rounded transition-colors"
                    title="Delete branch"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Create Branch Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#000000]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateBranch} className="w-[440px] bg-[#0d1117] border border-[#30363d] rounded-xl p-6 space-y-4 text-xs">
            <h3 className="font-semibold text-sm text-[#f0f6fc]">Create new branch</h3>

            {createError && <div className="p-2 bg-[#3d1308] border border-[#f85149] rounded text-[#f85149]">{createError}</div>}

            <div>
              <label className="block text-[#8b949e] mb-1 font-mono text-[11px]">Branch Name</label>
              <input
                type="text"
                required
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="e.g. feature/new-login"
                className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9] font-mono focus:outline-none focus:border-[#58a6ff]"
              />
            </div>

            <div>
              <label className="block text-[#8b949e] mb-1 font-mono text-[11px]">Source Branch</label>
              <select
                value={sourceBranch}
                onChange={(e) => setSourceBranch(e.target.value)}
                className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9] font-mono focus:outline-none"
              >
                {branches.map((b: any) => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#30363d]">
              <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-3 py-1.5 bg-[#21262d] text-[#c9d1d9] rounded">Cancel</button>
              <button type="submit" disabled={creating || !newBranchName.trim()} className="px-4 py-1.5 bg-[#238636] text-white rounded font-semibold">
                {creating ? 'Creating...' : 'Create branch'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Branch Protection Rules Modal */}
      {protectBranchTarget && (
        <div className="fixed inset-0 z-50 bg-[#000000]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSaveProtection} className="w-[480px] bg-[#0d1117] border border-[#30363d] rounded-xl p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-[#30363d] pb-3">
              <Shield className="w-4 h-4 text-[#e3b341]" />
              <h3 className="font-semibold text-sm text-[#f0f6fc]">Branch Protection: {protectBranchTarget}</h3>
            </div>

            {protectionMessage && (
              <div className={`p-2.5 rounded border text-xs ${protectionMessage.startsWith('Error') ? 'bg-[#3d1308] border-[#f85149] text-[#f85149]' : 'bg-[#0e2a1f] border-[#238636] text-[#3fb950]'}`}>
                {protectionMessage}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[#8b949e] mb-1 font-mono">Required Approving Reviews</label>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={requiredReviews}
                  onChange={(e) => setRequiredReviews(parseInt(e.target.value, 10))}
                  className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9]"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enforceAdmins}
                  onChange={(e) => setEnforceAdmins(e.target.checked)}
                  className="rounded border-[#30363d] bg-[#000000]"
                />
                <span>Include administrators in protection rules</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#30363d]">
              <button type="button" onClick={() => setProtectBranchTarget(null)} className="px-3 py-1.5 bg-[#21262d] text-[#c9d1d9] rounded">Close</button>
              <button type="submit" disabled={savingProtection} className="px-4 py-1.5 bg-[#238636] text-white rounded font-semibold">
                {savingProtection ? 'Saving...' : 'Save protection rules'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
