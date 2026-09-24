import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite'
import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { networkInterfaces } from 'node:os'
import { spawn } from 'node:child_process'
import selfsigned from 'selfsigned'
import { WebSocketServer, type WebSocket } from 'ws'

export type SyncChannel =
  | 'draft'
  | 'gameplay'
  | 'stinger'
  | 'bracket'
  | 'cams'
  | 'lineup'
  | 'tournament'
  | 'casters'

type Json = unknown
type HubState = Record<SyncChannel, Json>

const PHONE_HTTPS_PORT = 5174
const CHANNELS: SyncChannel[] = [
  'draft',
  'gameplay',
  'stinger',
  'bracket',
  'cams',
  'lineup',
  'tournament',
  'casters',
]

function hubDir() {
  return join(process.cwd(), 'node_modules', '.cache', 'obs-sync')
}

function hubPath() {
  return join(hubDir(), 'hub-state.json')
}

function lockedTournamentPath() {
  return join(hubDir(), 'tournament-locked.json')
}

function isNamedPlayer(p: { name?: unknown } | null | undefined) {
  const n = String(p?.name || '').trim()
  return Boolean(n) && !/^PLAYER\s*\d+$/i.test(n)
}

function tournamentNamedCount(tournament: unknown): number {
  if (!tournament || typeof tournament !== 'object') return 0
  const raw = tournament as { tournaments?: { teams?: { players?: { name?: unknown }[] }[] }[] }
  const projects = Array.isArray(raw.tournaments) ? raw.tournaments : []
  let n = 0
  for (const proj of projects) {
    for (const team of proj.teams || []) {
      for (const player of team.players || []) {
        if (isNamedPlayer(player)) n += 1
      }
    }
  }
  return n
}

