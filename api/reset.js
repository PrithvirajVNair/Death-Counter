// Serverless Function: /api/reset
import { resetState } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const target = body.target || 'session';
    const state = await resetState(target);

    return res.status(200).json({
      ok: true,
      reset: target,
      deaths: state.deaths,
      sessionDeaths: state.sessionDeaths,
      allTimeDeaths: state.allTimeDeaths,
      bossKills: state.bossKills,
      timestamp: Date.now(),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
