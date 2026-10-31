import { createClient } from "@supabase/supabase-js";

// Helper to safely read environment variables across Vite, Node, and browser runtimes
const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : (typeof process !== 'undefined' && process.env ? process.env : {});

const supabaseUrl =
  env.VITE_SUPABASE_URL ||
  "https://sexlwhkcropcrdewarmr.supabase.co";

const supabaseAnonKey =
  env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_u3waObuvRCSxPW7AN42bvg_fmP32lF2";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Generate cryptographically secure random string with given character length
 * Throws an explicit error if a secure cryptographic source is unavailable.
 */
export function generateCryptoRandomString(length = 32) {
  const cryptoObj = typeof globalThis !== 'undefined' && globalThis.crypto ? globalThis.crypto : null;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('Cryptographically secure PRNG (crypto.getRandomValues) is required but unavailable.');
  }

  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(length);
  cryptoObj.getRandomValues(bytes);
  let str = '';
  for (let i = 0; i < length; i++) {
    str += charset[bytes[i] % charset.length];
  }
  return str;
}

/**
 * Compute SHA-256 hex string for a given token.
 * Throws an explicit error if Web Crypto subtle.digest is unavailable.
 */
export async function sha256Hex(str) {
  if (typeof str !== 'string' || !str) {
    throw new Error('sha256Hex requires a non-empty string input.');
  }

  const cryptoObj = typeof globalThis !== 'undefined' && globalThis.crypto ? globalThis.crypto : null;
  if (!cryptoObj || !cryptoObj.subtle || typeof cryptoObj.subtle.digest !== 'function') {
    throw new Error('Cryptographically secure SHA-256 (crypto.subtle.digest) is required but unavailable.');
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(str.trim());
  const hashBuffer = await cryptoObj.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a new cryptographically secure unique streamer key.
 * Format: sdc_ + 24 high-entropy random characters
 */
export function generateStreamerKey() {
  return `sdc_${generateCryptoRandomString(24)}`;
}

/**
 * Generate a cryptographically secure token for remote moderator access.
 * Format: rmt_ + 32 high-entropy random characters
 */
export function generateRemoteToken() {
  return `rmt_${generateCryptoRandomString(32)}`;
}

/**
 * Get the streamerKey from user metadata, or generate and save a new one.
 */
export function getStreamerKey(user) {
  if (!user) return "guest";
  if (user.user_metadata?.streamerKey) {
    return user.user_metadata.streamerKey;
  }
  return generateStreamerKey();
}

/**
 * Regenerate the user's streamerKey.
 * Generates a new cryptographically secure key and updates Supabase.
 */
export async function regenerateStreamerKey(user) {
  if (!user) throw new Error("User must be logged in to regenerate key");

  const newKey = generateStreamerKey();

  // 1. Transactionally update database via dedicated authenticated RPC
  const { data, error: rpcError } = await supabase.rpc("regenerate_streamer_key", {
    p_new_key: newKey,
  });

  if (rpcError) {
    console.error("Database failed to regenerate streamer key:", rpcError);
    throw new Error(rpcError.message || "Failed to regenerate streamer key in database");
  }

  const authoritativeKey = data?.streamer_key || newKey;

  // 2. Reconcile Auth user metadata ONLY after database persistence succeeds
  try {
    const { error: authError } = await supabase.auth.updateUser({
      data: { streamerKey: authoritativeKey },
    });
    if (authError) {
      console.warn("Streamer key saved in database but could not sync Auth metadata:", authError.message);
    }
  } catch (authErr) {
    console.warn("Non-fatal error updating Auth metadata after database success:", authErr.message);
  }

  return authoritativeKey;
}

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin + "/controller",
    },
  });
  if (error) throw error;
  return data;
}

/**
 * Sign in with email/password
 */
export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * Sign up with email/password
 */
export async function signUpWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * Sign out
 */
