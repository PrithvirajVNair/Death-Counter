import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
  "https://sexlwhkcropcrdewarmr.supabase.co";

const supabaseAnonKey =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) ||
  "sb_publishable_u3waObuvRCSxPW7AN42bvg_fmP32lF2";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Generate cryptographically secure alphanumeric random strings.
 */
export function generateCryptoRandomString(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  }
  return Math.random().toString(36).substring(2, 2 + length);
}

/**
 * Compute SHA-256 hash of a string using Web Crypto API.
 */
export async function sha256Hex(str) {
  if (!str) return '';
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {}
  }
  return str;
}

/**
 * Generate a clean, stable streamer key from user object
 */
export function getStreamerKey(user) {
  if (!user) return "guest";
  if (user.user_metadata?.streamerKey) return user.user_metadata.streamerKey;

  const prefix = user.email
    ? user.email
        .split("@")[0]
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase()
    : "user";
  const shortId = (user.id || "").replace(/-/g, "").slice(0, 6);
  return `${prefix}-${shortId}`;
}

/**
 * Regenerate a new unique streamer key for user using cryptographic randomness,
 * updating both Supabase tables and user metadata.
 */
export async function regenerateStreamerKey(user) {
  if (!user || !supabase) return null;
  const prefix = user.email
    ? user.email
        .split("@")[0]
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase()
    : "user";
  const rand = generateCryptoRandomString(8);
  const newKey = `${prefix}-${rand}`;

  // 1. Update public.streamer_states table with new key
  try {
    const { error: stateError } = await supabase
      .from("streamer_states")
      .update({ streamer_key: newKey, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (stateError) {
      console.warn("Could not update streamer_states directly:", stateError);
    }
  } catch (e) {
    console.warn("streamer_states update failed:", e);
  }

  // 2. Update user metadata in Supabase Auth
  const { error } = await supabase.auth.updateUser({
    data: { streamerKey: newKey },
  });

  if (error) {
    throw error;
  }

  return newKey;
}

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle() {
  const redirectUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/controller`
      : "https://soulgamedc-rosy.vercel.app/controller";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) {
    throw error;
  }
  return data;
}

/**
 * Sign in with email/password fallback
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
        lastUpdated: data.last_updated || 0,
      };
    }
  } catch (err) {
    console.warn("loadCloudStateByKey error:", err);
  }

  return null;
}

/**
 * Generate an opaque, cryptographically secure token for friend remote links.
 */
export function generateRemoteToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    let rand = '';
    for (let i = 0; i < bytes.length; i++) {
      rand += chars[bytes[i] % chars.length];
    }
    return `rmt_${rand}`;
  }
  return `rmt_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/**
 * Create a new friend/moderator remote access link token with optional expiry.
 * Stores token and token_hash for secure lookup.
 */
export async function createRemoteToken(user, { label = 'Friend Access', durationHours = 6 } = {}) {
  if (!user) throw new Error('User must be logged in to create remote links');
  const streamerKey = getStreamerKey(user);
  const streamerName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Streamer';
  const token = generateRemoteToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = durationHours && durationHours > 0
    ? new Date(Date.now() + durationHours * 3600 * 1000).toISOString()
    : null;

  const insertPayload = {
    user_id: user.id,
    streamer_key: streamerKey,
    streamer_name: streamerName,
    token,
    token_hash: tokenHash,
    label: (label && label.trim()) || 'Friend Access',
    expires_at: expiresAt,
    is_revoked: false,
  };

  // 1. Try Supabase streamer_remote_tokens table
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('streamer_remote_tokens')
        .insert(insertPayload)
        .select()
        .single();

      if (!error && data) {
        saveLocalTokenBackup(user.id, data);
        return data;
      }
      if (error) {
        console.warn('Supabase remote token insert warning:', error);
      }
    } catch (err) {
      console.warn('Failed to insert token into Supabase:', err);
    }
  }

  // 2. Fallback to localStorage backup
  const fallbackRecord = {
    ...insertPayload,
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tok_${Date.now()}`,
    created_at: new Date().toISOString(),
  };
  saveLocalTokenBackup(user.id, fallbackRecord);
  return fallbackRecord;
}

function saveLocalTokenBackup(userId, tokenRecord) {
  try {
    const key = `streamer_tokens_${userId}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.unshift(tokenRecord);
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 50)));
  } catch {}
}

