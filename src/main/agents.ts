import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentAuthState, AgentId, AgentInfo } from '@shared/types'
import { firstExisting, which } from './lib/which'
import { getSettings } from './settings'

const HOME = homedir()

/** Runs a binary and returns trimmed stdout, or null. Never uses a shell. */
function probe(bin: string, args: string[], timeout = 8000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err && !stdout) return resolve(null)
      const out = `${stdout}${stderr}`.trim()
      resolve(out.length ? out : null)
    })
  })
}

function firstLine(s: string | null): string | null {
  return s ? (s.split(/\r?\n/).find((l) => l.trim().length) ?? null) : null
}

/* ── per-agent auth evidence ──────────────────────────────────────────── */

function claudeAuth(): { auth: AgentAuthState; evidence: string } {
  if (process.env.ANTHROPIC_API_KEY)
    return { auth: 'authenticated', evidence: 'ANTHROPIC_API_KEY is set in the environment' }
  if (process.env.CLAUDE_CODE_USE_BEDROCK === '1' || process.env.CLAUDE_CODE_USE_VERTEX === '1')
    return { auth: 'authenticated', evidence: 'configured for a cloud provider via CLAUDE_CODE_USE_* env' }

  const creds = join(HOME, '.claude', '.credentials.json')
  if (existsSync(creds)) {
    try {
      const j = JSON.parse(readFileSync(creds, 'utf8')) as {
        claudeAiOauth?: { expiresAt?: number }
      }
      const exp = j.claudeAiOauth?.expiresAt
      if (typeof exp === 'number') {
        const when = new Date(exp).toISOString().slice(0, 16).replace('T', ' ')
        return exp > Date.now()
          ? { auth: 'authenticated', evidence: `~/.claude/.credentials.json, token valid to ${when} UTC` }
          : { auth: 'unauthenticated', evidence: `~/.claude/.credentials.json expired ${when} UTC` }
      }
      return { auth: 'authenticated', evidence: '~/.claude/.credentials.json present' }
    } catch {
      return { auth: 'unknown_auth', evidence: '~/.claude/.credentials.json is unreadable' }
    }
  }

  const userCfg = join(HOME, '.claude.json')
  if (existsSync(userCfg)) {
    try {
      const j = JSON.parse(readFileSync(userCfg, 'utf8')) as {
        oauthAccount?: { emailAddress?: string }
      }
      if (j.oauthAccount?.emailAddress)
        return {
          auth: 'authenticated',
          evidence: `~/.claude.json records ${j.oauthAccount.emailAddress}`
        }
    } catch {
      /* fall through to unknown */
    }
  }

  return {
    auth: 'unknown_auth',
    // Windows Claude Code keeps OAuth material in the OS credential store, which
    // DevHub deliberately does not read. Saying "unknown" beats guessing.
    evidence:
      'no ANTHROPIC_API_KEY, no ~/.claude/.credentials.json, no oauthAccount in ~/.claude.json — run `claude` once to check'
  }
}

function codexAuth(): { auth: AgentAuthState; evidence: string } {
  const auth = join(HOME, '.codex', 'auth.json')
  if (existsSync(auth)) {
    try {
      const j = JSON.parse(readFileSync(auth, 'utf8')) as {
        auth_mode?: string
        OPENAI_API_KEY?: string | null
        tokens?: unknown
      }
      const mode = j.auth_mode ?? (j.OPENAI_API_KEY ? 'apikey' : j.tokens ? 'chatgpt' : 'unknown')
      return { auth: 'authenticated', evidence: `~/.codex/auth.json, auth_mode=${mode}` }
    } catch {
      return { auth: 'unknown_auth', evidence: '~/.codex/auth.json is unreadable' }
    }
  }
  if (process.env.OPENAI_API_KEY)
    return { auth: 'authenticated', evidence: 'OPENAI_API_KEY is set in the environment' }
  return { auth: 'unauthenticated', evidence: 'no ~/.codex/auth.json and no OPENAI_API_KEY' }
}

/* ── per-OS install locations ─────────────────────────────────────────── */

