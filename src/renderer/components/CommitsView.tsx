import React, { useState } from 'react'
import { History, ShieldCheck, ArrowLeft, GitCommit, Calendar, User, FileDiff } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { DiffViewer } from './DiffViewer'
import { Loading, Empty, ErrorState } from './ui'

interface CommitsViewProps {
  owner: string
  repo: string
  selectedRef: string
}

export function CommitsView({ owner, repo, selectedRef }: CommitsViewProps): React.JSX.Element {
  const [selectedSha, setSelectedSha] = useState<string | null>(null)
  const activeBranch = selectedRef || 'main'

  // Commit History Query
  const { data: commits = [], isLoading, error } = useQuery({
    queryKey: ['github', 'commits', owner, repo, activeBranch],
    queryFn: async () => {
      try {
        const res = await window.devhub.github.request(`/repos/${owner}/${repo}/commits?sha=${activeBranch}&per_page=50`)
        if (Array.isArray(res.data)) return res.data
        const fallback = await window.devhub.github.request(`/repos/${owner}/${repo}/commits?per_page=50`)
        return Array.isArray(fallback.data) ? fallback.data : []
      } catch (e) {
        const fallback = await window.devhub.github.request(`/repos/${owner}/${repo}/commits?per_page=50`).catch(() => ({ data: [] }))
        return Array.isArray(fallback.data) ? fallback.data : []
      }
    }
  })

  // Commit Detail Query
  const { data: commitDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['github', 'commitDetail', owner, repo, selectedSha],
    enabled: Boolean(selectedSha),
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/commits/${selectedSha}`)
      return res.data
    }
  })

  if (isLoading) return <Loading what="Loading Commit History..." />
  if (error) return <ErrorState title="Failed to Load Commits" detail={(error as Error).message} />

  // If a commit is selected, show Commit Detail View
  if (selectedSha) {
    if (loadingDetail) return <Loading what="Loading Commit Details & Diffs..." />

    return (
      <div className="flex flex-col gap-6 text-xs text-[#c9d1d9] font-sans pb-16">
        {/* Back Button */}
        <button
          onClick={() => setSelectedSha(null)}
          className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-[#58a6ff] transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" /> Back to commits list
        </button>

        {/* Commit Header Summary */}
        <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-6 space-y-4">
          <div className="flex items-start justify-between">
            <h2 className="text-base font-semibold text-[#f0f6fc] leading-snug">
              {commitDetail?.commit?.message || 'No commit message'}
            </h2>
            <span className="font-mono text-xs text-[#58a6ff] bg-[#161b22] px-2.5 py-1 border border-[#30363d] rounded">
              {selectedSha.slice(0, 7)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-[#8b949e] pt-2 border-t border-[#30363d]/50">
            <div className="flex items-center gap-2">
              {commitDetail?.author?.avatar_url && (
                <img src={commitDetail.author.avatar_url} alt="" className="w-5 h-5 rounded-full border border-[#30363d]" />
              )}
              <span className="font-semibold text-[#c9d1d9]">
                {commitDetail?.commit?.author?.name || 'Author'}
              </span>
            </div>

            <span>Committed on {new Date(commitDetail?.commit?.author?.date).toLocaleString()}</span>

            {/* GPG Signature Verification Badge */}
            {commitDetail?.commit?.verification?.verified && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#0e2a1f] border border-[#238636] text-[#3fb950] rounded font-mono text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verified GPG ({commitDetail.commit.verification.reason})</span>
              </div>
            )}
          </div>
        </div>

        {/* Commit Diffs */}
        <DiffViewer files={commitDetail?.files || []} />
      </div>
    )
  }

  // Commits History List
  return (
    <div className="flex flex-col gap-3 text-xs text-[#c9d1d9] font-sans pb-16">
      <div className="flex items-center justify-between border-b border-[#30363d] pb-3 mb-2">
        <h3 className="font-semibold text-xs text-[#8b949e] uppercase tracking-wider">
          Commits on <span className="font-mono text-[#58a6ff]">{activeBranch}</span> ({commits.length})
        </h3>
      </div>

      <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]/40">
        {commits.map((c: any) => {
          const isVerified = c.commit?.verification?.verified
          return (
            <div
              key={c.sha}
              onClick={() => setSelectedSha(c.sha)}
              className="p-4 hover:bg-[#161b22] transition-colors cursor-pointer flex items-center justify-between gap-4 group"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-7 h-7 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center shrink-0 mt-0.5">
                  {c.author?.avatar_url ? (
                    <img src={c.author.avatar_url} alt="" className="w-full h-full rounded-full" />
                  ) : (
                    <GitCommit className="w-3.5 h-3.5 text-[#8b949e]" />
                  )}
                </div>

                <div className="flex flex-col gap-1 min-w-0">
                  <span className="font-semibold text-xs text-[#c9d1d9] group-hover:text-[#58a6ff] truncate">
                    {c.commit?.message?.split('\n')[0]}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-[#8b949e]">
                    <span className="font-medium text-[#c9d1d9]">{c.commit?.author?.name}</span>
                    <span>committed {new Date(c.commit?.author?.date).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {isVerified && (
                  <span title="Verified Signature" className="flex items-center gap-1 text-[#3fb950] font-mono text-[10px]">
                    <ShieldCheck className="w-3.5 h-3.5" /> Verified
                  </span>
                )}
                <span className="font-mono text-xs text-[#8b949e] group-hover:text-[#58a6ff] bg-[#161b22] px-2 py-0.5 rounded border border-[#30363d]/60">
                  {c.sha?.slice(0, 7)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
