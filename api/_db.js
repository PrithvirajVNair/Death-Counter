import fs from 'fs';
import path from 'path';

const CLOUD_SYNC_ID = 'ff808181a09d98f701a1884e8d4951f3';
const CLOUD_SYNC_URL = `https://api.restful-api.dev/objects/${CLOUD_SYNC_ID}`;
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

let lastCloudFetchTime = 0;

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

async function fetchCloudState() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(CLOUD_SYNC_URL, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
    });
    clearTimeout(timeout);
    if (res.ok) {
      const json = await res.json();
      return json?.data || null;
    }
  } catch {}
  return null;
}

async function saveCloudState(state) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    await fetch(CLOUD_SYNC_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        name: 'souls_death_counter_state_v1',
        data: state,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch {}
}

export async function getState(forceRefresh = false) {
  const now = Date.now();
  const needsFetch =
    !globalThis.__DEATH_COUNTER_STATE__ ||
    forceRefresh ||
    now - lastCloudFetchTime > 600;

  if (needsFetch) {
    lastCloudFetchTime = now;
    const cloud = await fetchCloudState();
    if (cloud) {
      const current = globalThis.__DEATH_COUNTER_STATE__ || readDiskCache() || DEFAULT_STATE;
      if (!current.lastUpdated || cloud.lastUpdated >= current.lastUpdated) {
        globalThis.__DEATH_COUNTER_STATE__ = { ...DEFAULT_STATE, ...cloud };
        writeDiskCache(globalThis.__DEATH_COUNTER_STATE__);
      }
    } else if (!globalThis.__DEATH_COUNTER_STATE__) {
      const disk = readDiskCache();
      globalThis.__DEATH_COUNTER_STATE__ = disk
        ? { ...DEFAULT_STATE, ...disk }
        : { ...DEFAULT_STATE };
    }
  }

  return globalThis.__DEATH_COUNTER_STATE__ || { ...DEFAULT_STATE };
}

export async function updateState(partial = {}) {
  const current = await getState();

  // Reject out-of-order stale updates if an older network packet arrives
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
    lastUpdated: Math.max(Date.now(), partial.lastUpdated || 0),
  };

  globalThis.__DEATH_COUNTER_STATE__ = next;
  writeDiskCache(next);
  await saveCloudState(next);
  return next;
}

export async function applyAction(rawAction, value) {
  const state = await getState();
  const now = Date.now();

  const normAction =
    rawAction === 'add' || rawAction === 'addDeath' ? 'add'
    : rawAction === 'undo' || rawAction === 'undoDeath' ? 'undo'
    : rawAction === 'addBossKill' || rawAction === 'bossSlain' ? 'addBossKill'
    : rawAction === 'undoBossKill' ? 'undoBossKill'
    : rawAction === 'set' || rawAction === 'setDeath' ? 'setDeath'
    : rawAction === 'setBossKill' ? 'setBossKill'
    : rawAction;

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

  state.lastUpdated = now;
  globalThis.__DEATH_COUNTER_STATE__ = state;
  writeDiskCache(state);
  await saveCloudState(state);

  return { state, normAction };
}

export async function resetState(target = 'session') {
  const state = await getState();
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
  globalThis.__DEATH_COUNTER_STATE__ = state;
  writeDiskCache(state);
  await saveCloudState(state);
  return state;
}