function antigravityApp(): string | null {
  const local = process.env.LOCALAPPDATA ?? join(HOME, 'AppData', 'Local')
  if (process.platform === 'win32') {
    return firstExisting([
      join(local, 'Programs', 'Antigravity', 'Antigravity.exe'),
      join(local, 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe'),
      join(local, 'Programs', 'Antigravity IDE', 'Antigravity.exe'),
      'C:\\Program Files\\Antigravity\\Antigravity.exe'
    ])
  }
  if (process.platform === 'darwin') {
    return firstExisting([
      '/Applications/Antigravity.app',
      join(HOME, 'Applications', 'Antigravity.app')
    ])
  }
  return firstExisting([
    '/usr/share/antigravity/antigravity',
    '/opt/Antigravity/antigravity',
    join(HOME, '.local', 'share', 'antigravity', 'antigravity')
  ])
}

function antigravityConfig(): string | null {
  const roaming = process.env.APPDATA ?? join(HOME, 'AppData', 'Roaming')
  if (process.platform === 'win32')
    return firstExisting([
      join(roaming, 'Antigravity', 'User', 'settings.json'),
      join(roaming, 'Antigravity IDE', 'User', 'settings.json')
    ])
  if (process.platform === 'darwin')
    return firstExisting([
      join(HOME, 'Library', 'Application Support', 'Antigravity', 'User', 'settings.json')
    ])
  return firstExisting([join(HOME, '.config', 'Antigravity', 'User', 'settings.json')])
}

/* ── detection ────────────────────────────────────────────────────────── */

export async function detectAgents(): Promise<AgentInfo[]> {
  const now = Date.now()

  const claudeBin = which('claude')
  const codexBin = which('codex')
  const agyBin = which('agy') ?? which('antigravity') ?? which('antigravity-ide')
  const agyApp = antigravityApp()

  const [claudeVer, codexVer, agyVer] = await Promise.all([
    claudeBin ? probe(claudeBin, ['--version']) : Promise.resolve(null),
    codexBin ? probe(codexBin, ['--version']) : Promise.resolve(null),
    agyBin ? probe(agyBin, ['--version']) : Promise.resolve(null)
  ])

  const claudeA = claudeBin ? claudeAuth() : { auth: 'unknown_auth' as AgentAuthState, evidence: 'not installed' }
  const codexA = codexBin ? codexAuth() : { auth: 'unknown_auth' as AgentAuthState, evidence: 'not installed' }

  const claudeCfg = join(HOME, '.claude', 'settings.json')
  // Codex ships config.toml; keep yaml/json as fallbacks if a user has one.
  const codexCfg =
    firstExisting([
      join(HOME, '.codex', 'config.toml'),
      join(HOME, '.codex', 'config.yaml'),
      join(HOME, '.codex', 'config.json')
    ]) ?? join(HOME, '.codex', 'config.toml')
  const agyCfg = antigravityConfig()

  const agents: AgentInfo[] = [
    {
      id: 'claude',
      name: 'Claude Code',
      kind: 'cli',
      installed: Boolean(claudeBin),
      binPath: claudeBin,
      appPath: null,
      version: firstLine(claudeVer),
      auth: claudeA.auth,
      authEvidence: claudeA.evidence,
      configPath: claudeCfg,
      configExists: existsSync(claudeCfg),
      installArgv:
        process.platform === 'win32'
          ? ['powershell', '-NoProfile', '-Command', 'irm https://claude.ai/install.ps1 | iex']
          : ['bash', '-lc', 'curl -fsSL https://claude.ai/install.sh | bash'],
      installHint: 'Official installer from claude.ai — runs in a visible pty you can read.',
      detectedAt: now
    },
    {
      id: 'codex',
      name: 'OpenAI Codex CLI',
      kind: 'cli',
      installed: Boolean(codexBin),
      binPath: codexBin,
      appPath: null,
      version: firstLine(codexVer),
      auth: codexA.auth,
      authEvidence: codexA.evidence,
      configPath: codexCfg,
      configExists: existsSync(codexCfg),
      installArgv: ['npm', 'install', '-g', '@openai/codex'],
      installHint: 'Requires npm on PATH.',
      detectedAt: now
    },
    {
      id: 'antigravity',
      name: 'Google Antigravity',
      kind: agyBin && agyApp ? 'gui+cli' : agyBin ? 'cli' : 'gui',
      installed: Boolean(agyApp || agyBin),
      binPath: agyBin,
      appPath: agyApp,
      version: firstLine(agyVer),
      // Antigravity signs in inside its own window; there is no file we can
      // honestly read for this, so it stays unknown rather than green.
      auth: 'unknown_auth',
      authEvidence: agyApp
        ? 'Antigravity manages sign-in inside its own window — DevHub cannot verify it from outside'
        : 'not installed',
      configPath: agyCfg,
      configExists: agyCfg !== null,
      installArgv: null,
      installHint: 'Download from antigravity.google — DevHub does not automate this installer.',
      detectedAt: now
    }
  ]

  const customApps = getSettings().customApps || []
  customApps.forEach(app => {
    agents.push({
      id: app.id as any,
      name: app.name,
      kind: 'gui',
      installed: true,
      binPath: null,
      appPath: app.appPath || null,
      url: app.url,
      iconUrl: app.iconUrl,
      version: null,
      auth: 'authenticated',
      authEvidence: 'Custom App',
      configPath: null,
      configExists: false,
      installArgv: null,
      installHint: null,
      detectedAt: now
    })
  })

  return agents
}

export function agentById(agents: AgentInfo[], id: AgentId): AgentInfo | undefined {
  return agents.find((a) => a.id === id)
}

/**
 * argv for launching an agent as a pty program. Returns null when the agent is
 * not a terminal program (Antigravity's GUI) or is not installed.
 */
export function agentArgv(info: AgentInfo): string[] | null {
  if (info.id === 'antigravity') return info.binPath ? [info.binPath] : null
  return info.binPath ? [info.binPath] : null
}
