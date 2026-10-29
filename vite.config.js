import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function deathCounterSyncPlugin() {
  const dataFilePath = path.resolve(__dirname, 'death-counter-data.json')

  const defaultState = {
    deaths: 0,
    sessionDeaths: 0,
    allTimeDeaths: 0,
    bossKills: 0,
    settings: {
      preset: 'classic-rune',
      fontSize: 72,
      labelVisible: true,
      runeVisible: true,
      goldColor: '#C8A65D',
      glowIntensity: 0.6,
      alignment: 'center',
      layout: 'horizontal',
      frameVisible: true,
      animationsEnabled: true,
      animationIntensity: 0.7,
      padding: 20,
      scale: 1,
      sessionCountVisible: false,
      bossAttemptsInOverlay: false,
      showBossKills: false,
      overlayMode: 'deaths',
    },
    shortcuts: {
      addDeath: 'F8',
      undoDeath: 'F7',
      addBossKill: 'F9',
      undoBossKill: 'F10',
      enabled: true,
    },
    bosses: {},
    currentBoss: '',
    history: [],
  }

  let state = { ...defaultState }
  const lastActionTimes = {}

  // Load from file if available
  try {
    if (fs.existsSync(dataFilePath)) {
      const saved = JSON.parse(fs.readFileSync(dataFilePath, 'utf-8'))
      state = {
        ...defaultState,
        ...saved,
        settings: { ...defaultState.settings, ...(saved.settings || {}) },
        shortcuts: { ...defaultState.shortcuts, ...(saved.shortcuts || {}) },
      }
    }
  } catch (err) {
    console.warn('[Sync Plugin] Failed to read initial data file:', err.message)
  }

  function persist() {
    try {
      fs.writeFileSync(dataFilePath, JSON.stringify(state, null, 2), 'utf-8')
    } catch (err) {
      console.warn('[Sync Plugin] Failed to write data file:', err.message)
    }
  }

  const sseClients = new Set()

  function broadcastSSE(msg) {
    const data = `data: ${JSON.stringify(msg)}\n\n`
    for (const client of sseClients) {
      try {
        client.write(data)
      } catch {
        sseClients.delete(client)
      }
    }
  }

  const middleware = (req, res, next) => {
    // Enable CORS for all API calls
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    const parsedUrl = new URL(req.url, 'http://localhost')
    const pathname = parsedUrl.pathname

    if (pathname === '/api/state' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(state))
      return
    }

    // Direct Action Endpoint (Called by native global hotkey daemon or external tools)
    if (pathname === '/api/action' && req.method === 'POST') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        try {
          const { action } = JSON.parse(body)
          const now = Date.now()
          const normAction = (action === 'add' || action === 'addDeath') ? 'add'
            : (action === 'undo' || action === 'undoDeath') ? 'undo'
            : (action === 'addBossKill' || action === 'bossSlain') ? 'addBossKill'
            : (action === 'undoBossKill') ? 'undoBossKill'
            : action

          // Deduplicate rapid repeat requests (< 350ms) to prevent double counting
          if (lastActionTimes[normAction] && (now - lastActionTimes[normAction] < 350)) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              ok: true,
              action: normAction,
              deaths: state.deaths,
              bossKills: state.bossKills || 0,
              deduped: true
            }))
            return
          }
          lastActionTimes[normAction] = now

          if (action === 'add' || action === 'addDeath') {
            state.deaths += 1
            state.sessionDeaths += 1
            state.allTimeDeaths += 1
            state.history = [
              ...(state.history || []).slice(-99),
              { action: 'add', timestamp: Date.now(), value: state.deaths },
            ]
            persist()

            broadcastSSE({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'deaths',
              payload: {
                deaths: state.deaths,
                sessionDeaths: state.sessionDeaths,
                allTimeDeaths: state.allTimeDeaths,
                bossKills: state.bossKills || 0,
                history: state.history,
                triggerAnim: true,
              },
              timestamp: Date.now(),
            })

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, action: 'add', deaths: state.deaths, bossKills: state.bossKills || 0 }))
            return
          } else if (action === 'undo' || action === 'undoDeath') {
            if (state.deaths > 0) {
              state.deaths -= 1
              state.sessionDeaths = Math.max(0, state.sessionDeaths - 1)
              state.history = [
                ...(state.history || []).slice(-99),
                { action: 'undo', timestamp: Date.now(), value: state.deaths },
              ]
              persist()

              broadcastSSE({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                type: 'deaths',
                payload: {
                  deaths: state.deaths,
                  sessionDeaths: state.sessionDeaths,
                  allTimeDeaths: state.allTimeDeaths,
                  bossKills: state.bossKills || 0,
                  history: state.history,
                  triggerAnim: false,
                },
                timestamp: Date.now(),
              })
            }
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, action: 'undo', deaths: state.deaths, bossKills: state.bossKills || 0 }))
            return
          } else if (action === 'addBossKill' || action === 'bossSlain') {
            state.bossKills = (state.bossKills || 0) + 1
            persist()

            broadcastSSE({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'bossKills',
              payload: {
                bossKills: state.bossKills,
                deaths: state.deaths,
                currentBoss: state.currentBoss,
                triggerAnim: true,
              },
              timestamp: Date.now(),
            })

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, action: 'addBossKill', bossKills: state.bossKills, deaths: state.deaths }))
            return
          } else if (action === 'undoBossKill') {
            state.bossKills = Math.max(0, (state.bossKills || 0) - 1)
            persist()

            broadcastSSE({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'bossKills',
              payload: {
                bossKills: state.bossKills,
                deaths: state.deaths,
                currentBoss: state.currentBoss,
                triggerAnim: false,
              },
              timestamp: Date.now(),
            })

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, action: 'undoBossKill', bossKills: state.bossKills, deaths: state.deaths }))
            return
          }

          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Unknown action' }))
        } catch (e) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: e.message }))
        }
      })
      return
    }

    if (pathname === '/api/state' && req.method === 'POST') {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        try {
          const payload = JSON.parse(body)

          if (payload.deaths !== undefined) state.deaths = payload.deaths
          if (payload.sessionDeaths !== undefined) state.sessionDeaths = payload.sessionDeaths
          if (payload.allTimeDeaths !== undefined) state.allTimeDeaths = payload.allTimeDeaths
          if (payload.bossKills !== undefined) state.bossKills = payload.bossKills
          if (payload.history !== undefined) state.history = payload.history
          if (payload.settings) state.settings = { ...state.settings, ...payload.settings }
          if (payload.shortcuts) state.shortcuts = { ...state.shortcuts, ...payload.shortcuts }
          if (payload.bosses) state.bosses = { ...state.bosses, ...payload.bosses }
          if (payload.currentBoss !== undefined) state.currentBoss = payload.currentBoss

          persist()

          const updateMessage = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: payload.type || 'stateUpdate',
            payload: {
              ...state,
              triggerAnim: payload.triggerAnim || false,
            },
            timestamp: Date.now(),
          }

          broadcastSSE(updateMessage)

          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, state }))
        } catch (e) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: e.message }))
        }
      })
      return
    }

    if (pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })

      // Send initial full sync
      const initMessage = {
        id: `init-${Date.now()}`,
        type: 'fullSync',
        payload: state,
        timestamp: Date.now(),
      }
      res.write(`data: ${JSON.stringify(initMessage)}\n\n`)

      sseClients.add(res)

      req.on('close', () => {
        sseClients.delete(res)
      })
      return
    }

    next()
  }

  // Heartbeat every 15s to keep connections alive
  setInterval(() => {
    for (const client of sseClients) {
      try {
        client.write(': keepalive\n\n')
      } catch {
        sseClients.delete(client)
      }
    }
  }, 15000)

  return {
    name: 'death-counter-sync-server',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), deathCounterSyncPlugin()],
  server: {
    port: 5173,
    host: true,
  },
})
