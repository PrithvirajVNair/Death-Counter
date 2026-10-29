import fs from 'fs';
import path from 'path';

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

export function getState() {
  if (!globalThis.__DEATH_COUNTER_STATE__) {
    const disk = readDiskCache();
    globalThis.__DEATH_COUNTER_STATE__ = disk
      ? { ...DEFAULT_STATE, ...disk }
      : { ...DEFAULT_STATE };
  }
  return globalThis.__DEATH_COUNTER_STATE__;
}

export function updateState(partial = {}) {
  const current = getState();

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
  return next;
}

export function applyAction(rawAction, value) {
  const state = getState();
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

  return { state, normAction };
}

export function resetState(target = 'session') {
  const state = getState();
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
  return state;
}
