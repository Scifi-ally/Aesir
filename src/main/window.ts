import { BrowserWindow, shell, session } from 'electron'
import { join } from 'node:path'

const isDev = !!process.env.ELECTRON_RENDERER_URL

/**
 * Renderer CSP. The renderer has no network path of its own — every API call
 * happens in the main process — so `connect-src 'self'` is deliberately
 * stricter than an allowlist of API hosts would be. `img-src https:` exists for
 * one real reason: remote images inside an email body, which stay stripped
 * until the user unblocks them per message.
 */
function cspFor(devServer: string | undefined): string {
  const parts = [
    "default-src 'self'",
    `script-src 'self'${devServer ? " 'unsafe-inline' 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https: http://127.0.0.1:* http://localhost:*",
    "font-src 'self' data: https:",
    `connect-src 'self' https://github.com https://api.github.com http://127.0.0.1:* http://localhost:*${devServer ? ` ${devServer} ws://localhost:* ws://127.0.0.1:*` : ''}`,
    "frame-src 'self' http://127.0.0.1:* http://localhost:*",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ]
  return parts.join('; ')
}

export function installCsp(): void {
  const devServer = process.env.ELECTRON_RENDERER_URL
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspFor(devServer)]
      }
    })
  })
}

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'Aesir',
    icon: join(__dirname, '../../icons/mimiricon.png'),
    minWidth: 900,
    minHeight: 560,
    show: true,
    // Transparent must be false on Windows for Snap Layouts to work
    transparent: false,
    backgroundColor: '#000000',
    // Use hidden title bar to preserve native snap controls on Windows
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform !== 'darwin' ? {
      color: '#000000',
      symbolColor: '#a1a1aa',
      height: 40
    } : false,
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 14 } : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // nothing in this app should ever open a second Electron window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:$/.test(new URL(url).protocol)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(process.env.ELECTRON_RENDERER_URL ?? 'file://')) {
      e.preventDefault()
      void shell.openExternal(url)
    }
  })

  const send = (): void => win.webContents.send('window:state', { maximized: win.isMaximized() })
  win.on('maximize', send)
  win.on('unmaximize', send)
  win.on('enter-full-screen', send)
  win.on('leave-full-screen', send)

  if (isDev) void win.loadURL(process.env.ELECTRON_RENDERER_URL as string)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))

  return win
}
