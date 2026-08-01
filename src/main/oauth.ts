import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { shell } from 'electron'
import { log } from './db'

export interface LoopbackOutcome {
  code: string
  redirectUri: string
  codeVerifier: string
  codeChallenge: string
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const PAGE = (title: string, detail: string): string => `<!doctype html>
<html><head><meta charset="utf-8"><title>DevHub</title>
<style>
  html,body{margin:0;height:100%;background:#0a0a0b;color:#e7e7ea;
    font:13px/1.6 "JetBrains Mono","IBM Plex Mono",ui-monospace,monospace;
    display:flex;align-items:center;justify-content:center}
  div{text-align:center}
  b{color:#1d9bf0;font-weight:500}
  p{color:#8a8a93}
</style></head>
<body><div><b>${title}</b><p>${detail}</p></div></body></html>`

/**
 * Loopback (127.0.0.1) authorization-code flow with PKCE — the correct grant
 * for installed desktop apps. Binds an ephemeral port, opens the system
 * browser, and resolves once the provider redirects back.
 */
export function runLoopbackFlow(
  buildAuthUrl: (args: { redirectUri: string; state: string; codeChallenge: string }) => string,
  timeoutMs = 5 * 60 * 1000
): Promise<LoopbackOutcome> {
  return new Promise<LoopbackOutcome>((resolve, reject) => {
    const state = b64url(randomBytes(24))
    const codeVerifier = b64url(randomBytes(48))
    const codeChallenge = b64url(createHash('sha256').update(codeVerifier).digest())

    let settled = false
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1`)
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const err = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      const gotState = url.searchParams.get('state')

      if (err) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(PAGE('Authorization denied', escapeHtml(err)))
        finish(new Error(`provider returned error: ${err}`))
        return
      }
      if (!code) {
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
        res.end(PAGE('Missing code', 'The provider did not return an authorization code.'))
        finish(new Error('no authorization code in redirect'))
        return
      }
      if (gotState !== state) {
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
        res.end(PAGE('State mismatch', 'Discarding this response.'))
        finish(new Error('OAuth state mismatch — response discarded'))
        return
      }

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(PAGE('Connected', 'You can close this tab and return to DevHub.'))
      finish(null, code)
    })

    const timer = setTimeout(() => finish(new Error('authorization timed out after 5 minutes')), timeoutMs)

    function finish(err: Error | null, code?: string): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      // give the browser a moment to render the page before the socket dies
      setTimeout(() => server.close(), 250)
      if (err) reject(err)
      else
        resolve({
          code: code as string,
          redirectUri: redirectUri as string,
          codeVerifier,
          codeChallenge
        })
    }

    let redirectUri: string | null = null
    server.on('error', (e) => finish(e as Error))
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      redirectUri = `http://127.0.0.1:${port}/callback`
      let authUrl: string
      try {
        authUrl = buildAuthUrl({ redirectUri, state, codeChallenge })
      } catch (e) {
        // a missing client id must fail here, not sit on the socket until timeout
        finish(e as Error)
        return
      }
      log('info', 'oauth', `loopback listening on ${redirectUri}`)
      void shell.openExternal(authUrl)
    })
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
