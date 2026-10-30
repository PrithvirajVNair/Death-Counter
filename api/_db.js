import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://sexlwhkcropcrdewarmr.supabase.co";

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_u3waObuvRCSxPW7AN42bvg_fmP32lF2";

let supabaseClient = null;
export function getSupabase() {
  if (!supabaseClient && SUPABASE_URL && SUPABASE_KEY) {
    try {
      supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false },
      });
    } catch (e) {
      console.warn('Failed to initialize Supabase client in API:', e.message);
    }
  }
  return supabaseClient;
}

const DEFAULT_STATE = {
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

// Fallback in-memory cache for offline/dev environments
const channelMap = globalThis.__DEATH_COUNTER_CHANNELS__ || (globalThis.__DEATH_COUNTER_CHANNELS__ = new Map());

export function hashToken(token) {
  if (!token) return '';
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Fetch authoritative state for a streamer key.
 * Always prefers Supabase PostgreSQL as the true persistent source of truth.
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

      if (!error && data) {
        const state = {
          deaths: Math.max(0, data.deaths ?? 0),
          sessionDeaths: Math.max(0, data.session_deaths ?? 0),
          allTimeDeaths: Math.max(0, data.all_time_deaths ?? 0),
          bossKills: Math.max(0, data.boss_kills ?? 0),
          settings: data.settings || DEFAULT_STATE.settings,
          shortcuts: data.shortcuts || DEFAULT_STATE.shortcuts,
          bosses: data.bosses || {},
          currentBoss: data.current_boss || '',
          revision: data.revision ?? 1,
          lastUpdated: data.last_updated ?? 0,
        };
        channelMap.set(channel, state);
        return state;
      }
    } catch (err) {
      console.warn('[DB] Supabase getState error:', err.message);
    }
  }

  if (!channelMap.has(channel)) {
    channelMap.set(channel, { ...DEFAULT_STATE });
  }
  return channelMap.get(channel);
}

/**
 * Public overlay state projection (Never exposes user_id, email, or secrets)
 */
export async function getPublicOverlayState(channel = '') {
  const full = await getState(channel);
  return {
    deaths: full.deaths,
    sessionDeaths: full.sessionDeaths,
    allTimeDeaths: full.allTimeDeaths,
    bossKills: full.bossKills,
    settings: full.settings,
    shortcuts: full.shortcuts,
    bosses: full.bosses,
    currentBoss: full.currentBoss,
    revision: full.revision || 1,
    lastUpdated: full.lastUpdated || 0,
  };
}

/**
 * Validate token and return authorized streamer key.
 * Strictly verifies unexpired and non-revoked status in Supabase.
 */
export async function getStreamerKeyFromToken(token) {
  if (!token || typeof token !== 'string') return null;
  const cleanToken = token.trim();
  if (cleanToken.length < 10) return null;

  const client = getSupabase();
  if (!client) {
    // In offline development fallback: check token in local cache
    for (const [key] of channelMap.entries()) {
      if (cleanToken.includes(key)) return key;
    }
    return null;
  }

  try {
    const tokenHash = hashToken(cleanToken);

    const { data, error } = await client
      .from('streamer_remote_tokens')
      .select('streamer_key, is_revoked, expires_at')
      .or(`token.eq.${cleanToken},token_hash.eq.${tokenHash}`)
      .maybeSingle();

    if (!error && data && !data.is_revoked) {
      if (!data.expires_at || new Date(data.expires_at).getTime() > Date.now()) {
        return data.streamer_key;
      }
    }
  } catch (err) {
    console.warn('[DB] Token lookup error:', err.message);
  }

  return null;
}

/**
 * Apply atomic counter mutation to authoritative state.
 */
