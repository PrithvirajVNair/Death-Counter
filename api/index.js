import {
  getPublicOverlayState,
  updateState,
  applyAction,
  resetState,
  getStreamerKeyFromToken,
} from './_db.js';

const ALLOWED_ACTIONS = new Set([
  'add',
  'addDeath',
  'undo',
  'undoDeath',
  'addBossKill',
  'bossSlain',
  'undoBossKill',
  'setDeath',
  'setCount',
  'setBossKill',
  'setBossCount',
  'resetSession',
  'resetAll',
  'reset',
]);

const MAX_BODY_BYTES = 65536; // 64 KB limit

async function parseBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body;
  }

  return new Promise((resolve) => {
    let raw = '';
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        req.destroy();
        resolve(null);
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function isValidChannelKey(key) {
  if (!key || typeof key !== 'string') return false;
  return /^[a-zA-Z0-9_-]{3,64}$/.test(key.trim());
}

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
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

    const queryToken = (url.searchParams.get('token') || '').trim();
    const queryKey = (url.searchParams.get('key') || url.searchParams.get('streamerKey') || url.searchParams.get('channel') || '').trim();

    // ─── 1. Public State Retrieval (GET /api/state) ───
    if (req.method === 'GET') {
      if (!queryKey) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_KEY', message: 'Streamer key is required.' },
        });
      }

      if (!isValidChannelKey(queryKey)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_KEY', message: 'Invalid streamer key format.' },
        });
      }

      // Public projection: strictly excludes email and user_id
      const publicState = await getPublicOverlayState(queryKey);
      return res.status(200).json({
        success: true,
        ok: true,
        ...publicState,
      });
    }

    // ─── POST Requests: Require Valid JSON Body ───
    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} is not allowed.` },
      });
    }

    const body = await parseBody(req);
    if (body === null) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_BODY', message: 'Malformed JSON payload or payload too large.' },
      });
    }

    const reqToken = (body.token || queryToken || '').trim();
    const explicitKey = (body.key || body.streamerKey || body.channel || queryKey || '').trim();

    // ─── Authentication & Authorization Verification ───
    let authorizedChannel = null;

    if (reqToken) {
      // Token-based delegation (Friend / Moderator)
      const tokenStreamerKey = await getStreamerKeyFromToken(reqToken);
      if (!tokenStreamerKey) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Remote moderator token is invalid, expired, or revoked.' },
        });
      }

      // If client also supplied an explicit streamer key, enforce that it matches the token
      if (explicitKey && explicitKey !== tokenStreamerKey) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Supplied token does not match the requested streamer key.' },
        });
      }

      authorizedChannel = tokenStreamerKey;
    } else {
      // Direct Streamer Key access (From Controller or Desktop Companion)
      if (!explicitKey || !isValidChannelKey(explicitKey)) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Valid streamer key or moderator token is required.' },
        });
      }
      authorizedChannel = explicitKey;
    }

    // ─── 2. Action Handler (POST /api/action or body.action) ───
    if (isActionPath || body.action) {
      const rawAction = body.action || 'add';
      if (!ALLOWED_ACTIONS.has(rawAction)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ACTION', message: `Unknown action: ${rawAction}` },
        });
      }

      const operationId = body.operationId || req.headers['x-operation-id'] || null;
      const { state, normAction, revision, deduped } = await applyAction(
        rawAction,
        body.value,
        body,
        authorizedChannel,
        reqToken || null,
        operationId
      );

      return res.status(200).json({
        success: true,
        ok: true,
        action: normAction,
        deduped: Boolean(deduped),
        deaths: state.deaths,
        sessionDeaths: state.sessionDeaths,
        allTimeDeaths: state.allTimeDeaths,
        bossKills: state.bossKills,
        revision: revision || state.revision || 1,
        lastUpdated: state.lastUpdated,
        data: state,
      });
    }

    // ─── 3. Reset Handler (POST /api/reset or body.type === 'reset') ───
    if (isResetPath || body.type === 'reset') {
      const target = body.target === 'all' ? 'all' : 'session';
      const updated = await resetState(target, authorizedChannel, reqToken || null);

      return res.status(200).json({
        success: true,
        ok: true,
        reset: target,
        deaths: updated.deaths,
        sessionDeaths: updated.sessionDeaths,
        allTimeDeaths: updated.allTimeDeaths,
        bossKills: updated.bossKills,
        revision: updated.revision || 1,
        lastUpdated: updated.lastUpdated,
        data: updated,
      });
    }

    // ─── 4. Full State Update Handler (POST /api/state) ───
    // Only streamers may update settings or shortcuts (moderators cannot alter settings)
    if (reqToken && (body.settings || body.shortcuts)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Moderators are not permitted to modify streamer settings.' },
      });
    }

    const updated = await updateState(body, authorizedChannel);
    return res.status(200).json({
      success: true,
      ok: true,
      deaths: updated.deaths,
      sessionDeaths: updated.sessionDeaths,
      allTimeDeaths: updated.allTimeDeaths,
      bossKills: updated.bossKills,
      revision: updated.revision || 1,
      lastUpdated: updated.lastUpdated,
      data: updated,
    });
  } catch (err) {
    console.error('[API Error]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An internal server error occurred.' },
    });
  }
}
