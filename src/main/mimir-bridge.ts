import { app } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import http from 'http'
import fs from 'fs'
import path from 'path'

const MIMIR_DIR = path.join(__dirname, '..', '..')
const PORT = 1420

let server: http.Server | null = null
let processes: ChildProcess[] = []

function getExePath(relPaths: string[], fallback: string): string {
  for (const p of relPaths) {
    const fullPath = path.join(MIMIR_DIR, p)
    if (fs.existsSync(fullPath)) {
      return fullPath
    }
  }
  return fallback
}

export function startMimirBridge() {
  if (server) return

  // 1. Start static file server and proxy for frontend
  server = http.createServer((req, res) => {
    if (req.url?.startsWith('/api/')) {
      if (req.method === 'OPTIONS') {
        const origin = req.headers.origin || 'http://localhost:5173'
        res.writeHead(204, {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-requested-with',
          'Access-Control-Max-Age': '86400'
        })
        res.end()
        return
      }

      const proxyReq = http.request({
        hostname: '127.0.0.1',
        port: 5000,
        path: req.url,
        method: req.method,
        headers: req.headers
      }, (proxyRes) => {
        const proxyHeaders = { ...proxyRes.headers }
        const origin = req.headers.origin || 'http://localhost:5173'
        proxyHeaders['access-control-allow-origin'] = origin
        proxyHeaders['access-control-allow-credentials'] = 'true'
        res.writeHead(proxyRes.statusCode || 200, proxyHeaders)
        proxyRes.pipe(res)
      })
      
      if (req.method === 'GET' || req.method === 'HEAD') {
        proxyReq.end()
      } else {
        req.pipe(proxyReq)
      }
      
      proxyReq.on('error', (e) => {
        console.error(`[Mimir Bridge] Proxy error for ${req.url}:`, e.message)
        if (!res.headersSent) {
          res.writeHead(502, {
            'Access-Control-Allow-Origin': 'http://localhost:5173',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-requested-with'
          })
          res.end('Bad Gateway: ' + e.message)
        }
      })
      return
    }

    if (req.url === '/tauri-icon.png' || req.url === '/icon-192x192.png') {
      const iconPath = path.join(MIMIR_DIR, 'icons', 'mimiricon.png');
      if (fs.existsSync(iconPath)) {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        fs.createReadStream(iconPath).pipe(res);
        return;
      }
    }

    // Frontend is now natively integrated into Aesir.
    res.writeHead(404);
    res.end('Not Found');
  })

  server.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/ws/')) {
      const proxyReq = http.request({
        hostname: '127.0.0.1',
        port: 5000,
        path: req.url,
        method: req.method,
        headers: req.headers
      })
      proxyReq.end()
      
      proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
        let headers = `HTTP/${req.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`
        for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
          headers += `${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i+1]}\r\n`
        }
        headers += '\r\n'
        socket.write(headers)
        if (proxyHead && proxyHead.length) socket.write(proxyHead)
        
        socket.pipe(proxySocket)
        proxySocket.pipe(socket)
      })
      
      proxyReq.on('error', () => {
        socket.destroy()
      })
      
      proxyReq.end()
    } else {
      socket.destroy()
    }
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Mimir Bridge] Serving frontend on http://127.0.0.1:${PORT}`)
  })

  // 2. Start Backend Processes Directly (Grouped under Aesir, no consoles)
  const nodeCmd = getExePath(['.portable\\node\\node.exe'], 'node')
  const pyCmd = getExePath(['.portable\\python\\python.exe', '.venv\\Scripts\\python.exe', '..\\.venv\\Scripts\\python.exe'], 'python')
  
  const spawnProc = (exe: string, args: string[], cwd: string, envOverrides?: any) => {
    const p = spawn(exe, args, {
      cwd: path.join(MIMIR_DIR, cwd),
      windowsHide: true,
      env: { ...process.env, ...envOverrides }
    })
    const logFile = fs.createWriteStream(path.join(MIMIR_DIR, 'mimir-bridge-spawn.log'), { flags: 'a' })
    logFile.write(`\n--- Spawning ${exe} ${args.join(' ')} in ${cwd} ---\n`)
    p.stdout?.pipe(logFile)
    p.stderr?.pipe(logFile)
    p.on('error', (err) => logFile.write(`Spawn error: ${err.message}\n`))
    p.on('exit', (code, signal) => logFile.write(`Process exited with code ${code} signal ${signal}\n`))
    
    processes.push(p)
    return p
  }

  // Start Redis
  if (fs.existsSync(path.join(MIMIR_DIR, '.portable\\redis\\redis-server.exe'))) {
    spawnProc(path.join(MIMIR_DIR, '.portable\\redis\\redis-server.exe'), ['redis.windows.conf'], '.portable\\redis')
  }

  // Start Postgres
  if (fs.existsSync(path.join(MIMIR_DIR, '.portable\\pgsql\\bin\\postgres.exe'))) {
    spawnProc(
      path.join(MIMIR_DIR, '.portable\\pgsql\\bin\\postgres.exe'),
      ['-D', path.join(MIMIR_DIR, '.portable\\pgsql\\data'), '-p', '5433'],
      '.portable\\pgsql\\bin'
    )
    
    // Fire and forget db creation and migrations
    setTimeout(() => {
      spawn(path.join(MIMIR_DIR, '.portable\\pgsql\\bin\\createdb.exe'), ['-h', 'localhost', '-p', '5433', '-U', 'postgres', 'upstox_bot'], {
        windowsHide: true,
        env: { ...process.env, PGPASSWORD: 'postgres' }
      }).on('close', () => {
        spawn(nodeCmd, ['migrate.mjs'], {
          cwd: path.join(MIMIR_DIR, 'backend\\dist'),
          windowsHide: true,
          env: { ...process.env, DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/upstox_bot' }
        })
      })
    }, 2000) // Wait 2s for postgres to start
  }

  // Start Node Backend
  spawnProc(nodeCmd, ['--enable-source-maps', './dist/index.mjs'], 'backend', {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/upstox_bot',
    UPSTOXBOT_SECRET_KEY: 'aesir-mimir-local-secret-key-for-dev-environment-only'
  })

  // Start Python AI Service
  spawnProc(pyCmd, ['-u', 'main.py'], 'backend\\ai_service', {
    HF_HUB_OFFLINE: '1'
  })

  console.log(`[Mimir Bridge] Spawned ${processes.length} background processes.`)

  // 3. Cleanup on exit
  app.on('before-quit', () => {
    stopMimirBridge()
  })
}

export function stopMimirBridge() {
  if (server) {
    server.close()
    server = null
  }
  
  processes.forEach(p => {
    try { p.kill() } catch (e) {}
  })
  processes = []
  
  // Just in case bot.bat was previously running, also attempt a fast stop
  const botBatPath = path.join(MIMIR_DIR, 'bot.bat')
  if (fs.existsSync(botBatPath)) {
    spawn('cmd.exe', ['/c', botBatPath, 'stop'], { cwd: MIMIR_DIR, windowsHide: true })
  }
  console.log('[Mimir Bridge] Stopped all processes.')
}
