import React, { useState, useEffect } from 'react'
import {
  Book,
  Star,
  GitBranch,
  Eye,
  GitFork,
  CircleDot,
  GitPullRequest,
  PlayCircle,
  Shield,
  Activity,
  Settings as SettingsIcon,
  Search,
  Plus,
  LogOut,
  Folder,
  FileText,
  FileCode,
  FileImage,
  ChevronRight,
  ChevronDown,
  Layout,
  BookOpen,
  Tag as TagIcon,
  Bell as BellIcon,
  MessageSquare,
  History as HistoryIcon,
  Users,
  Code,
  FileCheck,
  Check,
  ExternalLink,
  ShieldAlert,
  SlidersHorizontal,
  ArrowUpRight,
  Sparkles,
  Command,
  MoreHorizontal
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RateLimitBadge } from './RateLimitBadge'
import { CreateRepoModal } from './CreateRepoModal'
import { RepoSettingsView } from './RepoSettingsView'
import { CodeBrowserView } from './CodeBrowserView'
import { CommitsView } from './CommitsView'
import { CompareView } from './CompareView'
import { BranchesView } from './BranchesView'
import { PullRequestsView } from './PullRequestsView'
import { IssuesView } from './IssuesView'
import { ActionsView } from './ActionsView'
import { ProjectsView } from './ProjectsView'
import { WikiView } from './WikiView'
import { SecurityView } from './SecurityView'
import { InsightsView } from './InsightsView'
import { NotificationsView } from './NotificationsView'
import { ReleasesView } from './ReleasesView'
import { GlobalSearchView } from './GlobalSearchView'
import { Loading, Empty, ErrorState } from './ui'

import githubIconUrl from '../../../icons/github-dark-32px.png'

