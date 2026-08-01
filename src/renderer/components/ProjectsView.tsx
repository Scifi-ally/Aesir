import React, { useState } from 'react'
import { Layout, Plus, ExternalLink, CircleDot, GitPullRequest, FileText, CheckCircle2, Clock } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loading, Empty, ErrorState } from './ui'

interface ProjectsViewProps {
  owner: string
  repo: string
}

export function ProjectsView({ owner, repo }: ProjectsViewProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  // GraphQL Query for Projects v2
  const { data: projectsData, isLoading, error } = useQuery({
    queryKey: ['github', 'projectsV2', owner, repo],
    queryFn: async () => {
      const query = `
        query GetRepoProjects($owner: String!, $repo: String!) {
          repository(owner: $owner, name: $repo) {
            projectsV2(first: 10) {
              nodes {
                id
                number
                title
                url
                closed
                items(first: 50) {
                  nodes {
                    id
                    type
                    content {
                      ... on Issue {
                        __typename
                        title
                        number
                        state
                        url
                      }
                      ... on PullRequest {
                        __typename
                        title
                        number
                        state
                        url
                      }
                      ... on DraftIssue {
                        __typename
                        title
                        body
                      }
                    }
                    fieldValues(first: 10) {
                      nodes {
                        ... on ProjectV2ItemFieldSingleSelectValue {
                          name
                          optionId
                          field {
                            ... on ProjectV2SingleSelectField {
                              name
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `
      const res = await window.devhub.github.graphql(query, { owner, repo })
      return res.data?.repository?.projectsV2?.nodes || []
    }
  })

  if (isLoading) return <Loading what="Loading GitHub Projects (v2)..." />
  if (error) return <ErrorState title="Failed to Load Projects" detail={(error as Error).message} />

  const activeProject = projectsData.find((p: any) => p.id === selectedProjectId) || projectsData[0]

  if (projectsData.length === 0) {
    return (
      <Empty
        title="No Projects v2 Found"
        hint="Create a Project (v2) on GitHub to organize issues and pull requests into Kanban boards."
      />
    )
  }

  // Extract items and group by status field (e.g. Todo, In Progress, Done)
  const items = activeProject?.items?.nodes || []
  const columns: Record<string, any[]> = {
    'Todo': [],
    'In Progress': [],
    'Done': [],
    'Backlog': []
  }

  items.forEach((item: any) => {
    let status = 'Todo'
    const singleSelectNode = item.fieldValues?.nodes?.find((fv: any) => fv.field?.name === 'Status' || fv.name)
    if (singleSelectNode?.name) {
      status = singleSelectNode.name
    }
    if (!columns[status]) columns[status] = []
    columns[status].push(item)
  })

  return (
    <div className="flex flex-col gap-6 text-xs text-[#c9d1d9] font-sans pb-16">
      {/* Projects Bar Selector */}
      <div className="flex items-center justify-between border-b border-[#30363d] pb-4">
        <div className="flex items-center gap-3">
          <Layout className="w-5 h-5 text-[#58a6ff]" />
          <div className="flex items-center gap-2">
            <select
              value={activeProject?.id || ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-sm font-semibold text-[#f0f6fc] focus:outline-none focus:border-[#58a6ff]"
            >
              {projectsData.map((p: any) => (
                <option key={p.id} value={p.id}>{p.title} (#{p.number})</option>
              ))}
            </select>
          </div>
        </div>

        {activeProject?.url && (
          <a
            href={activeProject.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-[#58a6ff] hover:underline"
          >
            Open in GitHub <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Kanban Board View */}
      <div className="grid grid-cols-4 gap-4 overflow-x-auto pb-4">
        {Object.entries(columns).map(([colName, colItems]) => (
          <div key={colName} className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3 flex flex-col gap-3 min-w-[240px]">
            <div className="flex items-center justify-between font-mono text-xs border-b border-[#30363d]/50 pb-2">
              <span className="font-semibold text-[#f0f6fc] uppercase tracking-wider text-[11px]">{colName}</span>
              <span className="bg-[#161b22] px-2 py-0.5 rounded text-[10px] text-[#8b949e] border border-[#30363d]">
                {colItems.length}
              </span>
            </div>

            <div className="space-y-2.5 flex-1 min-h-[200px]">
              {colItems.length === 0 ? (
                <div className="text-center py-8 text-[#484f58] text-[11px] italic">No items</div>
              ) : (
                colItems.map((item: any) => {
                  const content = item.content || {}
                  const isIssue = content.__typename === 'Issue'
                  const isPr = content.__typename === 'PullRequest'

                  return (
                    <div
                      key={item.id}
                      className="bg-[#161b22] border border-[#30363d] hover:border-[#58a6ff]/50 rounded p-3 space-y-2 transition-all cursor-pointer shadow-sm"
                    >
                      <div className="flex items-start gap-2">
                        {isIssue ? (
                          <CircleDot className="w-3.5 h-3.5 text-[#3fb950] shrink-0 mt-0.5" />
                        ) : isPr ? (
                          <GitPullRequest className="w-3.5 h-3.5 text-[#a371f7] shrink-0 mt-0.5" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-[#8b949e] shrink-0 mt-0.5" />
                        )}

                        <span className="font-semibold text-xs text-[#c9d1d9] leading-snug">
                          {content.title || 'Untitled Card'}
                        </span>
                      </div>

                      {content.number && (
                        <div className="text-[10px] font-mono text-[#8b949e]">
                          #{content.number} · {content.state}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
