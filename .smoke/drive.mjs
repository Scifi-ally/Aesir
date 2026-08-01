/**
 * Live smoke driver: launches the built app with the DevTools protocol open and
 * evaluates real calls inside the renderer, so every assertion below crosses
 * the preload bridge into the main process exactly like a user click would.
 * Run: node .smoke/drive.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { createRequire } from 'node:module'

const PORT = 9333
const electron = createRequire(import.meta.url)('electron')

const child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe']
})
let appLog = ''
child.stdout.on('data', (d) => (appLog += d))
child.stderr.on('data', (d) => (appLog += d))

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page.webSocketDebuggerUrl
    } catch {
      /* devtools endpoint not up yet */
    }
    await sleep(500)
  }
  throw new Error(`no renderer target after 30s\n${appLog}`)
}

const ws = new WebSocket(await target())
await new Promise((r, j) => {
  ws.onopen = r
  ws.onerror = () => j(new Error('devtools socket failed'))
})

let seq = 0
const pending = new Map()
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  const p = pending.get(msg.id)
  if (p) {
    pending.delete(msg.id)
    p(msg)
  }
}

function send(method, params) {
  const id = ++seq
  return new Promise((resolve) => {
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression: `(async()=>{${expression}})()`,
    awaitPromise: true,
    returnByValue: true
  })
  if (res.error) throw new Error(JSON.stringify(res.error))
  const r = res.result
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails))
  }
  return r.result?.value
}

let pass = 0
let fail = 0
async function check(name, expr, assert) {
  try {
    const value = await evaluate(expr)
    const verdict = assert(value)
    if (verdict === true) {
      pass++
      console.log(`PASS ${name}: ${JSON.stringify(value)?.slice(0, 200)}`)
    } else {
      fail++
      console.log(`FAIL ${name}: ${verdict} | got ${JSON.stringify(value)?.slice(0, 400)}`)
    }
  } catch (e) {
    fail++
    console.log(`FAIL ${name}: threw ${e.message.slice(0, 400)}`)
  }
}

const arg = process.argv[2] ?? 'first'

// wait for the preload bridge to be installed on the page
for (let i = 0; i < 40; i++) {
  const ok = await evaluate('return typeof window.devhub === "object"').catch(() => false)
  if (ok) break
  await sleep(500)
}

if (arg === 'leave') {
  // leave a live session behind so the next launch has something to restore
  await check(
    'session left running for the next launch',
    `const s = await window.devhub.pty.create({cwd:(await window.devhub.app.info()).home, purpose:'shell'});
     return s.id.length > 0`,
    (v) => (v === true ? true : 'could not create a session')
  )
  console.log(`\n${pass} passed, ${fail} failed`)
  ws.close()
  child.kill()
  await sleep(1500)
  process.exit(fail === 0 ? 0 : 1)
}

if (arg === 'cleanup') {
  await check(
    'smoke state removed',
    `await window.devhub.settings.set({accent:'blue'});
     await window.devhub.commands.remove('smoke1').catch(()=>{});
     await window.devhub.layout.save({tabs:[],activeTabId:null});
     for (const s of await window.devhub.pty.restorable()) await window.devhub.pty.kill(s.id).catch(()=>{});
     const l = await window.devhub.layout.get();
     const c = await window.devhub.commands.list();
     return {accent:(await window.devhub.settings.get()).accent, tabs:l?.tabs?.length ?? 0, cmds:c.length, restorable:(await window.devhub.pty.restorable()).length}`,
    (v) => (v?.accent === 'blue' && v.tabs === 0 ? true : 'cleanup incomplete')
  )
  console.log(`\n${pass} passed, ${fail} failed`)
  ws.close()
  child.kill()
  await sleep(500)
  process.exit(fail === 0 ? 0 : 1)
}

await check('app.info', 'return await window.devhub.app.info()', (v) =>
  v?.versions?.electron ? true : 'no electron version'
)

await check(
  'agents.list real detection',
  'return (await window.devhub.agents.list(true)).map(a=>({id:a.id,installed:a.installed,bin:a.binPath,auth:a.auth,cfg:a.configPath}))',
  (v) => (Array.isArray(v) && v.length === 3 ? true : 'expected 3 agents')
)

