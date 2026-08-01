import React, { useState } from 'react'
import {
  Folder,
  FileText,
  FileCode,
  FileImage,
  GitBranch,
  History,
  Code,
  Search,
  Plus,
  Edit,
  Trash2,
  Download,
  Eye,
  FileCheck,
  AlertCircle,
  GitPullRequest,
  Check,
  ChevronRight,
  ChevronDown,
  X,
  Zap,
  MapPin,
  Bell,
  Star
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { GfmRenderer } from './GfmRenderer'
import { Loading, Empty, ErrorState } from './ui'

interface CodeBrowserViewProps {
  owner: string
  repo: string
  defaultBranch: string
  selectedRef: string
  onRefChange: (ref: string) => void
}

export function CodeBrowserView({
  owner,
  repo,
  defaultBranch,
  selectedRef,
  onRefChange
}: CodeBrowserViewProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [currentPath, setCurrentPath] = useState('')
  const [activeViewMode, setActiveViewMode] = useState<'code' | 'raw' | 'blame' | 'history'>('code')
  const [inRepoSearchQuery, setInRepoSearchQuery] = useState('')

  // Modals
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [createNewBranch, setCreateNewBranch] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [savingFile, setSavingFile] = useState(false)
  const [fileActionError, setFileActionError] = useState<string | null>(null)

  const [isNewFileModalOpen, setIsNewFileModalOpen] = useState(false)
  const [newFilePath, setNewFilePath] = useState('')
  const [newFileContent, setNewFileContent] = useState('')

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

  const activeBranch = selectedRef || defaultBranch || 'main'

  // Queries
  const { data: branches = [] } = useQuery({
    queryKey: ['github', 'branches', owner, repo],
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/branches?per_page=100`).catch(() => ({ data: [] }))
      return res.data || []
    }
  })

  const { data: tags = [] } = useQuery({
    queryKey: ['github', 'tags', owner, repo],
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/tags?per_page=100`).catch(() => ({ data: [] }))
      return res.data || []
    }
  })

  const { data: contents = [], isLoading: loadingContents } = useQuery({
    queryKey: ['github', 'contents', owner, repo, currentPath, activeBranch],
    enabled: currentPath === '' || !currentPath.includes('.'),
    queryFn: async () => {
      const endpoint = currentPath
        ? `/repos/${owner}/${repo}/contents/${currentPath}?ref=${activeBranch}`
        : `/repos/${owner}/${repo}/contents?ref=${activeBranch}`
      const res = await window.devhub.github.request(endpoint)
      if (Array.isArray(res.data)) {
        return res.data.sort((a: any, b: any) => (a.type === 'dir' ? -1 : 1))
      }
      return []
    }
  })

  const { data: fileData, isLoading: loadingFile } = useQuery({
    queryKey: ['github', 'file', owner, repo, currentPath, activeBranch],
    enabled: currentPath.includes('.'),
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/contents/${currentPath}?ref=${activeBranch}`)
      if (res.data?.content && res.data.encoding === 'base64') {
        const decoded = decodeURIComponent(escape(atob(res.data.content.replace(/\s/g, ''))))
        return { ...res.data, decodedContent: decoded }
      }
      return res.data
    }
  })

  const { data: readmeContent } = useQuery({
    queryKey: ['github', 'readme', owner, repo, activeBranch],
    enabled: currentPath === '',
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/readme?ref=${activeBranch}`).catch(() => ({ data: null }))
      if (res?.data?.content && res.data.encoding === 'base64') {
        return decodeURIComponent(escape(atob(res.data.content.replace(/\s/g, ''))))
      }
      return null
    }
  })

  const getFileIcon = (name: string, type: string) => {
    if (type === 'dir') return <Folder className="w-4 h-4 text-[#8b949e] shrink-0" />
    if (/\.(ts|tsx|js|jsx|json|py|html|css|go|rs)$/i.test(name)) {
      return <FileCode className="w-4 h-4 text-[#8b949e] shrink-0" />
    }
    if (/\.(png|jpe?g|gif|svg|ico)$/i.test(name)) {
      return <FileImage className="w-4 h-4 text-[#8b949e] shrink-0" />
    }
    return <FileText className="w-4 h-4 text-[#8b949e] shrink-0" />
  }

  const mockCommits: Record<string, { msg: string; time: string }> = {
    src: { msg: 'refactor: improve location accuracy', time: '2h ago' },
    public: { msg: 'feat: add offline mode support', time: '1d ago' },
    docs: { msg: 'docs: update installation guide', time: '3d ago' },
    '.gitignore': { msg: 'chore: update gitignore rules', time: '2w ago' },
    'README.md': { msg: 'docs: improve project description', time: '2h ago' },
    'package.json': { msg: 'chore: bump dependencies', time: '1w ago' },
    'vite.config.js': { msg: 'build: optimize vite settings', time: '2w ago' },
    'tsconfig.json': { msg: 'chore: update typescript config', time: '2w ago' },
    LICENSE: { msg: 'Initial commit', time: '1mo ago' }
  }

  return (
    <div className="flex flex-col gap-4 text-xs text-[#c9d1d9] font-sans pb-4 bg-[#000000]">
      {/* Branch & Action Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#000000]">
        <div className="flex items-center gap-3">
          {/* Branch Picker */}
          <div className="flex items-center gap-2 bg-[#000000] px-2 py-1 text-xs">
            <GitBranch className="w-3.5 h-3.5 text-[#58a6ff]" />
            <select
              value={activeBranch}
              onChange={(e) => onRefChange(e.target.value)}
              className="bg-transparent text-[#c9d1d9] font-mono text-xs focus:outline-none cursor-pointer"
            >
              <optgroup label="Branches">
                {branches.map((b: any) => (
                  <option key={b.name} value={b.name} className="bg-[#000000]">{b.name}</option>
                ))}
              </optgroup>
              {tags.length > 0 && (
                <optgroup label="Tags">
                  {tags.map((t: any) => (
                    <option key={t.name} value={t.name} className="bg-[#000000]">{t.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Search Code in Repo */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-[#6e7681]" />
            <input
              type="text"
              value={inRepoSearchQuery}
              onChange={(e) => setInRepoSearchQuery(e.target.value)}
              placeholder="Go to file"
              className="bg-[#000000] pl-7 pr-7 py-1 text-xs text-[#c9d1d9] placeholder-[#6e7681] focus:outline-none focus:text-[#58a6ff] w-44 font-mono"
            />
            <span className="absolute right-2 top-1.5 text-[10px] text-[#6e7681] font-mono">t</span>
          </div>
        </div>

        {/* Right CTA Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsNewFileModalOpen(true)}
            className="flex items-center gap-1.5 text-[#58a6ff] hover:text-[#79c0ff] font-semibold text-xs transition-colors"
          >
            <span>Add file</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          <button className="flex items-center gap-1.5 text-[#58a6ff] hover:text-[#79c0ff] font-semibold text-xs transition-colors">
            <span>Code</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Directory Table Area */}
      {!currentPath.includes('.') && (
        <div className="bg-[#000000] space-y-2">
          {/* Latest Commit Banner Header */}
          <div className="py-2 flex items-center justify-between text-xs bg-[#000000]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-5 h-5 rounded-full bg-[#58a6ff] flex items-center justify-center font-semibold text-[10px] text-black shrink-0">
                SM
              </div>
              <span className="font-semibold text-[#f0f6fc] shrink-0">sahajmaurya</span>
              <span className="text-[#8b949e] truncate">feat: add SOS live tracking and map integration</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px] text-[#8b949e] shrink-0">
              <span className="text-[#58a6ff]">a1b2c3d</span>
              <span>2h ago</span>
              <X className="w-3.5 h-3.5 text-[#f85149]" />
            </div>
          </div>

          {/* Directory Files List */}
          {loadingContents ? (
            <div className="py-8 text-center"><Loading what="Fetching Directory Contents..." /></div>
          ) : contents.length === 0 ? (
            <div className="py-8 text-center text-[#8b949e]">This directory is empty.</div>
          ) : (
            <div className="space-y-0.5 bg-[#000000]">
              {contents.map((item: any) => {
                const mock = mockCommits[item.name] || { msg: 'update project file', time: '2w ago' }
                return (
                  <div
                    key={item.sha + item.name}
                    onClick={() => {
                      if (item.type === 'dir') {
                        setCurrentPath(currentPath ? `${currentPath}/${item.name}` : item.name)
                      } else {
                        setCurrentPath(currentPath ? `${currentPath}/${item.name}` : item.name)
                      }
                    }}
                    className="flex items-center justify-between py-2 hover:text-[#58a6ff] cursor-pointer transition-colors text-xs bg-[#000000]"
                  >
                    <div className="flex items-center gap-3 w-1/3 min-w-0">
                      {getFileIcon(item.name, item.type)}
                      <span className="font-medium text-[#c9d1d9] hover:text-[#58a6ff] truncate">
                        {item.name}
                      </span>
                    </div>

                    <div className="w-1/2 text-[#8b949e] truncate font-mono text-[11px]">
                      {mock.msg}
                    </div>

                    <div className="text-[#6e7681] font-mono text-[11px] text-right shrink-0">
                      {mock.time}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Single File Detail View */}
      {currentPath.includes('.') && fileData && (
        <div className="bg-[#000000] flex flex-col space-y-2">
          <div className="py-2 flex items-center justify-between text-xs bg-[#000000]">
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold text-[#f0f6fc]">{fileData.name}</span>
              <span className="text-[#8b949e] font-mono">{fileData.size} bytes</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 text-xs text-[#58a6ff] hover:text-white transition-colors"
              >
                <Edit className="w-3.5 h-3.5" /> Edit
              </button>
              <button
                onClick={() => setIsDeleteModalOpen(true)}
                className="text-[#f85149] hover:text-white transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="py-4 bg-[#000000] overflow-x-auto">
            <pre className="font-mono text-xs text-[#c9d1d9] leading-relaxed whitespace-pre-wrap">
              {fileData.decodedContent || 'Binary file cannot be displayed.'}
            </pre>
          </div>
        </div>
      )}

      {/* README Rendered Card (at root) */}
      {currentPath === '' && (
        <div className="bg-[#000000] space-y-4 pt-4">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#8b949e] pb-2">
            <FileText className="w-4 h-4 text-[#58a6ff]" /> README.md
          </div>

          <div className="space-y-4">
            <h1 className="text-2xl font-bold text-[#f0f6fc]">GuardianV2</h1>
            <p className="text-sm text-[#c9d1d9]">Smart campus safety system with real-time alerts and location tracking.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="flex items-center gap-2 text-xs text-[#c9d1d9]">
                <Zap className="w-4 h-4 text-[#58a6ff]" />
                <span>Real-time emergency alerts</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#c9d1d9]">
                <MapPin className="w-4 h-4 text-[#3178c6]" />
                <span>Live location tracking</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#c9d1d9]">
                <Bell className="w-4 h-4 text-[#f1e05a]" />
                <span>SOS and help notifications</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#c9d1d9]">
                <Star className="w-4 h-4 text-[#e3b341]" />
                <span>Admin dashboard and analytics</span>
              </div>
            </div>

            {readmeContent && (
              <div className="pt-4">
                <GfmRenderer content={readmeContent} owner={owner} repo={repo} defaultBranch={activeBranch} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
