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
 */
export function generateCryptoRandomString(length = 32) {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    let str = '';
    for (let i = 0; i < length; i++) {
      str += charset[bytes[i] % charset.length];
    }
    return str;
  }
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

/**
 * Compute SHA-256 hex string for a given token
 */
export async function sha256Hex(str) {
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Browser fallback for non-secure contexts (e.g. dev http localhost)
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
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

  // 1. Update user metadata
  const { error: authError } = await supabase.auth.updateUser({
    data: { streamerKey: newKey },
  });
  if (authError) throw authError;

  // 2. Update streamer_states table
  const { error: dbError } = await supabase
    .from("streamer_states")
    .update({ streamer_key: newKey, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (dbError) {
    console.warn("Could not update streamer_key in streamer_states table:", dbError);
  }

  return newKey;
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
 * Save user counter state to Supabase.
 * Strictly preserves boss history and settings without replacing omitted properties with empty defaults.
 */
export async function saveCloudState(user, state) {
  if (!user || !state) return;
  const streamerKey = getStreamerKey(user);

  try {
    const payload = {
      user_id: user.id,
      email: user.email,
      display_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Streamer",
      avatar_url: user.user_metadata?.avatar_url || "",
      streamer_key: streamerKey,
      updated_at: new Date().toISOString(),
    };

    if (state.deaths !== undefined) payload.deaths = Math.max(0, state.deaths);
    if (state.sessionDeaths !== undefined) payload.session_deaths = Math.max(0, state.sessionDeaths);
    if (state.allTimeDeaths !== undefined) payload.all_time_deaths = Math.max(0, state.allTimeDeaths);
    if (state.bossKills !== undefined) payload.boss_kills = Math.max(0, state.bossKills);
    if (state.settings !== undefined) payload.settings = state.settings;
    if (state.shortcuts !== undefined) payload.shortcuts = state.shortcuts;
    if (state.bosses !== undefined) payload.bosses = state.bosses;
    if (state.currentBoss !== undefined) payload.current_boss = state.currentBoss;
    if (state.revision !== undefined) payload.revision = state.revision;
    if (state.lastUpdated !== undefined) payload.last_updated = state.lastUpdated;

    const { error } = await supabase
      .from("streamer_states")
      .upsert(payload, { onConflict: "user_id" });

    if (!error) return;
  } catch (err) {
    console.warn("Supabase saveCloudState error:", err);
  }

  // Fallback: Save to user metadata
  try {
    const metaPayload = {
      streamerKey,
      deaths: state.deaths ?? 0,
      sessionDeaths: state.sessionDeaths ?? 0,
      allTimeDeaths: state.allTimeDeaths ?? 0,
      bossKills: state.bossKills ?? 0,
      settings: state.settings || {},
      shortcuts: state.shortcuts || {},
      lastUpdated: state.lastUpdated || Date.now(),
    };
    if (state.bosses !== undefined) metaPayload.bosses = state.bosses;
    if (state.currentBoss !== undefined) metaPayload.currentBoss = state.currentBoss;

    await supabase.auth.updateUser({
      data: metaPayload,
    });
  } catch {}
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
 * Validate a token (used by friend on /remote?token=...).
 * Calls the secure backend endpoint to validate SHA-256 hash without exposing database records.
 */
export async function validateRemoteToken(token) {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'missing' };
  const cleanToken = token.trim();

  try {
    const res = await fetch(`/api/validate-token?token=${encodeURIComponent(cleanToken)}`, {
      headers: { 'Accept': 'application/json' },
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
        token: token || undefined,
        value: extra.value,
        target: extra.target || (isReset ? 'session' : undefined),
        deaths: extra.deaths,
        sessionDeaths: extra.sessionDeaths,
        allTimeDeaths: extra.allTimeDeaths,
        bossKills: extra.bossKills,
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
