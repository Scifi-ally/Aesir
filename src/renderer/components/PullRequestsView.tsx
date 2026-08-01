import React, { useState } from 'react'
import {
  GitPullRequest,
  Plus,
  ArrowLeft,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  GitMerge,
  ShieldCheck,
  AlertTriangle,
  User,
  Send,
  FileCode,
  Check
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { GfmRenderer } from './GfmRenderer'
import { DiffViewer } from './DiffViewer'
import { CreatePullRequestModal } from './CreatePullRequestModal'
import { Loading, Empty, ErrorState } from './ui'

interface PullRequestsViewProps {
  owner: string
  repo: string
  defaultBranch: string
}

export function PullRequestsView({ owner, repo, defaultBranch }: PullRequestsViewProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(null)
  const [stateFilter, setStateFilter] = useState<'open' | 'closed' | 'all'>('open')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState<'conversation' | 'files' | 'checks'>('conversation')

  // New Comment input
  const [newCommentBody, setNewCommentBody] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  // Review drawer state
  const [isReviewing, setIsReviewing] = useState(false)
  const [reviewEvent, setReviewEvent] = useState<'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'>('APPROVE')
  const [reviewBody, setReviewBody] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  // Merge state
  const [mergeMethod, setMergeMethod] = useState<'merge' | 'squash' | 'rebase'>('merge')
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)

  // PR List Query
  const { data: prs = [], isLoading, error } = useQuery({
    queryKey: ['github', 'prs', owner, repo, stateFilter],
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/pulls?state=${stateFilter}&per_page=50`)
      return res.data || []
    }
  })

  // PR Detail Query
  const { data: prDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['github', 'prDetail', owner, repo, selectedPrNumber],
    enabled: Boolean(selectedPrNumber),
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/pulls/${selectedPrNumber}`)
      return res.data
    }
  })

  // PR Comments & Reviews Query (Chronological Conversation Thread)
  const { data: prComments = [] } = useQuery({
    queryKey: ['github', 'prComments', owner, repo, selectedPrNumber],
    enabled: Boolean(selectedPrNumber),
    queryFn: async () => {
      const [issueCommentsRes, reviewCommentsRes, reviewsRes] = await Promise.all([
        window.devhub.github.request(`/repos/${owner}/${repo}/issues/${selectedPrNumber}/comments`).catch(() => ({ data: [] })),
        window.devhub.github.request(`/repos/${owner}/${repo}/pulls/${selectedPrNumber}/comments`).catch(() => ({ data: [] })),
        window.devhub.github.request(`/repos/${owner}/${repo}/pulls/${selectedPrNumber}/reviews`).catch(() => ({ data: [] }))
      ])

      const issueComments = (issueCommentsRes.data || []).map((c: any) => ({ ...c, type: 'issue_comment' }))
      const reviewComments = (reviewCommentsRes.data || []).map((c: any) => ({ ...c, type: 'review_comment' }))
      const reviews = (reviewsRes.data || []).map((r: any) => ({ ...r, type: 'review' }))

      const combined = [...issueComments, ...reviewComments, ...reviews].sort(
        (a, b) => new Date(a.created_at || a.submitted_at).getTime() - new Date(b.created_at || b.submitted_at).getTime()
      )

      return combined
    }
  })

  // PR Files Diffs Query
  const { data: prFiles = [] } = useQuery({
    queryKey: ['github', 'prFiles', owner, repo, selectedPrNumber],
    enabled: Boolean(selectedPrNumber && activeSubTab === 'files'),
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/pulls/${selectedPrNumber}/files`)
      return res.data || []
    }
  })

  // PR Commits CI Status / Combined Check Runs Query
  const { data: ciStatus } = useQuery({
    queryKey: ['github', 'prStatus', owner, repo, prDetail?.head?.sha],
    enabled: Boolean(prDetail?.head?.sha),
    queryFn: async () => {
      const sha = prDetail.head.sha
      const [statusRes, checksRes] = await Promise.all([
        window.devhub.github.request(`/repos/${owner}/${repo}/commits/${sha}/status`).catch(() => ({ data: null })),
        window.devhub.github.request(`/repos/${owner}/${repo}/commits/${sha}/check-runs`).catch(() => ({ data: null }))
      ])
      return {
        combinedStatus: statusRes.data,
        checkRuns: checksRes.data?.check_runs || []
      }
    }
  })

  // Post Issue Comment
  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCommentBody.trim() || !selectedPrNumber) return
    setPostingComment(true)

    try {
      await window.devhub.github.request(`/repos/${owner}/${repo}/issues/${selectedPrNumber}/comments`, {
        method: 'POST',
        body: { body: newCommentBody.trim() }
      })
      setNewCommentBody('')
      queryClient.invalidateQueries({ queryKey: ['github', 'prComments', owner, repo, selectedPrNumber] })
    } catch (err: any) {
      alert(`Failed to post comment: ${err.message}`)
    } finally {
      setPostingComment(false)
    }
  }

  // Submit Review (Approve / Request Changes / Comment)
  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPrNumber) return
    setSubmittingReview(true)

    try {
      await window.devhub.github.request(`/repos/${owner}/${repo}/pulls/${selectedPrNumber}/reviews`, {
        method: 'POST',
        body: {
          event: reviewEvent,
          body: reviewBody.trim()
        }
      })
      setIsReviewing(false)
      setReviewBody('')
      queryClient.invalidateQueries({ queryKey: ['github', 'prComments', owner, repo, selectedPrNumber] })
      queryClient.invalidateQueries({ queryKey: ['github', 'prDetail', owner, repo, selectedPrNumber] })
    } catch (err: any) {
      alert(`Failed to submit review: ${err.message}`)
    } finally {
      setSubmittingReview(false)
    }
  }

  // Execute PR Merge
  const handleMergePr = async () => {
    if (!selectedPrNumber) return
    setMerging(true)
    setMergeError(null)

    try {
      await window.devhub.github.request(`/repos/${owner}/${repo}/pulls/${selectedPrNumber}/merge`, {
        method: 'PUT',
        body: {
          merge_method: mergeMethod
        }
      })
      queryClient.invalidateQueries({ queryKey: ['github', 'prs', owner, repo] })
      queryClient.invalidateQueries({ queryKey: ['github', 'prDetail', owner, repo, selectedPrNumber] })
    } catch (err: any) {
      setMergeError(err.message || 'Failed to merge pull request')
    } finally {
      setMerging(false)
    }
  }

  if (isLoading) return <Loading what="Loading Pull Requests..." />
  if (error) return <ErrorState title="Failed to Load Pull Requests" detail={(error as Error).message} />

  // PR Detail View
  if (selectedPrNumber && prDetail) {
    const isMerged = prDetail.merged
    const isClosed = prDetail.state === 'closed' && !isMerged
    const isDraft = prDetail.draft
    const isMergeable = prDetail.mergeable

    return (
      <div className="flex flex-col gap-6 text-xs text-[#c9d1d9] font-sans pb-16">
        <CreatePullRequestModal
          isOpen={isCreateModalOpen}
          owner={owner}
          repo={repo}
          defaultBranch={defaultBranch}
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={(newPr) => setSelectedPrNumber(newPr.number)}
        />

        <button
          onClick={() => setSelectedPrNumber(null)}
          className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-[#58a6ff] transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" /> Back to pull requests
        </button>

        {/* PR Header Banner */}
        <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-6 space-y-3">
          <div className="flex items-start justify-between">
            <h2 className="text-lg font-semibold text-[#f0f6fc]">
              {prDetail.title} <span className="text-[#8b949e] font-normal">#{prDetail.number}</span>
            </h2>

            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded text-xs font-semibold uppercase font-mono flex items-center gap-1.5 ${
                isMerged
                  ? 'bg-[#8250df]/20 border border-[#a371f7] text-[#a371f7]'
                  : isClosed
                  ? 'bg-[#da3633]/20 border border-[#f85149] text-[#f85149]'
                  : isDraft
                  ? 'bg-[#30363d] text-[#8b949e]'
                  : 'bg-[#238636]/20 border border-[#3fb950] text-[#3fb950]'
              }`}>
                <GitPullRequest className="w-3.5 h-3.5" />
                {isMerged ? 'Merged' : isClosed ? 'Closed' : isDraft ? 'Draft' : 'Open'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-[#8b949e]">
            <span className="font-semibold text-[#c9d1d9]">{prDetail.user?.login}</span>
            <span>wants to merge into <code className="bg-[#161b22] px-1.5 py-0.5 rounded font-mono text-[#58a6ff]">{prDetail.base?.ref}</code> from <code className="bg-[#161b22] px-1.5 py-0.5 rounded font-mono text-[#58a6ff]">{prDetail.head?.ref}</code></span>
          </div>

          {/* Subtabs Nav */}
          <div className="flex items-center gap-4 pt-3 border-t border-[#30363d]/50 font-medium">
            <button
              onClick={() => setActiveSubTab('conversation')}
              className={`pb-1 border-b-2 transition-colors ${activeSubTab === 'conversation' ? 'border-[#f78166] text-[#f0f6fc]' : 'border-transparent text-[#8b949e] hover:text-[#c9d1d9]'}`}
            >
              Conversation ({prComments.length})
            </button>
            <button
              onClick={() => setActiveSubTab('files')}
              className={`pb-1 border-b-2 transition-colors ${activeSubTab === 'files' ? 'border-[#f78166] text-[#f0f6fc]' : 'border-transparent text-[#8b949e] hover:text-[#c9d1d9]'}`}
            >
              Files Changed ({prDetail.changed_files})
            </button>
            <button
              onClick={() => setActiveSubTab('checks')}
              className={`pb-1 border-b-2 transition-colors ${activeSubTab === 'checks' ? 'border-[#f78166] text-[#f0f6fc]' : 'border-transparent text-[#8b949e] hover:text-[#c9d1d9]'}`}
            >
              Checks & CI
            </button>
          </div>
        </div>

        {/* Conversation Subtab */}
        {activeSubTab === 'conversation' && (
          <div className="space-y-6">
            {/* Body */}
            {prDetail.body && (
              <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-6">
                <GfmRenderer content={prDetail.body} owner={owner} repo={repo} defaultBranch={defaultBranch} />
              </div>
            )}

            {/* Conversation Items */}
            <div className="space-y-4">
              {prComments.map((item: any, i: number) => (
                <div key={item.id || i} className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden">
                  <div className="bg-[#161b22] px-4 py-2 border-b border-[#30363d] flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#c9d1d9]">{item.user?.login}</span>
                      <span className="text-[#8b949e] text-[11px]">{new Date(item.created_at || item.submitted_at).toLocaleString()}</span>
                    </div>
                    {item.state && (
                      <span className={`font-mono text-[10px] uppercase font-semibold px-2 py-0.2 rounded ${
                        item.state === 'APPROVED' ? 'bg-[#0e2a1f] text-[#3fb950]' : 'bg-[#3d1308] text-[#f85149]'
                      }`}>
                        {item.state}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <GfmRenderer content={item.body || ''} owner={owner} repo={repo} defaultBranch={defaultBranch} />
                  </div>
                </div>
              ))}
            </div>

            {/* Submit Review Action Button */}
            {!isMerged && prDetail.state === 'open' && (
              <div className="flex justify-end">
                <button
                  onClick={() => setIsReviewing(true)}
                  className="px-4 py-1.5 bg-[#161b22] hover:bg-[#30363d] text-[#c9d1d9] rounded border border-[#30363d] font-semibold text-xs transition-colors"
                >
                  Submit PR Review
                </button>
              </div>
            )}

            {/* Review Submission Drawer */}
            {isReviewing && (
              <form onSubmit={handleSubmitReview} className="bg-[#0d1117] border border-[#58a6ff]/50 rounded-lg p-6 space-y-4">
                <h3 className="font-semibold text-sm text-[#f0f6fc]">Submit PR Review</h3>

                <div className="grid grid-cols-3 gap-3">
                  <label className={`p-3 border rounded cursor-pointer transition-colors ${reviewEvent === 'APPROVE' ? 'bg-[#0e2a1f] border-[#238636] text-[#3fb950]' : 'bg-[#000000] border-[#30363d]'}`}>
                    <input type="radio" name="event" checked={reviewEvent === 'APPROVE'} onChange={() => setReviewEvent('APPROVE')} className="sr-only" />
                    <div className="font-semibold text-xs">Approve</div>
                    <div className="text-[11px] text-[#8b949e]">Submit approval to merge</div>
                  </label>

                  <label className={`p-3 border rounded cursor-pointer transition-colors ${reviewEvent === 'REQUEST_CHANGES' ? 'bg-[#3d1308] border-[#f85149] text-[#f85149]' : 'bg-[#000000] border-[#30363d]'}`}>
                    <input type="radio" name="event" checked={reviewEvent === 'REQUEST_CHANGES'} onChange={() => setReviewEvent('REQUEST_CHANGES')} className="sr-only" />
                    <div className="font-semibold text-xs">Request Changes</div>
                    <div className="text-[11px] text-[#8b949e]">Block merge until updated</div>
                  </label>

                  <label className={`p-3 border rounded cursor-pointer transition-colors ${reviewEvent === 'COMMENT' ? 'bg-[#161b22] border-[#30363d] text-[#c9d1d9]' : 'bg-[#000000] border-[#30363d]'}`}>
                    <input type="radio" name="event" checked={reviewEvent === 'COMMENT'} onChange={() => setReviewEvent('COMMENT')} className="sr-only" />
                    <div className="font-semibold text-xs">Comment</div>
                    <div className="text-[11px] text-[#8b949e]">General review feedback</div>
                  </label>
                </div>

                <textarea
                  rows={4}
                  value={reviewBody}
                  onChange={(e) => setReviewBody(e.target.value)}
                  placeholder="Review comments..."
                  className="w-full bg-[#000000] border border-[#30363d] rounded p-3 font-mono text-xs text-[#c9d1d9]"
                />

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setIsReviewing(false)} className="px-3 py-1.5 bg-[#21262d] text-[#c9d1d9] rounded">Cancel</button>
                  <button type="submit" disabled={submittingReview} className="px-4 py-1.5 bg-[#238636] text-white rounded font-semibold">
                    {submittingReview ? 'Submitting...' : 'Submit Review'}
                  </button>
                </div>
              </form>
            )}

            {/* Comment Form */}
            <form onSubmit={handlePostComment} className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 space-y-3">
              <textarea
                rows={3}
                value={newCommentBody}
                onChange={(e) => setNewCommentBody(e.target.value)}
                placeholder="Leave a comment..."
                className="w-full bg-[#000000] border border-[#30363d] rounded p-3 text-xs text-[#c9d1d9] font-mono focus:outline-none focus:border-[#58a6ff]"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={postingComment || !newCommentBody.trim()}
                  className="px-4 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-semibold rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> Comment
                </button>
              </div>
            </form>

            {/* Merge Bar Section */}
            {!isMerged && prDetail.state === 'open' && (
              <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isMergeable === false ? (
                      <XCircle className="w-5 h-5 text-[#f85149]" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-[#3fb950]" />
                    )}
                    <div>
                      <div className="font-semibold text-[#c9d1d9]">
                        {isMergeable === false ? 'This branch has conflicts that must be resolved' : 'This branch has no conflicts with the base branch'}
                      </div>
                      <div className="text-[11px] text-[#8b949e]">Merge state: {prDetail.mergeable_state || 'unknown'}</div>
                    </div>
                  </div>

                  <select
                    value={mergeMethod}
                    onChange={(e: any) => setMergeMethod(e.target.value)}
                    className="bg-[#161b22] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#58a6ff] font-mono focus:outline-none"
                  >
                    <option value="merge">Create a merge commit</option>
                    <option value="squash">Squash and merge</option>
                    <option value="rebase">Rebase and merge</option>
                  </select>
                </div>

                {mergeError && <div className="p-3 bg-[#3d1308] border border-[#f85149] text-[#f85149] rounded">{mergeError}</div>}

                <div className="flex justify-end pt-2 border-t border-[#30363d]/50">
                  <button
                    onClick={handleMergePr}
                    disabled={merging || isMergeable === false}
                    className="px-6 py-2 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold text-xs rounded transition-colors disabled:opacity-40 flex items-center gap-2"
                  >
                    {merging ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <GitMerge className="w-4 h-4" />}
                    Merge Pull Request
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Files Changed Subtab */}
        {activeSubTab === 'files' && (
          <DiffViewer files={prFiles} />
        )}

        {/* Checks & CI Subtab */}
        {activeSubTab === 'checks' && (
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-xs text-[#8b949e] uppercase tracking-wider">CI Status Runs</h3>
            {ciStatus?.checkRuns.length === 0 ? (
              <div className="p-4 text-center text-[#8b949e]">No CI status checks configured for this commit.</div>
            ) : (
              <div className="space-y-2">
                {ciStatus?.checkRuns.map((check: any) => (
                  <div key={check.id} className="p-3 bg-[#161b22] border border-[#30363d] rounded flex items-center justify-between">
                    <span className="font-mono text-xs text-[#f0f6fc]">{check.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase ${
                      check.conclusion === 'success' ? 'bg-[#0e2a1f] text-[#3fb950]' : 'bg-[#3d1308] text-[#f85149]'
                    }`}>
                      {check.conclusion || check.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // PR List Screen
  return (
    <div className="flex flex-col gap-4 text-xs text-[#c9d1d9] font-sans pb-16">
      <CreatePullRequestModal
        isOpen={isCreateModalOpen}
        owner={owner}
        repo={repo}
        defaultBranch={defaultBranch}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(newPr) => setSelectedPrNumber(newPr.number)}
      />

      {/* Toolbar & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0d1117] border border-[#30363d] p-3 rounded-lg">
        <div className="flex items-center gap-2 border border-[#30363d] rounded overflow-hidden">
          <button
            onClick={() => setStateFilter('open')}
            className={`px-3 py-1 text-xs font-mono transition-colors ${stateFilter === 'open' ? 'bg-[#30363d] text-white' : 'text-[#8b949e]'}`}
          >
            Open
          </button>
          <button
            onClick={() => setStateFilter('closed')}
            className={`px-3 py-1 text-xs font-mono transition-colors ${stateFilter === 'closed' ? 'bg-[#30363d] text-white' : 'text-[#8b949e]'}`}
          >
            Closed
          </button>
          <button
            onClick={() => setStateFilter('all')}
            className={`px-3 py-1 text-xs font-mono transition-colors ${stateFilter === 'all' ? 'bg-[#30363d] text-white' : 'text-[#8b949e]'}`}
          >
            All
          </button>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold rounded text-xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New Pull Request
        </button>
      </div>

      {/* PR Cards List */}
      <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]/40">
        {prs.length === 0 ? (
          <Empty title="No pull requests found" hint={`No ${stateFilter} pull requests in this repository.`} />
        ) : (
          prs.map((pr: any) => (
            <div
              key={pr.id}
              onClick={() => setSelectedPrNumber(pr.number)}
              className="p-4 hover:bg-[#161b22] transition-colors cursor-pointer flex items-center justify-between gap-4 group"
            >
              <div className="flex items-start gap-3 min-w-0">
                <GitPullRequest className={`w-4 h-4 shrink-0 mt-0.5 ${
                  pr.merged_at ? 'text-[#a371f7]' : pr.state === 'closed' ? 'text-[#f85149]' : 'text-[#3fb950]'
                }`} />
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="font-semibold text-xs text-[#c9d1d9] group-hover:text-[#58a6ff] truncate">
                    {pr.title}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-[#8b949e]">
                    <span>#{pr.number}</span>
                    <span>opened on {new Date(pr.created_at).toLocaleDateString()} by {pr.user?.login}</span>
                  </div>
                </div>
              </div>

              {pr.comments > 0 && (
                <div className="flex items-center gap-1 text-xs text-[#8b949e]">
                  <MessageSquare className="w-3.5 h-3.5" /> {pr.comments}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
