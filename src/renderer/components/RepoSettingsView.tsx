import React, { useState, useEffect } from 'react'
import {
  Settings,
  Users,
  Webhook,
  Key,
  Shield,
  AlertTriangle,
  Trash2,
  Archive,
  Save,
  Check,
  Plus,
  RefreshCw,
  Lock
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loading, Empty } from './ui'

interface RepoSettingsViewProps {
  repo: any
  onRepoUpdated: () => void
  onRepoDeleted: () => void
}

export function RepoSettingsView({ repo, onRepoUpdated, onRepoDeleted }: RepoSettingsViewProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const owner = repo.owner.login
  const name = repo.name

  const [activeTab, setActiveTab] = useState<'general' | 'collaborators' | 'webhooks' | 'deploy_keys'>('general')

  // General state
  const [repoName, setRepoName] = useState(repo.name)
  const [description, setDescription] = useState(repo.description || '')
  const [topicsStr, setTopicsStr] = useState('')
  const [defaultBranch, setDefaultBranch] = useState(repo.default_branch || 'main')

  const [hasIssues, setHasIssues] = useState(repo.has_issues ?? true)
  const [hasProjects, setHasProjects] = useState(repo.has_projects ?? true)
  const [hasWiki, setHasWiki] = useState(repo.has_wiki ?? true)
  const [hasDiscussions, setHasDiscussions] = useState(repo.has_discussions ?? false)
  const [isPrivate, setIsPrivate] = useState(repo.private ?? false)

  const [savingGeneral, setSavingGeneral] = useState(false)
  const [generalMessage, setGeneralMessage] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)

  // Danger zone state
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Collaborators Tab State
  const [collabUsername, setCollabUsername] = useState('')
  const [collabPermission, setCollabPermission] = useState('push')
  const [addingCollab, setAddingCollab] = useState(false)

  // Webhook Tab State
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [creatingWebhook, setCreatingWebhook] = useState(false)

  // Deploy Keys Tab State
  const [keyTitle, setKeyTitle] = useState('')
  const [keyBody, setKeyBody] = useState('')
  const [keyReadOnly, setKeyReadOnly] = useState(true)
  const [creatingKey, setCreatingKey] = useState(false)

  useEffect(() => {
    setRepoName(repo.name)
    setDescription(repo.description || '')
    setDefaultBranch(repo.default_branch || 'main')
    setHasIssues(repo.has_issues ?? true)
    setHasProjects(repo.has_projects ?? true)
    setHasWiki(repo.has_wiki ?? true)
    setHasDiscussions(repo.has_discussions ?? false)
    setIsPrivate(repo.private ?? false)

    window.devhub.github.request(`/repos/${owner}/${name}/topics`, {
      headers: { Accept: 'application/vnd.github.mercy-preview+json' }
    }).then(res => {
      if (res.data?.names) setTopicsStr(res.data.names.join(', '))
    }).catch(() => {})
  }, [repo, owner, name])

  // Collaborators Query
  const { data: collaborators = [], isLoading: loadingCollabs } = useQuery({
    queryKey: ['github', 'collaborators', owner, name],
    enabled: activeTab === 'collaborators',
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${name}/collaborators`)
      return res.data || []
    }
  })

  // Webhooks Query
  const { data: webhooks = [], isLoading: loadingHooks } = useQuery({
    queryKey: ['github', 'webhooks', owner, name],
    enabled: activeTab === 'webhooks',
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${name}/hooks`)
      return res.data || []
    }
  })

  // Deploy Keys Query
  const { data: deployKeys = [], isLoading: loadingKeys } = useQuery({
    queryKey: ['github', 'deployKeys', owner, name],
    enabled: activeTab === 'deploy_keys',
    queryFn: async () => {
      const res = await window.devhub.github.request(`/repos/${owner}/${name}/keys`)
      return res.data || []
    }
  })

  // Handlers
  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingGeneral(true)
    setGeneralMessage(null)

    try {
      await window.devhub.github.request(`/repos/${owner}/${name}`, {
        method: 'PATCH',
        body: {
          name: repoName.trim(),
          description: description.trim(),
          default_branch: defaultBranch.trim(),
          has_issues: hasIssues,
          has_projects: hasProjects,
          has_wiki: hasWiki,
          has_discussions: hasDiscussions,
          private: isPrivate
        }
      })

      const topicsArr = topicsStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
      await window.devhub.github.request(`/repos/${owner}/${repoName.trim()}/topics`, {
        method: 'PUT',
        headers: { Accept: 'application/vnd.github.mercy-preview+json' },
        body: { names: topicsArr }
      })

      setGeneralMessage({ kind: 'success', msg: 'Repository settings updated successfully' })
      queryClient.invalidateQueries({ queryKey: ['github'] })
      onRepoUpdated()
    } catch (err: any) {
      setGeneralMessage({ kind: 'error', msg: err.message || 'Failed to update repository settings' })
    } finally {
      setSavingGeneral(false)
    }
  }

  const handleDelete = async () => {
    if (deleteConfirmText !== `${owner}/${name}`) return
    setIsDeleting(true)
    setDeleteError(null)

    try {
      await window.devhub.github.request(`/repos/${owner}/${name}`, { method: 'DELETE' })
      onRepoDeleted()
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete repository')
    } finally {
      setIsDeleting(false)
    }
  }

  // Collaborators CRUD
  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!collabUsername.trim()) return
    setAddingCollab(true)

    try {
      await window.devhub.github.request(`/repos/${owner}/${name}/collaborators/${collabUsername.trim()}`, {
        method: 'PUT',
        body: { permission: collabPermission }
      })
      setCollabUsername('')
      queryClient.invalidateQueries({ queryKey: ['github', 'collaborators', owner, name] })
    } catch (err: any) {
      alert(`Failed to add collaborator: ${err.message}`)
    } finally {
      setAddingCollab(false)
    }
  }

  const handleRemoveCollaborator = async (username: string) => {
    if (!confirm(`Remove ${username} from collaborators?`)) return
    try {
      await window.devhub.github.request(`/repos/${owner}/${name}/collaborators/${username}`, {
        method: 'DELETE'
      })
      queryClient.invalidateQueries({ queryKey: ['github', 'collaborators', owner, name] })
    } catch (err: any) {
      alert(`Failed to remove collaborator: ${err.message}`)
    }
  }

  // Webhooks CRUD
  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!webhookUrl.trim()) return
    setCreatingWebhook(true)

    try {
      await window.devhub.github.request(`/repos/${owner}/${name}/hooks`, {
        method: 'POST',
        body: {
          name: 'web',
          active: true,
          events: ['push', 'pull_request'],
          config: {
            url: webhookUrl.trim(),
            content_type: 'json',
            secret: webhookSecret.trim()
          }
        }
      })
      setWebhookUrl('')
      setWebhookSecret('')
      queryClient.invalidateQueries({ queryKey: ['github', 'webhooks', owner, name] })
    } catch (err: any) {
      alert(`Failed to create webhook: ${err.message}`)
    } finally {
      setCreatingWebhook(false)
    }
  }

  const handleDeleteWebhook = async (hookId: number) => {
    if (!confirm('Delete webhook?')) return
    try {
      await window.devhub.github.request(`/repos/${owner}/${name}/hooks/${hookId}`, { method: 'DELETE' })
      queryClient.invalidateQueries({ queryKey: ['github', 'webhooks', owner, name] })
    } catch (err: any) {
      alert(`Failed to delete webhook: ${err.message}`)
    }
  }

  // Deploy Keys CRUD
  const handleCreateDeployKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyTitle.trim() || !keyBody.trim()) return
    setCreatingKey(true)

    try {
      await window.devhub.github.request(`/repos/${owner}/${name}/keys`, {
        method: 'POST',
        body: {
          title: keyTitle.trim(),
          key: keyBody.trim(),
          read_only: keyReadOnly
        }
      })
      setKeyTitle('')
      setKeyBody('')
      queryClient.invalidateQueries({ queryKey: ['github', 'deployKeys', owner, name] })
    } catch (err: any) {
      alert(`Failed to add deploy key: ${err.message}`)
    } finally {
      setCreatingKey(false)
    }
  }

  const handleDeleteDeployKey = async (keyId: number) => {
    if (!confirm('Delete deploy key?')) return
    try {
      await window.devhub.github.request(`/repos/${owner}/${name}/keys/${keyId}`, { method: 'DELETE' })
      queryClient.invalidateQueries({ queryKey: ['github', 'deployKeys', owner, name] })
    } catch (err: any) {
      alert(`Failed to delete deploy key: ${err.message}`)
    }
  }

  return (
    <div className="flex flex-col gap-6 text-xs text-[#c9d1d9] font-sans pb-16">
      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-6 border-b border-[#30363d] pb-3 text-xs font-semibold text-[#8b949e]">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-1.5 pb-2 border-b-2 transition-colors ${activeTab === 'general' ? 'border-[#58a6ff] text-[#f0f6fc]' : 'border-transparent hover:text-[#c9d1d9]'}`}
        >
          <Settings className="w-4 h-4" /> General
        </button>

        <button
          onClick={() => setActiveTab('collaborators')}
          className={`flex items-center gap-1.5 pb-2 border-b-2 transition-colors ${activeTab === 'collaborators' ? 'border-[#58a6ff] text-[#f0f6fc]' : 'border-transparent hover:text-[#c9d1d9]'}`}
        >
          <Users className="w-4 h-4" /> Collaborators
        </button>

        <button
          onClick={() => setActiveTab('webhooks')}
          className={`flex items-center gap-1.5 pb-2 border-b-2 transition-colors ${activeTab === 'webhooks' ? 'border-[#58a6ff] text-[#f0f6fc]' : 'border-transparent hover:text-[#c9d1d9]'}`}
        >
          <Webhook className="w-4 h-4" /> Webhooks
        </button>

        <button
          onClick={() => setActiveTab('deploy_keys')}
          className={`flex items-center gap-1.5 pb-2 border-b-2 transition-colors ${activeTab === 'deploy_keys' ? 'border-[#58a6ff] text-[#f0f6fc]' : 'border-transparent hover:text-[#c9d1d9]'}`}
        >
          <Key className="w-4 h-4" /> Deploy Keys
        </button>
      </div>

      {/* General Tab */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveGeneral} className="bg-[#0d1117] border border-[#30363d] rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-sm text-[#f0f6fc]">General Settings</h3>

            {generalMessage && (
              <div className={`p-3 rounded border text-xs ${generalMessage.kind === 'error' ? 'bg-[#3d1308] border-[#f85149] text-[#f85149]' : 'bg-[#0e2a1f] border-[#238636] text-[#3fb950]'}`}>
                {generalMessage.msg}
              </div>
            )}

            <div>
              <label className="block text-[#8b949e] mb-1 font-mono uppercase text-[10px]">Repository Name</label>
              <input
                type="text"
                required
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9] font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[#8b949e] mb-1 font-mono uppercase text-[10px]">Description</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#000000] border border-[#30363d] rounded p-3 text-xs text-[#c9d1d9]"
              />
            </div>

            <div>
              <label className="block text-[#8b949e] mb-1 font-mono uppercase text-[10px]">Topics (comma separated)</label>
              <input
                type="text"
                value={topicsStr}
                onChange={(e) => setTopicsStr(e.target.value)}
                className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9] font-mono"
              />
            </div>

            <div className="flex justify-end pt-3 border-t border-[#30363d]">
              <button type="submit" disabled={savingGeneral} className="px-4 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white rounded font-semibold text-xs">
                {savingGeneral ? 'Saving...' : 'Save General Settings'}
              </button>
            </div>
          </form>

          {/* Danger Zone */}
          <div className="bg-[#0d1117] border border-[#da3633]/40 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-sm text-[#f85149]">Danger Zone</h3>

            <div className="p-4 bg-[#161b22] border border-[#da3633]/30 rounded-lg space-y-3">
              <div>
                <div className="font-semibold text-xs text-[#f0f6fc]">Delete this repository</div>
                <div className="text-[11px] text-[#8b949e]">Once deleted, this repository cannot be recovered.</div>
              </div>

              <div>
                <label className="block text-[11px] text-[#8b949e] mb-1 font-mono">
                  Type <strong className="text-[#f85149]">{owner}/{name}</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 font-mono text-xs text-[#c9d1d9]"
                />
              </div>

              <button
                onClick={handleDelete}
                disabled={isDeleting || deleteConfirmText !== `${owner}/${name}`}
                className="px-4 py-1.5 bg-[#da3633] hover:bg-[#b82522] text-white font-semibold rounded text-xs disabled:opacity-40"
              >
                {isDeleting ? 'Deleting...' : 'Delete this repository'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collaborators Tab */}
      {activeTab === 'collaborators' && (
        <div className="space-y-6">
          <form onSubmit={handleAddCollaborator} className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-xs text-[#8b949e] uppercase tracking-wider">Invite Collaborator</h4>
            <div className="flex gap-3">
              <input
                type="text"
                required
                placeholder="GitHub username"
                value={collabUsername}
                onChange={(e) => setCollabUsername(e.target.value)}
                className="flex-1 bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9]"
              />
              <select
                value={collabPermission}
                onChange={(e) => setCollabPermission(e.target.value)}
                className="bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#58a6ff] font-mono"
              >
                <option value="pull">Read (Pull)</option>
                <option value="push">Write (Push)</option>
                <option value="admin">Admin</option>
              </select>
              <button type="submit" disabled={addingCollab} className="px-4 py-1.5 bg-[#238636] text-white rounded font-semibold text-xs">
                Invite
              </button>
            </div>
          </form>

          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]/40">
            {loadingCollabs ? (
              <Loading what="Loading Collaborators..." />
            ) : (
              collaborators.map((c: any) => (
                <div key={c.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={c.avatar_url} alt="" className="w-7 h-7 rounded-full border border-[#30363d]" />
                    <span className="font-semibold text-xs text-[#f0f6fc]">{c.login}</span>
                  </div>
                  <button onClick={() => handleRemoveCollaborator(c.login)} className="text-[#8b949e] hover:text-[#f85149]">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Webhooks Tab */}
      {activeTab === 'webhooks' && (
        <div className="space-y-6">
          <form onSubmit={handleCreateWebhook} className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-xs text-[#8b949e] uppercase tracking-wider">Add Webhook</h4>
            <input
              type="url"
              required
              placeholder="Payload URL (https://...)"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9]"
            />
            <input
              type="text"
              placeholder="Secret Token (optional)"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9] font-mono"
            />
            <div className="flex justify-end">
              <button type="submit" disabled={creatingWebhook} className="px-4 py-1.5 bg-[#238636] text-white rounded font-semibold text-xs">
                Save Webhook
              </button>
            </div>
          </form>

          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]/40">
            {webhooks.map((h: any) => (
              <div key={h.id} className="p-4 flex items-center justify-between">
                <div className="font-mono text-xs text-[#58a6ff] truncate max-w-md">{h.config?.url}</div>
                <button onClick={() => handleDeleteWebhook(h.id)} className="text-[#8b949e] hover:text-[#f85149]">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deploy Keys Tab */}
      {activeTab === 'deploy_keys' && (
        <div className="space-y-6">
          <form onSubmit={handleCreateDeployKey} className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-xs text-[#8b949e] uppercase tracking-wider">Add Deploy Key</h4>
            <input
              type="text"
              required
              placeholder="Key Title (e.g. Staging Server)"
              value={keyTitle}
              onChange={(e) => setKeyTitle(e.target.value)}
              className="w-full bg-[#000000] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#c9d1d9]"
            />
            <textarea
              rows={4}
              required
              placeholder="ssh-rsa AAAAB3NzaC1yc2E..."
              value={keyBody}
              onChange={(e) => setKeyBody(e.target.value)}
              className="w-full bg-[#000000] border border-[#30363d] rounded p-3 text-xs text-[#c9d1d9] font-mono"
            />
            <div className="flex justify-end">
              <button type="submit" disabled={creatingKey} className="px-4 py-1.5 bg-[#238636] text-white rounded font-semibold text-xs">
                Add Key
              </button>
            </div>
          </form>

          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]/40">
            {deployKeys.map((k: any) => (
              <div key={k.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-xs text-[#f0f6fc]">{k.title}</div>
                  <div className="font-mono text-[11px] text-[#8b949e]">{k.key?.slice(0, 30)}...</div>
                </div>
                <button onClick={() => handleDeleteDeployKey(k.id)} className="text-[#8b949e] hover:text-[#f85149]">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