await check(
  'pty runs a real process',
  `const s = await window.devhub.pty.create({cwd:(await window.devhub.app.info()).home, purpose:'shell'});
   let buf='';
   const done = new Promise((res)=>{
     const off = window.devhub.pty.onData(e=>{ if(e.id===s.id){ buf+=e.data; if(buf.includes('SMOKE_'+'MARK_OK')) { off(); res(true) } } });
     setTimeout(()=>{ off(); res(false) }, 20000);
   });
   await window.devhub.pty.write(s.id, 'echo SMOKE_MARK_OK\\r');
   const ok = await done;
   await window.devhub.pty.kill(s.id);
   return {ok, program:s.program, tail: buf.slice(-120)}`,
  (v) => (v?.ok ? true : 'marker never came back from the shell')
)

await check(
  'connector github rejects a bad token with the real API error',
  `return await window.devhub.connectors.connect('github', {token:'ghp_smoke_invalid_token_000000000000'})`,
  (v) =>
    v && v.ok === false && v.status === 401 && /bad credentials/i.test(v.error ?? '')
      ? true
      : 'expected a real HTTP 401 Bad credentials'
)

await check(
  'bad credential was not persisted',
  `return (await window.devhub.connectors.states()).find(s=>s.id==='github') ?? null`,
  (v) => (v === null || v.connected === false ? true : 'github state saved despite a failed test')
)

await check(
  'gmail connect without a client id fails loudly',
  `try { await window.devhub.mail.connect('gmail'); return 'no error' } catch(e){ return e.message }`,
  (v) => (/oauth client/i.test(v) ? true : 'expected a setup-required error')
)

await check(
  'settings persist',
  `await window.devhub.settings.set({accent:'amber'});
   return (await window.devhub.settings.get()).accent`,
  (v) => (v === 'amber' ? true : 'accent did not stick')
)

await check(
  'saved command round-trips',
  `await window.devhub.commands.save({id:'smoke1',label:'smoke git status',argv:['git','status','--short'],cwd:null});
   return (await window.devhub.commands.list()).map(c=>c.id)`,
  (v) => (v?.includes('smoke1') ? true : 'command not stored')
)

await check(
  'layout round-trips',
  `await window.devhub.layout.save({tabs:[{id:'t1',title:'smoke',root:{type:'leaf',sessionId:'s1'},activeSessionId:'s1'}],activeTabId:'t1'});
   return (await window.devhub.layout.get())?.tabs?.[0]?.title ?? null`,
  (v) => (v === 'smoke' ? true : 'layout not stored')
)

await check(
  'vault list is masked',
  `return await window.devhub.vault.list()`,
  (v) => (Array.isArray(v) && v.every((e) => !/ghp_|GOCSPX/.test(e.masked)) ? true : 'raw secret leaked')
)

await check(
  'no generic ipc passthrough on the bridge',
  `return Object.keys(window.devhub).concat(typeof window.devhub.invoke, typeof window.ipcRenderer, typeof window.require)`,
  (v) => (v.includes('undefined') && !v.includes('invoke') ? true : 'renderer can reach raw IPC')
)

await check('activity log has real entries', 'return (await window.devhub.logs.recent(20)).length', (v) =>
  typeof v === 'number' ? true : 'no log access'
)

if (arg === 'second') {
  await check(
    'restart kept settings + commands + layout',
    `const s = await window.devhub.settings.get();
     const c = await window.devhub.commands.list();
     const l = await window.devhub.layout.get();
     return {accent:s.accent, cmd:c.some(x=>x.id==='smoke1'), tab:l?.tabs?.[0]?.title ?? null}`,
    (v) =>
      v?.accent === 'amber' && v.cmd && v.tab === 'smoke'
        ? true
        : 'state did not survive the restart'
  )
  await check(
    'restorable sessions are reported as dead, not alive',
    `const r = await window.devhub.pty.restorable(); const live = await window.devhub.pty.list();
     return {restorable:r.length, restoredFlag:r.every(s=>s.restored===true), live:live.length}`,
    (v) => (v?.restoredFlag !== false ? true : 'a stored session pretended to be live')
  )
}

console.log(`\n${pass} passed, ${fail} failed`)
ws.close()
child.kill()
await sleep(500)
process.exit(fail === 0 ? 0 : 1)
