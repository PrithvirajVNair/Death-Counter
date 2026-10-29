// Serverless Function: /api/action
// Compatible with Vercel, Netlify, and Node.js serverless runtimes

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const rawAction = body.action;

    if (!rawAction) {
      return res.status(400).json({ error: 'Missing "action" in request body' });
    }

    const normAction = (rawAction === 'add' || rawAction === 'addDeath') ? 'add'
      : (rawAction === 'undo' || rawAction === 'undoDeath') ? 'undo'
      : (rawAction === 'addBossKill' || rawAction === 'bossSlain') ? 'addBossKill'
      : (rawAction === 'undoBossKill') ? 'undoBossKill'
      : (rawAction === 'set' || rawAction === 'setDeath') ? 'setDeath'
      : (rawAction === 'setBossKill') ? 'setBossKill'
      : rawAction;

    const validActions = ['add', 'undo', 'addBossKill', 'undoBossKill', 'setDeath', 'setBossKill'];
    if (!validActions.includes(normAction)) {
      return res.status(400).json({ error: `Invalid action: ${rawAction}` });
    }

    return res.status(200).json({
      ok: true,
      action: normAction,
      value: body.value !== undefined ? Number(body.value) : undefined,
      processedAt: new Date().toISOString(),
      timestamp: Date.now()
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