export async function applyAction(rawAction, value, extra = {}, channel = '', token = null, operationId = null) {
  if (!channel) {
    return { state: { ...DEFAULT_STATE }, normAction: rawAction, revision: 1 };
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
    throw new Error(`Invalid counter action: ${rawAction}`);
  }

  const intVal = Math.max(0, parseInt(value !== undefined ? value : (extra.value || 0), 10) || 0);
  const now = extra.lastUpdated || Date.now();
  const sb = getSupabase();

  // 1. Try atomic PostgreSQL RPC function if Supabase is connected
  if (sb) {
    try {
      const { data: rpcResult, error: rpcError } = await sb.rpc('mutate_counter', {
        p_streamer_key: channel,
        p_action: normAction,
        p_value: intVal,
        p_operation_id: operationId || extra.operationId || null,
        p_token: token || null,
      });

      if (!rpcError && rpcResult && rpcResult.success) {
        const nextState = {
          deaths: rpcResult.deaths,
          sessionDeaths: rpcResult.sessionDeaths,
          allTimeDeaths: rpcResult.allTimeDeaths,
          bossKills: rpcResult.bossKills,
          revision: rpcResult.revision,
          lastUpdated: rpcResult.lastUpdated,
        };
        channelMap.set(channel, { ...(channelMap.get(channel) || DEFAULT_STATE), ...nextState });
        return {
          state: nextState,
          normAction,
          revision: rpcResult.revision,
          deduped: Boolean(rpcResult.deduped),
        };
      }
    } catch (err) {
      console.warn('[DB] RPC mutate_counter fallback:', err.message);
    }
  }

  // 2. Direct database update or offline fallback
  const current = await getState(channel);
  const next = { ...current };

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

  next.revision = (current.revision || 1) + 1;
  next.lastUpdated = Math.max(now, Date.now());

  channelMap.set(channel, next);

  if (sb) {
    try {
      await sb
        .from('streamer_states')
        .update({
          deaths: next.deaths,
          session_deaths: next.sessionDeaths,
          all_time_deaths: next.allTimeDeaths,
          boss_kills: next.bossKills,
          revision: next.revision,
          last_updated: next.lastUpdated,
          updated_at: new Date().toISOString(),
        })
        .eq('streamer_key', channel);
    } catch (err) {
      console.error('[DB] Fallback Supabase update failed:', err);
    }
  }

  return { state: next, normAction, revision: next.revision, deduped: false };
}

/**
 * Update full streamer state (Settings, shortcuts, custom tallies).
 * Carefully preserves boss histories and custom configurations.
 */
export async function updateState(partial = {}, channel = '') {
  if (!channel) {
    return { ...DEFAULT_STATE, ...partial };
  }

  const current = await getState(channel);
  const next = {
    ...current,
    settings: partial.settings ? { ...current.settings, ...partial.settings } : current.settings,
    shortcuts: partial.shortcuts ? { ...current.shortcuts, ...partial.shortcuts } : current.shortcuts,
    bosses: partial.bosses !== undefined ? partial.bosses : current.bosses,
    currentBoss: partial.currentBoss !== undefined ? partial.currentBoss : current.currentBoss,
    revision: (current.revision || 1) + 1,
    lastUpdated: Math.max(partial.lastUpdated || Date.now(), current.lastUpdated || 0),
  };

  if (partial.deaths !== undefined) next.deaths = Math.max(0, parseInt(partial.deaths, 10) || 0);
  if (partial.sessionDeaths !== undefined) next.sessionDeaths = Math.max(0, parseInt(partial.sessionDeaths, 10) || 0);
  if (partial.allTimeDeaths !== undefined) next.allTimeDeaths = Math.max(0, parseInt(partial.allTimeDeaths, 10) || 0);
  if (partial.bossKills !== undefined) next.bossKills = Math.max(0, parseInt(partial.bossKills, 10) || 0);

  channelMap.set(channel, next);

  const sb = getSupabase();
  if (sb) {
    try {
      await sb
        .from('streamer_states')
        .update({
          deaths: next.deaths,
          session_deaths: next.sessionDeaths,
          all_time_deaths: next.allTimeDeaths,
          boss_kills: next.bossKills,
          settings: next.settings,
          shortcuts: next.shortcuts,
          bosses: next.bosses,
          current_boss: next.currentBoss,
          revision: next.revision,
          last_updated: next.lastUpdated,
          updated_at: new Date().toISOString(),
        })
        .eq('streamer_key', channel);
    } catch (err) {
      console.error('[DB] Update state failed:', err.message);
    }
  }

  return next;
}

/**
 * Reset counter state (Session or All-Time).
 */
export async function resetState(target = 'session', channel = '', token = null) {
  const action = target === 'all' ? 'resetAll' : 'resetSession';
  const result = await applyAction(action, 0, {}, channel, token);
  return result.state;
}
