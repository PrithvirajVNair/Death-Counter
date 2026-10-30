import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

let supabaseClient = null;

export function getSupabaseCredentials() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  return { url, key, isConfigured: Boolean(url && key) };
}

export function getSupabase() {
  const { url, key } = getSupabaseCredentials();

  // In production, server operations MUST have both URL and Service Role Key
  if (!url || !key) {
    if (process.env.NODE_ENV === 'production') {
      const err = new Error('[DB Config Error] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are strictly required for production operations.');
      err.code = 'CONFIG_ERROR';
      err.status = 503;
      throw err;
    }
    return null;
  }

  if (supabaseClient && supabaseClient._url === url && supabaseClient._key === key) {
    return supabaseClient;
  }

  try {
    supabaseClient = createClient(url, key, {
      auth: { persistSession: false },
    });
    supabaseClient._url = url;
    supabaseClient._key = key;
    return supabaseClient;
  } catch (e) {
    console.error('[DB] Failed to initialize Supabase client:', e.message);
    if (process.env.NODE_ENV === 'production') {
      throw e;
    }
    return null;
  }
}

export const DEFAULT_STATE = {
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
    presetColors: {},
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
  revision: 1,
  lastUpdated: 0,
};

// Non-authoritative in-memory read cache (Never used for production writes)
const channelMap = globalThis.__DEATH_COUNTER_CHANNELS__ || (globalThis.__DEATH_COUNTER_CHANNELS__ = new Map());

export function hashToken(token) {
  if (!token) return '';
  return crypto.createHash('sha256').update(String(token).trim()).digest('hex');
}

/**
 * Fetch authoritative state for a streamer key.
 * Always queries Supabase PostgreSQL as the true persistent source of truth.
 * Fails closed on database errors (never returns zero-state as success during outages).
 */
export async function getState(channel = '') {
  if (!channel) {
    return { ...DEFAULT_STATE };
  }

  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('streamer_states')
        .select('streamer_key, deaths, session_deaths, all_time_deaths, boss_kills, settings, shortcuts, bosses, current_boss, revision, last_updated')
        .eq('streamer_key', channel)
        .maybeSingle();

      if (error) {
        console.warn(`[DB] Database error fetching state for ${channel}:`, error.message);
        const dbErr = new Error(`Database service unavailable: ${error.message}`);
        dbErr.code = 'SERVICE_UNAVAILABLE';
        dbErr.status = 503;
        throw dbErr;
      }

      if (data) {
        const state = {
          deaths: Math.max(0, data.deaths ?? 0),
          sessionDeaths: Math.max(0, data.session_deaths ?? 0),
          allTimeDeaths: Math.max(0, data.all_time_deaths ?? 0),
          bossKills: Math.max(0, data.boss_kills ?? 0),
          settings: data.settings || DEFAULT_STATE.settings,
          shortcuts: data.shortcuts || DEFAULT_STATE.shortcuts,
          bosses: data.bosses || {},
          currentBoss: data.current_boss || '',
          history: [],
          revision: data.revision || 1,
          lastUpdated: data.last_updated || Date.now(),
        };
        channelMap.set(channel, state);
        return state;
      }

      // Record does not exist: return initial zero state flagged as not found
      return { ...DEFAULT_STATE, streamerKey: channel, lastUpdated: Date.now(), notFound: true };
    } catch (e) {
      if (e.status === 503) throw e;
      const dbErr = new Error(`Database service unavailable: ${e.message}`);
      dbErr.code = 'SERVICE_UNAVAILABLE';
      dbErr.status = 503;
      throw dbErr;
    }
  }

  // Fallback to cache for read-only resilience in unit tests
  if (channelMap.has(channel)) {
    return { ...channelMap.get(channel) };
  }

  if (process.env.NODE_ENV === 'test' || !getSupabaseCredentials()) {
    return { ...DEFAULT_STATE, streamerKey: channel, lastUpdated: Date.now() };
  }

  const err = new Error('Database service unavailable.');
  err.code = 'SERVICE_UNAVAILABLE';
  err.status = 503;
  throw err;
}

/**
 * Public Overlay State Projection.
 * Strictly excludes sensitive fields (email, user_id, raw tokens).
 */
export async function getPublicOverlayState(channel = '') {
  const full = await getState(channel);
  return {
    streamerKey: channel,
    deaths: full.deaths,
    sessionDeaths: full.sessionDeaths,
    allTimeDeaths: full.allTimeDeaths,
    bossKills: full.bossKills,
    settings: full.settings,
    shortcuts: full.shortcuts,
    bosses: full.bosses,
    currentBoss: full.currentBoss,
    revision: full.revision,
    lastUpdated: full.lastUpdated,
  };
}

