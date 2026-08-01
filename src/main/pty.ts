import { EventEmitter } from 'node:events'
import { statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import * as nodePty from '@lydell/node-pty'
import type { IPty } from '@lydell/node-pty'
import type { AgentInfo, PtySession, PtySpawnRequest } from '@shared/types'
import { getSettings, shellArgs, shellLabel } from './settings'
import { forgetSession, log, persistSession } from './db'

/** Largest single write accepted from the renderer, per call. */
const MAX_WRITE = 64 * 1024

interface Live {
  proc: IPty
  meta: PtySession
}

class PtyManager extends EventEmitter {
  private live = new Map<string, Live>()

  /**
   * Spawns a real process on a real pty. `argv` is always an array — nothing is
   * ever concatenated into a shell string.
   */
  create(req: PtySpawnRequest, agents: AgentInfo[]): PtySession {
    const settings = getSettings()
    const cwd = req.cwd || settings.defaultCwd || process.cwd()
    assertDirectory(cwd)

    let argv: string[]
    let title = req.title ?? ''

    if (req.agentId) {
      const agent = agents.find((a) => a.id === req.agentId)
      if (!agent) throw new Error(`unknown agent: ${req.agentId}`)
      if (!agent.binPath)
        throw new Error(
          `${agent.name} has no CLI on PATH — nothing to run in a terminal. ${agent.installHint ?? ''}`.trim()
        )
      argv = [agent.binPath]
      title ||= agent.name
    } else if (req.argv && req.argv.length) {
      argv = req.argv.map(String)
      title ||= argv[0].split(/[\\/]/).pop() ?? argv[0]
    } else {
      const shell = settings.shellPath ?? process.env.SHELL ?? 'cmd.exe'
      argv = [shell, ...shellArgs(shell)]
      title ||= shellLabel(shell)
    }

    const [program, ...args] = argv
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) if (typeof v === 'string') env[k] = v
    delete env.ELECTRON_RUN_AS_NODE
    env.TERM = 'xterm-256color'
    env.COLORTERM = 'truecolor'

    let proc: IPty
    try {
      proc = nodePty.spawn(program, args, {
        cwd,
        env,
        cols: clampDim(req.cols, 80),
        rows: clampDim(req.rows, 24),
        name: 'xterm-256color'
      })
    } catch (e) {
      throw new Error(`could not start ${program}: ${(e as Error).message}`)
    }

    const meta: PtySession = {
      id: randomUUID(),
      title,
      cwd,
      program,
      argv,
      agentId: req.agentId ?? null,
      purpose: req.purpose ?? (req.agentId ? 'agent' : 'shell'),
      createdAt: Date.now(),
      exit: null,
      restored: false
    }

    proc.onData((data) => this.emit('data', meta.id, data))
    proc.onExit(({ exitCode, signal }) => {
      const rec = this.live.get(meta.id)
      if (rec) rec.meta.exit = { code: exitCode, signal, at: Date.now() }
      this.emit('exit', meta.id, exitCode, signal, rec?.meta ?? meta)
      log(
        exitCode === 0 ? 'info' : 'warn',
        'pty',
        `${meta.title} (${meta.program}) exited code=${exitCode}${signal ? ` signal=${signal}` : ''}`
      )
    })

    this.live.set(meta.id, { proc, meta })
    // installer runs are throwaway; agent/shell panes are restored next launch
    if (meta.purpose !== 'install') persistSession(meta)
    log('info', 'pty', `spawned ${program} pid=${proc.pid} cwd=${cwd}`)
    return meta
  }

  write(id: string, data: string): void {
    const rec = this.live.get(id)
    if (!rec) throw new Error('session is not running')
    if (typeof data !== 'string') throw new Error('pty input must be a string')
    if (data.length > MAX_WRITE) throw new Error(`pty input too large (${data.length} bytes)`)
    rec.proc.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const rec = this.live.get(id)
    if (!rec) return
    try {
      rec.proc.resize(clampDim(cols, 80), clampDim(rows, 24))
    } catch (e) {
      log('warn', 'pty', `resize failed: ${(e as Error).message}`)
    }
  }

  kill(id: string): void {
    const rec = this.live.get(id)
    if (rec) {
      try {
        rec.proc.kill()
      } catch {
        /* already gone */
      }
      this.live.delete(id)
    }
    forgetSession(id)
  }

  killAll(): void {
    for (const id of [...this.live.keys()]) {
      const rec = this.live.get(id)
      try {
        rec?.proc.kill()
      } catch {
        /* shutting down anyway */
      }
      this.live.delete(id)
    }
  }

  get(id: string): PtySession | null {
    return this.live.get(id)?.meta ?? null
  }

  list(): PtySession[] {
    return [...this.live.values()].map((l) => l.meta)
  }

  isAlive(id: string): boolean {
    const rec = this.live.get(id)
    return Boolean(rec && rec.meta.exit === null)
  }
}

function clampDim(v: number | undefined, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.max(2, Math.min(1000, Math.floor(v)))
}

function assertDirectory(p: string): void {
  try {
    if (!statSync(p).isDirectory()) throw new Error('not a directory')
  } catch {
    throw new Error(`working directory does not exist: ${p}`)
  }
}

export const ptys = new PtyManager()
