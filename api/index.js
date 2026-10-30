import {
  getPublicOverlayState,
  updateState,
  applyAction,
  resetState,
  verifyStreamerAuth,
  validateModeratorToken,
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

// ─── Distributed / Sliding Window Rate Limiting ───
const rateLimitMap = globalThis.__SDC_RATE_LIMITS__ || (globalThis.__SDC_RATE_LIMITS__ = new Map());

function checkRateLimit(key, limit, windowSeconds) {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  let record = rateLimitMap.get(key);

  if (!record || now - record.startTime > windowMs) {
    record = { count: 1, startTime: now };
    rateLimitMap.set(key, record);
    return { allowed: true, remaining: limit - 1, resetSeconds: windowSeconds };
  }

  record.count += 1;
  const resetSeconds = Math.max(1, Math.ceil((record.startTime + windowMs - now) / 1000));

  if (record.count > limit) {
    return { allowed: false, remaining: 0, resetSeconds };
  }

  return { allowed: true, remaining: limit - record.count, resetSeconds };
}

// Periodic cleanup of expired rate limit keys
if (!globalThis.__SDC_RATE_LIMIT_CLEANUP__) {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rateLimitMap.entries()) {
      if (now - v.startTime > 300000) { // 5 minutes old
        rateLimitMap.delete(k);
      }
    }
  }, 60000);
  if (cleanupTimer.unref) cleanupTimer.unref();
  globalThis.__SDC_RATE_LIMIT_CLEANUP__ = cleanupTimer;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || '127.0.0.1';
}