export async function signOutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Save user configuration state to Supabase.
 * Strictly updates settings, shortcuts, bosses, and currentBoss.
 * NEVER writes or overwrites counter columns (deaths, session_deaths, all_time_deaths, boss_kills).
 */
export async function saveCloudConfig(user, config) {
  if (!user || !config) return null;
  const streamerKey = getStreamerKey(user);

  // Configuration persistence strictly uses dedicated RPC so revision increments and row locking are preserved
  const { data: rpcData, error: rpcErr } = await supabase.rpc('update_streamer_config', {
    p_streamer_key: streamerKey,
    p_settings: config.settings || null,
    p_shortcuts: config.shortcuts || null,
    p_bosses: config.bosses !== undefined ? config.bosses : null,
    p_current_boss: config.currentBoss !== undefined ? config.currentBoss : null,
    p_display_name: user.user_metadata?.full_name || user.email?.split("@")[0] || null,
  });

  if (rpcErr) {
    console.error("Configuration RPC error in saveCloudConfig:", rpcErr);
    const err = new Error(`Configuration update RPC failed: ${rpcErr.message || rpcErr}`);
    err.code = 'CONFIG_RPC_FAILED';
    err.originalError = rpcErr;
    throw err;
  }

  return rpcData;
}

/**
 * Backward-compatible wrapper: routes to saveCloudConfig.
 * Never persists or overwrites counter values.
 */
export async function saveCloudState(user, state) {
  return saveCloudConfig(user, state);
}

/**
 * Perform an atomic counter mutation for an authenticated streamer.
 * Dispatches to /api/action or /api/reset with verified Bearer JWT and unique operation ID.
 * Returns the authoritative server state.
 */
export async function applyStreamerMutation(action, value = 0, { streamerKey, operationId, extra = {} } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error('Authentication required: Active session needed for counter mutation.');
  }

  const opId = operationId || `str_${Date.now()}_${generateCryptoRandomString(12)}`;
  const isReset = action === 'reset' || action === 'resetSession' || action === 'resetAll';
  const endpoint = isReset ? '/api/reset' : '/api/action';

  const payload = isReset
    ? { type: 'reset', target: extra.target || (action === 'resetAll' ? 'all' : 'session'), operationId: opId, key: streamerKey }
    : { action, value, operationId: opId, key: streamerKey };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Operation-Id': opId,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(json.error?.message || 'Mutation failed');
    err.status = res.status;
    err.code = json.error?.code || 'MUTATION_FAILED';
    throw err;
  }

  return {
    deaths: json.deaths,
    sessionDeaths: json.sessionDeaths,
    allTimeDeaths: json.allTimeDeaths,
    bossKills: json.bossKills,
    revision: json.revision,
    lastUpdated: json.lastUpdated,
    deduped: json.deduped,
  };
}


/**
 * Load user counter state from Supabase by streamerKey.
 * Uses public projection to avoid leaking private auth metadata.
 */
export async function loadCloudStateByKey(streamerKey) {
  if (!streamerKey || streamerKey === "guest") return null;

  try {
    const { data, error } = await supabase
      .from("streamer_states")
      .select("deaths, session_deaths, all_time_deaths, boss_kills, settings, shortcuts, bosses, current_boss, revision, last_updated")
      .eq("streamer_key", streamerKey)
      .maybeSingle();

    if (!error && data) {
      return {
        deaths: data.deaths ?? 0,
        sessionDeaths: data.session_deaths ?? 0,
        allTimeDeaths: data.all_time_deaths ?? 0,
        bossKills: data.boss_kills ?? 0,
        settings: data.settings || {},
        shortcuts: data.shortcuts || {},
        bosses: data.bosses || {},
        currentBoss: data.current_boss || "",
        revision: data.revision || 1,
        lastUpdated: data.last_updated ?? 0,
      };
    }
  } catch (err) {
    console.warn("Supabase loadCloudStateByKey error:", err);
  }
  return null;
}

/**
 * Load user counter state from Supabase by user_id
 */
