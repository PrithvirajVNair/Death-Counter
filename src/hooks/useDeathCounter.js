// Central death counter hook — shared state, persistence, and multi-channel sync
// Supports: Server-Sent Events (SSE for OBS Studio Browser Source), BroadcastChannel, LocalStorage, and REST API

import { useState, useEffect, useCallback, useRef } from 'react';
import { saveToStorage, loadFromStorage } from '../lib/storage';
import { broadcastUpdate, onSyncMessage, fetchServerState } from '../lib/sync';
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS } from '../lib/defaults';

export function useDeathCounter() {
  // ─── State ───
  const [deaths, setDeaths] = useState(() => loadFromStorage('deaths', 0));
  const [sessionDeaths, setSessionDeaths] = useState(() => loadFromStorage('sessionDeaths', 0));
  const [allTimeDeaths, setAllTimeDeaths] = useState(() => loadFromStorage('allTimeDeaths', 0));
  const [settings, setSettings] = useState(() => {
    const saved = loadFromStorage('settings', null);
    return saved ? { ...DEFAULT_SETTINGS, ...saved } : { ...DEFAULT_SETTINGS };
  });
  const [shortcuts, setShortcuts] = useState(() => {
    const saved = loadFromStorage('shortcuts', null);
    return saved ? { ...DEFAULT_SHORTCUTS, ...saved } : { ...DEFAULT_SHORTCUTS };
  });
  const [bosses, setBosses] = useState(() => loadFromStorage('bosses', {}));
  const [currentBoss, setCurrentBoss] = useState(() => loadFromStorage('currentBoss', ''));
  const [bossKills, setBossKills] = useState(() => loadFromStorage('bossKills', 0));
  const [history, setHistory] = useState(() => loadFromStorage('history', []));
  const [deathAnim, setDeathAnim] = useState(false);
  const [bossSlainAnim, setBossSlainAnim] = useState(false);

  const animTimeoutRef = useRef(null);
  const bossAnimTimeoutRef = useRef(null);

  // Keep refs for current state to allow fresh closures in event handlers
  const stateRef = useRef({
    deaths,
    sessionDeaths,
    allTimeDeaths,
    bossKills,
    settings,
    shortcuts,
    bosses,
    currentBoss,
    history,
  });

  useEffect(() => {
    stateRef.current = {
      deaths,
      sessionDeaths,
      allTimeDeaths,
      bossKills,
      settings,
      shortcuts,
      bosses,
      currentBoss,
      history,
    };
  });

  // ─── Animation triggers ───
  const triggerDeathAnimation = useCallback(() => {
    setDeathAnim(true);
    if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    animTimeoutRef.current = setTimeout(() => setDeathAnim(false), 800);
  }, []);

  const triggerBossSlainAnimation = useCallback(() => {
    setBossSlainAnim(true);
    if (bossAnimTimeoutRef.current) clearTimeout(bossAnimTimeoutRef.current);
    bossAnimTimeoutRef.current = setTimeout(() => setBossSlainAnim(false), 1200);
  }, []);

  const triggerAnimRef = useRef(triggerDeathAnimation);
  const triggerBossAnimRef = useRef(triggerBossSlainAnimation);
  useEffect(() => {
    triggerAnimRef.current = triggerDeathAnimation;
    triggerBossAnimRef.current = triggerBossSlainAnimation;
  }, [triggerDeathAnimation, triggerBossSlainAnimation]);

  // ─── Initial Server State Fetch ───
  useEffect(() => {
    fetchServerState().then((serverState) => {
      if (!serverState) return;
      if (serverState.deaths !== undefined) {
        setDeaths(serverState.deaths);
        saveToStorage('deaths', serverState.deaths);
      }
      if (serverState.sessionDeaths !== undefined) {
        setSessionDeaths(serverState.sessionDeaths);
        saveToStorage('sessionDeaths', serverState.sessionDeaths);
      }
      if (serverState.allTimeDeaths !== undefined) {
        setAllTimeDeaths(serverState.allTimeDeaths);
        saveToStorage('allTimeDeaths', serverState.allTimeDeaths);
      }
      if (serverState.bossKills !== undefined) {
        setBossKills(serverState.bossKills);
        saveToStorage('bossKills', serverState.bossKills);
      }
      if (serverState.settings) {
        setSettings((prev) => {
          const merged = { ...prev, ...serverState.settings };
          saveToStorage('settings', merged);
          return merged;
        });
      }
      if (serverState.shortcuts) {
        setShortcuts((prev) => {
          const merged = { ...prev, ...serverState.shortcuts };
          saveToStorage('shortcuts', merged);
          return merged;
        });
      }
      if (serverState.bosses) {
        setBosses(serverState.bosses);
        saveToStorage('bosses', serverState.bosses);
      }
      if (serverState.currentBoss !== undefined) {
        setCurrentBoss(serverState.currentBoss);
        saveToStorage('currentBoss', serverState.currentBoss);
      }
      if (serverState.history) {
        setHistory(serverState.history);
        saveToStorage('history', serverState.history);
      }
    });
  }, []);

  // ─── Sync listener (SSE, BroadcastChannel, Storage, Polling) ───
  useEffect(() => {
    const cleanup = onSyncMessage((msg) => {
      if (!msg || !msg.payload) return;

      switch (msg.type) {
        case 'deaths': {
          const p = msg.payload;
          setDeaths(p.deaths);
          setSessionDeaths(p.sessionDeaths);
          setAllTimeDeaths(p.allTimeDeaths);
          if (p.bossKills !== undefined) {
            setBossKills(p.bossKills);
            saveToStorage('bossKills', p.bossKills);
          }
          if (p.history) setHistory(p.history);
          saveToStorage('deaths', p.deaths);
          saveToStorage('sessionDeaths', p.sessionDeaths);
          saveToStorage('allTimeDeaths', p.allTimeDeaths);
          if (p.triggerAnim) {
            triggerAnimRef.current();
          }
          break;
        }

        case 'bossKills': {
          const p = msg.payload;
          setBossKills(p.bossKills);
          saveToStorage('bossKills', p.bossKills);
          if (p.triggerAnim) {
            triggerBossAnimRef.current();
          }
          break;
        }

        case 'settings': {
          setSettings((prev) => {
            const next = { ...prev, ...(msg.payload.settings || msg.payload) };
            saveToStorage('settings', next);
            return next;
          });
          break;
        }

        case 'shortcuts': {
          setShortcuts((prev) => {
            const next = { ...prev, ...(msg.payload.shortcuts || msg.payload) };
            saveToStorage('shortcuts', next);
            return next;
          });
          break;
        }

        case 'bosses': {
          const p = msg.payload;
          setBosses(p.bosses);
          setCurrentBoss(p.currentBoss);
          saveToStorage('bosses', p.bosses);
          saveToStorage('currentBoss', p.currentBoss);
          break;
        }

        case 'reset': {
          setDeaths(0);
          setSessionDeaths(0);
          setHistory([]);
          saveToStorage('deaths', 0);
          saveToStorage('sessionDeaths', 0);
          saveToStorage('history', []);
          break;
        }

        case 'fullSync':
        case 'stateUpdate':
        case 'pollSync': {
          const p = msg.payload;
          if (p.deaths !== undefined && p.deaths !== stateRef.current.deaths) {
            setDeaths(p.deaths);
            saveToStorage('deaths', p.deaths);
            if (p.triggerAnim) {
              triggerAnimRef.current();
            }
          }
          if (p.sessionDeaths !== undefined && p.sessionDeaths !== stateRef.current.sessionDeaths) {
            setSessionDeaths(p.sessionDeaths);
            saveToStorage('sessionDeaths', p.sessionDeaths);
          }
          if (p.allTimeDeaths !== undefined && p.allTimeDeaths !== stateRef.current.allTimeDeaths) {
            setAllTimeDeaths(p.allTimeDeaths);
            saveToStorage('allTimeDeaths', p.allTimeDeaths);
          }
          if (p.bossKills !== undefined && p.bossKills !== stateRef.current.bossKills) {
            setBossKills(p.bossKills);
            saveToStorage('bossKills', p.bossKills);
            if (p.triggerAnim) {
              triggerBossAnimRef.current();
            }
          }
          if (p.settings) {
            setSettings((prev) => {
              const merged = { ...prev, ...p.settings };
              saveToStorage('settings', merged);
              return merged;
            });
          }
          if (p.shortcuts) {
            setShortcuts((prev) => {
              const merged = { ...prev, ...p.shortcuts };
              saveToStorage('shortcuts', merged);
              return merged;
            });
          }
          if (p.bosses) {
            setBosses(p.bosses);
            saveToStorage('bosses', p.bosses);
          }
          if (p.currentBoss !== undefined) {
            setCurrentBoss(p.currentBoss);
            saveToStorage('currentBoss', p.currentBoss);
          }
          if (p.history) {
            setHistory(p.history);
            saveToStorage('history', p.history);
          }
          break;
        }

        default:
          break;
      }
    });

    return cleanup;
  }, []);

  // ─── Actions ───
  const addDeath = useCallback(() => {
    const cur = stateRef.current;
    const nextDeaths = cur.deaths + 1;
    const nextSession = cur.sessionDeaths + 1;
    const nextAllTime = cur.allTimeDeaths + 1;
    const nextHistory = [...cur.history.slice(-99), { action: 'add', timestamp: Date.now(), value: nextDeaths }];

    setDeaths(nextDeaths);
    setSessionDeaths(nextSession);
    setAllTimeDeaths(nextAllTime);
    setHistory(nextHistory);

    saveToStorage('deaths', nextDeaths);
    saveToStorage('sessionDeaths', nextSession);
    saveToStorage('allTimeDeaths', nextAllTime);
    saveToStorage('history', nextHistory);

    broadcastUpdate('deaths', {
      deaths: nextDeaths,
      sessionDeaths: nextSession,
      allTimeDeaths: nextAllTime,
      history: nextHistory,
      triggerAnim: true,
    });

    triggerDeathAnimation();
  }, [triggerDeathAnimation]);

  const undoDeath = useCallback(() => {
    const cur = stateRef.current;
    if (cur.deaths <= 0) return;
    const nextDeaths = cur.deaths - 1;
    const nextSession = Math.max(0, cur.sessionDeaths - 1);
    const nextHistory = [...cur.history.slice(-99), { action: 'undo', timestamp: Date.now(), value: nextDeaths }];

    setDeaths(nextDeaths);
    setSessionDeaths(nextSession);
    setHistory(nextHistory);

    saveToStorage('deaths', nextDeaths);
    saveToStorage('sessionDeaths', nextSession);
    saveToStorage('history', nextHistory);

    broadcastUpdate('deaths', {
      deaths: nextDeaths,
      sessionDeaths: nextSession,
      allTimeDeaths: cur.allTimeDeaths,
      history: nextHistory,
      triggerAnim: false,
    });
  }, []);

  const resetDeaths = useCallback(() => {
    const cur = stateRef.current;
    setDeaths(0);
    setSessionDeaths(0);
    setHistory([]);

    saveToStorage('deaths', 0);
    saveToStorage('sessionDeaths', 0);
    saveToStorage('history', []);

    broadcastUpdate('reset', {
      deaths: 0,
      sessionDeaths: 0,
      allTimeDeaths: cur.allTimeDeaths,
      history: [],
      triggerAnim: false,
    });
  }, []);

  const resetSession = useCallback(() => {
    const cur = stateRef.current;
    setDeaths(0);
    setSessionDeaths(0);
    setHistory([]);

    saveToStorage('deaths', 0);
    saveToStorage('sessionDeaths', 0);
    saveToStorage('history', []);

    broadcastUpdate('deaths', {
      deaths: 0,
      sessionDeaths: 0,
      allTimeDeaths: cur.allTimeDeaths,
      history: [],
      triggerAnim: false,
    });
  }, []);

  const updateSettings = useCallback((partial) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveToStorage('settings', next);
      broadcastUpdate('settings', { settings: next });
      return next;
    });
  }, []);

  const resetAppearance = useCallback(() => {
    const reset = { ...DEFAULT_SETTINGS };
    setSettings(reset);
    saveToStorage('settings', reset);
    broadcastUpdate('settings', { settings: reset });
  }, []);

  const updateShortcuts = useCallback((partial) => {
    setShortcuts((prev) => {
      const next = { ...prev, ...partial };
      saveToStorage('shortcuts', next);
      broadcastUpdate('shortcuts', { shortcuts: next });
      return next;
    });
  }, []);

  // Boss actions
  const addBossAttempt = useCallback((bossName) => {
    const cur = stateRef.current;
    const nextBosses = { ...cur.bosses, [bossName]: (cur.bosses[bossName] || 0) + 1 };
    setBosses(nextBosses);
    saveToStorage('bosses', nextBosses);
    broadcastUpdate('bosses', { bosses: nextBosses, currentBoss: cur.currentBoss });
  }, []);

  const undoBossAttempt = useCallback((bossName) => {
    const cur = stateRef.current;
    const count = cur.bosses[bossName] || 0;
    if (count <= 0) return;
    const nextBosses = { ...cur.bosses, [bossName]: count - 1 };
    setBosses(nextBosses);
    saveToStorage('bosses', nextBosses);
    broadcastUpdate('bosses', { bosses: nextBosses, currentBoss: cur.currentBoss });
  }, []);

  const resetBossAttempts = useCallback((bossName) => {
    const cur = stateRef.current;
    const nextBosses = { ...cur.bosses, [bossName]: 0 };
    setBosses(nextBosses);
    saveToStorage('bosses', nextBosses);
    broadcastUpdate('bosses', { bosses: nextBosses, currentBoss: cur.currentBoss });
  }, []);

  const selectBoss = useCallback((bossName) => {
    const cur = stateRef.current;
    setCurrentBoss(bossName);
    saveToStorage('currentBoss', bossName);
    broadcastUpdate('bosses', { bosses: cur.bosses, currentBoss: bossName });
  }, []);

  const addCustomBoss = useCallback((bossName) => {
    if (!bossName.trim()) return;
    const cur = stateRef.current;
    if (bossName in cur.bosses) return;
    const nextBosses = { ...cur.bosses, [bossName]: 0 };
    setBosses(nextBosses);
    saveToStorage('bosses', nextBosses);
    broadcastUpdate('bosses', { bosses: nextBosses, currentBoss: cur.currentBoss });
  }, []);

  const removeBoss = useCallback((bossName) => {
    const cur = stateRef.current;
    const nextBosses = { ...cur.bosses };
    delete nextBosses[bossName];
    const nextBoss = cur.currentBoss === bossName ? '' : cur.currentBoss;
    setBosses(nextBosses);
    setCurrentBoss(nextBoss);
    saveToStorage('bosses', nextBosses);
    saveToStorage('currentBoss', nextBoss);
    broadcastUpdate('bosses', { bosses: nextBosses, currentBoss: nextBoss });
  }, []);

  // ─── Boss Slain / Kill Counter Actions ───
  const addBossKill = useCallback(() => {
    const cur = stateRef.current;
    const nextKills = (cur.bossKills || 0) + 1;
    setBossKills(nextKills);
    saveToStorage('bossKills', nextKills);

    broadcastUpdate('bossKills', {
      bossKills: nextKills,
      deaths: cur.deaths,
      currentBoss: cur.currentBoss,
      triggerAnim: true,
    });

    triggerBossSlainAnimation();
  }, [triggerBossSlainAnimation]);

  const undoBossKill = useCallback(() => {
    const cur = stateRef.current;
    if (!cur.bossKills || cur.bossKills <= 0) return;
    const nextKills = cur.bossKills - 1;
    setBossKills(nextKills);
    saveToStorage('bossKills', nextKills);

    broadcastUpdate('bossKills', {
      bossKills: nextKills,
      deaths: cur.deaths,
      currentBoss: cur.currentBoss,
      triggerAnim: false,
    });
  }, []);

  const resetBossKills = useCallback(() => {
    const cur = stateRef.current;
    setBossKills(0);
    saveToStorage('bossKills', 0);

    broadcastUpdate('bossKills', {
      bossKills: 0,
      deaths: cur.deaths,
      currentBoss: cur.currentBoss,
      triggerAnim: false,
    });
  }, []);

  const setDeathCount = useCallback((customValue) => {
    const nextDeaths = Math.max(0, parseInt(customValue, 10) || 0);
    const cur = stateRef.current;
    const diff = nextDeaths - cur.deaths;
    const nextSession = Math.max(0, cur.sessionDeaths + diff);
    const nextAllTime = Math.max(0, cur.allTimeDeaths + Math.max(0, diff));
    const nextHistory = [...cur.history.slice(-99), { action: 'set', timestamp: Date.now(), value: nextDeaths }];

    setDeaths(nextDeaths);
    setSessionDeaths(nextSession);
    setAllTimeDeaths(nextAllTime);
    setHistory(nextHistory);

    saveToStorage('deaths', nextDeaths);
    saveToStorage('sessionDeaths', nextSession);
    saveToStorage('allTimeDeaths', nextAllTime);
    saveToStorage('history', nextHistory);

    broadcastUpdate('deaths', {
      deaths: nextDeaths,
      sessionDeaths: nextSession,
      allTimeDeaths: nextAllTime,
      history: nextHistory,
      triggerAnim: true,
    });

    triggerDeathAnimation();
  }, [triggerDeathAnimation]);

  const setBossKillCount = useCallback((customValue) => {
    const nextKills = Math.max(0, parseInt(customValue, 10) || 0);
    const cur = stateRef.current;

    setBossKills(nextKills);
    saveToStorage('bossKills', nextKills);

    broadcastUpdate('bossKills', {
      bossKills: nextKills,
      deaths: cur.deaths,
      currentBoss: cur.currentBoss,
      triggerAnim: true,
    });

    triggerBossSlainAnimation();
  }, [triggerBossSlainAnimation]);

  return {
    deaths,
    sessionDeaths,
    allTimeDeaths,
    bossKills,
    settings,
    shortcuts,
    bosses,
    currentBoss,
    history,
    deathAnim,
    bossSlainAnim,
    addDeath,
    undoDeath,
    resetDeaths,
    resetSession,
    setDeathCount,
    addBossKill,
    undoBossKill,
    resetBossKills,
    setBossKillCount,
    updateSettings,
    resetAppearance,
    updateShortcuts,
    addBossAttempt,
    undoBossAttempt,
    resetBossAttempts,
    selectBoss,
    addCustomBoss,
    removeBoss,
  };
}
