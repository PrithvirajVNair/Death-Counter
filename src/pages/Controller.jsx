import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDeathCounter } from '../hooks/useDeathCounter';
import { useAuth } from '../context/AuthContext';
import AuthModal from '../components/AuthModal';
import CounterControls from '../components/CounterControls';
import OverlayPreview from '../components/OverlayPreview';
import PresetSelector from '../components/PresetSelector';
import CustomizationPanel from '../components/CustomizationPanel';
import ToastContainer, { showToast } from '../components/Toast';
import { DEFAULT_PRESET_COLORS } from '../lib/defaults';
import { Key, Copy, Check, LogOut, Radio } from 'lucide-react';
import '../styles/controller.css';
import '../styles/auth.css';

export default function Controller() {
  const counter = useDeathCounter();
  const { user, loading: authLoading, streamerKey, signOut, saveCloudState } = useAuth();
  const [transparentPreview, setTransparentPreview] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedOverlay, setCopiedOverlay] = useState(false);

  const {
    deaths, sessionDeaths, allTimeDeaths, bossKills, settings, shortcuts, deathAnim, bossSlainAnim,
    addDeath, undoDeath, resetDeaths, resetSession,
    addBossKill, undoBossKill, resetBossKills,
    setDeathCount, setBossKillCount,
    updateSettings, resetAppearance, updateShortcuts,
  } = counter;

  const lastShortcutTimeRef = React.useRef(0);

  // ─── Keyboard shortcuts matcher ───
  const isShortcutMatch = useCallback((e, shortcutStr) => {
    if (!shortcutStr) return false;
    const s = shortcutStr.trim();
    if (!s || s === 'Not Configured' || s === 'None' || s === 'Disabled' || s === 'Unbound') return false;

    const parts = s.split('+').map((p) => p.trim());
    const needsCtrl = parts.some((p) => /^ctrl$/i.test(p) || /^control$/i.test(p));
    const needsAlt = parts.some((p) => /^alt$/i.test(p));
    const needsShift = parts.some((p) => /^shift$/i.test(p));
    const needsMeta = parts.some((p) => /^meta$/i.test(p) || /^cmd$/i.test(p) || /^win$/i.test(p));
    const baseKey = parts.find((p) => !/^(ctrl|control|alt|shift|meta|cmd|win)$/i.test(p));

    if (!baseKey) return false;

    if (Boolean(e.ctrlKey) !== needsCtrl) return false;
    if (Boolean(e.altKey) !== needsAlt) return false;
    if (Boolean(e.shiftKey) !== needsShift) return false;
    if (Boolean(e.metaKey) !== needsMeta) return false;

    const eventKey = (e.key || '').toUpperCase();
    const eventCode = (e.code || '').toUpperCase();
    const targetKey = baseKey.toUpperCase();

    if (eventKey === targetKey || eventCode === targetKey) return true;
    if (eventCode === `KEY${targetKey}`) return true;
    if (eventCode === `DIGIT${targetKey}`) return true;
    if (eventCode === `NUMPAD${targetKey}`) return true;
    if (targetKey === '+' || targetKey === 'NUMPADADD') return eventKey === '+' || eventCode === 'NUMPADADD';
    if (targetKey === '-' || targetKey === 'NUMPADSUBTRACT') return eventKey === '-' || eventCode === 'NUMPADSUBTRACT';
    if (targetKey.startsWith('NUMPAD') && eventCode === targetKey) return true;

    return false;
  }, []);

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    if (!shortcuts.enabled) return;

    const handler = (e) => {
      // Ignore when typing in inputs or on OS key repeat
      if (e.repeat) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.contentEditable === 'true') return;

      const now = Date.now();
      if (now - lastShortcutTimeRef.current < 350) return;

      if (isShortcutMatch(e, shortcuts.addDeath)) {
        e.preventDefault();
        lastShortcutTimeRef.current = now;
        addDeath();
      } else if (isShortcutMatch(e, shortcuts.undoDeath)) {
        e.preventDefault();
        lastShortcutTimeRef.current = now;
        undoDeath();
      } else if (isShortcutMatch(e, shortcuts.addBossKill)) {
        e.preventDefault();
        lastShortcutTimeRef.current = now;
        addBossKill();
      } else if (isShortcutMatch(e, shortcuts.undoBossKill)) {
        e.preventDefault();
        lastShortcutTimeRef.current = now;
        undoBossKill();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts, isShortcutMatch, addDeath, undoDeath, addBossKill, undoBossKill]);

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

  // Sync state to Supabase cloud when stats update
  useEffect(() => {
    if (user && streamerKey) {
      saveCloudState({
        deaths,
        sessionDeaths,
        allTimeDeaths,
        bossKills,
        settings,
        shortcuts,
        lastUpdated: Date.now(),
      });
    }
  }, [deaths, sessionDeaths, allTimeDeaths, bossKills, settings, shortcuts, user, streamerKey, saveCloudState]);

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
                <span>{streamerKey}</span>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#C8A65D', cursor: 'pointer', padding: '0 2px' }}
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
              </div>
              <button
                type="button"
                className="btn btn--sm btn--secondary"
                style={{ fontSize: '11px', padding: '3px 8px' }}
                onClick={() => {
                  const overlayUrl = `${window.location.origin}/overlay?key=${encodeURIComponent(streamerKey)}`;
                  navigator.clipboard.writeText(overlayUrl);
                  setCopiedOverlay(true);
                  showToast('Copied Private OBS Overlay URL!');
                  setTimeout(() => setCopiedOverlay(false), 2000);
                }}
              >
                {copiedOverlay ? '✓ URL Copied' : 'Copy OBS Link'}
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
            preset={settings.preset}
            goldColor={settings.goldColor}
            streamerKey={streamerKey}
          />

          <OverlayPreview
            deaths={deaths}
            bossKills={bossKills}
            settings={settings}
            deathAnim={deathAnim}
            bossSlainAnim={bossSlainAnim}
            sessionDeaths={sessionDeaths}
            transparentBg={transparentPreview}
            onToggleTransparent={setTransparentPreview}
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
            shortcuts={shortcuts}
            bossKills={bossKills}
            onUpdateSettings={updateSettings}
            onResetAppearance={resetAppearance}
            onUpdateShortcuts={updateShortcuts}
            onResetSession={resetSession}
          />
        </aside>
      </div>

      {/* Keyboard hint */}
      {shortcuts.enabled && (
        <div className="keyboard-hint">
          {shortcuts.addDeath && shortcuts.addDeath !== 'Not Configured' && (
            <>
              <span className="keyboard-hint__key">{shortcuts.addDeath}</span> +1 Death
            </>
          )}
          {shortcuts.undoDeath && shortcuts.undoDeath !== 'Not Configured' && (
            <>
              <span className="keyboard-hint__separator">|</span>
              <span className="keyboard-hint__key">{shortcuts.undoDeath}</span> Undo
            </>
          )}
          {shortcuts.addBossKill && shortcuts.addBossKill !== 'Not Configured' && (
            <>
              <span className="keyboard-hint__separator">|</span>
              <span className="keyboard-hint__key">{shortcuts.addBossKill}</span> +1 Boss Slain
            </>
          )}
          {shortcuts.undoBossKill && shortcuts.undoBossKill !== 'Not Configured' && (
            <>
              <span className="keyboard-hint__separator">|</span>
              <span className="keyboard-hint__key">{shortcuts.undoBossKill}</span> Undo Boss
            </>
          )}
        </div>
      )}

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
    </div>
  );
}

function Embers({ count = 8 }) {
  const positions = useMemo(() =>
    Array.from({ length: count }, () => ({
      left: `${10 + Math.random() * 80}%`,
      animationDelay: `${Math.random() * 6}s`,
      animationDuration: `${4 + Math.random() * 4}s`,
    })),
    [count]
  );

  return (
    <div className="embers" aria-hidden="true">
      {positions.map((style, i) => (
        <div key={i} className="ember" style={style} />
      ))}
    </div>
  );
}
