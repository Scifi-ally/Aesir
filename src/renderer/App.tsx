import TopNav from './components/TopNav'
import ClaudePage from './components/ClaudePage'
import AntigravityPage from './components/AntigravityPage'
import CodexPage from './components/CodexPage'
import GithubPage from './components/GithubPage'
import CustomAppPage from './components/CustomAppPage'
import MimirApp from './modules/mimir/App'
import Inbox from './modules/inbox/Inbox'
import Settings from './modules/settings/Settings'
import TerminalHub from './modules/terminal-hub/TerminalHub'
import Palette from './modules/command-palette/Palette'
import { useApp } from './state'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DynamicIsland } from './modules/mimir/components/DynamicIsland'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
})

/** Every view kind always mounts all pages; hidden ones use `display:contents`. */
export default function App(): React.JSX.Element {
  const { view, toasts, dismissToast } = useApp()
  const isMimir = view.kind === 'agent' && (view.agentId === 'mimir' || view.agentId === 'mimir2')
  const bg = isMimir ? 'bg-[#0a0a0a]' : 'bg-[#000000]'

  return (
    <QueryClientProvider client={queryClient}>
      <div className={`flex h-screen w-screen flex-col overflow-hidden ${bg}`} style={{ borderRadius: '12px', border: '1px solid rgba(39, 39, 42, 0.4)' }}>
        <TopNav />
        <div className={`relative flex min-h-0 flex-1 overflow-hidden ${bg}`}>
          <div className="absolute inset-0 flex flex-col">
            <div style={{ display: view.kind === 'agent' && view.agentId === 'codex' ? 'contents' : 'none' }}>
              <CodexPage />
            </div>
            <div style={{ display: view.kind === 'agent' && view.agentId === 'claude' ? 'contents' : 'none' }}>
              <ClaudePage />
            </div>
            <div style={{ display: view.kind === 'agent' && view.agentId === 'antigravity' ? 'contents' : 'none' }}>
              <AntigravityPage />
            </div>
            <div style={{ display: view.kind === 'inbox' ? 'contents' : 'none' }}>
              <Inbox />
            </div>
            <div style={{ display: view.kind === 'github' ? 'contents' : 'none' }}>
              <GithubPage />
            </div>
            <div style={{ display: isMimir ? 'contents' : 'none' }}>
              {isMimir && <MimirApp />}
            </div>
            <div style={{ display: view.kind === 'terminal' ? 'contents' : 'none' }}>
              <TerminalHub />
            </div>
            <div style={{ display: view.kind === 'settings' ? 'contents' : 'none' }}>
              <Settings />
            </div>
            <div style={{ display: view.kind === 'agent' && !['codex', 'claude', 'antigravity', 'mimir', 'mimir2'].includes(view.agentId as string) ? 'contents' : 'none' }}>
              {view.kind === 'agent' && !['codex', 'claude', 'antigravity', 'mimir', 'mimir2'].includes(view.agentId as string) && (
                <CustomAppPage agentId={view.agentId as string} />
              )}
            </div>
          </div>
        </div>
      </div>

      <Palette />

      {/* Toast notifications */}
      <div className="pointer-events-none fixed bottom-8 right-6 flex flex-col items-end gap-3 z-50">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="pointer-events-auto flex items-start gap-3 w-80 px-4 py-3 rounded-xl border border-[#27272a]/50 bg-[#18181b]/90 backdrop-blur-md shadow-2xl"
            >
              <div className="shrink-0 mt-0.5">
                {t.kind === 'success' && <CheckCircle2 className="w-[18px] h-[18px] text-[#22c55e]" />}
                {t.kind === 'error' && <AlertCircle className="w-[18px] h-[18px] text-[#ef4444]" />}
                {t.kind === 'info' && <Info className="w-[18px] h-[18px] text-[#3b82f6]" />}
              </div>
              <div className="flex-1 flex flex-col min-w-0">
                <span className="text-[13px] text-[#FFFFFF] font-medium leading-relaxed">{t.message}</span>
              </div>
              <button
                onClick={() => dismissToast(t.id)}
                className="shrink-0 mt-0.5 text-[#5A5A5A] hover:text-[#FFFFFF] transition-colors outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <DynamicIsland />
    </QueryClientProvider>
  )
}