function readJsonFile(path: string): unknown {
  try {
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function loadLockedTournament(): unknown {
  return readJsonFile(lockedTournamentPath())
}

function writeLockedTournament(payload: unknown) {
  try {
    mkdirSync(hubDir(), { recursive: true })
    writeFileSync(lockedTournamentPath(), JSON.stringify(payload), 'utf8')
  } catch (err) {
    console.warn('[obs-sync] could not write tournament-locked.json:', err)
  }
}

function richerTournament(a: unknown, b: unknown): unknown {
  return tournamentNamedCount(a) >= tournamentNamedCount(b) ? a : b
}

function protectTournament(incoming: unknown, current: unknown): unknown {
  const locked = loadLockedTournament()
  const floor = Math.max(tournamentNamedCount(current), tournamentNamedCount(locked))
  const next = tournamentNamedCount(incoming)
  if (floor > 0 && next < floor) {
    console.warn(
      `[obs-sync] kept ${floor} named players — refused thinner tournament (${next})`,
    )
    return richerTournament(current, locked)
  }
  if (next > 0 && next >= tournamentNamedCount(locked)) {
    writeLockedTournament(incoming)
  }
  return incoming
}

function loadHubFromDisk(): HubState {
  const empty: HubState = {
    draft: null,
    gameplay: null,
    stinger: null,
    bracket: null,
    cams: null,
    lineup: null,
    tournament: null,
    casters: null,
  }
  try {
    if (!existsSync(hubPath())) return empty
    const raw = JSON.parse(readFileSync(hubPath(), 'utf8')) as Partial<HubState>
    for (const ch of CHANNELS) {
      if (raw[ch] !== undefined) empty[ch] = raw[ch] as Json
    }
  } catch (err) {
    console.warn('[obs-sync] could not load hub-state.json:', err)
  }
  empty.tournament = protectTournament(empty.tournament, empty.tournament) as Json
  const locked = loadLockedTournament()
  if (tournamentNamedCount(locked) > tournamentNamedCount(empty.tournament)) {
    empty.tournament = locked as Json
    console.warn(
      `[obs-sync] restored locked tournament (${tournamentNamedCount(locked)} named players)`,
    )
  }
  return empty
}

function persistHubToDisk(state: HubState) {
  try {
    mkdirSync(hubDir(), { recursive: true })
    const disk = readJsonFile(hubPath()) as Partial<HubState> | null
    const tournament = protectTournament(
      state.tournament,
      disk?.tournament ?? state.tournament,
    )
    writeFileSync(
      hubPath(),
      JSON.stringify({ ...state, tournament }),
      'utf8',
    )
  } catch (err) {
    console.warn('[obs-sync] could not write hub-state.json:', err)
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, data: Json) {
  const body = JSON.stringify(data ?? null)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(body)
}

let importRunning: Promise<Json> | null = null

/** Pull Google Sheet + download Drive photos into public/form-media. */
function runFormImport(fresh: boolean): Promise<Json> {
  if (importRunning) return importRunning
  importRunning = new Promise<Json>((resolve, reject) => {
    const script = join(process.cwd(), 'scripts', 'import-form-responses.mjs')
    const args = [script, ...(fresh ? ['--fresh'] : [])]
    console.log(`[obs-sync] import-form starting${fresh ? ' (fresh downloads)' : ''}…`)
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      const s = chunk.toString()
      stdout += s
      process.stdout.write(s)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const s = chunk.toString()
      stderr += s
      process.stderr.write(s)
    })
    child.on('error', (err) => {
      importRunning = null
      reject(err)
    })
    child.on('close', (code) => {
      importRunning = null
      const backup = join(process.cwd(), 'public', 'cme-form-import.json')
      if (code !== 0 || !existsSync(backup)) {
        reject(
          new Error(
            stderr.trim() ||
              stdout.trim() ||
              `import exited with code ${code ?? 'unknown'}`,
          ),
        )
        return
      }
      try {
        resolve(JSON.parse(readFileSync(backup, 'utf8')) as Json)
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  })
  return importRunning
}

function lanIps(): string[] {
  const out: string[] = []
  const nets = networkInterfaces()
  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address)
    }
  }
  return out
}

/** Cached cert — regenerating RSA-2048 on every Vite restart freezes the process. */
async function loadOrCreatePhoneCert(): Promise<{ private: string; cert: string }> {
  const dir = join(process.cwd(), 'node_modules', '.cache', 'obs-sync')
  const keyPath = join(dir, 'phone-key.pem')
  const certPath = join(dir, 'phone-cert.pem')
  try {
    if (existsSync(keyPath) && existsSync(certPath)) {
      return {
        private: readFileSync(keyPath, 'utf8'),
        cert: readFileSync(certPath, 'utf8'),
      }
    }
  } catch {
    /* regenerate below */
  }

  const attrs = await selfsigned.generate(
    [{ name: 'commonName', value: 'cme-cams' }],
    {
      days: 365,
      keySize: 2048,
      algorithm: 'sha256',
      extensions: [
        {
          name: 'subjectAltName',
          altNames: [
            { type: 2, value: 'localhost' },
            ...lanIps().map((ip) => ({ type: 7 as const, ip })),
          ],
        },
      ],
    },
  )

  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(keyPath, attrs.private, 'utf8')
    writeFileSync(certPath, attrs.cert, 'utf8')
  } catch {
    /* still usable in-memory */
  }

  return { private: attrs.private, cert: attrs.cert }
}

function isChannel(v: unknown): v is SyncChannel {
  return typeof v === 'string' && (CHANNELS as string[]).includes(v)
}

/**
 * Sync hub + optional phone HTTPS port.
 * - :5173 HTTP  → OBS Browser Sources (no SSL blank page)
 * - :5174 HTTPS → phones (camera needs secure context)
 * Hub state is mirrored to disk so restart does not wipe tournaments / drafts.
 */
