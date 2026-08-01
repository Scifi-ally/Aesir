import { existsSync, statSync } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'

/**
 * PATH lookup without shelling out — no quoting hazards, works the same on
 * every platform, and returns the absolute path we later spawn as argv[0].
 */
export function which(bin: string): string | null {
  if (isAbsolute(bin)) return isExecutableFile(bin) ? bin : null

  const pathVar = process.env.PATH ?? process.env.Path ?? ''
  const dirs = pathVar.split(delimiter).filter(Boolean)
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : ['']

  for (const dir of dirs) {
    const base = join(dir.replace(/^"|"$/g, ''), bin)
    if (isExecutableFile(base)) return base
    for (const ext of exts) {
      const candidate = base + ext.toLowerCase()
      if (isExecutableFile(candidate)) return candidate
      const upper = base + ext
      if (isExecutableFile(upper)) return upper
    }
  }
  return null
}

function isExecutableFile(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isFile()
  } catch {
    return false
  }
}

/** First existing path from a list, or null. */
export function firstExisting(paths: (string | null | undefined)[]): string | null {
  for (const p of paths) {
    if (!p) continue
    try {
      if (existsSync(p)) return p
    } catch {
      /* unreadable path is simply not a hit */
    }
  }
  return null
}
