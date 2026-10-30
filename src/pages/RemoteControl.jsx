import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { validateRemoteToken } from '../lib/supabase';
import { Shield, Skull, Trophy, RotateCcw, Edit3, Clock, AlertTriangle, Check, ExternalLink, Zap } from 'lucide-react';
import Embers from '../components/Embers';
import '../styles/remote.css';

export default function RemoteControl() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [tokenInfo, setTokenInfo] = useState(null);
  const [errorReason, setErrorReason] = useState(null);

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
    if (!token) {
      setLoading(false);
      setErrorReason('missing');
      return;
    }

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

  // 2. Fetch & Poll streamer state
  const fetchState = useCallback(async () => {
    if (!streamerKey) return;
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
    fetchState();
    const interval = setInterval(fetchState, 1500);
    return () => clearInterval(interval);
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

  // Action Dispatcher
  const sendAction = async (action, extra = {}) => {
    if (!streamerKey) return;
    triggerHaptic([30]);

    if (action === 'add' || action === 'addDeath') {
      setDeaths((d) => d + 1);
      setSessionDeaths((s) => s + 1);
      setAllTimeDeaths((a) => a + 1);
      setAnimDeath(true);
      setTimeout(() => setAnimDeath(false), 600);
      showToast('+1 Death sent to streamer!');
    } else if (action === 'undo' || action === 'undoDeath') {
      setDeaths((d) => Math.max(0, d - 1));
      setSessionDeaths((s) => Math.max(0, s - 1));
      showToast('Death Undone!');
    } else if (action === 'addBossKill') {
      setBossKills((b) => b + 1);
      setAnimBoss(true);
      setTimeout(() => setAnimBoss(false), 900);
      showToast('+1 Boss Slain sent to streamer!');
    } else if (action === 'undoBossKill') {
      setBossKills((b) => Math.max(0, b - 1));
      showToast('Boss Slain Undone!');
    }

    try {
      await fetch(`/api/action?key=${encodeURIComponent(streamerKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          key: streamerKey,
          token,
          ...extra,
        }),
      });
    } catch {}
  };

  const handleCustomSet = async (e) => {
    e.preventDefault();
    const val = parseInt(customVal, 10);
    if (isNaN(val) || val < 0) return;

    if (customPrompt === 'death') {
      const diff = val - deaths;
      setDeaths(val);
      setSessionDeaths((s) => Math.max(0, s + diff));
      setAllTimeDeaths((a) => Math.max(0, a + Math.max(0, diff)));
      await sendAction('setCount', { target: 'death', value: val, deaths: val });
    } else if (customPrompt === 'boss') {
      setBossKills(val);
      await sendAction('setBossCount', { target: 'boss', value: val, bossKills: val });
    }

    setCustomPrompt(null);
    setCustomVal('');
    showToast('Score updated!');
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
            <span>Controlling for: <strong>{tokenInfo.streamerName}</strong></span>
          </div>
          {tokenInfo.expiresAt && (
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
                sendAction('reset', { target: 'session' });
              }
            }}
          >
            <RotateCcw size={13} /> Reset Session
          </button>
        </div>

        <div className="remote-live-footer">
          <span>● Live OBS Sync Active</span>
          <span style={{ color: '#c8a65d' }}>{tokenInfo.label}</span>
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
