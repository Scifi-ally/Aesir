import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AppSettings } from '@shared/types'
import { which } from './lib/which'

const DEFAULTS: AppSettings = {
  accent: 'amber',
  fontFamily: 'geist',
  claudeApiKey: '',
  claudeBaseUrl: '',
  claudeModel: '',
  claudeEffort: 'medium',
  claudeTemperature: 0.7,
  claudeMaxTokens: 8192,
  claudeSystemPrompt: '',
  shellPath: null,
  defaultCwd: null,
  globalPalette: true,
  mailPollSeconds: 90,
  notifications: true,
  blockRemoteImages: true,
  githubToken: null,
  customApps: []
}

let cache: AppSettings | null = null

function file(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function getSettings(): AppSettings {
  if (cache) return cache
  let onDisk: Partial<AppSettings> = {}
  try {
    if (existsSync(file())) onDisk = JSON.parse(readFileSync(file(), 'utf8')) as Partial<AppSettings>
  } catch {
    /* corrupt config falls back to defaults rather than blocking startup */
  }
  cache = { ...DEFAULTS, ...onDisk }
  if (!cache.shellPath || !existsSync(cache.shellPath)) cache.shellPath = detectShell()
  if (!cache.defaultCwd) cache.defaultCwd = homedir()
  return cache
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  const target = file()
  const temp = `${target}.tmp`
  cache = next
  mkdirSync(join(app.getPath('userData')), { recursive: true })
  writeFileSync(temp, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 })
  renameSync(temp, target)
  return next
}

/**
 * Interactive shell for plain pty panes. PowerShell 7 (`pwsh`) wins when
 * present, otherwise Windows PowerShell; POSIX uses $SHELL.
 */
export function detectShell(): string {
  if (process.platform === 'win32') {
    return (
      which('pwsh.exe') ??
      which('powershell.exe') ??
      join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe')
    )
  }
  return process.env.SHELL ?? which('zsh') ?? which('bash') ?? '/bin/sh'
}

/** Args that keep an interactive shell from clearing the pane on startup. */
export function shellArgs(shellPath: string): string[] {
  const lower = shellPath.toLowerCase()
  if (lower.endsWith('pwsh.exe') || lower.endsWith('powershell.exe')) return ['-NoLogo']
  if (lower.endsWith('bash') || lower.endsWith('bash.exe')) return ['-i']
  if (lower.endsWith('zsh')) return ['-i']
  return []
}

export function shellLabel(shellPath: string | null): string {
  if (!shellPath) return 'shell'
  const base = shellPath.split(/[\\/]/).pop() ?? shellPath
  return base.replace(/\.exe$/i, '')
}
