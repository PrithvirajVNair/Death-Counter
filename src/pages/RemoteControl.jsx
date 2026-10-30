import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { validateRemoteToken, supabase } from '../lib/supabase';
import { broadcastUpdate } from '../lib/sync';
import { Skull, Trophy, RotateCcw, Edit3, Clock, AlertTriangle, Zap } from 'lucide-react';
import Embers from '../components/Embers';
import '../styles/remote.css';

export default function RemoteControl() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

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

  // 1. Validate token
  useEffect(() => {
    if (!token) return;

    validateRemoteToken(token).then((result) => {
      setLoading(false);
      if (result.valid) {
        setTokenInfo(result);
      } else {
        setErrorReason(result.reason || 'invalid');
      }
    });
  }, [token]);

  const streamerKey = tokenInfo?.streamerKey;
  const lastActionTimeRef = useRef(0);

  // 2. Fetch & Poll streamer state directly from Supabase + API fallback
  const fetchState = useCallback(async () => {
    if (!streamerKey) return;
    // Don't let polling overwrite freshly tapped actions
    if (Date.now() - lastActionTimeRef.current < 2500) return;

    // 1. Direct Supabase check
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('streamer_states')
          .select('deaths, session_deaths, all_time_deaths, boss_kills')
          .eq('streamer_key', streamerKey)
          .maybeSingle();

        if (!error && data) {
          if (data.deaths !== undefined) setDeaths(data.deaths);
          if (data.session_deaths !== undefined) setSessionDeaths(data.session_deaths);
          if (data.all_time_deaths !== undefined) setAllTimeDeaths(data.all_time_deaths);
          if (data.boss_kills !== undefined) setBossKills(data.boss_kills);
          return;
        }
      } catch {}
    }

    // 2. Fallback to API
    try {
      const res = await fetch(`/api/state?key=${encodeURIComponent(streamerKey)}&_t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.deaths !== undefined) setDeaths(data.deaths);
        if (data.sessionDeaths !== undefined) setSessionDeaths(data.sessionDeaths);
        if (data.allTimeDeaths !== undefined) setAllTimeDeaths(data.allTimeDeaths);
        if (data.bossKills !== undefined) setBossKills(data.bossKills);
      }
    } catch {}
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

  // Action Dispatcher: updates local state synchronously and dispatches to backend API with token
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
      setAnimDeath(true);
      setTimeout(() => setAnimDeath(false), 600);
      showToast('+1 Death sent to streamer!');
    } else if (action === 'undo' || action === 'undoDeath') {
      nextDeaths = Math.max(0, deaths - 1);
      nextSession = Math.max(0, sessionDeaths - 1);
      setDeaths(nextDeaths);
      setSessionDeaths(nextSession);
      showToast('Death Undone!');
    } else if (action === 'addBossKill') {
      nextBossKills = bossKills + 1;
      setBossKills(nextBossKills);
      setAnimBoss(true);
      setTimeout(() => setAnimBoss(false), 900);
      showToast('+1 Boss Slain sent to streamer!');
    } else if (action === 'undoBossKill') {
      nextBossKills = Math.max(0, bossKills - 1);
      setBossKills(nextBossKills);
      showToast('Boss Slain Undone!');
    } else if (action === 'setCount' || action === 'setDeath') {
      const val = Math.max(0, parseInt(extra.value !== undefined ? extra.value : extra.deaths, 10) || 0);
      const diff = val - deaths;
      nextDeaths = val;
      nextSession = Math.max(0, sessionDeaths + diff);
      nextAllTime = Math.max(0, allTimeDeaths + Math.max(0, diff));
      setDeaths(nextDeaths);
      setSessionDeaths(nextSession);
      setAllTimeDeaths(nextAllTime);
      showToast(`Deaths set to ${val}`);
    } else if (action === 'setBossCount' || action === 'setBossKill') {
      const val = Math.max(0, parseInt(extra.value !== undefined ? extra.value : extra.bossKills, 10) || 0);
      nextBossKills = val;
      setBossKills(nextBossKills);
      showToast(`Bosses set to ${val}`);
    } else if (action === 'reset' || action === 'resetSession') {
      nextDeaths = 0;
      nextSession = 0;
      setDeaths(0);
      setSessionDeaths(0);
      showToast('Session Reset!');
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

    // 2. Dispatch to API with token
    try {
      const isResetAction = action === 'reset' || action === 'resetSession' || action === 'resetAll';
      const endpoint = isResetAction ? `/api/reset` : `/api/action`;
      const randSuffix = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
        : Math.random().toString(36).slice(2, 12);
      const operationId = `rmt_${Date.now()}_${randSuffix}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Moderator-Token': token,
        },
        body: JSON.stringify({
          action,
          key: streamerKey,
          token,
          value: extra.value,
          target: extra.target || (isResetAction ? 'session' : undefined),
          deaths: nextDeaths,
          sessionDeaths: nextSession,
          allTimeDeaths: nextAllTime,
          bossKills: nextBossKills,
          operationId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.deaths !== undefined) setDeaths(data.deaths);
        if (data.sessionDeaths !== undefined) setSessionDeaths(data.sessionDeaths);
        if (data.allTimeDeaths !== undefined) setAllTimeDeaths(data.allTimeDeaths);
        if (data.bossKills !== undefined) setBossKills(data.bossKills);
      } else {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403) {
          showToast(`Forbidden: ${errData.error?.message || 'Action not permitted'}`);
        } else if (res.status === 401) {
          showToast('Token expired or revoked by streamer!');
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

    if (errorReason === 'expired') {
      title = 'Remote Link Expired';
      desc = 'The expiration time set by the streamer for this session has ended.';
    } else if (errorReason === 'revoked') {
      title = 'Remote Access Revoked';
      desc = 'The streamer has ended or revoked access for this link.';
    }

    return (
      <div className="remote-page">
        <Embers count={6} />
        <div className="remote-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <div style={{ color: '#f87171', margin: '0 auto 1rem' }}>
            <AlertTriangle size={48} />
          </div>
          <h2 style={{ color: '#f87171', fontSize: '1.35rem', marginBottom: '0.6rem' }}>{title}</h2>
          <p style={{ color: '#a09985', fontSize: '0.88rem', lineHeight: '1.5', marginBottom: '1.8rem' }}>{desc}</p>
          <Link to="/" className="btn btn--primary" style={{ display: 'inline-block', fontSize: '0.85rem' }}>
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
          {tokenInfo?.expiresAt && (
            <div className="remote-expiry-pill">
              <Clock size={11} />
              <span>Session active</span>
            </div>
          )}
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
