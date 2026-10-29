// Serverless Function: /api/state
// Serves and synchronizes death counter state across OBS Studio, browser controller, and desktop apps
import { getState, updateState } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    if (req.method === 'GET') {
      const state = await getState();
      return res.status(200).json(state);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const updated = await updateState(body);
      return res.status(200).json({
        ok: true,
        deaths: updated.deaths,
        sessionDeaths: updated.sessionDeaths,
        allTimeDeaths: updated.allTimeDeaths,
        bossKills: updated.bossKills,
        timestamp: Date.now(),
      });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
