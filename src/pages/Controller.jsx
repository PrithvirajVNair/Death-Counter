import React, { useState, useEffect, useCallback } from 'react';
import { useDeathCounter } from '../hooks/useDeathCounter';
import { useAuth } from '../context/AuthContext';
import AuthModal from '../components/AuthModal';
import ShareRemoteModal from '../components/ShareRemoteModal';
import RegenerateKeyModal from '../components/RegenerateKeyModal';
import CounterControls from '../components/CounterControls';
import OverlayPreview from '../components/OverlayPreview';
import PresetSelector from '../components/PresetSelector';
import CustomizationPanel from '../components/CustomizationPanel';
import Embers from '../components/Embers';
import ToastContainer, { showToast } from '../components/Toast';
import { DEFAULT_PRESET_COLORS } from '../lib/defaults';
import { loadCloudStateByKey, supabase } from '../lib/supabase';
import { Key, Copy, Check, LogOut, Users, Eye, EyeOff, RefreshCw } from 'lucide-react';
import '../styles/controller.css';
import '../styles/auth.css';

export default function Controller() {
  const counter = useDeathCounter();
  const { user, loading: authLoading, streamerKey, signOut, saveCloudState } = useAuth();
  const [copiedKey, setCopiedKey] = useState(false);
  const [showStreamerKey, setShowStreamerKey] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [regenModalOpen, setRegenModalOpen] = useState(false);

  const {
    deaths, sessionDeaths, allTimeDeaths, bossKills, settings, shortcuts, deathAnim, bossSlainAnim,
    addDeath, undoDeath, resetDeaths, resetSession,
    addBossKill, undoBossKill, resetBossKills,
    setDeathCount, setBossKillCount,
    updateSettings, resetAppearance, _updateShortcuts,
    currentBoss, bosses,
  } = counter;

  const bossAttempts = currentBoss && bosses ? (bosses[currentBoss] || 0) : 0;



  // ─── Preset & Color Selection ───
  const handlePresetSelect = useCallback((presetId) => {
    const presetColors = settings.presetColors || DEFAULT_PRESET_COLORS;
    const colorForPreset = presetColors[presetId] || DEFAULT_PRESET_COLORS[presetId] || '#C8A65D';
    updateSettings({
      preset: presetId,
      goldColor: colorForPreset,
      presetColors: {
        ...presetColors,
        [presetId]: colorForPreset,
      },
    });
  }, [settings.presetColors, updateSettings]);

  const handleColorChange = useCallback((newColor) => {
    const currentPreset = settings.preset || 'classic-rune';
    const presetColors = settings.presetColors || DEFAULT_PRESET_COLORS;
    updateSettings({
      goldColor: newColor,
      presetColors: {
        ...presetColors,
        [currentPreset]: newColor,
      },
    });
  }, [settings.preset, settings.presetColors, updateSettings]);

  const handleResetColor = useCallback(() => {
    const currentPreset = settings.preset || 'classic-rune';
    const defaultColor = DEFAULT_PRESET_COLORS[currentPreset] || '#C8A65D';
    handleColorChange(defaultColor);
    showToast(`Reset ${currentPreset.replace(/-/g, ' ')} color to default`);
  }, [settings.preset, handleColorChange]);

  const hasLoadedCloudRef = React.useRef(false);
  const lastCloudStateRef = React.useRef({
    deaths: null,
    sessionDeaths: null,
    allTimeDeaths: null,
    bossKills: null,
    settingsHash: null,
    shortcutsHash: null,
    bossesHash: null,
    currentBoss: null,
    revision: null,
  });

  // 1. Bi-directional cloud sync: Listen for remote friend changes & pull on tab focus
  useEffect(() => {
    if (!user || !streamerKey || !supabase) return;

    const syncFromCloud = async () => {
      try {
        const cloudState = await loadCloudStateByKey(streamerKey);
        if (cloudState) {
          const prev = lastCloudStateRef.current;
          const isDifferent =
            prev.deaths !== cloudState.deaths ||
            prev.sessionDeaths !== cloudState.sessionDeaths ||
            prev.bossKills !== cloudState.bossKills ||
            (cloudState.revision && prev.revision && cloudState.revision > prev.revision);

          if (isDifferent || !hasLoadedCloudRef.current) {
            lastCloudStateRef.current = {
              deaths: cloudState.deaths,
              sessionDeaths: cloudState.sessionDeaths,
              allTimeDeaths: cloudState.allTimeDeaths,
              bossKills: cloudState.bossKills,
              settingsHash: JSON.stringify(cloudState.settings || {}),
              shortcutsHash: JSON.stringify(cloudState.shortcuts || {}),
              bossesHash: JSON.stringify(cloudState.bosses || {}),
              currentBoss: cloudState.currentBoss || '',
              revision: cloudState.revision || 1,
            };
            counter.loadFullState(cloudState);
          }
        } else if (!hasLoadedCloudRef.current) {
          // New user with no records: start clean at 0
          lastCloudStateRef.current = {
            deaths: 0,
            sessionDeaths: 0,
            allTimeDeaths: 0,
            bossKills: 0,
            settingsHash: JSON.stringify(settings || {}),
            shortcutsHash: JSON.stringify(shortcuts || {}),
            bossesHash: '{}',
            currentBoss: '',
            revision: 1,
          };
          counter.loadFullState({
            deaths: 0,
            sessionDeaths: 0,
            allTimeDeaths: 0,
            bossKills: 0,
            settings,
            shortcuts,
            bosses: {},
            currentBoss: '',
            revision: 1,
            lastUpdated: Date.now(),
          });
        }
        hasLoadedCloudRef.current = true;
      } catch (err) {
        console.warn('Could not sync controller from cloud:', err);
      }
    };

    // Initial sync
    syncFromCloud();

    // Pull whenever streamer focuses the tab (e.g. after friend makes a change)
    const handleFocus = () => syncFromCloud();
    window.addEventListener('focus', handleFocus);

    // Supabase Realtime: Instant push when a friend taps the remote control
    const channel = supabase
      .channel(`streamer_sync_${streamerKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'streamer_states',
          filter: `streamer_key=eq.${streamerKey}`,
        },
        (payload) => {
          const row = payload.new;
          if (row) {
            lastCloudStateRef.current = {
              deaths: row.deaths,
              sessionDeaths: row.session_deaths,
              allTimeDeaths: row.all_time_deaths,
              bossKills: row.boss_kills,
              settingsHash: JSON.stringify(row.settings || {}),
              shortcutsHash: JSON.stringify(row.shortcuts || {}),
              bossesHash: JSON.stringify(row.bosses || {}),
              currentBoss: row.current_boss || '',
              revision: row.revision || 1,
            };
            counter.loadFullState({
              deaths: row.deaths,
              sessionDeaths: row.session_deaths,
              allTimeDeaths: row.all_time_deaths,
              bossKills: row.boss_kills,
              settings: row.settings || {},
              shortcuts: row.shortcuts || {},
              bosses: row.bosses || {},
              currentBoss: row.current_boss || '',
              revision: row.revision || 1,
              lastUpdated: row.last_updated,
            });
          }
        }
      )
      .subscribe();

    // Polling safety net every 2 seconds
    const interval = setInterval(syncFromCloud, 2000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
      channel.unsubscribe();
    };
  }, [user, streamerKey, counter, settings, shortcuts]);

  // 2. Sync to Supabase ONLY when streamer makes local changes on the Controller
  useEffect(() => {
    if (!user || !streamerKey || !hasLoadedCloudRef.current) return;

    const prev = lastCloudStateRef.current;
    const settingsStr = JSON.stringify(settings || {});
    const shortcutsStr = JSON.stringify(shortcuts || {});
    const bossesStr = JSON.stringify(bosses || {});

    // Don't save if the state simply matches what was loaded/pushed from the cloud
    if (
      prev.deaths === deaths &&
      prev.sessionDeaths === sessionDeaths &&
      prev.allTimeDeaths === allTimeDeaths &&
      prev.bossKills === bossKills &&
      prev.settingsHash === settingsStr &&
      prev.shortcutsHash === shortcutsStr &&
      prev.bossesHash === bossesStr &&
      prev.currentBoss === currentBoss
    ) {
      return;
    }

    lastCloudStateRef.current = {
      deaths,
      sessionDeaths,
      allTimeDeaths,
      bossKills,
      settingsHash: settingsStr,
      shortcutsHash: shortcutsStr,
      bossesHash: bossesStr,
      currentBoss,
      revision: (counter.revision || 1) + 1,
    };

    saveCloudState({
      deaths,
      sessionDeaths,
      allTimeDeaths,
      bossKills,
      settings,
      shortcuts,
      bosses,
      currentBoss,
      revision: (counter.revision || 1) + 1,
      lastUpdated: Date.now(),
    });
  }, [deaths, sessionDeaths, allTimeDeaths, bossKills, settings, shortcuts, bosses, currentBoss, user, streamerKey, counter.revision, saveCloudState]);

  // Auth Gate: Require sign in to use counter
  if (authLoading) {
    return (
      <div className="controller-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--color-gold)', fontFamily: 'Georgia, serif', fontSize: '18px', letterSpacing: '1px' }}>
          Loading Souls Chronicle...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="controller-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Embers count={12} />
        <AuthModal isOpen={true} />
      </div>
    );
  }

  return (
    <div className="controller-page">
      {/* Header */}
      <header className="controller-header">
        <div className="controller-header__left">
          <h1 className="controller-header__title">Death Counter</h1>
          <p className="controller-header__subtitle">Souls Game Chronicle</p>
        </div>
        <div className="controller-header__right">
          {user && (
            <div className="user-profile-bar">
              {user.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="Avatar" className="user-avatar" />
              ) : (
                <div className="user-avatar-placeholder">
                  {(user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase()}
                </div>
              )}
              <span style={{ fontWeight: 600, color: 'var(--color-gold)' }}>
                {user.user_metadata?.full_name || user.email?.split('@')[0]}
              </span>
              <div className="user-streamer-key" title="Your unique Streamer Key">
                <Key size={12} color="#C8A65D" />
                <span style={{ fontFamily: 'monospace', letterSpacing: showStreamerKey ? 'normal' : '1.5px' }}>
                  {showStreamerKey ? streamerKey : '••••••••••••'}
                </span>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#C8A65D', cursor: 'pointer', padding: '0 2px', display: 'inline-flex', alignItems: 'center' }}
                  onClick={() => setShowStreamerKey((prev) => !prev)}
                  title={showStreamerKey ? 'Hide Streamer Key' : 'Reveal Streamer Key'}
                  aria-label={showStreamerKey ? 'Hide Streamer Key' : 'Reveal Streamer Key'}
                >
                  {showStreamerKey ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#C8A65D', cursor: 'pointer', padding: '0 2px', display: 'inline-flex', alignItems: 'center' }}
                  onClick={() => {
                    navigator.clipboard.writeText(streamerKey);
                    setCopiedKey(true);
                    showToast('Copied Streamer Key to clipboard!');
                    setTimeout(() => setCopiedKey(false), 2000);
                  }}
                  title="Copy Key"
                >
                  {copiedKey ? <Check size={12} color="#4ade80" /> : <Copy size={12} />}
                </button>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#C8A65D', cursor: 'pointer', padding: '0 2px', display: 'inline-flex', alignItems: 'center' }}
                  onClick={() => setRegenModalOpen(true)}
                  title="Regenerate Streamer Key"
                  aria-label="Regenerate Streamer Key"
                >
                  <RefreshCw size={11} />
                </button>
              </div>
              <button
                type="button"
                id="friend-access-btn"
                className="btn-friend-access"
                onClick={() => setShareModalOpen(true)}
                title="Create a remote link for a friend to update your counter live"
              >
                <Users size={13} color="#C8A65D" />
                <span>Friend Access</span>
              </button>
              <button
                type="button"
                className="btn-signout"
                onClick={signOut}
                title="Sign Out"
              >
                <LogOut size={12} />
              </button>
            </div>
          )}
          <span className="controller-header__preset">
            {settings.preset.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </span>
          <span className="sync-indicator sync-indicator--ok">
            <span className="sync-indicator__dot" />
            Cloud Synced
          </span>
        </div>
      </header>

      {/* Floating embers */}
      <Embers count={8} />

      <div className="controller-layout">
        {/* Main Column */}
        <div className="controller-main">
          <CounterControls
            deaths={deaths}
            sessionDeaths={sessionDeaths}
            allTimeDeaths={allTimeDeaths}
            onAdd={addDeath}
            onUndo={undoDeath}
            onReset={resetDeaths}
            bossKills={bossKills}
            onAddBossKill={addBossKill}
            onUndoBossKill={undoBossKill}
            onResetBossKills={resetBossKills}
            onSetDeathCount={setDeathCount}
            onSetBossKillCount={setBossKillCount}
            sessionCountVisible={settings.sessionCountVisible}
          />

          <OverlayPreview
            deaths={deaths}
            bossKills={bossKills}
            settings={settings}
            deathAnim={deathAnim}
            bossSlainAnim={bossSlainAnim}
            sessionDeaths={sessionDeaths}
            currentBoss={currentBoss}
            bossAttempts={bossAttempts}
            onUpdateSettings={updateSettings}
            streamerKey={streamerKey}
          />

          <PresetSelector
            currentPreset={settings.preset}
            onSelect={handlePresetSelect}
            currentColor={settings.goldColor || '#C8A65D'}
            presetColors={settings.presetColors || DEFAULT_PRESET_COLORS}
            onColorChange={handleColorChange}
            onResetColor={handleResetColor}
          />
        </div>

        {/* Sidebar */}
        <aside className="controller-sidebar">
          <CustomizationPanel
            settings={settings}
            bossKills={bossKills}
            onUpdateSettings={updateSettings}
            onResetAppearance={resetAppearance}
            onResetSession={resetSession}
          />
        </aside>
      </div>

      <footer style={{
        textAlign: 'center',
        padding: '24px 16px',
        fontSize: '11px',
        color: 'var(--text-dim, #5C5647)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        marginTop: '32px',
      }}>
        <span>Souls Game Death Counter</span>
        <span>•</span>
        <a href="/privacy" style={{ color: 'var(--gold, #C8A65D)', textDecoration: 'underline' }}>Privacy Policy</a>
        <span>•</span>
        <a href="/terms" style={{ color: 'var(--gold, #C8A65D)', textDecoration: 'underline' }}>Terms of Service</a>
        <span>•</span>
        <a
          href="https://github.com/PrithvirajVNair/Death-Counter"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--text-secondary, #9A927E)', textDecoration: 'underline' }}
        >
          GitHub
        </a>
      </footer>

      <ToastContainer />
      <ShareRemoteModal isOpen={shareModalOpen} onClose={() => setShareModalOpen(false)} />
      <RegenerateKeyModal isOpen={regenModalOpen} onClose={() => setRegenModalOpen(false)} />
    </div>
  );
}
