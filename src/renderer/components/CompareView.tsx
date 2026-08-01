import React, { useState } from 'react'
import { GitCompare, GitBranch, ArrowRight, Check } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { DiffViewer } from './DiffViewer'
import { Loading, Empty, ErrorState } from './ui'

interface CompareViewProps {
  owner: string
  repo: string
  defaultBranch: string
  initialBase?: string
  initialHead?: string
}

export function CompareView({
  owner,
  repo,
  defaultBranch,
  initialBase,
  initialHead
}: CompareViewProps): React.JSX.Element {
  const [baseRef, setBaseRef] = useState(initialBase || defaultBranch || 'main')
  const [headRef, setHeadRef] = useState(initialHead || 'main')

  // Branches Query for dropdown pickers
  const { data: branches = [] } = useQuery({
    queryKey: ['github', 'branches', owner, repo],
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/branches?per_page=100`)
      return res.data || []
    }
  })

  // Compare Query
  const { data: compareData, isLoading, error } = useQuery({
    queryKey: ['github', 'compare', owner, repo, baseRef, headRef],
    enabled: Boolean(baseRef && headRef && baseRef !== headRef),
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/compare/${baseRef}...${headRef}`)
      return res.data
    }
  })

  return (
    <div className="flex flex-col gap-6 text-xs text-[#c9d1d9] font-sans pb-16">
      {/* Compare Picker Bar */}
      <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-[#58a6ff]" />
          <h3 className="font-semibold text-sm text-[#f0f6fc]">Compare Changes</h3>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          {/* Base Picker */}
          <div className="flex items-center gap-2 bg-[#161b22] border border-[#30363d] rounded px-3 py-1.5 text-xs">
            <span className="text-[#8b949e] font-mono text-[11px]">base:</span>
            <select
              value={baseRef}
              onChange={(e) => setBaseRef(e.target.value)}
              className="bg-transparent text-[#58a6ff] font-mono font-semibold text-xs focus:outline-none cursor-pointer"
            >
              {branches.map((b: any) => (
                <option key={b.name} value={b.name} className="bg-[#0d1117] text-[#c9d1d9]">{b.name}</option>
              ))}
            </select>
          </div>

          <ArrowRight className="w-4 h-4 text-[#8b949e]" />

          {/* Head Picker */}
          <div className="flex items-center gap-2 bg-[#161b22] border border-[#30363d] rounded px-3 py-1.5 text-xs">
            <span className="text-[#8b949e] font-mono text-[11px]">compare:</span>
            <select
              value={headRef}
              onChange={(e) => setHeadRef(e.target.value)}
              className="bg-transparent text-[#58a6ff] font-mono font-semibold text-xs focus:outline-none cursor-pointer"
            >
              {branches.map((b: any) => (
                <option key={b.name} value={b.name} className="bg-[#0d1117] text-[#c9d1d9]">{b.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Compare State Body */}
      {baseRef === headRef ? (
        <Empty title="Branches are identical" hint="Select two different branches or tags to compare changes." />
      ) : isLoading ? (
        <Loading what={`Comparing ${baseRef}...${headRef}`} />
      ) : error ? (
        <ErrorState title="Failed to Compare Branches" detail={(error as Error).message} />
      ) : compareData ? (
        <div className="space-y-6">
          {/* Compare Stats Banner */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-[#3fb950] font-semibold">
                {compareData.ahead_by} {compareData.ahead_by === 1 ? 'commit' : 'commits'} ahead
              </span>
              <span className="text-[#8b949e]">·</span>
              <span className="text-[#e3b341] font-semibold">
                {compareData.behind_by} {compareData.behind_by === 1 ? 'commit' : 'commits'} behind
              </span>
            </div>

            <div className="text-xs text-[#8b949e]">
              Showing <strong className="text-[#f0f6fc]">{compareData.files?.length || 0}</strong> changed files
            </div>
          </div>

          {/* Diffs */}
          <DiffViewer files={compareData.files || []} />
        </div>
      ) : null}
    </div>
  )
}