export async function loadCloudState(userId) {
  if (!userId) return null;

  try {
    const { data, error } = await supabase
      .from("streamer_states")
      .select("streamer_key, deaths, session_deaths, all_time_deaths, boss_kills, settings, shortcuts, bosses, current_boss, revision, last_updated")
      .eq("user_id", userId)
      .maybeSingle();

    if (!error && data) {
      return {
        streamerKey: data.streamer_key,
        deaths: data.deaths ?? 0,
        sessionDeaths: data.session_deaths ?? 0,
        allTimeDeaths: data.all_time_deaths ?? 0,
        bossKills: data.boss_kills ?? 0,
        settings: data.settings || {},
        shortcuts: data.shortcuts || {},
        bosses: data.bosses || {},
        currentBoss: data.current_boss || "",
        revision: data.revision || 1,
        lastUpdated: data.last_updated ?? 0,
      };
    }
  } catch (err) {
    console.warn("Supabase loadCloudState error:", err);
  }
  return null;
}

/**
 * Create a remote token for moderator access.
 * Stores ONLY the SHA-256 hash in PostgreSQL. Never stores plaintext token in the database.
 * Does not fall back to local storage (fails loudly if database insertion fails).
 */
export async function createRemoteToken(user, { label = 'Friend Access', durationHours = 24, permissions = null } = {}) {
  if (!user || !user.id) throw new Error('User must be authenticated to generate remote access.');

  const streamerKey = getStreamerKey(user);
  const streamerName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Streamer';
  const rawToken = generateRemoteToken();
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = durationHours && durationHours > 0
    ? new Date(Date.now() + durationHours * 3600 * 1000).toISOString()
    : null;

  const defaultPerms = {
    can_increment_deaths: true,
    can_increment_bosses: true,
    can_set_deaths: true,
    can_set_bosses: true,
    can_reset_session: true,
    can_reset_all: false,
  };

  const insertPayload = {
    user_id: user.id,
    streamer_key: streamerKey,
    streamer_name: streamerName,
    token_hash: tokenHash,
    label: (label && label.trim()) || 'Friend Access',
    permissions: permissions || defaultPerms,
    expires_at: expiresAt,
    is_revoked: false,
  };

  const { data, error } = await supabase
    .from('streamer_remote_tokens')
    .insert(insertPayload)
    .select('id, user_id, streamer_key, streamer_name, label, permissions, expires_at, is_revoked, created_at')
    .single();

  if (error) {
    console.error('Supabase remote token creation error:', error);
    throw new Error(`Failed to create remote token: ${error.message}`);
  }

  // Return token details with raw token for single-time display in share link
  return {
    ...data,
    rawToken,
    token: rawToken,
  };
}

/**
 * Fetch all remote tokens created by this streamer.
 * Queries metadata columns only — never queries or returns token hashes.
 */
export async function fetchRemoteTokens(user) {
  if (!user || !user.id) return [];

  const { data, error } = await supabase
    .from('streamer_remote_tokens')
    .select('id, user_id, streamer_key, streamer_name, label, permissions, expires_at, is_revoked, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Failed to fetch remote tokens:', error.message);
    return [];
  }

  return Array.isArray(data) ? data : [];
}

/**
 * Revoke a remote token by ID.
 */
export async function revokeRemoteToken(user, tokenId) {
  if (!user || !tokenId) return false;

  const { error } = await supabase
    .from('streamer_remote_tokens')
    .update({ is_revoked: true })
    .eq('id', tokenId)
    .eq('user_id', user.id);

  if (error) {
    console.warn('Failed to revoke token in Supabase:', error.message);
    return false;
  }

  return true;
}

/**
 * Parse a remote access code or link input.
 * Accepts raw tokens (rmt_...), full URLs with query parameters (?token=...),
 * hash fragments (#token=... or #rmt_...), or embedded tokens.
 */
