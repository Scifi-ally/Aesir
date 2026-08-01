import React, { useState } from 'react'
import { Bell, Check, ExternalLink, Filter, MessageSquare, GitPullRequest, CircleDot } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loading, Empty, ErrorState } from './ui'

interface NotificationsViewProps {
  currentRepoOnly?: boolean
  owner?: string
  repo?: string
}

export function NotificationsView({ currentRepoOnly, owner, repo }: NotificationsViewProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [filterReason, setFilterReason] = useState<string>('all')

  // Notifications Query with ETag polling every 15 seconds
  const { data: notifications = [], isLoading, error } = useQuery({
    queryKey: ['github', 'notifications', currentRepoOnly, owner, repo],
    refetchInterval: 15000,
    queryFn: async () => {
      const endpoint = (currentRepoOnly && owner && repo)
        ? `/repos/${owner}/${repo}/notifications?all=true`
        : `/notifications?all=true`
      const res = await window.devhub.github.request(endpoint)
      return res.data || []
    }
  })

  // Mark notification thread as read
  const handleMarkAsRead = async (threadId: string) => {
    try {
      await window.devhub.github.request(`/notifications/threads/${threadId}`, {
        method: 'PATCH'
      })
      queryClient.invalidateQueries({ queryKey: ['github', 'notifications'] })
    } catch (e: any) {
      alert(`Failed to mark read: ${e.message}`)
    }
  }

  // Mark all as read
  const handleMarkAllRead = async () => {
    try {
      await window.devhub.github.request(`/notifications`, {
        method: 'PUT',
        body: { last_read_at: new Date().toISOString() }
      })
      queryClient.invalidateQueries({ queryKey: ['github', 'notifications'] })
    } catch (e: any) {
      alert(`Failed to mark all read: ${e.message}`)
    }
  }

  if (isLoading) return <Loading what="Loading GitHub Notifications Inbox..." />
  if (error) return <ErrorState title="Failed to Load Notifications" detail={(error as Error).message} />

  const filtered = notifications.filter((n: any) => {
    if (filterReason === 'all') return true
    return n.reason === filterReason
  })

  return (
    <div className="flex flex-col gap-6 text-xs text-[#c9d1d9] font-sans pb-16">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0d1117] border border-[#30363d] p-3 rounded-lg">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-[#58a6ff]" />
          <h3 className="font-semibold text-sm text-[#f0f6fc]">Notifications Inbox</h3>
        </div>

        <div className="flex items-center gap-3">
          {/* Reason Filter */}
          <select
            value={filterReason}
            onChange={(e) => setFilterReason(e.target.value)}
            className="bg-[#161b22] border border-[#30363d] rounded px-3 py-1 text-xs text-[#c9d1d9]"
          >
            <option value="all">All Reasons</option>
            <option value="mention">Mentions</option>
            <option value="review_requested">Review Requested</option>
            <option value="assign">Assigned</option>
            <option value="author">Author</option>
            <option value="subscribed">Subscribed</option>
          </select>

          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-1.5 px-3 py-1 bg-[#161b22] hover:bg-[#30363d] text-[#58a6ff] rounded border border-[#30363d] font-semibold text-xs transition-colors"
          >
            <Check className="w-3.5 h-3.5" /> Mark all read
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]/40">
        {filtered.length === 0 ? (
          <Empty title="All caught up!" hint="No unread notifications in your inbox." />
        ) : (
          filtered.map((item: any) => {
            const isUnread = item.unread
            const type = item.subject?.type

            return (
              <div
                key={item.id}
                className={`p-4 transition-colors flex items-center justify-between gap-4 ${
                  isUnread ? 'bg-[#161b22]/70 font-semibold' : 'hover:bg-[#161b22]'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  {type === 'PullRequest' ? (
                    <GitPullRequest className="w-4 h-4 text-[#a371f7] shrink-0 mt-0.5" />
                  ) : (
                    <CircleDot className="w-4 h-4 text-[#3fb950] shrink-0 mt-0.5" />
                  )}

                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-xs text-[#f0f6fc] truncate">
                      {item.subject?.title}
                    </span>
                    <div className="flex items-center gap-2 text-[11px] text-[#8b949e]">
                      <span className="font-mono">{item.repository?.full_name}</span>
                      <span>·</span>
                      <span className="capitalize">{item.reason?.replace('_', ' ')}</span>
                      <span>·</span>
                      <span>{new Date(item.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isUnread && (
                    <button
                      onClick={() => handleMarkAsRead(item.id)}
                      className="p-1 text-[#8b949e] hover:text-[#3fb950] hover:bg-[#161b22] rounded transition-colors"
                      title="Mark as read"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
