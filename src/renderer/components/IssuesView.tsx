import React, { useState } from 'react'
import {
  CircleDot,
  Plus,
  ArrowLeft,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Tag,
  Calendar,
  User,
  Send,
  GitPullRequest,
  Smile,
  AlertCircle
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { GfmRenderer } from './GfmRenderer'
import { CreateIssueModal } from './CreateIssueModal'
import { LabelsMilestonesModal } from './LabelsMilestonesModal'
import { Loading, Empty, ErrorState } from './ui'

interface IssuesViewProps {
  owner: string
  repo: string
  defaultBranch: string
}

export function IssuesView({ owner, repo, defaultBranch }: IssuesViewProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [selectedIssueNumber, setSelectedIssueNumber] = useState<number | null>(null)
  const [stateFilter, setStateFilter] = useState<'open' | 'closed' | 'all'>('open')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isManageModalOpen, setIsManageModalOpen] = useState(false)

  // Comment input
  const [newCommentBody, setNewCommentBody] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  // Issues List Query
  const { data: issues = [], isLoading, error } = useQuery({
    queryKey: ['github', 'issues', owner, repo, stateFilter],
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/issues?state=${stateFilter}&per_page=50`)
      // Filter out pull requests from issues endpoint
      return (res.data || []).filter((i: any) => !i.pull_request)
    }
  })

  // Issue Detail Query
  const { data: issueDetail } = useQuery({
    queryKey: ['github', 'issueDetail', owner, repo, selectedIssueNumber],
    enabled: Boolean(selectedIssueNumber),
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/issues/${selectedIssueNumber}`)
      return res.data
    }
  })

  // Issue Comments Query
  const { data: issueComments = [] } = useQuery({
    queryKey: ['github', 'issueComments', owner, repo, selectedIssueNumber],
    enabled: Boolean(selectedIssueNumber),
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/issues/${selectedIssueNumber}/comments`)
      return res.data || []
    }
  })

  // Linked Pull Requests Query (finding PRs referencing this issue)
  const { data: linkedPrs = [] } = useQuery({
    queryKey: ['github', 'linkedPrs', owner, repo, selectedIssueNumber],
    enabled: Boolean(selectedIssueNumber),
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/pulls?state=all&per_page=50`).catch(() => ({ data: [] }))
      const prs = res.data || []
      const targetPattern = new RegExp(`(#${selectedIssueNumber}|Fixes #${selectedIssueNumber}|Closes #${selectedIssueNumber})`, 'i')
      return prs.filter((pr: any) => targetPattern.test(pr.body || '') || targetPattern.test(pr.title || ''))
    }
  })

  // Close / Reopen Issue Handler
  const handleToggleIssueState = async () => {
    if (!issueDetail || !selectedIssueNumber) return
    const nextState = issueDetail.state === 'open' ? 'closed' : 'open'

    try {
      await window.devhub.github.request(`/repos/${owner}/${repo}/issues/${selectedIssueNumber}`, {
        method: 'PATCH',
        body: { state: nextState }
      })
      queryClient.invalidateQueries({ queryKey: ['github', 'issues', owner, repo] })
      queryClient.invalidateQueries({ queryKey: ['github', 'issueDetail', owner, repo, selectedIssueNumber] })
    } catch (e: any) {
      alert(`Failed to update issue: ${e.message}`)
    }
  }

  // Post Issue Comment
  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCommentBody.trim() || !selectedIssueNumber) return
    setPostingComment(true)

    try {
      await window.devhub.github.request(`/repos/${owner}/${repo}/issues/${selectedIssueNumber}/comments`, {
        method: 'POST',
        body: { body: newCommentBody.trim() }
      })
      setNewCommentBody('')
      queryClient.invalidateQueries({ queryKey: ['github', 'issueComments', owner, repo, selectedIssueNumber] })
    } catch (err: any) {
      alert(`Failed to post comment: ${err.message}`)
    } finally {
      setPostingComment(false)
    }
  }

  // Add Comment Reaction
  const handleAddReaction = async (commentId: number, content: string) => {
    try {
      await window.devhub.github.request(`/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`, {
        method: 'POST',
        headers: { Accept: 'application/vnd.github.squirrel-girl-preview+json' },
        body: { content }
      })
      queryClient.invalidateQueries({ queryKey: ['github', 'issueComments', owner, repo, selectedIssueNumber] })
    } catch (e) {
      console.error(e)
    }
  }

  if (isLoading) return <Loading what="Loading Issues..." />
  if (error) return <ErrorState title="Failed to Load Issues" detail={(error as Error).message} />

  // Issue Detail View
  if (selectedIssueNumber && issueDetail) {
    const isOpen = issueDetail.state === 'open'

    return (
      <div className="flex flex-col gap-6 text-xs text-[#c9d1d9] font-sans pb-16">
        <button
          onClick={() => setSelectedIssueNumber(null)}
          className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-[#58a6ff] transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" /> Back to issues list
        </button>

        {/* Issue Header */}
        <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-6 space-y-3">
          <div className="flex items-start justify-between">
            <h2 className="text-lg font-semibold text-[#f0f6fc]">
              {issueDetail.title} <span className="text-[#8b949e] font-normal">#{issueDetail.number}</span>
            </h2>

            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded text-xs font-semibold uppercase font-mono flex items-center gap-1.5 ${
                isOpen ? 'bg-[#238636]/20 border border-[#3fb950] text-[#3fb950]' : 'bg-[#8250df]/20 border border-[#a371f7] text-[#a371f7]'
              }`}>
                <CircleDot className="w-3.5 h-3.5" /> {issueDetail.state}
              </span>

              <button
                onClick={handleToggleIssueState}
                className="px-3 py-1 bg-[#161b22] hover:bg-[#30363d] text-[#c9d1d9] rounded border border-[#30363d] text-xs transition-colors font-semibold"
              >
                {isOpen ? 'Close Issue' : 'Reopen Issue'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-[#8b949e]">
            <span className="font-semibold text-[#c9d1d9]">{issueDetail.user?.login}</span>
            <span>opened on {new Date(issueDetail.created_at).toLocaleString()}</span>
          </div>

          {/* Labels & Assignees list */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#30363d]/50">
            {issueDetail.labels?.map((l: any) => (
              <span
                key={l.name}
                className="px-2 py-0.5 rounded text-[11px] font-mono border"
                style={{
                  backgroundColor: `#${l.color}20`,
                  borderColor: `#${l.color}`,
                  color: `#${l.color}`
                }}
              >
                {l.name}
              </span>
            ))}
          </div>
        </div>

        {/* Linked PRs Banner */}
        {linkedPrs.length > 0 && (
          <div className="bg-[#161b22] border border-[#a371f7]/40 rounded-lg p-4 space-y-2">
            <div className="text-xs font-semibold text-[#a371f7] uppercase tracking-wider flex items-center gap-1.5">
              <GitPullRequest className="w-4 h-4" /> Linked Pull Requests ({linkedPrs.length})
            </div>
            {linkedPrs.map((pr: any) => (
              <div key={pr.id} className="font-mono text-xs text-[#58a6ff] hover:underline cursor-pointer">
                #{pr.number} — {pr.title} ({pr.state})
              </div>
            ))}
          </div>
        )}

        {/* Issue Body */}
        {issueDetail.body && (
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-6">
            <GfmRenderer content={issueDetail.body} owner={owner} repo={repo} defaultBranch={defaultBranch} />
          </div>
        )}

        {/* Comments List */}
        <div className="space-y-4">
          {issueComments.map((c: any) => (
            <div key={c.id} className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden">
              <div className="bg-[#161b22] px-4 py-2 border-b border-[#30363d] flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#c9d1d9]">{c.user?.login}</span>
                  <span className="text-[#8b949e] text-[11px]">{new Date(c.created_at).toLocaleString()}</span>
                </div>

                {/* Reaction Quick Picker */}
                <div className="flex items-center gap-1">
                  <button onClick={() => handleAddReaction(c.id, '+1')} className="px-1.5 py-0.5 hover:bg-[#30363d] rounded text-xs" title="Thumbs up">👍</button>
                  <button onClick={() => handleAddReaction(c.id, '-1')} className="px-1.5 py-0.5 hover:bg-[#30363d] rounded text-xs" title="Thumbs down">👎</button>
                  <button onClick={() => handleAddReaction(c.id, 'hooray')} className="px-1.5 py-0.5 hover:bg-[#30363d] rounded text-xs" title="Party">🎉</button>
                  <button onClick={() => handleAddReaction(c.id, 'rocket')} className="px-1.5 py-0.5 hover:bg-[#30363d] rounded text-xs" title="Rocket">🚀</button>
                </div>
              </div>
              <div className="p-4">
                <GfmRenderer content={c.body || ''} owner={owner} repo={repo} defaultBranch={defaultBranch} />
              </div>
            </div>
          ))}
        </div>

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
      </div>
    )
  }

  // Issues List Screen
  return (
    <div className="flex flex-col gap-4 text-xs text-[#c9d1d9] font-sans pb-16">
      <CreateIssueModal
        isOpen={isCreateModalOpen}
        owner={owner}
        repo={repo}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(newIssue) => setSelectedIssueNumber(newIssue.number)}
      />

      <LabelsMilestonesModal
        isOpen={isManageModalOpen}
        owner={owner}
        repo={repo}
        onClose={() => setIsManageModalOpen(false)}
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

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsManageModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#161b22] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d] font-semibold rounded text-xs transition-colors"
          >
            <Tag className="w-3.5 h-3.5 text-[#58a6ff]" /> Labels & Milestones
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold rounded text-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Issue
          </button>
        </div>
      </div>

      {/* Issue List Cards */}
      <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]/40">
        {issues.length === 0 ? (
          <Empty title="No issues found" hint={`No ${stateFilter} issues in this repository.`} />
        ) : (
          issues.map((issue: any) => (
            <div
              key={issue.id}
              onClick={() => setSelectedIssueNumber(issue.number)}
              className="p-4 hover:bg-[#161b22] transition-colors cursor-pointer flex items-center justify-between gap-4 group"
            >
              <div className="flex items-start gap-3 min-w-0">
                <CircleDot className={`w-4 h-4 shrink-0 mt-0.5 ${
                  issue.state === 'open' ? 'text-[#3fb950]' : 'text-[#8250df]'
                }`} />
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-xs text-[#c9d1d9] group-hover:text-[#58a6ff] truncate">
                      {issue.title}
                    </span>
                    {issue.labels?.map((l: any) => (
                      <span
                        key={l.name}
                        className="px-1.5 py-0.2 rounded text-[10px] font-mono border"
                        style={{
                          backgroundColor: `#${l.color}20`,
                          borderColor: `#${l.color}`,
                          color: `#${l.color}`
                        }}
                      >
                        {l.name}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#8b949e]">
                    <span>#{issue.number}</span>
                    <span>opened on {new Date(issue.created_at).toLocaleDateString()} by {issue.user?.login}</span>
                  </div>
                </div>
              </div>

              {issue.comments > 0 && (
                <div className="flex items-center gap-1 text-xs text-[#8b949e]">
                  <MessageSquare className="w-3.5 h-3.5" /> {issue.comments}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