export function parseTokenInput(input) {
  if (!input || typeof input !== 'string') return '';
  const val = input.trim();
  if (!val) return '';

  if (val.startsWith('rmt_')) return val;

  const hashMatch = val.match(/#token=([a-zA-Z0-9_-]+)/) || val.match(/#rmt_([a-zA-Z0-9_-]+)/);
  if (hashMatch) {
    return hashMatch[0].startsWith('#rmt_') ? hashMatch[0].slice(1) : hashMatch[1];
  }

  const queryMatch = val.match(/[?&]token=([a-zA-Z0-9_-]+)/);
  if (queryMatch) return queryMatch[1];

  const rmtMatch = val.match(/rmt_[a-zA-Z0-9_-]+/);
  if (rmtMatch) return rmtMatch[0];

  return val;
}

/**
 * Extract active remote token from browser location (hash, query params)
 * with sessionStorage and localStorage fallback to survive page reloads and app switches.
 */
export function parseTokenFromLocation(locObj = null, storageMap = null) {
  const win = locObj || (typeof window !== 'undefined' ? window : null);
  if (!win) return null;

  // 1. Check URL hash (#token=..., #rmt_..., or token=...)
  const hash = win.location?.hash || '';
  if (hash.startsWith('#token=')) return hash.slice(7).trim();
  if (hash.startsWith('#rmt_')) return hash.slice(1).trim();
  const hashMatch = hash.match(/token=([a-zA-Z0-9_-]+)/);
  if (hashMatch) return hashMatch[1].trim();
  const hashDirectMatch = hash.match(/rmt_[a-zA-Z0-9_-]+/);
  if (hashDirectMatch) return hashDirectMatch[0].trim();

  // 2. Check query parameters (?token=...)
  try {
    const search = win.location?.search || '';
    const params = new URLSearchParams(search);
    const qToken = params.get('token');
    if (qToken && qToken.trim()) return qToken.trim();
  } catch {}

  // 3. Fallback to storage so reloads or browser suspensions preserve the session
  try {
    const s = storageMap?.sessionStorage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
    const sToken = s?.getItem('sdc_remote_token');
    if (sToken && sToken.trim()) return sToken.trim();
  } catch {}

  try {
    const l = storageMap?.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const lToken = l?.getItem('sdc_remote_token');
    if (lToken && lToken.trim()) return lToken.trim();
  } catch {}

  return null;
}

/**
 * Validate a token (used by friend on /remote?token=...).
 * Calls the secure backend endpoint to validate SHA-256 hash without exposing database records.
 */
export async function validateRemoteToken(token) {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'missing' };
  const cleanToken = token.trim();

  try {
    const res = await fetch('/api/validate-token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'X-Moderator-Token': cleanToken,
      },
    });
    const data = await res.json();

    if (res.ok && data.success) {
      return {
        valid: true,
        streamerKey: data.streamerKey,
        streamerName: data.streamerName || 'Streamer',
        label: data.label || 'Friend Access',
        permissions: data.permissions || {},
        expiresAt: data.expiresAt,
      };
    }

    return {
      valid: false,
      reason: data.error?.code === 'INVALID_TOKEN' ? data.error.message : (data.reason || 'invalid_token'),
    };
  } catch (err) {
    console.warn('Token validation request error:', err.message);
    return { valid: false, reason: 'network_error' };
  }
}

/**
 * Update state remotely via API endpoint with operation idempotency and token auth.
 */
export async function updateStreamerStateRemote(streamerKey, action, extra = {}, token = null) {
  if (!streamerKey) return null;

  try {
    const isReset = action === 'reset' || action === 'resetSession' || action === 'resetAll';
    const endpoint = isReset ? '/api/reset' : '/api/action';
    const operationId = `rmt_${Date.now()}_${generateCryptoRandomString(8)}`;

    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['X-Moderator-Token'] = token;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.access_token) {
      headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action,
        key: streamerKey,
        value: extra.value,
        target: extra.target || (isReset ? 'session' : undefined),
        operationId,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data.data || data;
    }
  } catch (err) {
    console.warn('API remote action error:', err);
  }
  return null;
}
