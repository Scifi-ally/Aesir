import { useEffect, useState } from 'react'
import type { AgentId } from '@shared/types'
import { Button, InlineError, Loading } from '../../components/ui'

/** Reads and writes the tool's real config file — no synthesized content. */
export default function ConfigEditor({
  agentId,
  name,
  onClose
}: {
  agentId: AgentId
  name: string
  onClose: () => void
}): React.JSX.Element {
  const [state, setState] = useState<{
    path: string | null
    exists: boolean
    content: string
  } | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setError(null)
    window.devhub.agents
      .readConfig(agentId)
      .then((r) => {
        setState(r)
        setDraft(r.content)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [agentId])

  if (loading) return <Loading what={`reading ${name} config`} />

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline gap-3 px-4 pt-3">
        <span style={{ color: 'var(--fg-0)' }}>{name} config</span>
        <span className="truncate" style={{ color: 'var(--fg-2)' }} title={state?.path ?? ''}>
          {state?.path ?? 'unknown path'}
        </span>
        <div className="ml-auto flex gap-1">
          {state?.path && (
            <Button onClick={() => void window.devhub.app.showItemInFolder(state.path as string)}>
              reveal
            </Button>
          )}
          <Button
            kind="accent"
            onClick={() => {
              setError(null)
              setSaved(null)
              window.devhub.agents
                .writeConfig(agentId, draft)
                .then((r) => setSaved(r.path))
                .catch((e: Error) => setError(e.message))
            }}
          >
            save
          </Button>
          <Button onClick={onClose}>close</Button>
        </div>
      </div>

      {!state?.exists && (
        <div className="px-4 pt-2" style={{ color: 'var(--warn)' }}>
          this file does not exist yet — saving will create it
        </div>
      )}
      {error && (
        <div className="px-4 pt-2">
          <InlineError message={error} />
        </div>
      )}
      {saved && (
        <div className="px-4 pt-2" style={{ color: 'var(--ok)' }}>
          wrote {saved}
        </div>
      )}

      <div className="mt-3 min-h-0 flex-1 px-4 pb-4">
        <textarea
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          className="h-full w-full resize-none bg-[var(--bg-1)] px-3 py-2 outline-none"
          style={{ tabSize: 2 }}
        />
      </div>
    </div>
  )
}
