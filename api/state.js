// Serverless Function: /api/state
// Compatible with Vercel, Netlify, and Node.js serverless runtimes

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'online',
      message: 'Souls Game Death Counter API ready',
      timestamp: Date.now()
    });
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      return res.status(200).json({
        ok: true,
        received: Object.keys(body),
        timestamp: Date.now()
      });
    } catch (err) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
