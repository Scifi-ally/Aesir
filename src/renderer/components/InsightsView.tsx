import React from 'react'
import { Activity, Users, Eye, GitCommit, TrendingUp, BarChart2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Loading, Empty, ErrorState } from './ui'

interface InsightsViewProps {
  owner: string
  repo: string
}

export function InsightsView({ owner, repo }: InsightsViewProps): React.JSX.Element {
  // Contributors Query
  const { data: contributors = [], isLoading: loadingContrib } = useQuery({
    queryKey: ['github', 'contributors', owner, repo],
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/contributors?per_page=30`)
      return res.data || []
    }
  })

  // Traffic Views Query (Requires push access)
  const { data: trafficViews } = useQuery({
    queryKey: ['github', 'trafficViews', owner, repo],
    queryFn: async () => {
      try {
        const res = await window.devhub.github.request(`/repos/${owner}/${repo}/traffic/views`)
        return res.data
      } catch (err: any) {
        return null
      }
    }
  })

  // Traffic Clones Query
  const { data: trafficClones } = useQuery({
    queryKey: ['github', 'trafficClones', owner, repo],
    queryFn: async () => {
      try {
        const res = await window.devhub.github.request(`/repos/${owner}/${repo}/traffic/clones`)
        return res.data
      } catch (err: any) {
        return null
      }
    }
  })

  // Commit Activity Query
  const { data: commitActivity = [] } = useQuery({
    queryKey: ['github', 'commitActivity', owner, repo],
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/stats/commit_activity`).catch(() => ({ data: [] }))
      return Array.isArray(res.data) ? res.data : []
    }
  })

  if (loadingContrib) return <Loading what="Loading Repository Insights & Stats..." />

  return (
    <div className="flex flex-col gap-6 text-xs text-[#c9d1d9] font-sans pb-16">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-[#58a6ff]" />
          <h2 className="text-base font-semibold text-[#f0f6fc]">Repository Insights & Traffic</h2>
        </div>
      </div>

      {/* Traffic Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 space-y-1">
          <div className="text-[11px] text-[#8b949e] uppercase font-mono font-semibold flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-[#58a6ff]" /> Views (Last 14 Days)
          </div>
          <div className="text-xl font-bold text-[#f0f6fc] font-mono">
            {trafficViews?.count !== undefined ? trafficViews.count : 'N/A'}
          </div>
          <div className="text-[10px] text-[#8b949e]">
            {trafficViews?.uniques !== undefined ? `${trafficViews.uniques} unique visitors` : 'Push access required'}
          </div>
        </div>

        <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 space-y-1">
          <div className="text-[11px] text-[#8b949e] uppercase font-mono font-semibold flex items-center gap-1.5">
            <GitCommit className="w-3.5 h-3.5 text-[#3fb950]" /> Git Clones
          </div>
          <div className="text-xl font-bold text-[#f0f6fc] font-mono">
            {trafficClones?.count !== undefined ? trafficClones.count : 'N/A'}
          </div>
          <div className="text-[10px] text-[#8b949e]">
            {trafficClones?.uniques !== undefined ? `${trafficClones.uniques} unique cloners` : 'Push access required'}
          </div>
        </div>

        <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 space-y-1">
          <div className="text-[11px] text-[#8b949e] uppercase font-mono font-semibold flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-[#a371f7]" /> Total Contributors
          </div>
          <div className="text-xl font-bold text-[#f0f6fc] font-mono">
            {contributors.length}
          </div>
          <div className="text-[10px] text-[#8b949e]">Active repository contributors</div>
        </div>
      </div>

      {/* Contributors Grid */}
      <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-5 space-y-4">
        <h3 className="font-semibold text-xs text-[#8b949e] uppercase tracking-wider">Top Contributors</h3>
        <div className="grid grid-cols-3 gap-3">
          {contributors.map((c: any) => (
            <div key={c.id} className="bg-[#161b22] border border-[#30363d] rounded p-3 flex items-center gap-3">
              <img src={c.avatar_url} alt="" className="w-8 h-8 rounded-full border border-[#30363d]" />
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-xs text-[#f0f6fc] truncate">{c.login}</span>
                <span className="font-mono text-[11px] text-[#8b949e]">{c.contributions} commits</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Commit Activity Sparklines */}
      {commitActivity.length > 0 && (
        <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-5 space-y-4">
          <h3 className="font-semibold text-xs text-[#8b949e] uppercase tracking-wider">Commit Activity Heatmap (Last 52 Weeks)</h3>
          <div className="flex items-end gap-1 h-20 pt-4 overflow-x-auto scrollbar-hide">
            {commitActivity.map((w: any, idx: number) => {
              const heightPct = Math.min(100, (w.total / 15) * 100)
              return (
                <div
                  key={idx}
                  style={{ height: `${Math.max(8, heightPct)}%` }}
                  className={`flex-1 min-w-[6px] rounded-t transition-all ${
                    w.total > 0 ? 'bg-[#238636] hover:bg-[#3fb950]' : 'bg-[#161b22]'
                  }`}
                  title={`Week ${idx + 1}: ${w.total} commits`}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
