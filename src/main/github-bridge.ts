import { vaultGet, vaultGetJson, vaultSet, vaultSetJson, vaultDelete } from './vault'
import { getSettings, setSettings } from './settings'
import { log } from './db'

export interface RateLimitInfo {
  limit: number
  remaining: number
  reset: number
  used?: number
  resource?: string
}

export interface RateLimitState {
  rest: RateLimitInfo
  graphql: RateLimitInfo
}

const etagCache = new Map<string, { etag: string; data: any; status: number }>()

const rateLimitState: RateLimitState = {
  rest: { limit: 5000, remaining: 5000, reset: Math.floor(Date.now() / 1000) + 3600 },
  graphql: { limit: 5000, remaining: 5000, reset: Math.floor(Date.now() / 1000) + 3600 }
}

export function getStoredGithubToken(): string | null {
  // Check vault first
  const creds = vaultGetJson<{ accessToken: string } | string>('github:credentials')
  if (creds) {
    if (typeof creds === 'string') return creds
    if (creds.accessToken) return creds.accessToken
  }
  const token = vaultGet('github:token')
  if (token) return token

  // Fallback to settings and migrate to vault
  const settingsToken = getSettings().githubToken
  if (settingsToken) {
    saveGithubToken(settingsToken)
    return settingsToken
  }
  return null
}

export function saveGithubToken(token: string | { accessToken: string; refreshToken?: string; expiresIn?: number; scope?: string }): void {
  const tokenStr = typeof token === 'string' ? token : token.accessToken
  const payload = typeof token === 'string' ? { accessToken: token } : token
  vaultSetJson('github:credentials', payload)
  vaultSet('github:token', tokenStr)
  setSettings({ githubToken: tokenStr })
}

export function clearGithubToken(): void {
  vaultDelete('github:credentials')
  vaultDelete('github:token')
  setSettings({ githubToken: null })
  etagCache.clear()
}

function updateRateLimitFromHeaders(headers: Headers, isGraphQL = false): void {
  const limit = headers.get('x-ratelimit-limit')
  const remaining = headers.get('x-ratelimit-remaining')
  const reset = headers.get('x-ratelimit-reset')
  const used = headers.get('x-ratelimit-used')
  const resource = headers.get('x-ratelimit-resource')

  const target = isGraphQL ? rateLimitState.graphql : rateLimitState.rest

  if (limit) target.limit = parseInt(limit, 10)
  if (remaining) target.remaining = parseInt(remaining, 10)
  if (reset) target.reset = parseInt(reset, 10)
  if (used) target.used = parseInt(used, 10)
  if (resource) target.resource = resource
}

export function getRateLimit(): RateLimitState {
  return rateLimitState
}

export async function requestRest(
  endpoint: string,
  options: {
    method?: string
    body?: any
    headers?: Record<string, string>
    useCache?: boolean
  } = {}
): Promise<{ data: any; status: number; headers: Record<string, string> }> {
  const token = getStoredGithubToken()
  if (!token) {
    throw new Error('UNAUTHORIZED: No GitHub token found in vault')
  }

  const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint.startsWith('/') ? '' : '/'}${endpoint}`
  const reqHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'DevHub-Desktop-App',
    ...options.headers
  }

  const method = (options.method || 'GET').toUpperCase()

  // ETag conditional request support for GET
  if (method === 'GET' && options.useCache !== false) {
    const cached = etagCache.get(url)
    if (cached?.etag) {
      reqHeaders['If-None-Match'] = cached.etag
    }
  }

  const fetchOptions: RequestInit = {
    method,
    headers: reqHeaders
  }

  if (options.body) {
    if (typeof options.body === 'string') {
      fetchOptions.body = options.body
    } else {
      fetchOptions.body = JSON.stringify(options.body)
      reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json'
    }
  }

  const response = await fetch(url, fetchOptions)
  updateRateLimitFromHeaders(response.headers, false)

  const resHeaders: Record<string, string> = {}
  response.headers.forEach((val, key) => {
    resHeaders[key.toLowerCase()] = val
  })

  // Handle 304 Not Modified
  if (response.status === 304) {
    const cached = etagCache.get(url)
    if (cached) {
      return { data: cached.data, status: 304, headers: resHeaders }
    }
  }

  // Handle 404 Not Found for GET requests without throwing unhandled API errors
  if (response.status === 404 && method === 'GET') {
    return { data: null, status: 404, headers: resHeaders }
  }

  // Handle errors
  if (!response.ok) {
    let errorMsg = `GitHub API request failed (${response.status} ${response.statusText})`
    try {
      const errorData = await response.json()
      if (errorData.message) {
        errorMsg = errorData.message
      }
    } catch {
      // ignore json parse error
    }

    if (response.status === 401) {
      log('warn', 'github-bridge', 'Token returned 401 Unauthorized')
      throw new Error(`UNAUTHORIZED: ${errorMsg}`)
    }

    if (response.status === 403) {
      if (rateLimitState.rest.remaining === 0 || errorMsg.toLowerCase().includes('rate limit')) {
        throw new Error(`RATE_LIMIT_EXCEEDED: ${errorMsg}`)
      }
      throw new Error(`FORBIDDEN: ${errorMsg}`)
    }

    throw new Error(`API_ERROR (${response.status}): ${errorMsg}`)
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return { data: null, status: 204, headers: resHeaders }
  }

  const responseData = await response.json()

  // Save to ETag cache if GET
  if (method === 'GET' && resHeaders['etag']) {
    etagCache.set(url, { etag: resHeaders['etag'], data: responseData, status: response.status })
  }

  return { data: responseData, status: response.status, headers: resHeaders }
}

export async function requestGraphQL(
  query: string,
  variables: Record<string, any> = {}
): Promise<{ data: any; errors?: any[] }> {
  const token = getStoredGithubToken()
  if (!token) {
    throw new Error('UNAUTHORIZED: No GitHub token found in vault')
  }

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'DevHub-Desktop-App'
    },
    body: JSON.stringify({ query, variables })
  })

  updateRateLimitFromHeaders(response.headers, true)

  if (!response.ok) {
    let errorMsg = `GraphQL HTTP error ${response.status}`
    try {
      const errJson = await response.json()
      if (errJson.message) errorMsg = errJson.message
    } catch {}
    if (response.status === 401) throw new Error(`UNAUTHORIZED: ${errorMsg}`)
    if (response.status === 403) throw new Error(`FORBIDDEN: ${errorMsg}`)
    throw new Error(`API_ERROR (${response.status}): ${errorMsg}`)
  }

  const json = await response.json()
  if (json.errors && json.errors.length > 0) {
    log('warn', 'github-bridge', `GraphQL errors: ${JSON.stringify(json.errors)}`)
  }
  return json
}

export async function requestDeviceCode(clientId: string, scope: string) {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope })
  })
  return await res.json()
}

export async function requestAccessToken(clientId: string, deviceCode: string) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    })
  })
  const data = await res.json()
  if (data.access_token) {
    saveGithubToken({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: data.scope
    })
  }
  return data
}

export function encryptGithubSecret(secretValue: string, publicKeyBase64: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sodium = require('tweetsodium')
  const messageBytes = Buffer.from(secretValue)
  const keyBytes = Buffer.from(publicKeyBase64, 'base64')
  const encryptedBytes = sodium.seal(messageBytes, keyBytes)
  return Buffer.from(encryptedBytes).toString('base64')
}