/**
 * Verify Streamer Supabase JWT server-side.
 * Resolves verified auth identity and confirms streamer ownership.
 */
export async function verifyStreamerAuth(jwtToken) {
  if (!jwtToken || typeof jwtToken !== 'string') return null;
  const token = jwtToken.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const sb = getSupabase();
  if (!sb) {
    if (process.env.NODE_ENV === 'test' || !getSupabaseCredentials()) {
      if (token === 'valid-streamer-jwt') {
        return {
          userId: 'test-user-uuid-1234',
          email: 'streamer@test.local',
          streamerKey: 'test-streamer',
          displayName: 'Test Streamer',
        };
      }
      if (token === 'other-user-jwt') {
        return {
          userId: 'other-user-uuid-9999',
          email: 'other@test.local',
          streamerKey: 'other-streamer',
          displayName: 'Other Streamer',
        };
      }
      if (token === 'expired-jwt' || token === 'invalid-jwt') {
        return null;
      }
    }
    return null;
  }

  try {
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (error || !user) return null;

    // Fetch streamer_key owned by this user
    const { data: streamer, error: streamerError } = await sb
      .from('streamer_states')
      .select('streamer_key, user_id, display_name, email')
      .eq('user_id', user.id)
      .maybeSingle();

    if (streamerError || !streamer) return null;

    return {
      userId: user.id,
      email: user.email,
      streamerKey: streamer.streamer_key,
      displayName: streamer.display_name,
    };
  } catch (err) {
    console.warn('[DB] Auth verification error:', err.message);
    return null;
  }
}

/**
 * Validate Remote Moderator Token via SHA-256 hash lookup in Supabase.
 * Enforces expiration, revocation, and returns fine-grained permissions.
 */
export async function validateModeratorToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return { valid: false, reason: 'missing' };
  const clean = rawToken.trim();
  const tokenHash = hashToken(clean);

  const sb = getSupabase();
  if (!sb) {
    if (process.env.NODE_ENV === 'test' || !getSupabaseCredentials()) {
      // Mock validation in offline unit test environment
      if (clean === 'valid-token') {
        return {
          valid: true,
          tokenId: 'test-token-id',
          streamerKey: 'test-streamer',
          streamerName: 'Test Streamer',
          label: 'Test Mod',
          permissions: {
            can_increment_deaths: true,
            can_increment_bosses: true,
            can_set_deaths: true,
            can_set_bosses: true,
            can_reset_session: true,
            can_reset_all: false,
          },
          expiresAt: null,
        };
      }
      if (clean === 'expired-token') {
        return { valid: false, reason: 'expired', streamerName: 'Test Streamer' };
      }
      if (clean === 'revoked-token') {
        return { valid: false, reason: 'revoked', streamerName: 'Test Streamer' };
      }
      if (clean === 'limited-mod-token') {
        return {
          valid: true,
          tokenId: 'limited-token-id',
          streamerKey: 'test-streamer',
          streamerName: 'Test Streamer',
          label: 'Limited Mod',
          permissions: {
            can_increment_deaths: true,
            can_increment_bosses: false,
            can_set_deaths: false,
            can_set_bosses: false,
            can_reset_session: false,
            can_reset_all: false,
          },
          expiresAt: null,
        };
      }
      return { valid: false, reason: 'invalid_token' };
    }
    return { valid: false, reason: 'service_unavailable' };
  }

  try {
    const { data, error } = await sb
      .from('streamer_remote_tokens')
      .select('id, streamer_key, streamer_name, label, permissions, expires_at, is_revoked')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (error || !data) {
      return { valid: false, reason: 'not_found' };
    }

    if (data.is_revoked) {
      return { valid: false, reason: 'revoked', streamerName: data.streamer_name };
    }

    if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
      return { valid: false, reason: 'expired', streamerName: data.streamer_name, expiresAt: data.expires_at };
    }

    const defaultPerms = {
      can_increment_deaths: true,
      can_increment_bosses: true,
      can_set_deaths: true,
      can_set_bosses: true,
      can_reset_session: true,
      can_reset_all: false,
    };

    return {
      valid: true,
      tokenId: data.id,
      streamerKey: data.streamer_key,
      streamerName: data.streamer_name || 'Streamer',
      label: data.label || 'Friend Access',
      permissions: { ...defaultPerms, ...(data.permissions || {}) },
      expiresAt: data.expires_at,
    };
  } catch (err) {
    console.warn('[DB] Token validation error:', err.message);
    return { valid: false, reason: 'error' };
  }
}

/**
 * Backward compatibility helper for token -> streamerKey resolution.
 */
