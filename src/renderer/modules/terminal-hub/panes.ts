import type { PaneNode } from '@shared/types'

/** Pure helpers for the tmux-style pane tree. */

export function leaf(sessionId: string): PaneNode {
  return { type: 'leaf', sessionId }
}

export function collectSessionIds(node: PaneNode | null): string[] {
  if (!node) return []
  if (node.type === 'leaf') return [node.sessionId]
  return [...collectSessionIds(node.a), ...collectSessionIds(node.b)]
}

/** Splits the pane holding `targetId` and puts `newId` beside it. */
export function splitPane(
  node: PaneNode,
  targetId: string,
  dir: 'h' | 'v',
  newId: string
): PaneNode {
  if (node.type === 'leaf') {
    if (node.sessionId !== targetId) return node
    return { type: 'split', dir, ratio: 0.5, a: node, b: leaf(newId) }
  }
  return {
    ...node,
    a: splitPane(node.a, targetId, dir, newId),
    b: splitPane(node.b, targetId, dir, newId)
  }
}

/** Removes a pane, collapsing the split that held it. Null when nothing is left. */
export function removePane(node: PaneNode | null, sessionId: string): PaneNode | null {
  if (!node) return null
  if (node.type === 'leaf') return node.sessionId === sessionId ? null : node
  const a = removePane(node.a, sessionId)
  const b = removePane(node.b, sessionId)
  if (a && b) return { ...node, a, b }
  return a ?? b
}

export function setRatio(node: PaneNode, path: string, ratio: number): PaneNode {
  return walk(node, '')
  function walk(n: PaneNode, cur: string): PaneNode {
    if (n.type === 'leaf') return n
    if (cur === path) return { ...n, ratio: Math.max(0.15, Math.min(0.85, ratio)) }
    return { ...n, a: walk(n.a, `${cur}a`), b: walk(n.b, `${cur}b`) }
  }
}

/** Next/previous pane in left-to-right traversal order. */
export function cyclePane(node: PaneNode | null, from: string | null, delta: 1 | -1): string | null {
  const ids = collectSessionIds(node)
  if (ids.length === 0) return null
  const i = from ? ids.indexOf(from) : -1
  if (i === -1) return ids[0]
  return ids[(i + delta + ids.length) % ids.length]
}
