import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

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
  if (!user) return 'guest';
  if (user.user_metadata?.streamerKey) return user.user_metadata.streamerKey;
  // Fall back to clean username or short UID
  const prefix = user.email ? user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : 'user';
  const shortId = (user.id || '').replace(/-/g, '').slice(0, 6);
  return `${prefix}-${shortId}`;
}

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle() {
  const redirectUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/controller`
    : 'https://soulgamedc-rosy.vercel.app/controller';

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
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
    const { error } = await supabase
      .from('streamer_states')
      .upsert({
        user_id: user.id,
        email: user.email,
        display_name: user.user_metadata?.full_name || user.email?.split('@')[0],
        avatar_url: user.user_metadata?.avatar_url || '',
        streamer_key: streamerKey,
        deaths: state.deaths ?? 0,
        session_deaths: state.sessionDeaths ?? 0,
        all_time_deaths: state.allTimeDeaths ?? 0,
        boss_kills: state.bossKills ?? 0,
        settings: state.settings || {},
        shortcuts: state.shortcuts || {},
        bosses: state.bosses || {},
        current_boss: state.currentBoss || '',
        last_updated: state.lastUpdated || Date.now(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

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
  if (!streamerKey || streamerKey === 'guest') return null;

  try {
    const { data, error } = await supabase
      .from('streamer_states')
      .select('*')
      .eq('streamer_key', streamerKey)
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
