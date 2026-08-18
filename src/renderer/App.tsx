import { lazy, Suspense, useEffect } from 'react'
import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TopNav from './components/TopNav'
import { useApp } from './state'

const Palette = lazy(() => import('./modules/command-palette/Palette'))

const ClaudePage = lazy(() => import('./components/ClaudePage'))
const AntigravityPage = lazy(() => import('./components/AntigravityPage'))
const CodexPage = lazy(() => import('./components/CodexPage'))
const GithubPage = lazy(() => import('./components/GithubPage'))
const CustomAppPage = lazy(() => import('./components/CustomAppPage'))
const MimirApp = lazy(() => import('./modules/mimir/App'))
const Inbox = lazy(() => import('./modules/inbox/Inbox'))
const Settings = lazy(() => import('./modules/settings/Settings'))
const TerminalHub = lazy(() => import('./modules/terminal-hub/TerminalHub'))
const DynamicIsland = lazy(() => import('./modules/mimir/components/DynamicIsland').then((module) => ({ default: module.DynamicIsland })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
})

function RouteFallback(): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-[#000000] text-[12px] text-[#737373]" role="status" aria-live="polite">
      Loading workspace…
    </div>
  )
}

function PaletteTrigger(): null {
  const { paletteOpen, setPaletteOpen } = useApp()

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (!event.repeat) setPaletteOpen(!paletteOpen)
      }
      if (event.key === 'Escape' && paletteOpen) {
        event.preventDefault()
        setPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    const offOpen = window.devhub.palette.onOpen(() => setPaletteOpen(true))
    return () => {
      window.removeEventListener('keydown', onKey, true)
      offOpen()
    }
  }, [paletteOpen, setPaletteOpen])

  return null
}

function ActiveView(): ReactNode {
  const { view } = useApp()

  switch (view.kind) {
    case 'agent':
      if (view.agentId === 'codex') return <CodexPage />
      if (view.agentId === 'claude') return <ClaudePage />
      if (view.agentId === 'antigravity') return <AntigravityPage />
      if (view.agentId === 'mimir' || view.agentId === 'mimir2') return <MimirApp />
      return <CustomAppPage agentId={view.agentId} />
    case 'inbox':
      return <Inbox />
    case 'github':
      return <GithubPage />
    case 'terminal':
      return <TerminalHub />
    case 'settings':
      return <Settings />
    case 'connectors':
      return <Settings />
    default:
      return null
  }
}

/** Mount only the active view; inactive workspaces stay unloaded and do not run effects or polling. */
export default function App(): React.JSX.Element {
  const { view, paletteOpen, toasts, dismissToast } = useApp()
  const isMimir = view.kind === 'agent' && (view.agentId === 'mimir' || view.agentId === 'mimir2')
  const bg = isMimir ? 'bg-[#0a0a0a]' : 'bg-[#000000]'

  return (
    <QueryClientProvider client={queryClient}>
      <div className={`flex h-screen w-screen flex-col overflow-hidden ${bg}`}>
        <TopNav />
        <div className={`relative flex min-h-0 flex-1 overflow-hidden ${bg}`}>
          <div className="absolute inset-0 flex flex-col">
            <Suspense fallback={<RouteFallback />}>
              <ActiveView />
            </Suspense>
          </div>
        </div>
      </div>

      <PaletteTrigger />
      {paletteOpen && (
        <Suspense fallback={null}>
          <Palette />
        </Suspense>
      )}

      <div className="pointer-events-none fixed bottom-8 right-6 z-50 flex flex-col items-end gap-3">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="pointer-events-auto flex w-80 items-start gap-3 px-4 py-3"
              role="status"
            >
              <div className="mt-0.5 shrink-0">
                {t.kind === 'success' && <CheckCircle2 className="h-[18px] w-[18px] text-[#22c55e]" />}
                {t.kind === 'error' && <AlertCircle className="h-[18px] w-[18px] text-[#ef4444]" />}
                {t.kind === 'info' && <Info className="h-[18px] w-[18px] text-[#3b82f6]" />}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[13px] font-medium leading-relaxed text-[#FFFFFF]">{t.message}</span>
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismissToast(t.id)}
                className="mt-0.5 shrink-0 text-[#5A5A5A] outline-none transition-colors hover:text-[#FFFFFF]"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {isMimir && (
        <Suspense fallback={null}>
          <DynamicIsland />
        </Suspense>
      )}
    </QueryClientProvider>
  )
}