async function parseBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) {
        return null;
      }
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    // If body is already parsed by framework, verify serialized size
    try {
      const serialized = JSON.stringify(req.body);
      if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) {
        return null;
      }
      return req.body;
    } catch {
      return null;
    }
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Moderator-Token, X-Operation-Id, X-Requested-With');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const rawUrl = req.headers['x-matched-path'] || req.headers['x-forwarded-uri'] || req.url || '';
  const url = new URL(rawUrl, 'http://localhost');
  const pathname = url.pathname.replace(/\/$/, '');
  const clientIp = getClientIp(req);

  try {
    const isActionPath = pathname.endsWith('/action') || pathname.includes('/action');
    const isResetPath = pathname.endsWith('/reset') || pathname.includes('/reset');
    const isValidateTokenPath = pathname.endsWith('/validate-token') || pathname.includes('/validate-token');

    const queryToken = (url.searchParams.get('token') || '').trim();
    const queryKey = (url.searchParams.get('key') || url.searchParams.get('streamerKey') || url.searchParams.get('channel') || '').trim();

    // ─── 1. Remote Token Validation (GET /api/validate-token) ───
    if (req.method === 'GET' && isValidateTokenPath) {
      const rl = checkRateLimit(`ip:val:${clientIp}`, 30, 60);
      if (!rl.allowed) {
        res.setHeader('Retry-After', rl.resetSeconds);
        return res.status(429).json({
          success: false,
          ok: false,
          error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many token validation requests.' },
        });
      }

      if (!queryToken) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: { code: 'MISSING_TOKEN', message: 'Token parameter is required.' },
        });
      }

      const valResult = await validateModeratorToken(queryToken);
      if (!valResult.valid) {
        return res.status(401).json({
          success: false,
          ok: false,
          error: { code: 'INVALID_TOKEN', message: `Token is ${valResult.reason}.` },
        });
      }

      return res.status(200).json({
        success: true,
        ok: true,
        ...valResult,
      });
    }

    // ─── 2. Public State Retrieval (GET /api/state) ───
    if (req.method === 'GET') {
      const rl = checkRateLimit(`ip:get:${clientIp}`, 120, 60);
      if (!rl.allowed) {
        res.setHeader('Retry-After', rl.resetSeconds);
        return res.status(429).json({
          success: false,
          ok: false,
          error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please slow down.' },
        });
      }

      if (!queryKey) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: { code: 'MISSING_KEY', message: 'Streamer key is required.' },
        });
      }

      if (!isValidChannelKey(queryKey)) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: { code: 'INVALID_KEY', message: 'Invalid streamer key format.' },
        });
      }

      const publicState = await getPublicOverlayState(queryKey);
      return res.status(200).json({
        success: true,
        ok: true,
        ...publicState,
      });
    }

    // ─── POST Requests: Strictly Validated ───
    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        ok: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} is not allowed.` },
      });
    }

    // Verify Content-Type
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      return res.status(415).json({
        success: false,
        ok: false,
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json.' },
      });
    }

    const body = await parseBody(req);
    if (body === null) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: { code: 'INVALID_BODY', message: 'Malformed JSON payload or payload exceeded 64KB limit.' },
      });
    }

    // ─── Authentication & Authorization Verification ───
    // Priority 1: Check Streamer Supabase JWT in Authorization header
    const authHeader = req.headers['authorization'] || '';
    const reqToken = (req.headers['x-moderator-token'] || body.token || queryToken || '').trim();
    const explicitKey = (body.key || body.streamerKey || body.channel || queryKey || '').trim();

    let authorizedStreamerKey = null;
    let authType = null; // 'streamer' | 'moderator'
    let moderatorPermissions = null;

    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      // Streamer Authentication via verified Supabase JWT
      const verifiedStreamer = await verifyStreamerAuth(authHeader);
      if (!verifiedStreamer) {
        return res.status(401).json({
          success: false,
          ok: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid or expired streamer authentication token.' },
        });
      }

      // If client supplied explicit key, confirm ownership
      if (explicitKey && explicitKey !== verifiedStreamer.streamerKey) {
        return res.status(403).json({
          success: false,
          ok: false,
          error: { code: 'FORBIDDEN', message: 'You are not authorized to modify another user\'s streamer state.' },
        });
      }

      authorizedStreamerKey = verifiedStreamer.streamerKey;
      authType = 'streamer';
    } else if (reqToken) {
      // Moderator Authentication via Token
      const tokenResult = await validateModeratorToken(reqToken);
      if (!tokenResult.valid) {
        return res.status(401).json({
          success: false,
          ok: false,
          error: { code: 'INVALID_TOKEN', message: `Remote moderator token is ${tokenResult.reason}.` },
        });
      }

      if (explicitKey && explicitKey !== tokenResult.streamerKey) {
        return res.status(403).json({
          success: false,
          ok: false,
          error: { code: 'FORBIDDEN', message: 'Supplied token does not match the requested streamer.' },
        });
      }

      authorizedStreamerKey = tokenResult.streamerKey;
      authType = 'moderator';
      moderatorPermissions = tokenResult.permissions;
    } else {
      // STRICT: Neither JWT nor Moderator Token provided. Streamer key alone is NOT sufficient!
      return res.status(401).json({
        success: false,
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required. Provide a valid Bearer token (for streamers) or a Moderator token.',
        },
      });
    }

    // Rate Limiting per Streamer / Token
    const rateLimitKey = authType === 'streamer'
      ? `streamer:${authorizedStreamerKey}`
      : `mod:${reqToken.slice(0, 16)}`;
    const limitMax = authType === 'streamer' ? 120 : 60;
    const rl = checkRateLimit(rateLimitKey, limitMax, 60);

    if (!rl.allowed) {
      res.setHeader('Retry-After', rl.resetSeconds);
      return res.status(429).json({
        success: false,
        ok: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Action rate limit exceeded. Please slow down.' },
      });
    }

    // ─── 3. Action Handler (POST /api/action or body.action) ───
    if (isActionPath || body.action) {
      const rawAction = body.action || 'add';
      if (!ALLOWED_ACTIONS.has(rawAction)) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: { code: 'INVALID_ACTION', message: `Unknown action: ${rawAction}` },
        });
      }

      // Check Moderator Permissions for Action
      if (authType === 'moderator' && moderatorPermissions) {
        if ((rawAction === 'add' || rawAction === 'addDeath' || rawAction === 'undo' || rawAction === 'undoDeath') &&
            !moderatorPermissions.can_increment_deaths) {
          return res.status(403).json({
            success: false,
            ok: false,
            error: { code: 'PERMISSION_DENIED', message: 'Moderator token does not have permission to modify deaths.' },
          });
        }
        if ((rawAction === 'addBossKill' || rawAction === 'bossSlain' || rawAction === 'undoBossKill') &&
            !moderatorPermissions.can_increment_bosses) {
          return res.status(403).json({
            success: false,
            ok: false,
            error: { code: 'PERMISSION_DENIED', message: 'Moderator token does not have permission to modify boss kills.' },
          });
        }
        if ((rawAction === 'setDeath' || rawAction === 'setCount') &&
            !moderatorPermissions.can_set_deaths) {
          return res.status(403).json({
            success: false,
            ok: false,
            error: { code: 'PERMISSION_DENIED', message: 'Moderator token does not have permission to set death count.' },
          });
        }
        if ((rawAction === 'setBossKill' || rawAction === 'setBossCount') &&
            !moderatorPermissions.can_set_bosses) {
          return res.status(403).json({
            success: false,
            ok: false,
            error: { code: 'PERMISSION_DENIED', message: 'Moderator token does not have permission to set boss kill count.' },
          });
        }
        if ((rawAction === 'resetSession' || rawAction === 'reset') &&
            !moderatorPermissions.can_reset_session) {
          return res.status(403).json({
            success: false,
            ok: false,
            error: { code: 'PERMISSION_DENIED', message: 'Moderator token does not have permission to reset session.' },
          });
        }
        if (rawAction === 'resetAll' && !moderatorPermissions.can_reset_all) {
          return res.status(403).json({
            success: false,
            ok: false,
            error: { code: 'PERMISSION_DENIED', message: 'Moderator token does not have permission to perform a full reset.' },
          });
        }
      }

      const operationId = (body.operationId || req.headers['x-operation-id'] || '').trim();
      if (!operationId || operationId.length < 8 || operationId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(operationId)) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: {
            code: 'INVALID_OPERATION_ID',
            message: 'A unique operationId (8-128 alphanumeric characters) is required for mutation actions.',
          },
        });
      }

      const { state, normAction, revision, deduped } = await applyAction(
        rawAction,
        body.value,
        body,
        authorizedStreamerKey,
        authType === 'moderator' ? reqToken : null,
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

    // ─── 4. Reset Handler (POST /api/reset or body.type === 'reset') ───
    if (isResetPath || body.type === 'reset') {
      const target = body.target;
      if (target !== 'session' && target !== 'all') {
        return res.status(400).json({
          success: false,
          ok: false,
          error: { code: 'INVALID_TARGET', message: 'Reset target must be explicitly "session" or "all".' },
        });
      }

      if (authType === 'moderator' && moderatorPermissions) {
        if (target === 'session' && !moderatorPermissions.can_reset_session) {
          return res.status(403).json({
            success: false,
            ok: false,
            error: { code: 'PERMISSION_DENIED', message: 'Moderator token does not have permission to reset session.' },
          });
        }
        if (target === 'all' && !moderatorPermissions.can_reset_all) {
          return res.status(403).json({
            success: false,
            ok: false,
            error: { code: 'PERMISSION_DENIED', message: 'Moderator token does not have permission for full reset.' },
          });
        }
      }

      const operationId = (body.operationId || req.headers['x-operation-id'] || '').trim() ||
        `rst_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      const updated = await resetState(
        target,
        authorizedStreamerKey,
        authType === 'moderator' ? reqToken : null,
        operationId
      );

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

    // ─── 5. Full State Update Handler (POST /api/state) ───
    // Strictly forbidden for remote moderators (only streamers can update settings/shortcuts)
    if (authType !== 'streamer') {
      return res.status(403).json({
        success: false,
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Only authenticated streamers may update configuration or full state.' },
      });
    }

    const updated = await updateState(body, authorizedStreamerKey);
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
    const status = err.status || 500;
    const code = err.code || 'INTERNAL_ERROR';
    console.error('[API Error]:', err.message);

    return res.status(status).json({
      success: false,
      ok: false,
      error: { code, message: err.message || 'An internal server error occurred.' },
    });
  }
}
