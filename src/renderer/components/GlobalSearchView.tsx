import React, { useState } from 'react'
import { Search, Code, CircleDot, Book, User, Filter, ArrowRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Loading, Empty, ErrorState } from './ui'

interface GlobalSearchViewProps {
  initialOwner?: string
  initialRepo?: string
}

export function GlobalSearchView({ initialOwner, initialRepo }: GlobalSearchViewProps): React.JSX.Element {
  const [queryStr, setQueryStr] = useState(
    initialOwner && initialRepo ? `repo:${initialOwner}/${initialRepo} ` : ''
  )
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [searchCategory, setSearchCategory] = useState<'code' | 'issues' | 'repositories' | 'users'>('code')

  // Search Query
  const { data: searchResults, isLoading, error } = useQuery({
    queryKey: ['github', 'globalSearch', searchCategory, submittedQuery],
    enabled: Boolean(submittedQuery.trim()),
    queryFn: async () => {
      const endpoint = `/search/${searchCategory}?q=${encodeURIComponent(submittedQuery.trim())}&per_page=30`
      const res = await window.devhub.github.request(endpoint)
      return res.data?.items || []
    }
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (queryStr.trim()) {
      setSubmittedQuery(queryStr.trim())
    }
  }

  return (
    <div className="flex flex-col gap-6 text-xs text-[#c9d1d9] font-sans pb-16">
      {/* Search Input Bar */}
      <form onSubmit={handleSearch} className="bg-[#0d1117] border border-[#30363d] p-4 rounded-lg space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-[#8b949e]" />
          <input
            type="text"
            value={queryStr}
            onChange={(e) => setQueryStr(e.target.value)}
            placeholder="Search GitHub (e.g. repo:owner/repo language:typescript is:open fixes)"
            className="w-full bg-[#000000] border border-[#30363d] rounded-lg py-2.5 pl-10 pr-24 font-mono text-xs text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]"
          />
          <button
            type="submit"
            className="absolute right-2 top-2 px-3 py-1 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold rounded text-xs transition-colors"
          >
            Search
          </button>
        </div>

        {/* Category Pickers */}
        <div className="flex items-center gap-4 pt-2 font-mono text-xs text-[#8b949e]">
          <button
            type="button"
            onClick={() => setSearchCategory('code')}
            className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${searchCategory === 'code' ? 'bg-[#30363d] text-white' : 'hover:text-[#c9d1d9]'}`}
          >
            <Code className="w-3.5 h-3.5" /> Code
          </button>

          <button
            type="button"
            onClick={() => setSearchCategory('issues')}
            className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${searchCategory === 'issues' ? 'bg-[#30363d] text-white' : 'hover:text-[#c9d1d9]'}`}
          >
            <CircleDot className="w-3.5 h-3.5" /> Issues & PRs
          </button>

          <button
            type="button"
            onClick={() => setSearchCategory('repositories')}
            className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${searchCategory === 'repositories' ? 'bg-[#30363d] text-white' : 'hover:text-[#c9d1d9]'}`}
          >
            <Book className="w-3.5 h-3.5" /> Repositories
          </button>

          <button
            type="button"
            onClick={() => setSearchCategory('users')}
            className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${searchCategory === 'users' ? 'bg-[#30363d] text-white' : 'hover:text-[#c9d1d9]'}`}
          >
            <User className="w-3.5 h-3.5" /> Users
          </button>
        </div>
      </form>

      {/* Results Container */}
      {!submittedQuery ? (
        <div className="p-8 text-center text-[#8b949e] font-mono">
          Enter a search query with GitHub qualifiers (e.g. <code className="text-[#58a6ff]">repo:owner/repo</code>, <code className="text-[#58a6ff]">is:pr</code>, <code className="text-[#58a6ff]">state:open</code>).
        </div>
      ) : isLoading ? (
        <Loading what={`Searching ${searchCategory} for "${submittedQuery}"...`} />
      ) : error ? (
        <ErrorState title="Search Failed" detail={(error as Error).message} />
      ) : searchResults?.length === 0 ? (
        <Empty title="No matching results" hint={`No ${searchCategory} found for "${submittedQuery}".`} />
      ) : (
        <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]/40 font-mono text-xs">
          {searchResults?.map((item: any) => (
            <div key={item.id || item.sha || item.html_url} className="p-4 hover:bg-[#161b22] transition-colors space-y-1">
              {searchCategory === 'code' && (
                <div>
                  <div className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-[#58a6ff]" />
                    <span className="font-semibold text-[#f0f6fc]">{item.name}</span>
                    <span className="text-[#8b949e] text-[11px]">in {item.repository?.full_name}</span>
                  </div>
                  <div className="text-[11px] text-[#8b949e] mt-1 pl-6 font-mono truncate">{item.path}</div>
                </div>
              )}

              {searchCategory === 'issues' && (
                <div>
                  <div className="flex items-center gap-2">
                    <CircleDot className="w-4 h-4 text-[#3fb950]" />
                    <span className="font-semibold text-[#f0f6fc]">{item.title}</span>
                    <span className="text-[#8b949e]">#{item.number}</span>
                  </div>
                  <div className="text-[11px] text-[#8b949e] mt-1 pl-6">Opened by {item.user?.login}</div>
                </div>
              )}

              {searchCategory === 'repositories' && (
                <div>
                  <div className="font-semibold text-[#58a6ff] text-sm">{item.full_name}</div>
                  <div className="text-xs text-[#8b949e] font-sans mt-1">{item.description}</div>
                </div>
              )}

              {searchCategory === 'users' && (
                <div className="flex items-center gap-3">
                  <img src={item.avatar_url} alt="" className="w-6 h-6 rounded-full border border-[#30363d]" />
                  <span className="font-semibold text-[#f0f6fc]">{item.login}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
