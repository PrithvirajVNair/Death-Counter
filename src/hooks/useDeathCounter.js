// Central death counter hook — shared state, persistence, and multi-channel sync
// Supports: Supabase Realtime, BroadcastChannel, LocalStorage, and REST API

import { useState, useEffect, useCallback, useRef } from 'react';
import { saveToStorage, loadFromStorage } from '../lib/storage';
import { broadcastUpdate, onSyncMessage, fetchServerState } from '../lib/sync';
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS } from '../lib/defaults';

export function useDeathCounter() {
  // ─── State ───
  const [deaths, setDeaths] = useState(() => loadFromStorage('deaths', 0));
  const [sessionDeaths, setSessionDeaths] = useState(() => loadFromStorage('sessionDeaths', 0));
  const [allTimeDeaths, setAllTimeDeaths] = useState(() => loadFromStorage('allTimeDeaths', 0));
  const [revision, setRevision] = useState(() => loadFromStorage('revision', 1));
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
  const [lastUpdated, setLastUpdated] = useState(() => loadFromStorage('lastUpdated', 0));
  const [deathAnim, setDeathAnim] = useState(false);
  const [bossSlainAnim, setBossSlainAnim] = useState(false);

  const animTimeoutRef = useRef(null);
  const bossAnimTimeoutRef = useRef(null);
  const lastLocalActionTimeRef = useRef(0);

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
    revision,
    lastUpdated,
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
      revision,
      lastUpdated,
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

      const isOverlay = typeof window !== 'undefined' && window.location.pathname.includes('overlay');
      const localDeaths = loadFromStorage('deaths', 0);
      const localSession = loadFromStorage('sessionDeaths', 0);
      const localAllTime = loadFromStorage('allTimeDeaths', 0);
      const localBossKills = loadFromStorage('bossKills', 0);
      const localLastUpdated = loadFromStorage('lastUpdated', 0);
      const serverLastUpdated = serverState.lastUpdated || 0;

      // If local progress is newer than server, update server (only if server has established history)
      if (!isOverlay && localLastUpdated > serverLastUpdated && serverLastUpdated > 0) {
        broadcastUpdate('fullSync', {
          deaths: localDeaths,
          sessionDeaths: localSession,
          allTimeDeaths: localAllTime,
          bossKills: localBossKills,
          revision: (serverState.revision || 1) + 1,
          lastUpdated: localLastUpdated || Date.now(),
        });
        return;
      }

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
      if (serverState.revision !== undefined) {
        setRevision(serverState.revision);
        saveToStorage('revision', serverState.revision);
      }
      if (serverState.lastUpdated) {
        setLastUpdated(serverState.lastUpdated);
        saveToStorage('lastUpdated', serverState.lastUpdated);
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

  // ─── Sync listener (BroadcastChannel, Storage, Realtime, Polling) ───
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
          if (p.revision !== undefined) {
            setRevision(p.revision);
            saveToStorage('revision', p.revision);
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
          if (p.revision !== undefined) {
            setRevision(p.revision);
            saveToStorage('revision', p.revision);
          }
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
          const isOverlay = typeof window !== 'undefined' && window.location.pathname.includes('overlay');
          const timeSinceLocalAction = Date.now() - lastLocalActionTimeRef.current;

          // On controller: reject background poll if user recently took a local action
          if (!isOverlay && timeSinceLocalAction < 2500 && msg.type === 'pollSync') {
            return;
          }

          // Authoritative revision check: ignore older revisions
          if (p.revision && stateRef.current.revision && p.revision < stateRef.current.revision) {
            return;
          }

          // Fallback timestamp check
          if (!p.revision && p.lastUpdated && stateRef.current.lastUpdated && p.lastUpdated < stateRef.current.lastUpdated) {
            return;
          }

          if (p.revision !== undefined) {
            setRevision(p.revision);
            saveToStorage('revision', p.revision);
          }

          if (p.lastUpdated) {
            setLastUpdated(p.lastUpdated);
            saveToStorage('lastUpdated', p.lastUpdated);
          }

          if (p.deaths !== undefined && p.deaths !== stateRef.current.deaths) {
            const isIncrease = p.deaths > stateRef.current.deaths;
            setDeaths(p.deaths);
            saveToStorage('deaths', p.deaths);
            if (p.triggerAnim || isIncrease) {
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
            const isIncrease = p.bossKills > stateRef.current.bossKills;
            setBossKills(p.bossKills);
            saveToStorage('bossKills', p.bossKills);
            if (p.triggerAnim || isIncrease) {
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
    lastLocalActionTimeRef.current = Date.now();
    const cur = stateRef.current;
    const nextDeaths = cur.deaths + 1;
    const nextSession = cur.sessionDeaths + 1;
    const nextAllTime = cur.allTimeDeaths + 1;
    const nextRevision = (cur.revision || 1) + 1;
    const nextHistory = [...cur.history.slice(-99), { action: 'add', timestamp: Date.now(), value: nextDeaths }];

    setDeaths(nextDeaths);
    setSessionDeaths(nextSession);
    setAllTimeDeaths(nextAllTime);
    setRevision(nextRevision);
    setHistory(nextHistory);

    saveToStorage('deaths', nextDeaths);
    saveToStorage('sessionDeaths', nextSession);
    saveToStorage('allTimeDeaths', nextAllTime);
    saveToStorage('revision', nextRevision);
    saveToStorage('history', nextHistory);
    saveToStorage('lastUpdated', Date.now());

    broadcastUpdate('deaths', {
      deaths: nextDeaths,
      sessionDeaths: nextSession,
      allTimeDeaths: nextAllTime,
      revision: nextRevision,
      history: nextHistory,
      triggerAnim: true,
    });

    triggerDeathAnimation();
  }, [triggerDeathAnimation]);

  const undoDeath = useCallback(() => {
    lastLocalActionTimeRef.current = Date.now();
    const cur = stateRef.current;
    if (cur.deaths <= 0) return;
    const nextDeaths = cur.deaths - 1;
    const nextSession = Math.max(0, cur.sessionDeaths - 1);
    const nextRevision = (cur.revision || 1) + 1;
    const nextHistory = [...cur.history.slice(-99), { action: 'undo', timestamp: Date.now(), value: nextDeaths }];

    setDeaths(nextDeaths);
    setSessionDeaths(nextSession);
    setRevision(nextRevision);
    setHistory(nextHistory);

    saveToStorage('deaths', nextDeaths);
    saveToStorage('sessionDeaths', nextSession);
    saveToStorage('revision', nextRevision);
    saveToStorage('history', nextHistory);
    saveToStorage('lastUpdated', Date.now());

    broadcastUpdate('deaths', {
      deaths: nextDeaths,
      sessionDeaths: nextSession,
      allTimeDeaths: cur.allTimeDeaths,
      revision: nextRevision,
      history: nextHistory,
      triggerAnim: false,
    });
  }, []);

  const resetDeaths = useCallback(() => {
    lastLocalActionTimeRef.current = Date.now();
    const cur = stateRef.current;
    const nextRevision = (cur.revision || 1) + 1;

    setDeaths(0);
    setSessionDeaths(0);
    setRevision(nextRevision);
    setHistory([]);

    saveToStorage('deaths', 0);
    saveToStorage('sessionDeaths', 0);
    saveToStorage('revision', nextRevision);
    saveToStorage('history', []);

    broadcastUpdate('reset', {
      deaths: 0,
      sessionDeaths: 0,
      allTimeDeaths: cur.allTimeDeaths,
      revision: nextRevision,
      history: [],
      triggerAnim: false,
    });
  }, []);

  const resetSession = useCallback(() => {
    lastLocalActionTimeRef.current = Date.now();
    const cur = stateRef.current;
    const nextRevision = (cur.revision || 1) + 1;

    setDeaths(0);
    setSessionDeaths(0);
    setRevision(nextRevision);
    setHistory([]);

    saveToStorage('deaths', 0);
    saveToStorage('sessionDeaths', 0);
    saveToStorage('revision', nextRevision);
    saveToStorage('history', []);

    broadcastUpdate('deaths', {
      deaths: 0,
      sessionDeaths: 0,
      allTimeDeaths: cur.allTimeDeaths,
      revision: nextRevision,
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
    lastLocalActionTimeRef.current = Date.now();
    const cur = stateRef.current;
    const nextKills = (cur.bossKills || 0) + 1;
    const nextRevision = (cur.revision || 1) + 1;
    setBossKills(nextKills);
    setRevision(nextRevision);
    saveToStorage('bossKills', nextKills);
    saveToStorage('revision', nextRevision);

    broadcastUpdate('bossKills', {
      bossKills: nextKills,
      deaths: cur.deaths,
      currentBoss: cur.currentBoss,
      revision: nextRevision,
      triggerAnim: true,
    });

    triggerBossSlainAnimation();
  }, [triggerBossSlainAnimation]);

  const undoBossKill = useCallback(() => {
    lastLocalActionTimeRef.current = Date.now();
    const cur = stateRef.current;
    if (!cur.bossKills || cur.bossKills <= 0) return;
    const nextKills = cur.bossKills - 1;
    const nextRevision = (cur.revision || 1) + 1;
    setBossKills(nextKills);
    setRevision(nextRevision);
    saveToStorage('bossKills', nextKills);
    saveToStorage('revision', nextRevision);

    broadcastUpdate('bossKills', {
      bossKills: nextKills,
      deaths: cur.deaths,
      currentBoss: cur.currentBoss,
      revision: nextRevision,
      triggerAnim: false,
    });
  }, []);

  const resetBossKills = useCallback(() => {
    lastLocalActionTimeRef.current = Date.now();
    const cur = stateRef.current;
    const nextRevision = (cur.revision || 1) + 1;
    setBossKills(0);
    setRevision(nextRevision);
    saveToStorage('bossKills', 0);
    saveToStorage('revision', nextRevision);

    broadcastUpdate('bossKills', {
      bossKills: 0,
      deaths: cur.deaths,
      currentBoss: cur.currentBoss,
      revision: nextRevision,
      triggerAnim: false,
    });
  }, []);

  const setDeathCount = useCallback((customValue) => {
    lastLocalActionTimeRef.current = Date.now();
    const nextDeaths = Math.max(0, parseInt(customValue, 10) || 0);
    const cur = stateRef.current;
    const diff = nextDeaths - cur.deaths;
    const nextSession = Math.max(0, cur.sessionDeaths + diff);
    const nextAllTime = Math.max(0, cur.allTimeDeaths + Math.max(0, diff));
    const nextRevision = (cur.revision || 1) + 1;
    const nextHistory = [...cur.history.slice(-99), { action: 'set', timestamp: Date.now(), value: nextDeaths }];

    setDeaths(nextDeaths);
    setSessionDeaths(nextSession);
    setAllTimeDeaths(nextAllTime);
    setRevision(nextRevision);
    setHistory(nextHistory);

    saveToStorage('deaths', nextDeaths);
    saveToStorage('sessionDeaths', nextSession);
    saveToStorage('allTimeDeaths', nextAllTime);
    saveToStorage('revision', nextRevision);
    saveToStorage('history', nextHistory);
    saveToStorage('lastUpdated', Date.now());

    broadcastUpdate('deaths', {
      deaths: nextDeaths,
      sessionDeaths: nextSession,
      allTimeDeaths: nextAllTime,
      revision: nextRevision,
      history: nextHistory,
      triggerAnim: true,
    });

    triggerDeathAnimation();
  }, [triggerDeathAnimation]);

  const setBossKillCount = useCallback((customValue) => {
    const nextKills = Math.max(0, parseInt(customValue, 10) || 0);
    const cur = stateRef.current;
    const nextRevision = (cur.revision || 1) + 1;

    setBossKills(nextKills);
    setRevision(nextRevision);
    saveToStorage('bossKills', nextKills);
    saveToStorage('revision', nextRevision);

    broadcastUpdate('bossKills', {
      bossKills: nextKills,
      deaths: cur.deaths,
      currentBoss: cur.currentBoss,
      revision: nextRevision,
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
    revision,
    deathAnim,
    bossSlainAnim,
    loadFullState: (s) => {
      if (!s) return;
      if (s.deaths !== undefined) {
        setDeaths(s.deaths);
        saveToStorage('deaths', s.deaths);
      }
      if (s.sessionDeaths !== undefined) {
        setSessionDeaths(s.sessionDeaths);
        saveToStorage('sessionDeaths', s.sessionDeaths);
      }
      if (s.allTimeDeaths !== undefined) {
        setAllTimeDeaths(s.allTimeDeaths);
        saveToStorage('allTimeDeaths', s.allTimeDeaths);
      }
      if (s.bossKills !== undefined) {
        setBossKills(s.bossKills);
        saveToStorage('bossKills', s.bossKills);
      }
      if (s.revision !== undefined) {
        setRevision(s.revision);
        saveToStorage('revision', s.revision);
      }
      if (s.settings) {
        setSettings((prev) => ({ ...prev, ...s.settings }));
        saveToStorage('settings', s.settings);
      }
      if (s.shortcuts) {
        setShortcuts((prev) => ({ ...prev, ...s.shortcuts }));
        saveToStorage('shortcuts', s.shortcuts);
      }
      if (s.bosses) {
        setBosses(s.bosses);
        saveToStorage('bosses', s.bosses);
      }
      if (s.currentBoss !== undefined) {
        setCurrentBoss(s.currentBoss);
        saveToStorage('currentBoss', s.currentBoss);
      }
      if (s.history) {
        setHistory(s.history);
        saveToStorage('history', s.history);
      }
      if (s.lastUpdated) {
        setLastUpdated(s.lastUpdated);
        saveToStorage('lastUpdated', s.lastUpdated);
      }
    },
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
