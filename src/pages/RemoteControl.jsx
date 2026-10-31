import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  validateRemoteToken,
  supabase,
  generateCryptoRandomString,
  parseTokenFromLocation,
  parseTokenInput,
} from '../lib/supabase';
import { broadcastUpdate } from '../lib/sync';
import { Skull, Trophy, RotateCcw, Edit3, Clock, AlertTriangle, Zap, LogOut } from 'lucide-react';
import Embers from '../components/Embers';
import '../styles/remote.css';
import '../styles/auth.css';

export default function RemoteControl() {
  const [token, setToken] = useState(() => parseTokenFromLocation());
  const [manualCodeInput, setManualCodeInput] = useState('');
  const [loading, setLoading] = useState(Boolean(token));
  const [tokenInfo, setTokenInfo] = useState(null);
  const [errorReason, setErrorReason] = useState(!token ? 'missing' : null);

  // Counter state for the streamer
  const [deaths, setDeaths] = useState(0);
  const [sessionDeaths, setSessionDeaths] = useState(0);
  const [allTimeDeaths, setAllTimeDeaths] = useState(0);
  const [bossKills, setBossKills] = useState(0);
  const [animDeath, setAnimDeath] = useState(false);
  const [animBoss, setAnimBoss] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [customPrompt, setCustomPrompt] = useState(null); // 'death' | 'boss'
  const [customVal, setCustomVal] = useState('');

  const lastAppliedRevisionRef = useRef(0);
  const isFetchingRef = useRef(false);
  const lastActionTimeRef = useRef(0);

  // 1. Validate token via dedicated POST transport (X-Moderator-Token header)
  useEffect(() => {
    if (!token) {
      setLoading(false);
      setErrorReason('missing');
      return;
    }

    setLoading(true);
    setErrorReason(null);

    validateRemoteToken(token).then((result) => {
      setLoading(false);
      if (result.valid) {
        setTokenInfo(result);
        setErrorReason(null);

        // Store token in session & local storage so page reload or tab reopen always maintains session
        try {
          sessionStorage.setItem('sdc_remote_token', token);
          localStorage.setItem('sdc_remote_token', token);
        } catch {}

        // Ensure browser address bar contains the token parameter so reloads and bookmarks work
        if (typeof window !== 'undefined') {
          const hasInHash = window.location.hash.includes(token);
          const hasInSearch = window.location.search.includes(encodeURIComponent(token)) || window.location.search.includes(token);
          if (!hasInHash && !hasInSearch) {
            const newUrl = `${window.location.pathname}?token=${encodeURIComponent(token)}`;
            window.history.replaceState(null, '', newUrl);
          }
        }
      } else {
        setErrorReason(result.reason || 'invalid');
        try {
          sessionStorage.removeItem('sdc_remote_token');
          localStorage.removeItem('sdc_remote_token');
        } catch {}
      }
    });
  }, [token]);

  const handleDisconnect = () => {
    try {
      sessionStorage.removeItem('sdc_remote_token');
      localStorage.removeItem('sdc_remote_token');
    } catch {}
    setToken(null);
    setTokenInfo(null);
    setErrorReason('missing');
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  const handleManualCodeSubmit = (e) => {
    e.preventDefault();
    const clean = parseTokenInput(manualCodeInput);
    if (!clean) return;
    setToken(clean);
  };

  const streamerKey = tokenInfo?.streamerKey;

  // 2. Fetch & Poll streamer state with strict monotonic revision checking
  const fetchState = useCallback(async () => {
    if (!streamerKey || isFetchingRef.current) return;
    // Don't let background polling overwrite freshly tapped actions
    if (Date.now() - lastActionTimeRef.current < 2500) return;

    isFetchingRef.current = true;
    try {
      // 1. Direct Supabase check
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('streamer_states')
            .select('deaths, session_deaths, all_time_deaths, boss_kills, revision')
            .eq('streamer_key', streamerKey)
            .maybeSingle();

          if (!error && data) {
            const rev = data.revision || 1;
            if (rev >= lastAppliedRevisionRef.current) {
              lastAppliedRevisionRef.current = rev;
              if (data.deaths !== undefined) setDeaths(data.deaths);
              if (data.session_deaths !== undefined) setSessionDeaths(data.session_deaths);
              if (data.all_time_deaths !== undefined) setAllTimeDeaths(data.all_time_deaths);
              if (data.boss_kills !== undefined) setBossKills(data.boss_kills);
            }
            return;
          }
        } catch {}
      }

      // 2. Fallback to API
      const res = await fetch(`/api/state?key=${encodeURIComponent(streamerKey)}&_t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        const rev = data.revision || 1;
        if (rev >= lastAppliedRevisionRef.current) {
          lastAppliedRevisionRef.current = rev;
          if (data.deaths !== undefined) setDeaths(data.deaths);
          if (data.sessionDeaths !== undefined) setSessionDeaths(data.sessionDeaths);
          if (data.allTimeDeaths !== undefined) setAllTimeDeaths(data.allTimeDeaths);
          if (data.bossKills !== undefined) setBossKills(data.bossKills);
        }
      }
    } finally {
      isFetchingRef.current = false;
    }
  }, [streamerKey]);

  useEffect(() => {
    if (!streamerKey) return;
    const initialTimer = setTimeout(() => {
      fetchState();
    }, 0);
    const interval = setInterval(fetchState, 1500);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [streamerKey, fetchState]);

  // Haptic feedback & quick toast
  const triggerHaptic = (pattern = [40]) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch {}
  };

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2200);
  };

  // Action Dispatcher: updates local state optimistically and dispatches to backend API with token in header
  const sendAction = async (action, extra = {}) => {
    if (!streamerKey || !token) return;
    triggerHaptic([30]);

    let nextDeaths = deaths;
    let nextSession = sessionDeaths;
    let nextAllTime = allTimeDeaths;
    let nextBossKills = bossKills;

    if (action === 'add' || action === 'addDeath') {
      nextDeaths = deaths + 1;
      nextSession = sessionDeaths + 1;
      nextAllTime = allTimeDeaths + 1;
      setDeaths(nextDeaths);
      setSessionDeaths(nextSession);
      setAllTimeDeaths(nextAllTime);
    } else if (action === 'undo' || action === 'undoDeath') {
      nextDeaths = Math.max(0, deaths - 1);
      nextSession = Math.max(0, sessionDeaths - 1);
      setDeaths(nextDeaths);
      setSessionDeaths(nextSession);
    } else if (action === 'addBossKill') {
      nextBossKills = bossKills + 1;
      setBossKills(nextBossKills);
    } else if (action === 'undoBossKill') {
      nextBossKills = Math.max(0, bossKills - 1);
      setBossKills(nextBossKills);
    } else if (action === 'setCount' || action === 'setDeath') {
      const val = Math.max(0, parseInt(extra.value !== undefined ? extra.value : extra.deaths, 10) || 0);
      const diff = val - deaths;
      nextDeaths = val;
      nextSession = Math.max(0, sessionDeaths + diff);
      nextAllTime = Math.max(0, allTimeDeaths + Math.max(0, diff));
      setDeaths(nextDeaths);
      setSessionDeaths(nextSession);
      setAllTimeDeaths(nextAllTime);
    } else if (action === 'setBossCount' || action === 'setBossKill') {
      const val = Math.max(0, parseInt(extra.value !== undefined ? extra.value : extra.bossKills, 10) || 0);
      nextBossKills = val;
      setBossKills(nextBossKills);
    } else if (action === 'reset' || action === 'resetSession') {
      nextDeaths = 0;
      nextSession = 0;
      setDeaths(0);
      setSessionDeaths(0);
    }

    lastActionTimeRef.current = Date.now();

    // 1. Instant tab-to-tab sync if testing on same computer
    broadcastUpdate('deaths', {
      deaths: nextDeaths,
      sessionDeaths: nextSession,
      allTimeDeaths: nextAllTime,
      bossKills: nextBossKills,
      triggerAnim: action === 'add' || action === 'addDeath',
    });

    // 2. Dispatch to API with token in header ONLY; no token or absolute counters in JSON body
    try {
      const isResetAction = action === 'reset' || action === 'resetSession' || action === 'resetAll';
      const endpoint = isResetAction ? `/api/reset` : `/api/action`;
      const operationId = `rmt_${Date.now()}_${generateCryptoRandomString(16)}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Moderator-Token': token,
          'X-Operation-Id': operationId,
        },
        body: JSON.stringify({
          action,
          key: streamerKey,
          value: extra.value,
          target: extra.target || (isResetAction ? 'session' : undefined),
          operationId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const rev = data.revision || 1;
        if (rev >= lastAppliedRevisionRef.current) {
          lastAppliedRevisionRef.current = rev;
          if (data.deaths !== undefined) setDeaths(data.deaths);
          if (data.sessionDeaths !== undefined) setSessionDeaths(data.sessionDeaths);
          if (data.allTimeDeaths !== undefined) setAllTimeDeaths(data.allTimeDeaths);
          if (data.bossKills !== undefined) setBossKills(data.bossKills);
        }

        // Show success toast ONLY upon authoritative server confirmation
        if (action === 'add' || action === 'addDeath') {
          setAnimDeath(true);
          setTimeout(() => setAnimDeath(false), 600);
          showToast('+1 Death confirmed!');
        } else if (action === 'undo' || action === 'undoDeath') {
          showToast('Death Undone!');
        } else if (action === 'addBossKill') {
          setAnimBoss(true);
          setTimeout(() => setAnimBoss(false), 900);
          showToast('+1 Boss Slain confirmed!');
        } else if (action === 'undoBossKill') {
          showToast('Boss Slain Undone!');
        } else if (action === 'setCount' || action === 'setDeath') {
          showToast(`Deaths set to ${data.deaths ?? extra.value}`);
        } else if (action === 'setBossCount' || action === 'setBossKill') {
          showToast(`Bosses set to ${data.bossKills ?? extra.value}`);
        } else if (action === 'reset' || action === 'resetSession') {
          showToast('Session Reset confirmed!');
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403) {
          showToast(`Forbidden: ${errData.error?.message || 'Action not permitted'}`);
        } else if (res.status === 401) {
          showToast('Token expired or revoked by streamer!');
          setErrorReason('revoked');
        } else {
          showToast(errData.error?.message || 'Action failed to reach cloud');
        }
        // Rollback local display on authorization or mutation error
        fetchState();
      }
    } catch (err) {
      console.warn('Remote action dispatch failed:', err);
      showToast('Network error: Action could not be synced');
      fetchState();
    }
  };

  const handleCustomSet = async (e) => {
    e.preventDefault();
    const val = parseInt(customVal, 10);
    if (isNaN(val) || val < 0) return;

    if (customPrompt === 'death') {
      await sendAction('setCount', { value: val });
    } else if (customPrompt === 'boss') {
      await sendAction('setBossCount', { value: val });
    }

    setCustomPrompt(null);
    setCustomVal('');
  };

  if (loading) {
    return (
      <div className="remote-page">
        <div className="remote-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div className="remote-rune-spinner" />
          <h2 style={{ color: '#c8a65d', marginTop: '1rem', fontSize: '1.2rem' }}>Verifying Remote Link...</h2>
        </div>
      </div>
    );
  }

  // Error States
  if (errorReason) {
    let title = 'Invalid Remote Link';
    let desc = 'This remote operator link is invalid or incomplete. Please request a new link from the streamer.';

    if (errorReason === 'missing') {
      title = 'No Access Code Found';
      desc = 'Open the remote link shared by the streamer, or paste your access code below.';
    } else if (errorReason === 'expired') {
      title = 'Remote Link Expired';
      desc = 'The expiration time set by the streamer for this session has ended.';
    } else if (errorReason === 'revoked') {
      title = 'Remote Access Revoked';
      desc = 'The streamer has ended or revoked access for this link.';
    }

    return (
      <div className="remote-page">
        <Embers count={6} />
        <div className="remote-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', maxWidth: '440px' }}>
          <div style={{ color: '#f87171', margin: '0 auto 1rem' }}>
            <AlertTriangle size={48} />
          </div>
          <h2 style={{ color: '#f87171', fontSize: '1.35rem', marginBottom: '0.6rem' }}>{title}</h2>
          <p style={{ color: '#a09985', fontSize: '0.88rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>{desc}</p>

          <form onSubmit={handleManualCodeSubmit} style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#c8a65d', marginBottom: '0.4rem', fontWeight: 600 }}>
              Enter Access Code or Paste Link:
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                className="auth-input"
                placeholder="rmt_... or paste full link"
                value={manualCodeInput}
                onChange={(e) => setManualCodeInput(e.target.value)}
                style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem', flex: 1 }}
              />
              <button
                type="submit"
                className="btn btn--primary"
                disabled={!manualCodeInput.trim()}
                style={{ padding: '0.55rem 0.9rem', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
              >
                Connect
              </button>
            </div>
          </form>

          <Link to="/" className="btn btn--secondary" style={{ display: 'inline-block', fontSize: '0.85rem' }}>
            Go to Death Counter Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="remote-page">
      <Embers count={8} />

      {/* Floating Toast Notification */}
      {toastMsg && (
        <div className="remote-toast">
          <Zap size={14} color="#4ade80" /> {toastMsg}
        </div>
      )}

      <div className="remote-card">
        {/* Header with Streamer Info */}
        <header className="remote-header">
          <div className="remote-streamer-badge">
            <span className="remote-pulse-dot" />
            <span>Controlling for: <strong>{tokenInfo?.streamerName || 'Streamer'}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {tokenInfo?.expiresAt && (
              <div className="remote-expiry-pill">
                <Clock size={11} />
                <span>Session active</span>
              </div>
            )}
            <button
              type="button"
              onClick={handleDisconnect}
              title="Disconnect & Switch Access Code"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(200, 166, 93, 0.25)',
                color: '#a09985',
                borderRadius: '12px',
                padding: '3px 8px',
                fontSize: '0.72rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <LogOut size={11} />
              <span>Disconnect</span>
            </button>
          </div>
        </header>

        {/* Live Scoreboard */}
        <div className="remote-scoreboard">
          {/* Deaths Box */}
          <div className={`remote-score-box remote-score-box--deaths ${animDeath ? 'pulse-anim' : ''}`}>
            <div className="remote-score-tag">
              <Skull size={13} /> DEATHS
            </div>
            <div className="remote-score-num" onClick={() => { setCustomPrompt('death'); setCustomVal(String(deaths)); }}>
              {deaths}
            </div>
            <div className="remote-score-sub">
              Session: {sessionDeaths} • Total: {allTimeDeaths}
            </div>
          </div>

          {/* Boss Kills Box */}
          <div className={`remote-score-box remote-score-box--boss ${animBoss ? 'pulse-anim' : ''}`}>
            <div className="remote-score-tag">
              <Trophy size={13} /> BOSS SLAIN
            </div>
            <div className="remote-score-num" onClick={() => { setCustomPrompt('boss'); setCustomVal(String(bossKills)); }}>
              {bossKills}
            </div>
            <div className="remote-score-sub">
              {bossKills === 1 ? '1 Boss Defeated' : `${bossKills} Bosses Defeated`}
            </div>
          </div>
        </div>

        {/* Big Tactile Action Buttons */}
        <div className="remote-actions">
          {/* Main +1 Death Button */}
          <button
            type="button"
            className="remote-btn remote-btn--death-add"
            onClick={() => sendAction('add')}
          >
            <Skull size={24} />
            <span>+1 DEATH</span>
          </button>

          {/* Undo Death Button */}
          <button
            type="button"
            className="remote-btn remote-btn--death-undo"
            onClick={() => sendAction('undo')}
          >
            <RotateCcw size={16} /> Undo Death
          </button>

          {/* Main +1 Boss Slain Button */}
          <button
            type="button"
            className="remote-btn remote-btn--boss-add"
            onClick={() => sendAction('addBossKill')}
          >
            <Trophy size={22} />
            <span>+1 BOSS SLAIN</span>
          </button>

          {/* Undo Boss Button */}
          <button
            type="button"
            className="remote-btn remote-btn--boss-undo"
            onClick={() => sendAction('undoBossKill')}
          >
            <RotateCcw size={16} /> Undo Boss
          </button>
        </div>

        {/* Quick Utility Tools */}
        <div className="remote-footer-tools">
          <button
            type="button"
            className="remote-tool-btn"
            onClick={() => { setCustomPrompt('death'); setCustomVal(String(deaths)); }}
          >
            <Edit3 size={13} /> Set Exact Deaths
          </button>

          <button
            type="button"
            className="remote-tool-btn"
            onClick={() => { setCustomPrompt('boss'); setCustomVal(String(bossKills)); }}
          >
            <Edit3 size={13} /> Set Exact Bosses
          </button>

          <button
            type="button"
            className="remote-tool-btn remote-tool-btn--reset"
            onClick={() => {
              if (confirm('Reset session deaths to 0 for the streamer?')) {
                sendAction('resetSession', { target: 'session' });
              }
            }}
          >
            <RotateCcw size={13} /> Reset Session
          </button>
        </div>

        <div className="remote-live-footer">
          <span>● Live OBS Sync Active</span>
          <span style={{ color: '#c8a65d' }}>{tokenInfo?.label || 'Friend Link'}</span>
        </div>
      </div>

      {/* Set Number Dialog */}
      {customPrompt && (
        <div className="auth-modal-overlay" onClick={() => setCustomPrompt(null)}>
          <div className="auth-modal-card" style={{ maxWidth: '340px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: '#c8a65d', marginBottom: '0.8rem', fontSize: '1.1rem' }}>
              Set {customPrompt === 'death' ? 'Death' : 'Boss Slain'} Count
            </h3>
            <form onSubmit={handleCustomSet}>
              <input
                type="number"
                min="0"
                autoFocus
                className="auth-input"
                value={customVal}
                onChange={(e) => setCustomVal(e.target.value)}
                style={{ fontSize: '1.4rem', textAlign: 'center', marginBottom: '1rem', fontWeight: 'bold' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="auth-submit-btn">
                  Update Count
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setCustomPrompt(null)}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
