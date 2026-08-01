import type { ConnectorManifest } from './types'

/**
 * Adding a connector means adding an entry here. No UI code changes:
 * Settings > Connections renders forms from `fields` and runs `test` verbatim.
 * `{{field}}` placeholders are substituted in the main process only, so a
 * credential never crosses the IPC bridge back into the renderer.
 */
export const CONNECTOR_MANIFESTS: ConnectorManifest[] = [
  {
    id: 'github',
    name: 'GitHub',
    icon: 'GH',
    blurb: 'Repos, issues, pull requests',
    docsUrl: 'https://github.com/settings/tokens',
    authType: 'api_key',
    fields: [
      {
        key: 'token',
        label: 'Personal access token',
        placeholder: 'ghp_… or github_pat_…',
        secret: true,
        help: 'Settings > Developer settings > Personal access tokens. Scope: read:user (add repo for repo data).'
      }
    ],
    test: {
      method: 'GET',
      url: 'https://api.github.com/user',
      headers: {
        Authorization: 'Bearer {{token}}',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'DevHub'
      },
      identityPath: ['login'],
      detailPath: ['name'],
      errorPath: ['message']
    }
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: 'SL',
    blurb: 'Workspace identity and messaging',
    docsUrl: 'https://api.slack.com/apps',
    authType: 'api_key',
    fields: [
      {
        key: 'token',
        label: 'Bot or user token',
        placeholder: 'xoxb-… / xoxp-…',
        secret: true,
        help: 'Create an app at api.slack.com/apps, install it to the workspace, copy the token from OAuth & Permissions.'
      }
    ],
    test: {
      method: 'POST',
      url: 'https://slack.com/api/auth.test',
      headers: {
        Authorization: 'Bearer {{token}}',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: '',
      okPath: ['ok'],
      identityPath: ['user'],
      detailPath: ['team'],
      errorPath: ['error']
    }
  },
  {
    id: 'linear',
    name: 'Linear',
    icon: 'LN',
    blurb: 'Issues and cycles',
    docsUrl: 'https://linear.app/settings/api',
    authType: 'api_key',
    fields: [
      {
        key: 'apiKey',
        label: 'Personal API key',
        placeholder: 'lin_api_…',
        secret: true,
        help: 'Linear > Settings > API > Personal API keys. Sent raw in the Authorization header (no Bearer prefix).'
      }
    ],
    test: {
      method: 'POST',
      url: 'https://api.linear.app/graphql',
      headers: {
        Authorization: '{{apiKey}}',
        'Content-Type': 'application/json'
      },
      body: '{"query":"{ viewer { id name email } }"}',
      identityPath: ['data', 'viewer', 'name'],
      detailPath: ['data', 'viewer', 'email'],
      errorPath: ['errors', 0, 'message']
    }
  },
  {
    id: 'notion',
    name: 'Notion',
    icon: 'NO',
    blurb: 'Docs and databases',
    docsUrl: 'https://www.notion.so/my-integrations',
    authType: 'api_key',
    fields: [
      {
        key: 'token',
        label: 'Internal integration secret',
        placeholder: 'ntn_… / secret_…',
        secret: true,
        help: 'notion.so/my-integrations > New integration > Internal integration secret.'
      }
    ],
    test: {
      method: 'GET',
      url: 'https://api.notion.com/v1/users/me',
      headers: {
        Authorization: 'Bearer {{token}}',
        'Notion-Version': '2022-06-28'
      },
      identityPath: ['name'],
      detailPath: ['bot', 'workspace_name'],
      errorPath: ['message']
    }
  },
  {
    id: 'vercel',
    name: 'Vercel',
    icon: 'VC',
    blurb: 'Deployments and projects',
    docsUrl: 'https://vercel.com/account/tokens',
    authType: 'api_key',
    fields: [
      {
        key: 'token',
        label: 'Access token',
        placeholder: 'vercel token',
        secret: true,
        help: 'vercel.com/account/tokens > Create token.'
      }
    ],
    test: {
      method: 'GET',
      url: 'https://api.vercel.com/v2/user',
      headers: { Authorization: 'Bearer {{token}}' },
      identityPath: ['user', 'username'],
      detailPath: ['user', 'email'],
      errorPath: ['error', 'message']
    }
  }
]

export function manifestById(id: string): ConnectorManifest | undefined {
  return CONNECTOR_MANIFESTS.find((m) => m.id === id)
}

/** Hosts the renderer's CSP must allow for connect-src, derived from the manifests. */
export function connectorHosts(): string[] {
  const hosts = new Set<string>()
  for (const m of CONNECTOR_MANIFESTS) {
    hosts.add(new URL(m.test.url).origin)
    if (m.oauth) {
      hosts.add(new URL(m.oauth.authUrl).origin)
      hosts.add(new URL(m.oauth.tokenUrl).origin)
    }
  }
  return [...hosts]
}