export default function GithubPage(): React.JSX.Element {
  const [vaultToken, setVaultToken] = useState<string | null>(null)
  const [checkingVault, setCheckingVault] = useState(true)

  const checkToken = React.useCallback(async () => {
    setCheckingVault(true)
    try {
      if (window.devhub?.github?.getToken) {
        const t = await window.devhub.github.getToken()
        setVaultToken(t)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setCheckingVault(false)
    }
  }, [])

  useEffect(() => {
    checkToken()
  }, [checkToken])

  const handleComplete = React.useCallback(async (token: string) => {
    if (window.devhub?.github?.saveToken) {
      await window.devhub.github.saveToken(token)
    }
    setVaultToken(token)
  }, [])

  const handleLogout = React.useCallback(async () => {
    if (window.devhub?.github?.logout) {
      await window.devhub.github.logout()
    }
    setVaultToken(null)
  }, [])

  if (checkingVault) {
    return <Loading what="Verifying GitHub Credentials..." />
  }

  if (!vaultToken) {
    return <OAuthLogin onComplete={handleComplete} />
  }

  return <GithubDashboard token={vaultToken} onLogout={handleLogout} />
}

function OAuthLogin({ onComplete }: { onComplete: (token: string) => void }) {
  const [loading, setLoading] = useState(false)
  const [deviceCode, setDeviceCode] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const CLIENT_ID = '178c6fc778ccc68e1d6a'

  const startOAuth = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await window.devhub.github.deviceCode(CLIENT_ID, 'repo workflow read:org notifications delete_repo')
      if (data.error) throw new Error(data.error_description || data.error)
      setDeviceCode(data)

      if (data.user_code) {
        try {
          await navigator.clipboard.writeText(data.user_code)
        } catch (err) {
          console.error('Clipboard copy error:', err)
        }
      }

      try {
        window.devhub.app.openExternal(data.verification_uri)
      } catch (err) {
        console.error('Failed to open browser:', err)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const checkAuthorizationNow = React.useCallback(async () => {
    if (!deviceCode) return
    try {
      const data = await window.devhub.github.accessToken(CLIENT_ID, deviceCode.device_code)
      if (data?.access_token) {
        onComplete(data.access_token)
        return
      }
      if (typeof window.devhub?.github?.getToken === 'function') {
        const storedToken = await window.devhub.github.getToken()
        if (storedToken) {
          onComplete(storedToken)
          return
        }
      }
      if (data?.error && data.error !== 'authorization_pending' && data.error !== 'slow_down') {
        setError(data.error_description || data.error)
      }
    } catch (e: any) {
      console.error('Poll error:', e)
    }
  }, [deviceCode, onComplete])

  useEffect(() => {
    if (!deviceCode) return
    let active = true
    checkAuthorizationNow()
    const intervalId = setInterval(() => {
      if (active) checkAuthorizationNow()
    }, 2000)
    return () => {
      active = false
      clearInterval(intervalId)
    }
  }, [deviceCode, checkAuthorizationNow])

  return (
    <div className="flex w-full h-full items-center justify-center bg-[#000000] text-[#c9d1d9] font-sans">
      <div className="flex flex-col items-center p-6 text-center">
        <img src={githubIconUrl} className="w-10 h-10 mb-4 invert opacity-90" alt="GitHub" />
        <h2 className="text-lg font-semibold mb-6 text-[#f0f6fc]">Connect to GitHub</h2>

        {error ? (
          <div className="w-full text-center">
            <p className="text-[#f85149] text-xs mb-4 p-3 text-[#f85149]">{error}</p>
            <button
              className="px-4 py-1.5 text-[#58a6ff] hover:text-[#79c0ff] text-xs font-semibold transition-colors"
              onClick={startOAuth}
            >
              Try Again
            </button>
          </div>
        ) : deviceCode ? (
          <div className="flex flex-col items-center space-y-4">
            <div className="text-3xl font-mono tracking-[0.25em] text-[#58a6ff] select-all my-2">
              {deviceCode.user_code}
            </div>

            <div className="flex items-center gap-2 text-[#8b949e] text-xs pt-2">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-[#58a6ff] border-t-transparent animate-spin" />
              <span>Waiting for authorization...</span>
            </div>
          </div>
        ) : (
          <button
            className="flex items-center justify-center gap-2 bg-[#58a6ff] hover:bg-[#79c0ff] text-black px-6 py-2 text-xs font-semibold transition-colors"
            disabled={loading}
            onClick={startOAuth}
          >
            {loading ? <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" /> : 'Login with GitHub'}
          </button>
        )}
      </div>
    </div>
  )
}

function GithubDashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const queryClient = useQueryClient()
  const [selectedRepo, setSelectedRepo] = useState<any>(null)
  const [selectedRef, setSelectedRef] = useState<string>('')
  const [repoSearch, setRepoSearch] = useState('')
  const [repoTab, setRepoTab] = useState('code')
  const [navSection, setNavSection] = useState('overview')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  // Star, Watch, Fork states
  const [isStarred, setIsStarred] = useState(false)
  const [watchLevel, setWatchLevel] = useState<'subscribed' | 'ignored' | 'none'>('none')
  const [starCount, setStarCount] = useState(0)
  const [forkCount, setForkCount] = useState(0)
  const [starring, setStarring] = useState(false)
  const [forking, setForking] = useState(false)

  // User query
  const { data: user } = useQuery({
    queryKey: ['github', 'user'],
    queryFn: async () => {
      const res = await window.devhub.github.request('/user')
      return res.data
    }
  })

  // Repositories Query
  const {
    data: repos = [],
    isLoading: loadingRepos,
    error: reposError,
    refetch: refetchRepos
  } = useQuery({
    queryKey: ['github', 'repos', repoSearch],
    queryFn: async () => {
      try {
        if (repoSearch.trim().length > 0) {
          const res = await window.devhub.github.request(`/search/repositories?q=${encodeURIComponent(repoSearch.trim())}`)
          return res.data?.items || []
        }

        let allRepos: any[] = []
        let page = 1
        while (page <= 5) {
          const res = await window.devhub.github.request(`/user/repos?sort=updated&per_page=100&page=${page}`)
          const pageItems = res.data || []
          allRepos = allRepos.concat(pageItems)
          if (pageItems.length < 100) break
          page++
        }
        return allRepos
      } catch (err: any) {
        if (err.message?.includes('UNAUTHORIZED')) {
          setAuthError('Your GitHub token is invalid or has expired. Please re-authenticate.')
        }
        throw err
      }
    }
  })

  useEffect(() => {
    if (repos.length > 0 && !selectedRepo) {
      setSelectedRepo(repos[0])
    }
  }, [repos, selectedRepo])

  useEffect(() => {
    if (!selectedRepo) return
    const owner = selectedRepo.owner.login
    const name = selectedRepo.name
    setStarCount(selectedRepo.stargazers_count || 0)
    setForkCount(selectedRepo.forks_count || 0)

    window.devhub.github.request(`/user/starred/${owner}/${name}`)
      .then(res => setIsStarred(res.status === 204))
      .catch(() => setIsStarred(false))

    window.devhub.github.request(`/repos/${owner}/${name}/subscription`)
      .then(res => {
        if (res.data?.subscribed) setWatchLevel('subscribed')
        else if (res.data?.ignored) setWatchLevel('ignored')
        else setWatchLevel('none')
      })
      .catch(() => setWatchLevel('none'))
  }, [selectedRepo])

  const handleToggleStar = async () => {
    if (!selectedRepo || starring) return
    const owner = selectedRepo.owner.login
    const name = selectedRepo.name
    setStarring(true)

    try {
      if (isStarred) {
        await window.devhub.github.request(`/user/starred/${owner}/${name}`, { method: 'DELETE' })
        setIsStarred(false)
        setStarCount(prev => Math.max(0, prev - 1))
      } else {
        await window.devhub.github.request(`/user/starred/${owner}/${name}`, { method: 'PUT' })
        setIsStarred(true)
        setStarCount(prev => prev + 1)
      }
    } catch (e: any) {
      alert(`Star failed: ${e.message}`)
    } finally {
      setStarring(false)
    }
  }

  const handleToggleWatch = async () => {
    if (!selectedRepo) return
    const owner = selectedRepo.owner.login
    const name = selectedRepo.name

    try {
      if (watchLevel === 'subscribed') {
        await window.devhub.github.request(`/repos/${owner}/${name}/subscription`, { method: 'DELETE' })
        setWatchLevel('none')
      } else {
        await window.devhub.github.request(`/repos/${owner}/${name}/subscription`, {
          method: 'PUT',
          body: { subscribed: true }
        })
        setWatchLevel('subscribed')
      }
    } catch (e: any) {
      alert(`Watch failed: ${e.message}`)
    }
  }

  const handleFork = async () => {
    if (!selectedRepo || forking) return
    const owner = selectedRepo.owner.login
    const name = selectedRepo.name
    setForking(true)

    try {
      await window.devhub.github.request(`/repos/${owner}/${name}/forks`, { method: 'POST' })
      alert(`Fork initiated! Check your account in a few seconds.`)
      setForkCount(prev => prev + 1)
    } catch (e: any) {
      alert(`Fork failed: ${e.message}`)
    } finally {
      setForking(false)
    }
  }

  const { data: repoDetails } = useQuery({
    queryKey: ['github', 'repoDetails', selectedRepo?.owner?.login, selectedRepo?.name],
    enabled: Boolean(selectedRepo),
    queryFn: async () => {
      const owner = selectedRepo.owner.login
      const name = selectedRepo.name
      const langRes = await window.devhub.github.request(`/repos/${owner}/${name}/languages`).catch(() => ({ data: {} }))
      return { languages: langRes.data || {} }
    }
  })

  if (authError) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-[#000000] text-[#c9d1d9] p-6 text-center">
        <div className="max-w-md p-6 space-y-4">
          <h3 className="text-base font-semibold text-[#f85149]">Authentication Required</h3>
          <p className="text-xs text-[#8b949e]">{authError}</p>
          <button
            onClick={onLogout}
            className="px-4 py-2 text-[#58a6ff] hover:text-[#79c0ff] text-xs font-semibold transition-colors"
          >
            Re-authenticate with GitHub
          </button>
        </div>
      </div>
    )
  }

  if (loadingRepos) return <Loading what="Loading GitHub Repositories..." />
  if (reposError) {
    return (
      <ErrorState
        title="Failed to Load Repositories"
        detail={(reposError as Error).message}
        retry={() => refetchRepos()}
      />
    )
  }

  const langs = repoDetails?.languages || {}
  const totalBytes = Object.values(langs).reduce((a: any, b: any) => a + b, 0) as number
  const langEntries = Object.entries(langs)
    .map(([name, bytes]) => ({
      name,
      bytes: bytes as number,
      percent: totalBytes > 0 ? ((bytes as number) / totalBytes) * 100 : 0
    }))
    .sort((a, b) => b.bytes - a.bytes)

  const langColors: Record<string, string> = {
    JavaScript: '#f1e05a',
    TypeScript: '#3178c6',
    Python: '#3572A5',
    CSS: '#563d7c',
    HTML: '#e34c26',
    Shell: '#89e051',
    Rust: '#dea584',
    Go: '#00ADD8'
  }

  const pinnedRepos = repos.slice(0, 3)
  const otherRepos = repos.slice(3)

  return (
    <div className="flex flex-1 min-h-0 w-full h-full bg-[#000000] text-[#c9d1d9] font-sans text-xs overflow-hidden select-none p-4 gap-6">
      {/* Create Repo Modal */}
      <CreateRepoModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(newRepo) => {
          setSelectedRepo(newRepo)
          setRepoTab('code')
        }}
      />

      {/* ---------------- COLUMN 1: Flat Left Nav Rail ---------------- */}
      <div className="w-[190px] bg-[#000000] flex flex-col shrink-0 relative h-full">
        <div className="flex-1 overflow-y-auto scrollbar-hide py-4 px-3 space-y-6 pb-12">
          {/* Top CTA */}
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="w-full flex items-center justify-between py-1 text-xs font-semibold text-[#58a6ff] hover:text-[#79c0ff] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-3.5 h-3.5" />
              <span>New repository</span>
            </div>
            <span className="text-[10px] font-mono text-[#6e7681]">N</span>
          </button>

          {/* Primary Nav List */}
          <div className="space-y-1">
            <NavRailItem icon={<Layout className="w-4 h-4" />} label="Overview" active={navSection === 'overview'} onClick={() => setNavSection('overview')} />
            <NavRailItem icon={<Book className="w-4 h-4" />} label="Repositories" count={repos.length.toString()} active={navSection === 'repos'} onClick={() => setNavSection('repos')} />
            <NavRailItem icon={<GitPullRequest className="w-4 h-4" />} label="Pull requests" count="7" />
            <NavRailItem icon={<CircleDot className="w-4 h-4" />} label="Issues" count="12" />
            <NavRailItem icon={<MessageSquare className="w-4 h-4" />} label="Discussions" />
            <NavRailItem icon={<Layout className="w-4 h-4" />} label="Projects" />
            <NavRailItem icon={<BookOpen className="w-4 h-4" />} label="Wiki" />
            <NavRailItem icon={<Star className="w-4 h-4 text-[#e3b341]" />} label="Stars" count="89" />
            <NavRailItem icon={<Code className="w-4 h-4" />} label="Gists" />
            <NavRailItem icon={<Users className="w-4 h-4" />} label="Organizations" />
          </div>

          {/* Recent Repositories */}
          <div className="space-y-2 pt-3">
            <h4 className="text-[10px] font-bold text-[#6e7681] uppercase tracking-wider font-mono px-2">Recent</h4>
            <div className="space-y-0.5">
              {repos.slice(0, 5).map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRepo(r)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs transition-colors truncate ${selectedRepo?.id === r.id ? 'text-[#58a6ff] font-semibold' : 'text-[#8b949e] hover:text-[#c9d1d9]'}`}
                >
                  <Book className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{r.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Fade-out Gradient Effect */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#000000] via-[#000000]/80 to-transparent pointer-events-none z-10" />
      </div>

      {/* ---------------- COLUMN 2: Flat Repositories Feed Panel ---------------- */}
      <div className="w-[270px] bg-[#000000] flex flex-col shrink-0 relative h-full">
        {/* Search Header */}
        <div className="pb-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#6e7681]" />
            <input
              type="text"
              value={repoSearch}
              onChange={(e) => setRepoSearch(e.target.value)}
              placeholder="Search repositories..."
              className="w-full bg-[#000000] py-1.5 pl-9 pr-10 text-xs text-[#c9d1d9] placeholder-[#6e7681] focus:outline-none focus:text-[#58a6ff]"
            />
            <div className="absolute right-3 top-2.5 flex items-center gap-1 text-[10px] text-[#6e7681] font-mono">
              <Command className="w-3 h-3" />
              <span>X</span>
            </div>
          </div>
        </div>

        {/* Repositories Scroll Feed */}
        <div className="flex-1 overflow-y-auto scrollbar-hide space-y-4 pr-1 pb-16">
          {/* Pinned Section */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-semibold text-[#6e7681] uppercase font-mono tracking-wider px-1">Pinned</h4>
            <div className="space-y-2">
              {pinnedRepos.map((r: any) => (
                <RepoFeedCard
                  key={r.id}
                  repo={r}
                  active={selectedRepo?.id === r.id}
                  onClick={() => {
                    setSelectedRepo(r)
                    setRepoTab('code')
                  }}
                  langColors={langColors}
                />
              ))}
            </div>
          </div>

          {/* All Repositories Section */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-semibold text-[#6e7681] uppercase font-mono tracking-wider px-1">All repositories</h4>
            <div className="space-y-2">
              {otherRepos.map((r: any) => (
                <RepoFeedCard
                  key={r.id}
                  repo={r}
                  active={selectedRepo?.id === r.id}
                  onClick={() => {
                    setSelectedRepo(r)
                    setRepoTab('code')
                  }}
                  langColors={langColors}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Fade-out Gradient Effect */}
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#000000] via-[#000000]/90 to-transparent pointer-events-none z-10" />
      </div>

      {/* ---------------- COLUMN 3: Flat Main Workspace Panel ---------------- */}
      <div className="flex-1 bg-[#000000] flex flex-col overflow-y-auto scrollbar-hide space-y-5 h-full min-w-0">
        {selectedRepo ? (
          <>
            {/* Header Title & Actions */}
            <div className="flex flex-col space-y-3 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Book className="w-4 h-4 text-[#8b949e]" />
                  <span className="text-base font-bold text-[#f0f6fc]">{selectedRepo.name}</span>
                  <span className="text-[10px] text-[#8b949e] font-mono uppercase tracking-wider">
                    {selectedRepo.private ? 'Private' : 'Public'}
                  </span>
                </div>

                {/* Star / Fork / Overflow Menu */}
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleToggleStar}
                    disabled={starring}
                    className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${isStarred ? 'text-[#e3b341]' : 'text-[#8b949e] hover:text-[#c9d1d9]'}`}
                  >
                    <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-[#e3b341]' : ''}`} />
                    <span>Star</span>
                    <span className="font-mono text-[11px] text-[#8b949e]">{starCount}</span>
                  </button>

                  <button
                    onClick={handleFork}
                    disabled={forking}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
                  >
                    <GitFork className="w-3.5 h-3.5" />
                    <span>Fork</span>
                    <span className="font-mono text-[11px] text-[#8b949e]">{forkCount}</span>
                  </button>

                  <button className="text-[#8b949e] hover:text-white transition-colors">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Navigation Tabs Line */}
              <div className="flex items-center gap-6 text-xs font-semibold text-[#8b949e] overflow-x-auto whitespace-nowrap scrollbar-hide pt-1">
                <MainTabItem icon={<Code className="w-4 h-4" />} label="Code" active={repoTab === 'code'} onClick={() => setRepoTab('code')} />
                <MainTabItem icon={<CircleDot className="w-4 h-4" />} label="Issues" count={selectedRepo.open_issues_count?.toString() || '3'} active={repoTab === 'issues'} onClick={() => setRepoTab('issues')} />
                <MainTabItem icon={<GitPullRequest className="w-4 h-4" />} label="Pull requests" count="2" active={repoTab === 'prs'} onClick={() => setRepoTab('prs')} />
                <MainTabItem icon={<PlayCircle className="w-4 h-4" />} label="Actions" active={repoTab === 'actions'} onClick={() => setRepoTab('actions')} />
                <MainTabItem icon={<Layout className="w-4 h-4" />} label="Projects" active={repoTab === 'projects'} onClick={() => setRepoTab('projects')} />
                <MainTabItem icon={<BookOpen className="w-4 h-4" />} label="Wiki" active={repoTab === 'wiki'} onClick={() => setRepoTab('wiki')} />
                <MainTabItem icon={<Shield className="w-4 h-4" />} label="Security" active={repoTab === 'security'} onClick={() => setRepoTab('security')} />
                <MainTabItem icon={<Activity className="w-4 h-4" />} label="Insights" active={repoTab === 'insights'} onClick={() => setRepoTab('insights')} />
                <MainTabItem icon={<SettingsIcon className="w-4 h-4" />} label="Settings" active={repoTab === 'settings'} onClick={() => setRepoTab('settings')} />
              </div>
            </div>

            {/* Main Content Workspace Panel */}
            <div className="flex-1 overflow-y-auto scrollbar-hide space-y-5 bg-[#000000]">
              {repoTab === 'code' ? (
                <div className="space-y-5 bg-[#000000]">
                  {/* Hero Summary */}
                  <div className="space-y-3 pb-2 bg-[#000000]">
                    <p className="text-xs text-[#c9d1d9] font-medium leading-relaxed">
                      {selectedRepo.description || 'Smart campus safety system with real-time alerts and location tracking.'}
                    </p>

                    {/* Topic Tags */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {['javascript', 'react', 'nodejs', 'express', 'maps', 'safety'].map(t => (
                        <span key={t} className="text-[#58a6ff] text-[11px] font-mono">
                          {t}
                        </span>
                      ))}
                      <span className="text-[#6e7681] text-[11px] font-mono">+ 2</span>
                    </div>

                    {/* Quick Stats Line */}
                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#8b949e] font-mono pt-2">
                      <span className="flex items-center gap-1.5 text-[#c9d1d9]">
                        <span className="w-2 h-2 rounded-full bg-[#f1e05a]" /> {selectedRepo.language || 'JavaScript'}
                      </span>
                      <span className="flex items-center gap-1 text-[#8b949e]">
                        <GitBranch className="w-3.5 h-3.5" /> {selectedRepo.default_branch || 'main'}
                      </span>
                      <span>12 branches</span>
                      <span>5 tags</span>
                      <span>{selectedRepo.license?.spdx_id || 'MIT'}</span>
                      <span className="flex items-center gap-1 text-[#8b949e]">
                        <HistoryIcon className="w-3.5 h-3.5" /> 152 commits
                      </span>
                    </div>
                  </div>

                  {/* Code Browser View Integration */}
                  <CodeBrowserView
                    owner={selectedRepo.owner.login}
                    repo={selectedRepo.name}
                    defaultBranch={selectedRepo.default_branch || 'main'}
                    selectedRef={selectedRef}
                    onRefChange={setSelectedRef}
                  />
                </div>
              ) : repoTab === 'commits' ? (
                <CommitsView
                  owner={selectedRepo.owner.login}
                  repo={selectedRepo.name}
                  selectedRef={selectedRef}
                />
              ) : repoTab === 'branches' ? (
                <BranchesView
                  owner={selectedRepo.owner.login}
                  repo={selectedRepo.name}
                  defaultBranch={selectedRepo.default_branch || 'main'}
                  onSelectBranch={(b) => {
                    setSelectedRef(b)
                    setRepoTab('code')
                  }}
                />
              ) : repoTab === 'issues' ? (
                <IssuesView
                  owner={selectedRepo.owner.login}
                  repo={selectedRepo.name}
                  defaultBranch={selectedRepo.default_branch || 'main'}
                />
              ) : repoTab === 'prs' ? (
                <PullRequestsView
                  owner={selectedRepo.owner.login}
                  repo={selectedRepo.name}
                  defaultBranch={selectedRepo.default_branch || 'main'}
                />
              ) : repoTab === 'actions' ? (
                <ActionsView
                  owner={selectedRepo.owner.login}
                  repo={selectedRepo.name}
                  defaultBranch={selectedRepo.default_branch || 'main'}
                />
              ) : repoTab === 'projects' ? (
                <ProjectsView
                  owner={selectedRepo.owner.login}
                  repo={selectedRepo.name}
                />
              ) : repoTab === 'wiki' ? (
                <WikiView
                  owner={selectedRepo.owner.login}
                  repo={selectedRepo.name}
                  defaultBranch={selectedRepo.default_branch || 'main'}
                />
              ) : repoTab === 'releases' ? (
                <ReleasesView
                  owner={selectedRepo.owner.login}
                  repo={selectedRepo.name}
                  defaultBranch={selectedRepo.default_branch || 'main'}
                />
              ) : repoTab === 'notifications' ? (
                <NotificationsView
                  currentRepoOnly={true}
                  owner={selectedRepo.owner.login}
                  repo={selectedRepo.name}
                />
              ) : repoTab === 'globalsearch' ? (
                <GlobalSearchView
                  initialOwner={selectedRepo.owner.login}
                  initialRepo={selectedRepo.name}
                />
              ) : repoTab === 'security' ? (
                <SecurityView
                  owner={selectedRepo.owner.login}
                  repo={selectedRepo.name}
                />
              ) : repoTab === 'insights' ? (
                <InsightsView
                  owner={selectedRepo.owner.login}
                  repo={selectedRepo.name}
                />
              ) : repoTab === 'settings' ? (
                <RepoSettingsView
                  repo={selectedRepo}
                  onRepoUpdated={() => {
                    queryClient.invalidateQueries({ queryKey: ['github', 'repos'] })
                  }}
                  onRepoDeleted={() => {
                    setSelectedRepo(null)
                    queryClient.invalidateQueries({ queryKey: ['github', 'repos'] })
                  }}
                />
              ) : null}
            </div>
          </>
        ) : (
          <Empty title="No repository selected" hint="Select a repository from the sidebar to view details." />
        )}
      </div>

      {/* ---------------- COLUMN 4: Flat Right Metadata Panel ---------------- */}
      <div className="w-[240px] bg-[#000000] flex flex-col shrink-0 overflow-y-auto scrollbar-hide space-y-6 h-full">
        {/* About Section */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-[#8b949e] uppercase font-mono tracking-wider">About</h4>
          <p className="text-xs text-[#c9d1d9] leading-relaxed">
            {selectedRepo?.description || 'Smart campus safety system with real-time alerts and location tracking.'}
          </p>

          <div className="space-y-2.5 pt-2 text-xs text-[#8b949e]">
            <div className="flex items-center gap-2 text-[#c9d1d9]"><BookOpen className="w-3.5 h-3.5 text-[#8b949e]" /> Readme</div>
            <div className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-[#8b949e]" /> {selectedRepo?.license?.spdx_id || 'MIT license'}</div>
            <div className="flex items-center gap-2"><Star className="w-3.5 h-3.5 text-[#8b949e]" /> {starCount} stars</div>
            <div className="flex items-center gap-2"><GitFork className="w-3.5 h-3.5 text-[#8b949e]" /> {forkCount} forks</div>
            <div className="flex items-center gap-2"><Eye className="w-3.5 h-3.5 text-[#8b949e]" /> 5 watching</div>
          </div>
        </div>

        {/* Languages Section */}
        <div className="space-y-3 pt-4">
          <h4 className="text-xs font-semibold text-[#8b949e] uppercase font-mono tracking-wider">Languages</h4>
          <div className="flex h-1.5 rounded-full overflow-hidden bg-[#161822]">
            <div style={{ width: '62%' }} className="bg-[#f1e05a]" />
            <div style={{ width: '20%' }} className="bg-[#3178c6]" />
            <div style={{ width: '10%' }} className="bg-[#563d7c]" />
            <div style={{ width: '8%' }} className="bg-[#8b949e]" />
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#f1e05a]" /> JavaScript</span><span className="font-mono text-[#8b949e]">62%</span></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#3178c6]" /> TypeScript</span><span className="font-mono text-[#8b949e]">20%</span></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#563d7c]" /> CSS</span><span className="font-mono text-[#8b949e]">10%</span></div>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#8b949e]" /> Other</span><span className="font-mono text-[#8b949e]">8%</span></div>
          </div>
        </div>

        {/* Contributors Section */}
        <div className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-[#8b949e] uppercase font-mono tracking-wider">Contributors</h4>
            <span className="font-mono text-xs text-[#6e7681]">2</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#58a6ff] flex items-center justify-center font-semibold text-xs text-black">
              SM
            </div>
            <div className="w-7 h-7 rounded-full bg-[#3b82f6] flex items-center justify-center font-semibold text-xs text-white">
              UB
            </div>
            <div className="w-7 h-7 rounded-full bg-[#161b22] flex items-center justify-center font-mono text-[10px] text-[#8b949e]">
              +3
            </div>
          </div>
        </div>

        {/* Releases Section */}
        <div className="space-y-3 pt-4">
          <h4 className="text-xs font-semibold text-[#8b949e] uppercase font-mono tracking-wider">Releases</h4>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <TagIcon className="w-3.5 h-3.5 text-[#58a6ff]" />
              <span className="font-semibold text-xs text-[#f0f6fc]">v1.2.0</span>
              <span className="text-[#3fb950] text-[10px] font-mono font-semibold">Latest</span>
            </div>
            <div className="text-[11px] text-[#6e7681] pl-5">2 days ago</div>
          </div>

          <button className="text-[11px] text-[#8b949e] hover:text-[#58a6ff] transition-colors pt-1">
            + 4 releases
          </button>
        </div>
      </div>
    </div>
  )
}

function NavRailItem({ icon, label, count, active, onClick }: { icon: React.ReactNode; label: string; count?: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between py-1 text-xs transition-colors ${active ? 'text-[#58a6ff] font-semibold' : 'text-[#8b949e] hover:text-[#c9d1d9]'}`}
    >
      <div className="flex items-center gap-2.5">
        {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'w-4 h-4' })}
        <span>{label}</span>
      </div>
      {count && <span className="font-mono text-[10px] text-[#6e7681]">{count}</span>}
    </button>
  )
}

function RepoFeedCard({ repo, active, onClick, langColors }: any) {
  const langColor = repo.language ? langColors[repo.language] || '#58a6ff' : '#58a6ff'
  return (
    <div
      onClick={onClick}
      className={`py-2 flex flex-col gap-1 cursor-pointer transition-all ${active ? 'text-[#58a6ff] font-semibold' : 'text-[#c9d1d9] hover:text-[#58a6ff]'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Book className="w-3.5 h-3.5 text-[#8b949e] shrink-0" />
          <span className="text-xs truncate">{repo.name}</span>
        </div>
        <span className="text-[10px] text-[#6e7681] font-mono shrink-0">
          {repo.private ? 'Priv' : 'Pub'}
        </span>
      </div>

      <div className="flex items-center gap-3 font-mono text-[10px] text-[#6e7681]">
        <span className="flex items-center gap-1 text-[#8b949e]">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: langColor }} />
          {repo.language || 'Code'}
        </span>
        <span className="flex items-center gap-1"><Star className="w-3 h-3 text-[#e3b341]" /> {repo.stargazers_count || 0}</span>
        <span className="flex items-center gap-1"><GitFork className="w-3 h-3" /> {repo.forks_count || 0}</span>
      </div>

      {repo.description && (
        <p className="text-[#6e7681] text-[11px] line-clamp-1 leading-snug">{repo.description}</p>
      )}
    </div>
  )
}

function MainTabItem({ icon, label, count, active, onClick }: { icon: React.ReactNode; label: string; count?: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 pb-2 cursor-pointer transition-colors whitespace-nowrap text-xs ${active ? 'text-[#f0f6fc] font-semibold' : 'text-[#8b949e] hover:text-[#c9d1d9]'}`}
    >
      {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'w-4 h-4' })}
      <span>{label}</span>
      {count && <span className="text-[#8b949e] text-[10px] font-mono">({count})</span>}
    </button>
  )
}