export async function getStreamerKeyFromToken(rawToken) {
  const result = await validateModeratorToken(rawToken);
  return result.valid ? result.streamerKey : null;
}

/**
 * Apply atomic counter mutation to authoritative state.
 * Strictly uses PostgreSQL stored procedure mutate_counter_backend with row-level locks.
 * NEVER falls back to unprotected direct UPDATE or local memory in production.
 */
export async function applyAction(rawAction, value, extra = {}, channel = '', token = null, operationId = null) {
  if (!channel) {
    const err = new Error('Missing channel / streamer key');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const normAction =
    rawAction === 'add' || rawAction === 'addDeath' ? 'add'
    : rawAction === 'undo' || rawAction === 'undoDeath' ? 'undo'
    : rawAction === 'addBossKill' || rawAction === 'bossSlain' ? 'addBossKill'
    : rawAction === 'undoBossKill' ? 'undoBossKill'
    : rawAction === 'set' || rawAction === 'setDeath' || rawAction === 'setCount' ? 'setDeath'
    : rawAction === 'setBossKill' || rawAction === 'setBossCount' ? 'setBossKill'
    : rawAction === 'resetSession' || rawAction === 'reset' ? 'resetSession'
    : rawAction === 'resetAll' ? 'resetAll'
    : null;

  if (!normAction) {
    const err = new Error(`Invalid counter action: ${rawAction}`);
    err.code = 'INVALID_ACTION';
    err.status = 400;
    throw err;
  }

  const opId = (operationId || extra.operationId || '').trim();
  if (!opId || opId.length < 8 || opId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(opId)) {
    const err = new Error('Invalid or missing operationId (must be 8-128 alphanumeric characters)');
    err.code = 'INVALID_OPERATION_ID';
    err.status = 400;
    throw err;
  }

  const intVal = Math.max(0, parseInt(value !== undefined ? value : (extra.value || 0), 10) || 0);
  const sb = getSupabase();

  if (!sb) {
    // Isolated unit test environment support only
    if (process.env.NODE_ENV === 'test' || !getSupabaseCredentials()) {
      return executeOfflineTestMutation(normAction, intVal, extra, channel, opId);
    }
    const err = new Error('Database service unavailable.');
    err.code = 'SERVICE_UNAVAILABLE';
    err.status = 503;
    throw err;
  }

  // Authoritative PostgreSQL RPC mutate_counter_backend execution via service_role client
  const { data: rpcResult, error: rpcError } = await sb.rpc('mutate_counter_backend', {
    p_streamer_key: channel,
    p_action: normAction,
    p_value: intVal,
    p_operation_id: opId,
    p_caller_type: token ? 'moderator' : 'streamer',
    p_caller_id: token ? hashToken(token) : channel,
  });

  if (rpcError) {
    const msg = rpcError.message || 'Counter mutation failed';
    const err = new Error(msg);
    if (msg.includes('Unauthorized') || msg.includes('Invalid or missing operation_id')) {
      err.code = 'UNAUTHORIZED';
      err.status = 401;
    } else if (msg.includes('Permission denied')) {
      err.code = 'FORBIDDEN';
      err.status = 403;
    } else if (msg.includes('not found')) {
      err.code = 'NOT_FOUND';
      err.status = 404;
    } else if (msg.includes('conflicting action')) {
      err.code = 'CONFLICT';
      err.status = 409;
    } else {
      err.code = 'MUTATION_FAILED';
      err.status = 500;
    }
    throw err;
  }

  if (!rpcResult || !rpcResult.success) {
    const err = new Error('Database mutation did not return valid result state');
    err.code = 'MUTATION_FAILED';
    err.status = 500;
    throw err;
  }

  const nextState = {
    deaths: rpcResult.deaths,
    sessionDeaths: rpcResult.sessionDeaths,
    allTimeDeaths: rpcResult.allTimeDeaths,
    bossKills: rpcResult.bossKills,
    revision: rpcResult.revision,
    lastUpdated: rpcResult.lastUpdated,
  };

  // Update read cache
  channelMap.set(channel, { ...(channelMap.get(channel) || DEFAULT_STATE), ...nextState });

  return {
    state: nextState,
    normAction,
    revision: rpcResult.revision,
    deduped: Boolean(rpcResult.deduped),
  };
}

/**
 * Offline simulation helper strictly for unit tests running without live database credentials.
 */
function executeOfflineTestMutation(normAction, intVal, extra, channel, opId) {
  const current = channelMap.get(channel) || { ...DEFAULT_STATE, revision: 1 };
  const next = { ...current };

  // Check idempotency in test map
  const idempotencyKey = `${channel}:${opId}`;
  globalThis.__TEST_IDEMPOTENCY__ = globalThis.__TEST_IDEMPOTENCY__ || new Map();
  if (globalThis.__TEST_IDEMPOTENCY__.has(idempotencyKey)) {
    const cached = globalThis.__TEST_IDEMPOTENCY__.get(idempotencyKey);
    if (cached.action !== normAction) {
      const err = new Error('Operation ID reuse with conflicting action');
      err.code = 'CONFLICT';
      err.status = 409;
      throw err;
    }
    return {
      state: cached.state,
      normAction,
      revision: cached.revision,
      deduped: true,
    };
  }

  if (normAction === 'add') {
    next.deaths += 1;
    next.sessionDeaths += 1;
    next.allTimeDeaths += 1;
  } else if (normAction === 'undo') {
    next.deaths = Math.max(0, next.deaths - 1);
    next.sessionDeaths = Math.max(0, next.sessionDeaths - 1);
  } else if (normAction === 'addBossKill') {
    next.bossKills = Math.max(0, (next.bossKills || 0) + 1);
  } else if (normAction === 'undoBossKill') {
    next.bossKills = Math.max(0, (next.bossKills || 0) - 1);
  } else if (normAction === 'setDeath') {
    const diff = intVal - next.deaths;
    next.deaths = intVal;
    next.sessionDeaths = Math.max(0, next.sessionDeaths + diff);
    next.allTimeDeaths = Math.max(0, next.allTimeDeaths + Math.max(0, diff));
  } else if (normAction === 'setBossKill') {
    next.bossKills = intVal;
  } else if (normAction === 'resetSession') {
    next.deaths = 0;
    next.sessionDeaths = 0;
  } else if (normAction === 'resetAll') {
    next.deaths = 0;
    next.sessionDeaths = 0;
    next.allTimeDeaths = 0;
    next.bossKills = 0;
  }

  next.revision = (next.revision || 0) + 1;
  next.lastUpdated = Date.now();
  channelMap.set(channel, next);

  globalThis.__TEST_IDEMPOTENCY__.set(idempotencyKey, {
    action: normAction,
    state: next,
    revision: next.revision,
  });

  return {
    state: next,
    normAction,
    revision: next.revision,
    deduped: false,
  };
}

/**
 * Reset counter state (Session or All-Time).
 * Routes through applyAction to ensure atomic transaction and idempotency logging.
 */
export async function resetState(target = 'session', channel = '', token = null, operationId = null) {
  const normTarget = target === 'all' ? 'resetAll' : 'resetSession';
  const opId = operationId || `rst_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const { state } = await applyAction(normTarget, 0, {}, channel, token, opId);
  return state;
}

/**
 * Update configuration/settings in database via atomic update_streamer_config RPC.
 * Strictly for authenticated streamers. NEVER touches counter columns.
 */
export async function updateState(updatesOrChannel = {}, channelOrUpdates = '') {
  let updates = updatesOrChannel;
  let channel = channelOrUpdates;
  if (typeof updatesOrChannel === 'string' && typeof channelOrUpdates === 'object') {
    channel = updatesOrChannel;
    updates = channelOrUpdates || {};
  }

  if (!channel) {
    const err = new Error('Channel key required');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const sb = getSupabase();
  const current = await getState(channel);

  const next = {
    ...current,
    settings: updates.settings ? { ...current.settings, ...updates.settings } : current.settings,
    shortcuts: updates.shortcuts ? { ...current.shortcuts, ...updates.shortcuts } : current.shortcuts,
    bosses: updates.bosses !== undefined ? updates.bosses : current.bosses,
    currentBoss: updates.currentBoss !== undefined ? updates.currentBoss : current.currentBoss,
    revision: (current.revision || 0) + 1,
    lastUpdated: Date.now(),
  };

  if (sb) {
    const { data: rpcResult, error: rpcError } = await sb.rpc('update_streamer_config', {
      p_streamer_key: channel,
      p_settings: updates.settings || null,
      p_shortcuts: updates.shortcuts || null,
      p_bosses: updates.bosses !== undefined ? updates.bosses : null,
      p_current_boss: updates.currentBoss !== undefined ? updates.currentBoss : null,
      p_display_name: updates.displayName || null,
    });

    if (rpcError) {
      console.error('[DB] Failed to persist configuration update via RPC:', rpcError.message);
      const err = new Error(`Database configuration update failed: ${rpcError.message}`);
      err.code = 'DB_UPDATE_FAILED';
      err.status = 500;
      throw err;
    }

    if (rpcResult) {
      next.revision = rpcResult.revision;
      next.lastUpdated = rpcResult.lastUpdated;
    }
  }

  channelMap.set(channel, next);
  return next;
}
