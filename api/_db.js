import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabaseClient = null;
function getSupabase() {
  if (!supabaseClient && SUPABASE_URL && SUPABASE_KEY) {
    try {
      supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false },
      });
    } catch {}
  }
  return supabaseClient;
}

const TMP_FILE_PATH = path.join('/tmp', 'death-counter-data.json');

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
  lastUpdated: 0,
};

function readDiskCache() {
  try {
    if (fs.existsSync(TMP_FILE_PATH)) {
      const raw = fs.readFileSync(TMP_FILE_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {}
  return null;
}

function writeDiskCache(state) {
  try {
    fs.writeFileSync(TMP_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch {}
}

const channelMap = globalThis.__DEATH_COUNTER_CHANNELS__ || (globalThis.__DEATH_COUNTER_CHANNELS__ = new Map());

export function getState(channel = '') {
  if (!channel) {
    // If no channel is specified, return clean isolated default state so strangers never see each other's data!
    return { ...DEFAULT_STATE };
  }
  if (!channelMap.has(channel)) {
    channelMap.set(channel, { ...DEFAULT_STATE });
  }
  return channelMap.get(channel);
}

function saveToSupabaseAsync(channel, state) {
  if (!channel) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    sb.from('streamer_states').upsert({
      streamer_key: channel,
      deaths: state.deaths ?? 0,
      session_deaths: state.sessionDeaths ?? 0,
      all_time_deaths: state.allTimeDeaths ?? 0,
      boss_kills: state.bossKills ?? 0,
      settings: state.settings || {},
      shortcuts: state.shortcuts || {},
      last_updated: state.lastUpdated || Date.now(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'streamer_key' }).then(() => {}).catch(() => {});
  } catch {}
}

export function updateState(partial = {}, channel = '') {
  if (!channel) {
    return { ...DEFAULT_STATE, ...partial };
  }
  const current = getState(channel);
  const updateTimestamp = partial.lastUpdated || Date.now();

  // If incoming state is strictly older than current server state, do not roll back!
  if (partial.lastUpdated && current.lastUpdated && partial.lastUpdated < current.lastUpdated) {
    return current;
  }

  const next = {
    ...current,
    ...partial,
    settings: {
      ...current.settings,
      ...(partial.settings || {}),
    },
    shortcuts: {
      ...current.shortcuts,
      ...(partial.shortcuts || {}),
    },
    bosses: {
      ...current.bosses,
      ...(partial.bosses || {}),
    },
    lastUpdated: Math.max(updateTimestamp, current.lastUpdated || 0),
  };

  channelMap.set(channel, next);
  saveToSupabaseAsync(channel, next);
  return next;
}

export function applyAction(rawAction, value, extra = {}, channel = '') {
  if (!channel) {
    return { state: { ...DEFAULT_STATE }, normAction: rawAction };
  }
  const state = getState(channel);
  const now = extra.lastUpdated || Date.now();

  const normAction =
    rawAction === 'add' || rawAction === 'addDeath' ? 'add'
    : rawAction === 'undo' || rawAction === 'undoDeath' ? 'undo'
    : rawAction === 'addBossKill' || rawAction === 'bossSlain' ? 'addBossKill'
    : rawAction === 'undoBossKill' ? 'undoBossKill'
    : rawAction === 'set' || rawAction === 'setDeath' ? 'setDeath'
    : rawAction === 'setBossKill' ? 'setBossKill'
    : rawAction;

  // If the caller provided authoritative counts with a newer or equal timestamp:
  if (extra.deaths !== undefined && (!state.lastUpdated || now >= state.lastUpdated)) {
    state.deaths = Math.max(0, parseInt(extra.deaths, 10) || 0);
    if (extra.sessionDeaths !== undefined) {
      state.sessionDeaths = Math.max(0, parseInt(extra.sessionDeaths, 10) || 0);
    }
    if (extra.allTimeDeaths !== undefined) {
      state.allTimeDeaths = Math.max(0, parseInt(extra.allTimeDeaths, 10) || 0);
    }
    if (extra.bossKills !== undefined) {
      state.bossKills = Math.max(0, parseInt(extra.bossKills, 10) || 0);
    }
    state.history = [
      ...(state.history || []).slice(-99),
      { action: normAction, timestamp: now, value: state.deaths },
    ];
  } else {
    // Standard relative action mutation
    if (normAction === 'add') {
      state.deaths += 1;
      state.sessionDeaths += 1;
      state.allTimeDeaths += 1;
      state.history = [
        ...(state.history || []).slice(-99),
        { action: 'add', timestamp: now, value: state.deaths },
      ];
    } else if (normAction === 'undo') {
      if (state.deaths > 0) state.deaths -= 1;
      if (state.sessionDeaths > 0) state.sessionDeaths -= 1;
      state.history = [
        ...(state.history || []).slice(-99),
        { action: 'undo', timestamp: now, value: state.deaths },
      ];
    } else if (normAction === 'addBossKill') {
      state.bossKills += 1;
    } else if (normAction === 'undoBossKill') {
      if (state.bossKills > 0) state.bossKills -= 1;
    } else if (normAction === 'setDeath') {
      const num = Math.max(0, parseInt(value, 10) || 0);
      state.deaths = num;
      state.sessionDeaths = num;
    } else if (normAction === 'setBossKill') {
      const num = Math.max(0, parseInt(value, 10) || 0);
      state.bossKills = num;
    }
  }

  state.lastUpdated = Math.max(now, state.lastUpdated || 0);
  channelMap.set(channel, state);
  saveToSupabaseAsync(channel, state);

  return { state, normAction };
}

export function resetState(target = 'session', channel = '') {
  if (!channel) return { ...DEFAULT_STATE };
  const state = getState(channel);
  state.deaths = 0;
  state.sessionDeaths = 0;
  state.history = [];

  if (target === 'all') {
    state.allTimeDeaths = 0;
    state.bossKills = 0;
    state.bosses = {};
    state.currentBoss = '';
  }

  state.lastUpdated = Date.now();
  channelMap.set(channel, state);
  saveToSupabaseAsync(channel, state);
  return state;
}
