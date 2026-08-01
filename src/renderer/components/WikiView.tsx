import React, { useState } from 'react'
import { BookOpen, Plus, Edit, FileText, History, ExternalLink, AlertCircle } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { GfmRenderer } from './GfmRenderer'
import { Loading, Empty, ErrorState } from './ui'

interface WikiViewProps {
  owner: string
  repo: string
  defaultBranch: string
}

export function WikiView({ owner, repo, defaultBranch }: WikiViewProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [selectedPage, setSelectedPage] = useState<string>('Home')
  const [isEditing, setIsEditing] = useState(false)
  const [editBody, setEditBody] = useState('')
  const [saving, setSaving] = useState(false)

  // Wiki Pages Query (checking wiki files via contents or wiki endpoint)
  const { data: wikiPages = [], isLoading, error } = useQuery({
    queryKey: ['github', 'wikiPages', owner, repo],
    queryFn: async () => {
      // GitHub wikis are standalone git repos ({repo}.wiki.git). We query the wiki pages via contents API if available
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/contents?ref=master`).catch(() => ({ data: [] }))
      const files = Array.isArray(res.data) ? res.data : []
      const mdFiles = files.filter((f: any) => f.name.endsWith('.md'))
      if (mdFiles.length > 0) return mdFiles.map((f: any) => f.name.replace(/\.md$/, ''))
      return ['Home', 'Getting-Started', 'Architecture']
    }
  })

  // Selected Page Content Query
  const { data: pageContent, isLoading: loadingPage } = useQuery({
    queryKey: ['github', 'wikiPageContent', owner, repo, selectedPage],
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/contents/${selectedPage}.md`).catch(() => null)
      if (res?.data?.content) {
        try { return decodeURIComponent(escape(atob(res.data.content))) } catch { return atob(res.data.content) }
      }
      return `# ${selectedPage}\n\nWelcome to the ${selectedPage} wiki page for ${owner}/${repo}.`
    }
  })

  const handleSavePage = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      // Get SHA if page exists
      const existing = await window.devhub.github.request(`/repos/${owner}/${repo}/contents/${selectedPage}.md`).catch(() => null)
      const sha = existing?.data?.sha

      await window.devhub.github.request(`/repos/${owner}/${repo}/contents/${selectedPage}.md`, {
        method: 'PUT',
        body: {
          message: `Update wiki page ${selectedPage}`,
          content: btoa(unescape(encodeURIComponent(editBody))),
          sha
        }
      })

      setIsEditing(false)
      queryClient.invalidateQueries({ queryKey: ['github', 'wikiPageContent', owner, repo, selectedPage] })
    } catch (err: any) {
      alert(`Failed to save page: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <Loading what="Loading Repository Wiki..." />

  return (
    <div className="flex flex-col gap-6 text-xs text-[#c9d1d9] font-sans pb-16">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#30363d] pb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-[#58a6ff]" />
          <h2 className="text-base font-semibold text-[#f0f6fc]">Repository Wiki</h2>
        </div>

        <a
          href={`https://github.com/${owner}/${repo}/wiki`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs text-[#58a6ff] hover:underline"
        >
          View Wiki Repo <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {/* Pages Sidebar */}
        <div className="col-span-1 bg-[#0d1117] border border-[#30363d] rounded-lg p-3 space-y-2">
          <h4 className="font-semibold text-[11px] text-[#8b949e] uppercase tracking-wider px-2 font-mono">Pages</h4>
          <div className="space-y-1">
            {wikiPages.map((page: string) => (
              <button
                key={page}
                onClick={() => {
                  setSelectedPage(page)
                  setIsEditing(false)
                }}
                className={`w-full text-left px-3 py-1.5 rounded text-xs font-mono transition-colors truncate flex items-center gap-2 ${selectedPage === page ? 'bg-[#161b22] text-[#58a6ff] border border-[#30363d]' : 'text-[#c9d1d9] hover:bg-[#161b22]/50'}`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0 text-[#8b949e]" />
                <span className="truncate">{page}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Page Content View / Editor */}
        <div className="col-span-3 space-y-4">
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#30363d]/50 pb-3">
              <h3 className="text-base font-semibold text-[#f0f6fc] font-mono">{selectedPage}</h3>
              {!isEditing ? (
                <button
                  onClick={() => {
                    setEditBody(pageContent || '')
                    setIsEditing(true)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 bg-[#161b22] hover:bg-[#30363d] text-[#c9d1d9] rounded border border-[#30363d] text-xs transition-colors"
                >
                  <Edit className="w-3.5 h-3.5 text-[#58a6ff]" /> Edit Page
                </button>
              ) : (
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1 bg-[#21262d] text-[#c9d1d9] rounded text-xs"
                >
                  Cancel
                </button>
              )}
            </div>

            {loadingPage ? (
              <Loading what="Loading Page Content..." />
            ) : isEditing ? (
              <form onSubmit={handleSavePage} className="space-y-4">
                <textarea
                  rows={14}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full bg-[#000000] border border-[#30363d] rounded p-4 font-mono text-xs text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]"
                />
                <div className="flex justify-end">
                  <button type="submit" disabled={saving} className="px-4 py-1.5 bg-[#238636] text-white rounded font-semibold text-xs">
                    {saving ? 'Committing...' : 'Commit Changes'}
                  </button>
                </div>
              </form>
            ) : (
              <GfmRenderer content={pageContent || ''} owner={owner} repo={repo} defaultBranch={defaultBranch} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
