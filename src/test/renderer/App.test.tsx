import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppStateProvider, useApp } from '../../renderer/state'
import App from '../../renderer/App'

vi.mock('../../renderer/components/TopNav', () => ({
  default: function MockTopNav() {
    const { setView } = useApp()
    return <button onClick={() => setView({ kind: 'github' })}>Open GitHub</button>
  },
}))

vi.mock('../../renderer/components/CodexPage', () => ({ default: () => <div>Codex workspace</div> }))
vi.mock('../../renderer/components/GithubPage', () => ({ default: () => <div>GitHub workspace</div> }))
vi.mock('../../renderer/components/ClaudePage', () => ({ default: () => <div>Claude workspace</div> }))
vi.mock('../../renderer/components/AntigravityPage', () => ({ default: () => <div>Antigravity workspace</div> }))
vi.mock('../../renderer/components/CustomAppPage', () => ({ default: () => <div>Custom workspace</div> }))
vi.mock('../../renderer/modules/inbox/Inbox', () => ({ default: () => <div>Inbox workspace</div> }))
vi.mock('../../renderer/modules/settings/Settings', () => ({ default: () => <div>Settings workspace</div> }))
vi.mock('../../renderer/modules/terminal-hub/TerminalHub', () => ({ default: () => <div>Terminal workspace</div> }))
vi.mock('../../renderer/modules/mimir/App', () => ({ default: () => <div>Mimir workspace</div> }))
vi.mock('../../renderer/modules/command-palette/Palette', () => ({ default: () => null }))
vi.mock('../../renderer/modules/mimir/components/DynamicIsland', () => ({ DynamicIsland: () => null }))

describe('App routing', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('devhub_view', JSON.stringify({ kind: 'agent', agentId: 'codex' }))
    window.devhub = {
      settings: {
        get: vi.fn().mockResolvedValue({ accent: 'blue', fontFamily: 'inter' }),
        set: vi.fn(),
        onChanged: vi.fn(() => vi.fn()),
      },
      status: {
        get: vi.fn().mockResolvedValue(null),
        onChanged: vi.fn(() => vi.fn()),
      },
      agents: {
        list: vi.fn().mockResolvedValue([]),
        onChanged: vi.fn(() => vi.fn()),
      },
      palette: { onOpen: vi.fn(() => vi.fn()) },
    } as unknown as typeof window.devhub
  })

  it('mounts only the active workspace and switches routes through app state', async () => {
    render(
      <AppStateProvider>
        <App />
      </AppStateProvider>,
    )

    expect(await screen.findByText('Codex workspace')).toBeInTheDocument()
    expect(screen.queryByText('GitHub workspace')).not.toBeInTheDocument()

    screen.getByRole('button', { name: 'Open GitHub' }).click()

    await waitFor(() => expect(screen.getByText('GitHub workspace')).toBeInTheDocument())
    expect(screen.queryByText('Codex workspace')).not.toBeInTheDocument()
  })
})
