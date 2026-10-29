import { getState, updateState, applyAction, resetState } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/$/, '');

  try {
    // ─── 1. /api/action Endpoint ───
    if (pathname.endsWith('/action') && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const rawAction = body.action;
      if (!rawAction) {
        return res.status(400).json({ error: 'Missing action' });
      }
      const { state, normAction } = applyAction(rawAction, body.value);
      return res.status(200).json({
        ok: true,
        action: normAction,
        deaths: state.deaths,
        sessionDeaths: state.sessionDeaths,
        allTimeDeaths: state.allTimeDeaths,
        bossKills: state.bossKills,
        lastUpdated: state.lastUpdated,
        timestamp: Date.now(),
      });
    }

    // ─── 2. /api/reset Endpoint ───
    if (pathname.endsWith('/reset') && req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const target = body.target || 'session';
      const state = resetState(target);
      return res.status(200).json({
        ok: true,
        reset: target,
        deaths: state.deaths,
        sessionDeaths: state.sessionDeaths,
        allTimeDeaths: state.allTimeDeaths,
        bossKills: state.bossKills,
        lastUpdated: state.lastUpdated,
        timestamp: Date.now(),
      });
    }

    // ─── 3. /api/state Endpoint ───
    if (pathname.endsWith('/state')) {
      if (req.method === 'GET') {
        const state = getState();
        return res.status(200).json(state);
      }
      if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const updated = updateState(body);
        return res.status(200).json({
          ok: true,
          deaths: updated.deaths,
          sessionDeaths: updated.sessionDeaths,
          allTimeDeaths: updated.allTimeDeaths,
          bossKills: updated.bossKills,
          lastUpdated: updated.lastUpdated,
          timestamp: Date.now(),
        });
      }
    }

    // Default fallback
    if (req.method === 'GET') {
      return res.status(200).json(getState());
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
