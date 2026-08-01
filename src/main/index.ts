import { BrowserWindow, app, globalShortcut } from 'electron'
import { log, openDb } from './db'
import { emitStatus, refreshAgents, registerIpc, wireEvents } from './ipc'
import * as connectors from './connectors'
import * as mail from './mail'
import { ptys } from './pty'
import { getSettings } from './settings'
import { createWindow, installCsp } from './window'
import { startMimirBridge } from './mimir-bridge'

const PALETTE_ACCELERATOR = 'CommandOrControl+K'

if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL) {
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'
}

let mainWindow: BrowserWindow | null = null
let pollTimer: NodeJS.Timeout | null = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  void start()
}

async function start(): Promise<void> {
  await app.whenReady()

  openDb()
  installCsp()
  registerIpc()
  wireEvents()
  startMimirBridge()

  mainWindow = createWindow()
  wireGlobalPalette(mainWindow)

  // real detection on startup; the renderer also asks for a forced refresh
  await refreshAgents()

  startMailPolling()
  // health dots come from actual testConnection calls, not remembered guesses
  void connectors.testAll().then(emitStatus)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
      wireGlobalPalette(mainWindow)
    }
  })
}

/**
 * Cmd/Ctrl+K is handled in the renderer while DevHub has focus, and grabbed
 * system-wide only while it does not — so the palette works from the background
 * without permanently stealing the shortcut from other apps.
 */
function wireGlobalPalette(win: BrowserWindow): void {
  const grab = (): void => {
    if (!getSettings().globalPalette) return
    if (globalShortcut.isRegistered(PALETTE_ACCELERATOR)) return
    globalShortcut.register(PALETTE_ACCELERATOR, () => {
      if (win.isDestroyed()) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      win.webContents.send('palette:open')
    })
  }
  const release = (): void => globalShortcut.unregister(PALETTE_ACCELERATOR)

  win.on('blur', grab)
  win.on('focus', release)
  win.on('closed', release)
  if (!win.isFocused()) grab()
}

function startMailPolling(): void {
  if (pollTimer) clearInterval(pollTimer)
  const seconds = Math.max(30, getSettings().mailPollSeconds)
  // The timer only decides *when* to ask the provider. Notifications fire from
  // the diff of a real API response against the cache — never from the timer.
  pollTimer = setInterval(() => {
    void mail.syncAll()
  }, seconds * 1000)
  void mail.syncAll()
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (pollTimer) clearInterval(pollTimer)
  ptys.killAll()
  log('info', 'app', 'shutdown')
})

process.on('uncaughtException', (e) => log('error', 'main', `uncaught: ${e.message}`))
process.on('unhandledRejection', (r) => log('error', 'main', `unhandled rejection: ${String(r)}`))
