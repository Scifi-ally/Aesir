import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type { AgentInfo, AppSettings, StatusSnapshot } from '@shared/types'

export type View =
  | { kind: 'terminal' }
  | { kind: 'inbox'; accountId?: string; messageId?: string }
  | { kind: 'connectors'; focus?: string }
  | { kind: 'settings'; section?: 'general' | 'vault' | 'connections' | 'logs' }
  | { kind: 'agent'; agentId: AgentInfo['id'] }
  | { kind: 'github' }

export interface PaletteAction {
  id: string
  label: string
  hint?: string
  group: string
  glyph?: string
  run: () => void | Promise<void>
}

export interface Toast {
  id: number
  kind: 'info' | 'error' | 'success'
  message: string
}

const VIEW_KEY = 'devhub_view'

/** The last view the user was on, so a restart lands where they left off. */
function loadView(): View {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    if (raw) {
      const v = JSON.parse(raw) as View
      if (v && typeof v.kind === 'string') return v
    }
  } catch {
    /* corrupt entry — fall through to the default */
  }
  return { kind: 'agent', agentId: 'mimir' }
}

interface Ctx {
  settings: AppSettings | null
  setSettings: (patch: Partial<AppSettings>) => Promise<void>
  status: StatusSnapshot | null
  agents: AgentInfo[]
  agentsLoading: boolean
  agentsError: string | null
  refreshAgents: (force?: boolean) => Promise<void>
  view: View
  setView: (v: View) => void
  paletteOpen: boolean
  setPaletteOpen: (b: boolean) => void
  actions: PaletteAction[]
  registerActions: (list: PaletteAction[]) => () => void
  toasts: Toast[]
  toast: (message: string, kind?: Toast['kind']) => void
  dismissToast: (id: number) => void
}

const AppCtx = createContext<Ctx | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [settings, setSettingsState] = useState<AppSettings | null>(null)
  const [status, setStatus] = useState<StatusSnapshot | null>(null)
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [agentsError, setAgentsError] = useState<string | null>(null)
  const [view, setViewState] = useState<View>(loadView)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [actionVersion, setActionVersion] = useState(0)
  const actionsRef = useRef<Map<string, PaletteAction[]>>(new Map())
  const toastSeq = useRef(0)
  const toastTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const setView = useCallback((v: View) => {
    setViewState(v)
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(v))
    } catch {
      /* private mode / quota — the view still changes, it just won't persist */
    }
  }, [])

  const dismissToast = useCallback((id: number) => {
    const timer = toastTimers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      toastTimers.current.delete(id)
    }
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  /** Cap the stack so a burst of errors can't cover the window. */
  const toast = useCallback(
    (message: string, kind: Toast['kind'] = 'info') => {
      const id = ++toastSeq.current
      setToasts((t) => [...t, { id, kind, message }].slice(-4))
      const timer = setTimeout(() => {
        toastTimers.current.delete(id)
        setToasts((t) => t.filter((x) => x.id !== id))
      }, kind === 'error' ? 9000 : 4000)
      toastTimers.current.set(id, timer)
    },
    []
  )

  useEffect(() => {
    const timers = toastTimers.current
    return () => {
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
    }
  }, [])

  const refreshAgents = useCallback(
    async (force = false) => {
      setAgentsLoading(true)
      setAgentsError(null)
      try {
        setAgents(await window.devhub.agents.list(force))
      } catch (e) {
        setAgentsError((e as Error).message)
      } finally {
        setAgentsLoading(false)
      }
    },
    []
  )

  const applySettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await window.devhub.settings.set(patch)
    setSettingsState(next)
  }, [])

  /** Modules register palette actions without the palette knowing they exist. */
  const registerActions = useCallback((list: PaletteAction[]) => {
    const key = `${Date.now()}-${Math.random()}`
    actionsRef.current.set(key, list)
    setActionVersion((v) => v + 1)
    return () => {
      actionsRef.current.delete(key)
      setActionVersion((v) => v + 1)
    }
  }, [])

  const actions = useMemo(() => {
    void actionVersion
    // the connectors module is reachable from two places; first registration wins
    const byId = new Map<string, PaletteAction>()
    for (const a of [...actionsRef.current.values()].flat()) if (!byId.has(a.id)) byId.set(a.id, a)
    return [...byId.values()]
  }, [actionVersion])

  useEffect(() => {
    void (async () => {
      try {
        const s = await window.devhub.settings.get()
        setSettingsState(s)
      } catch (e) {
        toast(`settings failed to load: ${(e as Error).message}`, 'error')
      }
      try {
        setStatus(await window.devhub.status.get())
      } catch {
        /* status strip degrades to empty, not fatal */
      }
      void refreshAgents(false)
    })()

    const offStatus = window.devhub.status.onChanged(setStatus)
    const offSettings = window.devhub.settings.onChanged(setSettingsState)
    const offAgents = window.devhub.agents.onChanged(setAgents)
    return () => {
      offStatus()
      offSettings()
      offAgents()
    }
  }, [refreshAgents, toast])

  useEffect(() => {
    if (settings) {
      document.documentElement.dataset.accent = settings.accent
      document.documentElement.dataset.font = settings.fontFamily
    }
  }, [settings])

  const value: Ctx = {
    settings,
    setSettings: applySettings,
    status,
    agents,
    agentsLoading,
    agentsError,
    refreshAgents,
    view,
    setView,
    paletteOpen,
    setPaletteOpen,
    actions,
    registerActions,
    toasts,
    toast,
    dismissToast
  }

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp outside provider')
  return ctx
}

/** Registers palette actions for as long as the component is mounted. */
export function usePaletteActions(build: () => PaletteAction[], deps: unknown[]): void {
  const { registerActions } = useApp()
  useEffect(() => {
    return registerActions(build())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
