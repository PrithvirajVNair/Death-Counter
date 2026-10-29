import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDeathCounter } from '../hooks/useDeathCounter';
import CounterControls from '../components/CounterControls';
import OverlayPreview from '../components/OverlayPreview';
import PresetSelector from '../components/PresetSelector';
import CustomizationPanel from '../components/CustomizationPanel';
import ToastContainer, { showToast } from '../components/Toast';
import { DEFAULT_PRESET_COLORS } from '../lib/defaults';
import '../styles/controller.css';

export default function Controller() {
  const counter = useDeathCounter();
  const [transparentPreview, setTransparentPreview] = useState(false);

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

  return (
    <div className="controller-page">
      {/* Header */}
      <header className="controller-header">
        <div className="controller-header__left">
          <h1 className="controller-header__title">Death Counter</h1>
          <p className="controller-header__subtitle">Souls Game Chronicle</p>
        </div>
        <div className="controller-header__right">
          <span className="controller-header__preset">
            {settings.preset.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </span>
          <span className="sync-indicator sync-indicator--ok">
            <span className="sync-indicator__dot" />
            Live OBS Sync Ready
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
