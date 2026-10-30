import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://sexlwhkcropcrdewarmr.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_u3waObuvRCSxPW7AN42bvg_fmP32lF2";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Generate a clean, stable streamer key from user object
 */
export function getStreamerKey(user) {
  if (!user) return "guest";
  if (user.user_metadata?.streamerKey) return user.user_metadata.streamerKey;
  // Fall back to clean username or short UID
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
 * Regenerate a new unique streamer key for user, updating both Supabase tables and user metadata
 */
export async function regenerateStreamerKey(user) {
  if (!user || !supabase) return null;
  const prefix = user.email
    ? user.email
        .split("@")[0]
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase()
    : "user";
  const rand = Math.random().toString(36).substring(2, 8);
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
 * Save user counter state to Supabase
 */
export async function saveCloudState(user, state) {
  if (!user) return;
  const streamerKey = getStreamerKey(user);

  try {
    // 1. Try public.streamer_states table first
    const { error } = await supabase.from("streamer_states").upsert(
      {
        user_id: user.id,
        email: user.email,
        display_name:
          user.user_metadata?.full_name || user.email?.split("@")[0],
        avatar_url: user.user_metadata?.avatar_url || "",
        streamer_key: streamerKey,
        deaths: state.deaths ?? 0,
        session_deaths: state.sessionDeaths ?? 0,
        all_time_deaths: state.allTimeDeaths ?? 0,
        boss_kills: state.bossKills ?? 0,
        settings: state.settings || {},
        shortcuts: state.shortcuts || {},
        bosses: state.bosses || {},
        current_boss: state.currentBoss || "",
        last_updated: state.lastUpdated || Date.now(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (!error) return;
  } catch {}

  // 2. Fallback: Save to user metadata
  try {
    await supabase.auth.updateUser({
      data: {
        streamerKey,
        deaths: state.deaths ?? 0,
        sessionDeaths: state.sessionDeaths ?? 0,
        allTimeDeaths: state.allTimeDeaths ?? 0,
        bossKills: state.bossKills ?? 0,
        settings: state.settings || {},
        shortcuts: state.shortcuts || {},
        lastUpdated: state.lastUpdated || Date.now(),
      },
    });
  } catch {}
}

/**
 * Load user counter state from Supabase by streamerKey
 */
export async function loadCloudStateByKey(streamerKey) {
  if (!streamerKey || streamerKey === "guest") return null;

  try {
    const { data, error } = await supabase
      .from("streamer_states")
      .select("*")
      .eq("streamer_key", streamerKey)
      .maybeSingle();

    if (!error && data) {
      return {
        deaths: data.deaths,
        sessionDeaths: data.session_deaths,
        allTimeDeaths: data.all_time_deaths,
        bossKills: data.boss_kills,
        settings: data.settings,
        shortcuts: data.shortcuts,
        bosses: data.bosses,
        currentBoss: data.current_boss,
        lastUpdated: data.last_updated,
      };
    }
  } catch {}

  return null;
}

/**
 * Generate an opaque, cryptographically-secure random token for friend remote links.
 * Does NOT contain the streamer key, keeping the streamer key 100% private.
 */
export function generateRemoteToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i++) {
      rand += chars[bytes[i] % chars.length];
    }
  } else {
    rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  return `rmt_${rand.slice(0, 24)}`;
}

/**
 * Create a new friend/moderator remote access link token with optional expiry
 */
export async function createRemoteToken(user, { label = 'Friend Access', durationHours = 6 } = {}) {
  if (!user) throw new Error('User must be logged in to create remote links');
  const streamerKey = getStreamerKey(user);
  const streamerName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Streamer';
  const token = generateRemoteToken();
  const expiresAt = durationHours && durationHours > 0
    ? new Date(Date.now() + durationHours * 3600 * 1000).toISOString()
    : null;

  // Do NOT pass manual non-UUID id string so Postgres auto-generates gen_random_uuid()
  const insertPayload = {
    user_id: user.id,
    streamer_key: streamerKey,
    streamer_name: streamerName,
    token,
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

  // 2. Fallback to localStorage
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
      .select('*')
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
 */
export async function validateRemoteToken(token) {
  if (!token) return { valid: false, reason: 'missing' };

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

  // 1. Try Supabase
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('streamer_remote_tokens')
        .select('*')
        .eq('token', token)
        .maybeSingle();

      if (!error && data) {
        return checkTokenObject(data);
      }
    } catch {}
  }

  // 2. Check local storage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('streamer_tokens_')) {
        const tokens = JSON.parse(localStorage.getItem(key) || '[]');
        const found = tokens.find(t => t.token === token);
        if (found) {
          const res = checkTokenObject(found);
          if (res) return res;
        }
      }
    }
  } catch {}

  // 3. Fallback: Parse self-contained token format: mod_streamerKey_expiryMs_rand
  if (token.startsWith('mod_')) {
    try {
      const parts = token.split('_');
      if (parts.length >= 4) {
        const rawKey = parts[1];
        const expiryMs = parseInt(parts[2], 10);
        if (expiryMs > 0 && expiryMs < Date.now()) {
          return { valid: false, reason: 'expired', streamerName: rawKey, expiresAt: new Date(expiryMs).toISOString() };
        }
        return {
          valid: true,
          streamerKey: rawKey,
          streamerName: rawKey,
          label: 'Friend Remote Link',
          expiresAt: expiryMs > 0 ? new Date(expiryMs).toISOString() : null,
        };
      }
    } catch {}
  }

  return { valid: false, reason: 'invalid' };
}

/**
 * Update streamer state from remote friend link directly in Supabase
 */
export async function updateStreamerStateRemote(streamerKey, stateUpdate) {
  if (!supabase || !streamerKey) return null;
  try {
    const payload = {
      ...stateUpdate,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('streamer_states')
      .update(payload)
      .eq('streamer_key', streamerKey)
      .select();

    if (!error && data && data.length > 0) {
      return data[0];
    }
  } catch (err) {
    console.warn('Direct remote Supabase update failed:', err);
  }
  return null;
}

