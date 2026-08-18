import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()

vi.stubGlobal('fetch', fetchMock)

vi.mock('../../../main/vault', () => ({
  vaultGetJson: vi.fn(() => ({ clientId: 'test-client', tenant: 'common' })),
  vaultGet: vi.fn(() => 'serialized-cache'),
  vaultSet: vi.fn(),
  vaultSetJson: vi.fn(),
  vaultDelete: vi.fn(),
  vaultKey: {
    oauthClient: (provider: string) => `oauth:${provider}`,
  },
}))

vi.mock('../../../main/oauth', () => ({
  runLoopbackFlow: vi.fn(),
}))

vi.mock('../../../main/db', () => ({
  log: vi.fn(),
}))

vi.mock('@azure/msal-node', () => ({
  PublicClientApplication: class {
    getTokenCache() {
      return {
        getAllAccounts: vi.fn().mockResolvedValue([{ username: 'user@example.com' }]),
      }
    }
    acquireTokenSilent() {
      return Promise.resolve({ accessToken: 'test-access-token' })

    }
  },
  LogLevel: { Error: 0 },
}))

describe('outlookList', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ value: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  it.each([
    ['sentitems', 'SENT'],
    ['drafts', 'DRAFT'],
    ['deleteditems', 'TRASH'],
  ])('uses the %s Outlook folder for %s', async (folderId, label) => {
    const { outlookList } = await import('../../../main/mail/outlook')
    const headers = await outlookList('outlook:user@example.com', 'user@example.com', { folderId, label })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/me/mailFolders/${folderId}/messages`)
    expect(headers).toEqual([])
  })
})
