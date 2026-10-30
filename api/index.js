import { getState, updateState, applyAction, resetState } from './_db.js';

async function parseBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    return req.body;
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const rawUrl = req.headers['x-matched-path'] || req.headers['x-forwarded-uri'] || req.url || '';
  const url = new URL(rawUrl, 'http://localhost');
  const pathname = url.pathname.replace(/\/$/, '');

  try {
    const isActionPath = pathname.endsWith('/action') || pathname.includes('/action');
    const isResetPath = pathname.endsWith('/reset') || pathname.includes('/reset');

    if (req.method === 'POST') {
      const body = await parseBody(req);

      // ─── 1. Action Handler (by URL path or by presence of body.action) ───
      if (isActionPath || body.action) {
        const rawAction = body.action || 'add';
        const { state, normAction } = applyAction(rawAction, body.value, body);
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

      // ─── 2. Reset Handler ───
      if (isResetPath || body.type === 'reset') {
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

      // ─── 3. State Update Handler ───
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

    // ─── 4. State Retrieval Handler (GET) ───
    if (req.method === 'GET') {
      return res.status(200).json(getState());
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