export function obsSyncPlugin(): Plugin {
  const state: HubState = loadHubFromDisk()
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  function schedulePersist() {
    if (persistTimer != null) return
    persistTimer = setTimeout(() => {
      persistTimer = null
      persistHubToDisk(state)
    }, 400)
  }

  const sockets = new Set<WebSocket>()
  const sse: Record<SyncChannel, Set<ServerResponse>> = {
    draft: new Set(),
    gameplay: new Set(),
    stinger: new Set(),
    bracket: new Set(),
    cams: new Set(),
    lineup: new Set(),
    tournament: new Set(),
    casters: new Set(),
  }

  const wss = new WebSocketServer({ noServer: true })
  let phoneHttpsStarted = false
  let phoneHttpsServer: HttpsServer | null = null

  function wsSend(socket: WebSocket, msg: unknown) {
    if (socket.readyState !== 1) return
    try {
      socket.send(JSON.stringify(msg))
    } catch {
      sockets.delete(socket)
    }
  }

  function broadcastRaw(raw: string, except?: WebSocket) {
    for (const socket of [...sockets]) {
      if (socket === except) continue
      if (socket.readyState !== 1) {
        sockets.delete(socket)
        continue
      }
      try {
        socket.send(raw)
      } catch {
        sockets.delete(socket)
      }
    }
  }

  function broadcastChannel(channel: SyncChannel, payload: Json, except?: WebSocket) {
    broadcastRaw(JSON.stringify({ type: 'update', channel, payload }), except)
    const ssePayload = `data: ${JSON.stringify(payload)}\n\n`
    for (const res of [...sse[channel]]) {
      try {
        res.write(ssePayload)
      } catch {
        sse[channel].delete(res)
      }
    }
  }

  function setChannel(channel: SyncChannel, payload: Json, except?: WebSocket) {
    const next =
      channel === 'tournament'
        ? (protectTournament(payload, state.tournament) as Json)
        : payload
    if (channel === 'tournament' && next !== payload) {
      // Keep the richer roster in memory and on disk; do not broadcast a wipe.
      state.tournament = next
      schedulePersist()
      broadcastChannel('tournament', next, except)
      return
    }
    state[channel] = next
    schedulePersist()
    broadcastChannel(channel, next, except)
  }

  wss.on('connection', (ws) => {
    sockets.add(ws)
    wsSend(ws, { type: 'snapshot', channels: { ...state } })

    ws.on('message', (raw) => {
      try {
        const text = String(raw)
        const msg = JSON.parse(text) as {
          type?: string
          channel?: unknown
          payload?: Json
        }
        if (msg.type === 'ping') {
          wsSend(ws, { type: 'pong' })
          return
        }
        if (msg.type === 'cam') {
          broadcastRaw(text, ws)
          return
        }
        if (msg.type === 'push' && isChannel(msg.channel)) {
          setChannel(msg.channel, msg.payload ?? null, ws)
          return
        }
        if (msg.type === 'get' && isChannel(msg.channel)) {
          wsSend(ws, {
            type: 'update',
            channel: msg.channel,
            payload: state[msg.channel],
          })
        }
      } catch {
        /* ignore */
      }
    })

    ws.on('close', () => sockets.delete(ws))
    ws.on('error', () => sockets.delete(ws))
  })

  function bindUpgrade(httpServer: HttpServer) {
    httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = req.url?.split('?')[0] ?? ''
      if (url !== '/api/sync/ws') return
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    })
  }

  async function startPhoneHttps(vite: ViteDevServer | PreviewServer) {
    if (phoneHttpsStarted || phoneHttpsServer) return
    phoneHttpsStarted = true

    let attrs: { private: string; cert: string }
    try {
      attrs = await loadOrCreatePhoneCert()
    } catch (err) {
      phoneHttpsStarted = false
      console.error('[obs-sync] phone HTTPS cert failed:', err)
      return
    }

    const httpsServer = createHttpsServer(
      { key: attrs.private, cert: attrs.cert },
      // Share Vite's full middleware stack (app + our sync API)
      vite.middlewares,
    )
    phoneHttpsServer = httpsServer

    bindUpgrade(httpsServer)

    httpsServer.listen(PHONE_HTTPS_PORT, '0.0.0.0', () => {
      const ips = lanIps()
      console.log('\n  Phone cams (HTTPS — accept cert warning once):')
      for (const ip of ips) {
        console.log(`    https://${ip}:${PHONE_HTTPS_PORT}/cam`)
      }
      console.log('  OBS overlays (HTTP — use these in Browser Source):')
      console.log('    http://localhost:5173/overlay/game')
      console.log('    http://localhost:5173/overlay/cam/blue\n')
    })

    httpsServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(
          `[obs-sync] phone HTTPS :${PHONE_HTTPS_PORT} already in use — reusing existing listener`,
        )
        phoneHttpsServer = null
        return
      }
      console.error('[obs-sync] phone HTTPS listen error:', err)
      phoneHttpsStarted = false
      phoneHttpsServer = null
    })

    const close = () => {
      try {
        httpsServer.close()
      } catch {
        /* ignore */
      }
      phoneHttpsServer = null
      phoneHttpsStarted = false
    }
    vite.httpServer?.on('close', close)
  }

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url?.split('?')[0] ?? ''

    if (req.method === 'OPTIONS' && url.startsWith('/api/sync/')) {
      res.statusCode = 204
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.end()
      return
    }

    if (url === '/api/sync/snapshot' && req.method === 'GET') {
      sendJson(res, 200, state)
      return
    }

    if (url === '/api/lan' && req.method === 'GET') {
      // HTTP :5173 for OBS; HTTPS :5174 for camera / window share over Wi‑Fi
      sendJson(res, 200, {
        ips: lanIps(),
        port: 5173,
        httpsPort: PHONE_HTTPS_PORT,
      })
      return
    }

    // Download self-signed cert so Windows can trust Wi‑Fi HTTPS (Select window)
    if (
      (url === '/api/cert.pem' || url === '/api/lan/cert') &&
      req.method === 'GET'
    ) {
      const certPath = join(hubDir(), 'phone-cert.pem')
      try {
        if (!existsSync(certPath)) {
          // Ensure cert exists even if HTTPS boot lagged
          void loadOrCreatePhoneCert().then(() => {
            /* next request will serve it */
          })
          sendJson(res, 503, {
            ok: false,
            error: 'Certificate not ready yet — refresh in a second',
          })
          return
        }
        const body = readFileSync(certPath)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/x-pem-file')
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="cme-wifi-cert.pem"',
        )
        res.setHeader('Cache-Control', 'no-store')
        res.end(body)
      } catch (err) {
        sendJson(res, 500, {
          ok: false,
          error: err instanceof Error ? err.message : 'cert read failed',
        })
      }
      return
    }

    // Live Google Sheet → download Drive photos to public/form-media → merge payload
    if (url === '/api/sync/import-form' && (req.method === 'POST' || req.method === 'GET')) {
      const fresh =
        req.method === 'POST'
          ? true
          : (req.url || '').includes('fresh=1')
      void runFormImport(fresh)
        .then((bundle) => {
          const payload = (bundle as { channels?: Record<string, Json> })
            ?.channels?.['mlbb-tournament-state-v2']
          if (payload != null) setChannel('tournament', payload)
          sendJson(res, 200, bundle)
        })
        .catch((err: Error) => {
          console.error('[obs-sync] import-form failed:', err)
          sendJson(res, 500, {
            ok: false,
            error: err?.message || 'import failed',
          })
        })
      return
    }

    for (const channel of CHANNELS) {
      const base = `/api/sync/${channel}`

      if (url === base && req.method === 'GET') {
        sendJson(res, 200, state[channel])
        return
      }

      if (url === base && req.method === 'POST') {
        void readBody(req)
          .then((raw) => {
            const payload = JSON.parse(raw || 'null') as Json
            setChannel(channel, payload)
            sendJson(res, 200, { ok: true })
          })
          .catch(() => sendJson(res, 400, { ok: false }))
        return
      }

      if (url === `${base}/stream` && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        })
        res.write('\n')
        if (state[channel] != null) {
          res.write(`data: ${JSON.stringify(state[channel])}\n\n`)
        }
        sse[channel].add(res)
        req.on('close', () => sse[channel].delete(res))
        return
      }
    }

    next()
  }

  return {
    name: 'obs-sync',
    configureServer(server) {
      if (server.httpServer) bindUpgrade(server.httpServer)
      server.middlewares.use(middleware)
      // After Vite listens, open phone HTTPS
      const boot = () => {
        void startPhoneHttps(server)
      }
      if (server.httpServer?.listening) boot()
      else server.httpServer?.once('listening', boot)
    },
    configurePreviewServer(server) {
      // Fresh form photos live in public/form-media; preview only serves dist.
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        if (!url.startsWith('/form-media/')) {
          next()
          return
        }
        const filePath = join(process.cwd(), 'public', url.slice(1))
        if (!existsSync(filePath)) {
          next()
          return
        }
        const buf = readFileSync(filePath)
        res.statusCode = 200
        res.setHeader('Content-Type', 'image/jpeg')
        res.setHeader('Cache-Control', 'no-store')
        res.end(buf)
      })
      // Missing hashed assets must 404 — SPA fallback returns index.html and
      // browsers then throw: Unexpected token '<', "<!doctype "... is not valid JSON
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        if (!url.startsWith('/assets/')) {
          next()
          return
        }
        const filePath = join(process.cwd(), 'dist', url.slice(1))
        if (!existsSync(filePath)) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(`Missing asset: ${url}\nHard-refresh the page (Ctrl+Shift+R).`)
          return
        }
        next()
      })
      if (server.httpServer) bindUpgrade(server.httpServer)
      server.middlewares.use(middleware)
      const boot = () => {
        void startPhoneHttps(server)
      }
      if (server.httpServer?.listening) boot()
      else server.httpServer?.once('listening', boot)
    },
  }
}
