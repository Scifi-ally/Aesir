import React, { useState } from 'react'
import { Tag, Plus, Download, ExternalLink, Calendar, Trash2, Edit } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { GfmRenderer } from './GfmRenderer'
import { Loading, Empty, ErrorState } from './ui'

interface ReleasesViewProps {
  owner: string
  repo: string
  defaultBranch: string
}

export function ReleasesView({ owner, repo, defaultBranch }: ReleasesViewProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [subTab, setSubTab] = useState<'releases' | 'tags'>('releases')

  // Create Release Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [tagName, setTagName] = useState('')
  const [releaseTitle, setReleaseTitle] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [isDraft, setIsDraft] = useState(false)
  const [isPrerelease, setIsPrerelease] = useState(false)
  const [creating, setCreating] = useState(false)

  // Releases Query
  const { data: releases = [], isLoading: loadingReleases, error } = useQuery({
    queryKey: ['github', 'releases', owner, repo],
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/releases`)
      return res.data || []
    }
  })

  // Tags Query
  const { data: tags = [], isLoading: loadingTags } = useQuery({
    queryKey: ['github', 'tags', owner, repo],
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/tags`)
      return res.data || []
    }
  })

  // Create Release Handler
  const handleCreateRelease = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tagName.trim()) return
    setCreating(true)

    try {
      await window.devhub.github.request(`/repos/${owner}/${repo}/releases`, {
        method: 'POST',
        body: {
          tag_name: tagName.trim(),
          target_commitish: defaultBranch,
          name: releaseTitle.trim() || tagName.trim(),
          body: releaseNotes.trim(),
          draft: isDraft,
          prerelease: isPrerelease
        }
      })

      queryClient.invalidateQueries({ queryKey: ['github', 'releases', owner, repo] })
      setIsModalOpen(false)
      setTagName('')
      setReleaseTitle('')
      setReleaseNotes('')
    } catch (err: any) {
      alert(`Failed to publish release: ${err.message}`)
    } finally {
      setCreating(false)
    }
  }

  if (loadingReleases) return <Loading what="Loading Releases & Tags..." />
  if (error) return <ErrorState title="Failed to Load Releases" detail={(error as Error).message} />

  return (
    <div className="flex flex-col gap-6 text-xs text-[#c9d1d9] font-sans pb-16">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between border-b border-[#30363d] pb-4">
        <div className="flex items-center gap-4">
          <div className="flex border border-[#30363d] rounded overflow-hidden">
            <button
              onClick={() => setSubTab('releases')}
              className={`px-3 py-1 text-xs transition-colors flex items-center gap-1.5 font-mono ${subTab === 'releases' ? 'bg-[#30363d] text-white' : 'text-[#8b949e]'}`}
            >
              Releases ({releases.length})
            </button>
            <button
              onClick={() => setSubTab('tags')}
              className={`px-3 py-1 text-xs transition-colors flex items-center gap-1.5 font-mono ${subTab === 'tags' ? 'bg-[#30363d] text-white' : 'text-[#8b949e]'}`}
            >
              <Tag className="w-3.5 h-3.5" /> Tags ({tags.length})
            </button>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold rounded text-xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Draft a new release
        </button>
      </div>

      {/* Releases Subtab */}
      {subTab === 'releases' && (
        <div className="space-y-6">
          {releases.length === 0 ? (
            <Empty title="No releases published" hint="Create a release to publish versioned software packages." />
          ) : (
            releases.map((rel: any) => (
              <div key={rel.id} className="bg-[#0d1117] border border-[#30363d] rounded-lg p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-bold text-[#f0f6fc]">{rel.name || rel.tag_name}</h3>
                      <span className="font-mono text-xs bg-[#161b22] px-2.5 py-0.5 border border-[#30363d] rounded text-[#58a6ff]">
                        {rel.tag_name}
                      </span>
                      {rel.prerelease && (
                        <span className="text-[10px] uppercase font-mono bg-[#d29922]/20 border border-[#e3b341] text-[#e3b341] px-2 py-0.2 rounded font-semibold">
                          Pre-release
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#8b949e]">
                      Released on {new Date(rel.published_at || rel.created_at).toLocaleDateString()} by {rel.author?.login}
                    </div>
                  </div>

                  <a href={rel.html_url} target="_blank" rel="noreferrer" className="text-[#58a6ff] hover:underline flex items-center gap-1">
                    View on GitHub <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {/* Release Body */}
                {rel.body && (
                  <div className="pt-3 border-t border-[#30363d]/50">
                    <GfmRenderer content={rel.body} owner={owner} repo={repo} defaultBranch={defaultBranch} />
                  </div>
                )}

                {/* Assets */}
                {rel.assets?.length > 0 && (
                  <div className="pt-3 border-t border-[#30363d]/50 space-y-2">
                    <h5 className="font-mono text-xs text-[#8b949e] uppercase font-semibold">Assets ({rel.assets.length})</h5>
                    <div className="space-y-1">
                      {rel.assets.map((asset: any) => (
                        <a
                          key={asset.id}
                          href={asset.browser_download_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between p-2.5 bg-[#161b22] hover:bg-[#30363d]/50 rounded border border-[#30363d] text-xs font-mono transition-colors"
                        >
                          <div className="flex items-center gap-2 text-[#58a6ff]">
                            <Download className="w-3.5 h-3.5" />
                            <span>{asset.name}</span>
                          </div>
                          <span className="text-[#8b949e] text-[11px]">{(asset.size / 1024 / 1024).toFixed(2)} MB</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Tags Subtab */}
      {subTab === 'tags' && (
        <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]/40">
          {tags.length === 0 ? (
            <Empty title="No git tags" hint="Create git tags using git tag or by drafting a release." />
          ) : (
            tags.map((t: any) => (
              <div key={t.name} className="p-4 flex items-center justify-between font-mono text-xs">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-[#58a6ff]" />
                  <span className="font-semibold text-[#f0f6fc]">{t.name}</span>
                </div>
                <span className="text-[#8b949e] text-[11px]">{t.commit?.sha?.slice(0, 7)}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create Release Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#000000]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateRelease} className="w-[520px] bg-[#0d1117] border border-[#30363d] rounded-xl p-6 space-y-4 text-xs">
            <h3 className="font-semibold text-sm text-[#f0f6fc]">Draft a New Release</h3>

            <div>
              <label className="block text-[#8b949e] mb-1 font-mono uppercase text-[10px]">Tag Version (e.g. v1.0.0)</label>
              <input
                type="text"
                required
                placeholder="v1.0.0"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 font-mono text-xs text-[#c9d1d9]"
              />
            </div>

            <div>
              <label className="block text-[#8b949e] mb-1 font-mono uppercase text-[10px]">Release Title</label>
              <input
                type="text"
                placeholder="Title for release"
                value={releaseTitle}
                onChange={(e) => setReleaseTitle(e.target.value)}
                className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9]"
              />
            </div>

            <div>
              <label className="block text-[#8b949e] mb-1 font-mono uppercase text-[10px]">Release Notes (GFM Supported)</label>
              <textarea
                rows={6}
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                placeholder="Describe what's changed in this release..."
                className="w-full bg-[#000000] border border-[#30363d] rounded p-3 text-xs text-[#c9d1d9] font-mono"
              />
            </div>

            <div className="flex gap-4 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isPrerelease} onChange={(e) => setIsPrerelease(e.target.checked)} className="rounded border-[#30363d] bg-[#000000]" />
                <span>Set as a pre-release</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isDraft} onChange={(e) => setIsDraft(e.target.checked)} className="rounded border-[#30363d] bg-[#000000]" />
                <span>Save as draft</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#30363d]">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-3 py-1.5 bg-[#21262d] text-[#c9d1d9] rounded">Cancel</button>
              <button type="submit" disabled={creating || !tagName.trim()} className="px-4 py-1.5 bg-[#238636] text-white rounded font-semibold">
                {creating ? 'Publishing...' : 'Publish Release'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
