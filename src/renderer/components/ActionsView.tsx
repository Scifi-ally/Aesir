import React, { useState, useEffect } from 'react'
import {
  PlayCircle,
  Play,
  RotateCw,
  XCircle,
  CheckCircle2,
  Clock,
  Key,
  Package,
  FileText,
  Lock,
  Plus,
  RefreshCw,
  AlertCircle
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loading, Empty, ErrorState } from './ui'

interface ActionsViewProps {
  owner: string
  repo: string
  defaultBranch: string
}

export function ActionsView({ owner, repo, defaultBranch }: ActionsViewProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'runs' | 'secrets' | 'artifacts'>('runs')

  // Dispatch modal
  const [dispatchModalWorkflow, setDispatchModalWorkflow] = useState<any | null>(null)
  const [dispatchRef, setDispatchRef] = useState(defaultBranch || 'main')
  const [dispatchInputs, setDispatchInputs] = useState<string>('{}')
  const [dispatching, setDispatching] = useState(false)

  // Secrets modal
  const [isSecretModalOpen, setIsSecretModalOpen] = useState(false)
  const [secretName, setSecretName] = useState('')
  const [secretValue, setSecretValue] = useState('')
  const [savingSecret, setSavingSecret] = useState(false)

  // Workflows Query
  const { data: workflowsData, isLoading: loadingWorkflows } = useQuery({
    queryKey: ['github', 'workflows', owner, repo],
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/actions/workflows`)
      return res.data?.workflows || []
    }
  })

  // Runs Query (with 10s ETag polling for live run tracking!)
  const { data: runsData, isLoading: loadingRuns } = useQuery({
    queryKey: ['github', 'actionsRuns', owner, repo, selectedWorkflowId],
    refetchInterval: 10000,
    queryFn: async () => {
      const endpoint = selectedWorkflowId
        ? `/repos/${owner}/${repo}/actions/workflows/${selectedWorkflowId}/runs?per_page=30`
        : `/repos/${owner}/${repo}/actions/runs?per_page=30`
      const res = await window.devhub.github.request(endpoint)
      return res.data?.workflow_runs || []
    }
  })

  // Run Jobs Query (for detailed step breakdown of selected run)
  const { data: runJobsData } = useQuery({
    queryKey: ['github', 'runJobs', owner, repo, selectedRunId],
    enabled: Boolean(selectedRunId),
    refetchInterval: (query) => {
      // Poll every 5s if any job is in progress or queued
      const jobs = query.state.data || []
      const inProgress = jobs.some((j: any) => j.status !== 'completed')
      return inProgress ? 5000 : false
    },
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/actions/runs/${selectedRunId}/jobs`)
      return res.data?.jobs || []
    }
  })

  // Artifacts Query
  const { data: artifactsData } = useQuery({
    queryKey: ['github', 'artifacts', owner, repo],
    enabled: activeTab === 'artifacts',
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/actions/artifacts`)
      return res.data?.artifacts || []
    }
  })

  // Secrets Query
  const { data: secretsData } = useQuery({
    queryKey: ['github', 'secrets', owner, repo],
    enabled: activeTab === 'secrets',
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${repo}/actions/secrets`)
      return res.data?.secrets || []
    }
  })

  // Dispatch Workflow Handler
  const handleDispatchWorkflow = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dispatchModalWorkflow) return
    setDispatching(true)

    try {
      let inputsObj = {}
      if (dispatchInputs.trim()) {
        try { inputsObj = JSON.parse(dispatchInputs) } catch {}
      }

      await window.devhub.github.request(`/repos/${owner}/${repo}/actions/workflows/${dispatchModalWorkflow.id}/dispatches`, {
        method: 'POST',
        body: {
          ref: dispatchRef,
          inputs: inputsObj
        }
      })

      setDispatchModalWorkflow(null)
      queryClient.invalidateQueries({ queryKey: ['github', 'actionsRuns', owner, repo] })
    } catch (err: any) {
      alert(`Dispatch failed: ${err.message}`)
    } finally {
      setDispatching(false)
    }
  }

  // Rerun Workflow Run Handler
  const handleRerun = async (runId: number) => {
    try {
      await window.devhub.github.request(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun`, {
        method: 'POST'
      })
      queryClient.invalidateQueries({ queryKey: ['github', 'actionsRuns', owner, repo] })
    } catch (err: any) {
      alert(`Rerun failed: ${err.message}`)
    }
  }

  // Cancel Workflow Run Handler
  const handleCancel = async (runId: number) => {
    try {
      await window.devhub.github.request(`/repos/${owner}/${repo}/actions/runs/${runId}/cancel`, {
        method: 'POST'
      })
      queryClient.invalidateQueries({ queryKey: ['github', 'actionsRuns', owner, repo] })
    } catch (err: any) {
      alert(`Cancel failed: ${err.message}`)
    }
  }

  // Save Secret with Libsodium Sealed-Box Encryption!
  const handleSaveSecret = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!secretName.trim() || !secretValue.trim()) return
    setSavingSecret(true)

    try {
      // 1. Get Repo Public Key
      const keyRes = await window.devhub.github.request(`/repos/${owner}/${repo}/actions/secrets/public-key`)
      const { key: publicKey, key_id: keyId } = keyRes.data

      // 2. Encrypt value client-side via IPC sealed-box
      const encryptedValue = await window.devhub.github.encryptSecret(secretValue.trim(), publicKey)

      // 3. Put Encrypted Secret
      await window.devhub.github.request(`/repos/${owner}/${repo}/actions/secrets/${secretName.trim()}`, {
        method: 'PUT',
        body: {
          encrypted_value: encryptedValue,
          key_id: keyId
        }
      })

      setIsSecretModalOpen(false)
      setSecretName('')
      setSecretValue('')
      queryClient.invalidateQueries({ queryKey: ['github', 'secrets', owner, repo] })
    } catch (err: any) {
      alert(`Failed to save secret: ${err.message}`)
    } finally {
      setSavingSecret(false)
    }
  }

  if (loadingWorkflows) return <Loading what="Loading GitHub Actions Workflows..." />

  return (
    <div className="flex flex-col gap-6 text-xs text-[#c9d1d9] font-sans pb-16">
      {/* Header Tabs */}
      <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
        <div className="flex items-center gap-6 font-semibold text-xs text-[#8b949e]">
          <button
            onClick={() => setActiveTab('runs')}
            className={`flex items-center gap-1.5 pb-2 border-b-2 transition-colors ${activeTab === 'runs' ? 'border-[#58a6ff] text-[#f0f6fc]' : 'border-transparent hover:text-[#c9d1d9]'}`}
          >
            <PlayCircle className="w-4 h-4" /> Workflow Runs
          </button>

          <button
            onClick={() => setActiveTab('artifacts')}
            className={`flex items-center gap-1.5 pb-2 border-b-2 transition-colors ${activeTab === 'artifacts' ? 'border-[#58a6ff] text-[#f0f6fc]' : 'border-transparent hover:text-[#c9d1d9]'}`}
          >
            <Package className="w-4 h-4" /> Artifacts
          </button>

          <button
            onClick={() => setActiveTab('secrets')}
            className={`flex items-center gap-1.5 pb-2 border-b-2 transition-colors ${activeTab === 'secrets' ? 'border-[#58a6ff] text-[#f0f6fc]' : 'border-transparent hover:text-[#c9d1d9]'}`}
          >
            <Key className="w-4 h-4 text-[#e3b341]" /> Actions Secrets
          </button>
        </div>

        {activeTab === 'secrets' && (
          <button
            onClick={() => setIsSecretModalOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white rounded font-semibold text-xs"
          >
            <Plus className="w-3.5 h-3.5" /> New Secret
          </button>
        )}
      </div>

      {/* Workflow Runs Tab */}
      {activeTab === 'runs' && (
        <div className="grid grid-cols-4 gap-6">
          {/* Workflows Sidebar Filter */}
          <div className="col-span-1 bg-[#0d1117] border border-[#30363d] rounded-lg p-3 space-y-2">
            <h4 className="font-semibold text-[11px] text-[#8b949e] uppercase tracking-wider px-2">Workflows</h4>
            <button
              onClick={() => setSelectedWorkflowId(null)}
              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors font-medium truncate ${selectedWorkflowId === null ? 'bg-[#161b22] text-[#58a6ff] border border-[#30363d]' : 'text-[#c9d1d9] hover:bg-[#161b22]/50'}`}
            >
              All Workflows
            </button>

            {workflowsData.map((wf: any) => (
              <div key={wf.id} className="flex items-center justify-between group">
                <button
                  onClick={() => setSelectedWorkflowId(wf.id)}
                  className={`flex-1 text-left px-3 py-2 rounded text-xs transition-colors truncate font-mono ${selectedWorkflowId === wf.id ? 'bg-[#161b22] text-[#58a6ff] border border-[#30363d]' : 'text-[#c9d1d9] hover:bg-[#161b22]/50'}`}
                >
                  {wf.name}
                </button>
                <button
                  onClick={() => setDispatchModalWorkflow(wf)}
                  className="p-1.5 text-[#8b949e] hover:text-[#3fb950] opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Run workflow dispatch"
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Runs List & Details */}
          <div className="col-span-3 space-y-4">
            {loadingRuns ? (
              <Loading what="Loading Workflow Runs..." />
            ) : runsData.length === 0 ? (
              <Empty title="No workflow runs found" hint="Trigger a workflow run or push commits to initiate CI." />
            ) : (
              <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]/40">
                {runsData.map((run: any) => {
                  const isSuccess = run.conclusion === 'success'
                  const isFailed = run.conclusion === 'failure' || run.conclusion === 'cancelled'
                  const isRunning = run.status === 'in_progress' || run.status === 'queued'
                  const isExpanded = selectedRunId === run.id

                  return (
                    <div key={run.id} className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          {isRunning ? (
                            <div className="w-4 h-4 border-2 border-[#e3b341] border-t-transparent rounded-full animate-spin shrink-0" />
                          ) : isSuccess ? (
                            <CheckCircle2 className="w-4 h-4 text-[#3fb950] shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-[#f85149] shrink-0" />
                          )}

                          <div className="flex flex-col min-w-0">
                            <span
                              onClick={() => setSelectedRunId(isExpanded ? null : run.id)}
                              className="font-semibold text-xs text-[#f0f6fc] hover:text-[#58a6ff] cursor-pointer truncate"
                            >
                              {run.display_title || run.name}
                            </span>
                            <div className="flex items-center gap-2 text-[11px] text-[#8b949e]">
                              <span className="font-mono">{run.head_branch}</span>
                              <span>·</span>
                              <span>{run.event}</span>
                              <span>·</span>
                              <span>by {run.actor?.login}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isRunning ? (
                            <button
                              onClick={() => handleCancel(run.id)}
                              className="px-2.5 py-1 bg-[#3d1308] border border-[#f85149]/40 text-[#f85149] rounded text-[11px] font-semibold"
                            >
                              Cancel
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRerun(run.id)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-[#161b22] hover:bg-[#30363d] text-[#c9d1d9] rounded border border-[#30363d] text-[11px]"
                            >
                              <RotateCw className="w-3 h-3" /> Re-run
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Job Steps Breakdown when clicked */}
                      {isExpanded && (
                        <div className="pt-3 border-t border-[#30363d]/40 space-y-2">
                          <h5 className="font-semibold text-[11px] text-[#8b949e] uppercase font-mono">Job Execution Steps</h5>
                          {!runJobsData ? (
                            <Loading what="Loading Jobs..." />
                          ) : runJobsData.length === 0 ? (
                            <div className="text-[#8b949e]">No jobs found.</div>
                          ) : (
                            runJobsData.map((job: any) => (
                              <div key={job.id} className="bg-[#161b22] border border-[#30363d] rounded p-3 space-y-2">
                                <div className="flex items-center justify-between font-mono text-xs">
                                  <span className="font-semibold text-[#f0f6fc]">{job.name}</span>
                                  <span className={`text-[10px] px-2 py-0.2 rounded uppercase ${job.conclusion === 'success' ? 'bg-[#0e2a1f] text-[#3fb950]' : 'bg-[#3d1308] text-[#f85149]'}`}>
                                    {job.conclusion || job.status}
                                  </span>
                                </div>
                                <div className="space-y-1 pl-2">
                                  {job.steps?.map((st: any) => (
                                    <div key={st.number} className="flex items-center justify-between text-[11px] text-[#8b949e]">
                                      <span>{st.number}. {st.name}</span>
                                      <span className="font-mono text-[10px]">{st.conclusion}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Artifacts Tab */}
      {activeTab === 'artifacts' && (
        <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]/40">
          {!artifactsData || artifactsData.length === 0 ? (
            <Empty title="No build artifacts" hint="Workflow runs in this repo have not produced artifacts yet." />
          ) : (
            artifactsData.map((art: any) => (
              <div key={art.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-[#58a6ff]" />
                  <div>
                    <div className="font-semibold text-xs text-[#f0f6fc] font-mono">{art.name}</div>
                    <div className="text-[11px] text-[#8b949e]">
                      {(art.size_in_bytes / 1024 / 1024).toFixed(2)} MB · Created {new Date(art.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <a
                  href={art.archive_download_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-[#161b22] hover:bg-[#30363d] text-[#58a6ff] rounded border border-[#30363d] font-semibold text-xs"
                >
                  Download Zip
                </a>
              </div>
            ))
          )}
        </div>
      )}

      {/* Secrets Tab */}
      {activeTab === 'secrets' && (
        <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]/40">
          {!secretsData || secretsData.length === 0 ? (
            <Empty title="No repository secrets" hint="Secrets are encrypted client-side using libsodium sealed-box encryption." />
          ) : (
            secretsData.map((sec: any) => (
              <div key={sec.name} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Lock className="w-4 h-4 text-[#e3b341]" />
                  <div>
                    <div className="font-semibold text-xs text-[#f0f6fc] font-mono">{sec.name}</div>
                    <div className="text-[11px] text-[#8b949e]">Updated {new Date(sec.updated_at).toLocaleDateString()}</div>
                  </div>
                </div>

                <span className="text-[10px] font-mono text-[#8b949e] bg-[#161b22] px-2 py-1 rounded border border-[#30363d]">
                  Encrypted Value Hidden
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Workflow Dispatch Modal */}
      {dispatchModalWorkflow && (
        <div className="fixed inset-0 z-50 bg-[#000000]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleDispatchWorkflow} className="w-[440px] bg-[#0d1117] border border-[#30363d] rounded-xl p-6 space-y-4 text-xs">
            <h3 className="font-semibold text-sm text-[#f0f6fc]">Run Workflow: {dispatchModalWorkflow.name}</h3>

            <div>
              <label className="block text-[#8b949e] mb-1 font-mono">Branch / Ref</label>
              <input
                type="text"
                required
                value={dispatchRef}
                onChange={(e) => setDispatchRef(e.target.value)}
                className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 font-mono text-xs text-[#c9d1d9]"
              />
            </div>

            <div>
              <label className="block text-[#8b949e] mb-1 font-mono">Inputs (JSON)</label>
              <textarea
                rows={4}
                value={dispatchInputs}
                onChange={(e) => setDispatchInputs(e.target.value)}
                className="w-full bg-[#000000] border border-[#30363d] rounded p-3 font-mono text-xs text-[#c9d1d9]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#30363d]">
              <button type="button" onClick={() => setDispatchModalWorkflow(null)} className="px-3 py-1.5 bg-[#21262d] text-[#c9d1d9] rounded">Cancel</button>
              <button type="submit" disabled={dispatching} className="px-4 py-1.5 bg-[#238636] text-white font-semibold rounded">
                {dispatching ? 'Dispatching...' : 'Run Workflow'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Encrypted Secret Modal */}
      {isSecretModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#000000]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSaveSecret} className="w-[440px] bg-[#0d1117] border border-[#30363d] rounded-xl p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-[#30363d] pb-3">
              <Lock className="w-4 h-4 text-[#e3b341]" />
              <h3 className="font-semibold text-sm text-[#f0f6fc]">Add Encrypted Repository Secret</h3>
            </div>

            <div>
              <label className="block text-[#8b949e] mb-1 font-mono uppercase text-[10px]">Secret Name</label>
              <input
                type="text"
                required
                placeholder="e.g. DEPLOY_TOKEN"
                value={secretName}
                onChange={(e) => setSecretName(e.target.value.toUpperCase())}
                className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 font-mono text-xs text-[#c9d1d9]"
              />
            </div>

            <div>
              <label className="block text-[#8b949e] mb-1 font-mono uppercase text-[10px]">Secret Value</label>
              <textarea
                rows={4}
                required
                placeholder="Secret value will be encrypted client-side using libsodium sealed-box before sending..."
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                className="w-full bg-[#000000] border border-[#30363d] rounded p-3 font-mono text-xs text-[#c9d1d9]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#30363d]">
              <button type="button" onClick={() => setIsSecretModalOpen(false)} className="px-3 py-1.5 bg-[#21262d] text-[#c9d1d9] rounded">Cancel</button>
              <button type="submit" disabled={savingSecret} className="px-4 py-1.5 bg-[#238636] text-white font-semibold rounded">
                {savingSecret ? 'Encrypting & Saving...' : 'Save Encrypted Secret'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