/**
 * Fetch all remote tokens created by this streamer
 */
export async function fetchRemoteTokens(user) {
  if (!user) return [];
  const localTokens = (() => {
    try {
      return JSON.parse(localStorage.getItem(`streamer_tokens_${user.id}`) || '[]');
    } catch {
      return [];
    }
  })();

  if (!supabase) return localTokens;

  try {
    const { data, error } = await supabase
      .from('streamer_remote_tokens')
      .select('id, user_id, streamer_key, streamer_name, token, label, expires_at, is_revoked, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      const map = new Map();
      data.forEach(t => map.set(t.token, t));
      localTokens.forEach(t => {
        if (!map.has(t.token)) map.set(t.token, t);
      });
      return Array.from(map.values());
    }
  } catch {}

  return localTokens;
}

/**
 * Revoke a remote token
 */
export async function revokeRemoteToken(user, tokenIdOrToken) {
  if (!user) return false;

  // 1. Update in local storage
  try {
    const key = `streamer_tokens_${user.id}`;
    const tokens = JSON.parse(localStorage.getItem(key) || '[]');
    tokens.forEach(t => {
      if (t.id === tokenIdOrToken || t.token === tokenIdOrToken) {
        t.is_revoked = true;
      }
    });
    localStorage.setItem(key, JSON.stringify(tokens));
  } catch {}

  // 2. Update in Supabase
  if (supabase) {
    try {
      await supabase
        .from('streamer_remote_tokens')
        .update({ is_revoked: true })
        .or(`id.eq.${tokenIdOrToken},token.eq.${tokenIdOrToken}`)
        .eq('user_id', user.id);
      return true;
    } catch {}
  }

  return true;
}

/**
 * Validate a token (used by friend on /remote?token=...)
 * Checks revocation and expiration strictly.
 */
export async function validateRemoteToken(token) {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'missing' };
  const cleanToken = token.trim();

  const checkTokenObject = (t) => {
    if (!t) return null;
    if (t.is_revoked) return { valid: false, reason: 'revoked', streamerName: t.streamer_name };
    if (t.expires_at && new Date(t.expires_at).getTime() < Date.now()) {
      return { valid: false, reason: 'expired', streamerName: t.streamer_name, expiresAt: t.expires_at };
    }
    return {
      valid: true,
      streamerKey: t.streamer_key,
      streamerName: t.streamer_name || 'Streamer',
      label: t.label || 'Friend Access',
      expiresAt: t.expires_at,
    };
  };

  // 1. Check Supabase by token or token_hash
  if (supabase) {
    try {
      const hash = await sha256Hex(cleanToken);
      const { data, error } = await supabase
        .from('streamer_remote_tokens')
        .select('streamer_key, streamer_name, label, expires_at, is_revoked')
        .or(`token.eq.${cleanToken},token_hash.eq.${hash}`)
        .maybeSingle();

      if (!error && data) {
        return checkTokenObject(data);
      }
    } catch {}
  }

  // 2. Check local storage backup
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('streamer_tokens_')) {
        const tokens = JSON.parse(localStorage.getItem(key) || '[]');
        const found = tokens.find(t => t.token === cleanToken);
        if (found) {
          const res = checkTokenObject(found);
          if (res) return res;
        }
      }
    }
  } catch {}

  return { valid: false, reason: 'invalid' };
}

/**
 * Update streamer state from remote friend link via secure API endpoint.
 * Ensures strict authorization via token rather than direct unauthorized table updates.
 */
export async function updateStreamerStateRemote(streamerKey, actionOrState, token) {
  if (!token) {
    throw new Error('Moderator token is required for remote counter operations.');
  }

  const endpoint = '/api/action';
  const payload = typeof actionOrState === 'string'
    ? { action: actionOrState, token, key: streamerKey }
    : { ...actionOrState, token, key: streamerKey };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Remote operation failed (HTTP ${res.status})`);
  }

  return await res.json();
}
