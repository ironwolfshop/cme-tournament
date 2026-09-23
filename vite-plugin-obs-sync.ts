import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite'
import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { networkInterfaces } from 'node:os'
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

function isChannel(v: unknown): v is SyncChannel {
  return typeof v === 'string' && (CHANNELS as string[]).includes(v)
}

/**
 * Sync hub + optional phone HTTPS port.
 * - :5173 HTTP  → OBS Browser Sources (no SSL blank page)
 * - :5174 HTTPS → phones (camera needs secure context)
 */
export function obsSyncPlugin(): Plugin {
  const state: HubState = {
    draft: null,
    gameplay: null,
    stinger: null,
    bracket: null,
    cams: null,
    lineup: null,
    tournament: null,
    casters: null,
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
    state[channel] = payload
    broadcastChannel(channel, payload, except)
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
