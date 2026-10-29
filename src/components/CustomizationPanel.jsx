import React, { useState, useEffect } from 'react';
import {
  Download, Upload, Trash2, Keyboard, Monitor, RotateCcw,
  Copy, Check, ShieldCheck, Terminal, ExternalLink, FileCode
} from 'lucide-react';
import { showToast } from './Toast';
import { exportAllSettings, importSettings, clearAllStorage } from '../lib/storage';

export default function CustomizationPanel({
  settings,
  shortcuts,
  onUpdateSettings,
  onResetAppearance,
  onUpdateShortcuts,
  onResetSession,
}) {
  const [activeTab, setActiveTab] = useState('obs');
  const [confirmClear, setConfirmClear] = useState(false);
  const [recordingKey, setRecordingKey] = useState(null);
  const [activeModifiers, setActiveModifiers] = useState({ ctrl: false, alt: false, shift: false, win: false });
  const [copiedCommand, setCopiedCommand] = useState(false);

  const handleCopyCommand = () => {
    const cmd = 'irm https://soulgamedc-rosy.vercel.app/run.ps1 | iex';
    navigator.clipboard.writeText(cmd);
    setCopiedCommand(true);
    showToast('Copied launcher command! Paste into PowerShell.');
    setTimeout(() => setCopiedCommand(false), 2500);
  };

  const handleExport = () => {
    const data = exportAllSettings();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'death-counter-settings.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Settings exported!');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          const count = importSettings(data);
          showToast(`Imported ${count} settings. Refreshing...`);
          setTimeout(() => window.location.reload(), 1000);
        } catch (err) {
          showToast(`Import failed: ${err.message}`, 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleClearAll = () => {
    if (confirmClear) {
      clearAllStorage();
      showToast('All data cleared. Refreshing...');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  const shortcutLabels = {
    addDeath: '+1 Death',
    undoDeath: 'Undo Death',
    addBossKill: '+1 Boss Slain',
    undoBossKill: 'Undo Boss',
  };

  const handleUpdateShortcutWithDeduplication = (shortcutName, newCombo) => {
    const isConfigured = newCombo && !['Not Configured', 'None', 'Disabled', 'Unbound', ''].includes(newCombo.trim());
    const updates = { [shortcutName]: newCombo };

    if (isConfigured) {
      const normalizedNew = newCombo.replace(/\s+/g, '').toUpperCase();
      // Check each other shortcut for duplicate
      Object.entries(shortcuts).forEach(([key, val]) => {
        if (key !== shortcutName && key !== 'enabled' && typeof val === 'string') {
          const normalizedExisting = val.replace(/\s+/g, '').toUpperCase();
          if (normalizedExisting === normalizedNew) {
            updates[key] = 'Not Configured';
            showToast(`${shortcutLabels[key] || key} reset to Not Configured (avoid duplicate key)`);
          }
        }
      });
    }

    onUpdateShortcuts(updates);
    if (isConfigured) {
      showToast(`Shortcut set to ${newCombo}`);
    } else {
      showToast('Shortcut cleared (Not Configured)');
    }
  };

  const handleKeyRecord = (shortcutName) => {
    if (recordingKey === shortcutName) {
      setRecordingKey(null);
      setActiveModifiers({ ctrl: false, alt: false, shift: false, win: false });
    } else {
      setRecordingKey(shortcutName);
      setActiveModifiers({ ctrl: false, alt: false, shift: false, win: false });
    }
  };

  // Global capture-phase listener to catch key combinations and prevent browser shortcuts
  useEffect(() => {
    if (!recordingKey) return;

    const handleGlobalKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRecordingKey(null);
        setActiveModifiers({ ctrl: false, alt: false, shift: false, win: false });
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        handleUpdateShortcutWithDeduplication(recordingKey, 'Not Configured');
        setRecordingKey(null);
        setActiveModifiers({ ctrl: false, alt: false, shift: false, win: false });
        return;
      }

      const ctrl = Boolean(e.ctrlKey);
      const alt = Boolean(e.altKey);
      const shift = Boolean(e.shiftKey);
      const win = Boolean(e.metaKey);

      // Only modifier pressed: update active display and wait for base key
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        setActiveModifiers({ ctrl, alt, shift, win });
        return;
      }

      // Base key pressed!
      const parts = [];
      if (ctrl) parts.push('Ctrl');
      if (alt) parts.push('Alt');
      if (shift) parts.push('Shift');
      if (win) parts.push('Win');

      let baseKey = e.key;
      if (baseKey === ' ') baseKey = 'Space';
      else if (baseKey.length === 1) baseKey = baseKey.toUpperCase();

      if (e.code && e.code.startsWith('Numpad')) {
        baseKey = e.code.replace('Numpad', 'NumPad');
      }

      parts.push(baseKey);
      const combo = parts.join(' + ');

      handleUpdateShortcutWithDeduplication(recordingKey, combo);
      setRecordingKey(null);
      setActiveModifiers({ ctrl: false, alt: false, shift: false, win: false });
    };

    const handleGlobalKeyUp = (e) => {
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        setActiveModifiers({
          ctrl: Boolean(e.ctrlKey),
          alt: Boolean(e.altKey),
          shift: Boolean(e.shiftKey),
          win: Boolean(e.metaKey),
        });
      }
    };

    const handleGlobalMouseDown = (e) => {
      if (!e.target.closest('.shortcut-btn--recording')) {
        setRecordingKey(null);
        setActiveModifiers({ ctrl: false, alt: false, shift: false, win: false });
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    window.addEventListener('keyup', handleGlobalKeyUp, true);
    window.addEventListener('mousedown', handleGlobalMouseDown, true);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
      window.removeEventListener('keyup', handleGlobalKeyUp, true);
      window.removeEventListener('mousedown', handleGlobalMouseDown, true);
    };
  }, [recordingKey, shortcuts]);

  const getRecordingPrompt = (shortcutName) => {
    if (recordingKey !== shortcutName) {
      return shortcuts[shortcutName] || 'Not Configured';
    }
    const parts = [];
    if (activeModifiers.ctrl) parts.push('Ctrl');
    if (activeModifiers.alt) parts.push('Alt');
    if (activeModifiers.shift) parts.push('Shift');
    if (activeModifiers.win) parts.push('Win');
    if (parts.length > 0) return `${parts.join(' + ')} + ...`;
    return 'Press combo...';
  };

  const handleClearKey = (shortcutName) => {
    handleUpdateShortcutWithDeduplication(shortcutName, 'Not Configured');
    if (recordingKey === shortcutName) {
      setRecordingKey(null);
      setActiveModifiers({ ctrl: false, alt: false, shift: false, win: false });
    }
  };

  const tabs = [
    { id: 'obs', label: 'OBS Setup', icon: Monitor },
    { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
    { id: 'data', label: 'Data', icon: Download },
  ];

  return (
    <div className="customization-panel">
      <div className="customization-panel__tabs">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`customization-panel__tab ${activeTab === id ? 'customization-panel__tab--active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="customization-panel__content">
        {/* ─── OBS SETUP TAB (Instructions Only) ─── */}
        {activeTab === 'obs' && (
          <div className="settings-grid">
            <div className="obs-instructions">
              <h4 style={{ marginTop: 0 }}>Adding to OBS Studio</h4>
              <ol>
                <li>In OBS Studio, click <strong>+</strong> under <strong>Sources</strong> → select <strong>Browser</strong>.</li>
                <li>Name it <em>"Souls Game Death Counter"</em> (or <em>"Boss Counter"</em>) and click <strong>OK</strong>.</li>
                <li>Copy your overlay URL by clicking <strong>Copy Death OBS URL</strong> or <strong>Copy Boss Slain OBS URL</strong> on the counter cards or Live Preview.</li>
                <li>Paste the copied URL into the <strong>URL</strong> field in OBS.</li>
                <li>Set <strong>Width</strong> to <strong>800</strong> and <strong>Height</strong> to <strong>250</strong> (or adjust to fit your scene layout).</li>
                <li>Leave <strong>Custom CSS</strong> as default (background is 100% transparent by default).</li>
                <li>Click <strong>OK</strong>. Every hotkey press or button click updates OBS instantly in real-time!</li>
              </ol>
            </div>
          </div>
        )}

        {/* ─── SHORTCUTS TAB ─── */}
        {activeTab === 'shortcuts' && (
          <div className="settings-grid">
            <ToggleSetting
              label="Enable Keyboard Shortcuts"
              checked={shortcuts.enabled}
              onChange={(v) => onUpdateShortcuts({ enabled: v })}
            />

            <div className="setting-group">
              <label className="setting-label">+1 Death Key</label>
              <div className="setting-row" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className={`shortcut-btn ${recordingKey === 'addDeath' ? 'shortcut-btn--recording' : ''}`}
                  onClick={() => handleKeyRecord('addDeath')}
                >
                  {getRecordingPrompt('addDeath')}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ padding: '4px 8px', fontSize: '11px', height: '28px' }}
                  onClick={() => handleClearKey('addDeath')}
                >
                  Clear
                </button>
                <span className="setting-hint" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>e.g. Ctrl+F8</span>
              </div>
            </div>

            <div className="setting-group">
              <label className="setting-label">Undo Death Key</label>
              <div className="setting-row" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className={`shortcut-btn ${recordingKey === 'undoDeath' ? 'shortcut-btn--recording' : ''}`}
                  onClick={() => handleKeyRecord('undoDeath')}
                >
                  {getRecordingPrompt('undoDeath')}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ padding: '4px 8px', fontSize: '11px', height: '28px' }}
                  onClick={() => handleClearKey('undoDeath')}
                >
                  Clear
                </button>
                <span className="setting-hint" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>e.g. Ctrl+F7</span>
              </div>
            </div>

            <div className="setting-group">
              <label className="setting-label">+1 Boss Slain Key</label>
              <div className="setting-row" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className={`shortcut-btn ${recordingKey === 'addBossKill' ? 'shortcut-btn--recording' : ''}`}
                  onClick={() => handleKeyRecord('addBossKill')}
                >
                  {getRecordingPrompt('addBossKill')}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ padding: '4px 8px', fontSize: '11px', height: '28px' }}
                  onClick={() => handleClearKey('addBossKill')}
                >
                  Clear
                </button>
                <span className="setting-hint" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>e.g. Ctrl+F9</span>
              </div>
            </div>

            <div className="setting-group">
              <label className="setting-label">Undo Boss Slain Key</label>
              <div className="setting-row" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className={`shortcut-btn ${recordingKey === 'undoBossKill' ? 'shortcut-btn--recording' : ''}`}
                  onClick={() => handleKeyRecord('undoBossKill')}
                >
                  {getRecordingPrompt('undoBossKill')}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ padding: '4px 8px', fontSize: '11px', height: '28px' }}
                  onClick={() => handleClearKey('undoBossKill')}
                >
                  Clear
                </button>
                <span className="setting-hint" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>e.g. Ctrl+F10</span>
              </div>
            </div>

            <div className="setting-group">
              <label className="setting-label">PC Hotkey Companion App</label>
              <div className="hotkey-download-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  Listen for global hotkeys while playing fullscreen Souls games and sync directly to your OBS overlay:
                </p>

                {/* ─── OPTION 1: 1-Click PowerShell Launch (Zero Browser Download Warnings) ─── */}
                <div style={{
                  padding: '12px',
                  background: 'rgba(20, 22, 18, 0.85)',
                  border: '1px solid rgba(200, 166, 93, 0.4)',
                  borderRadius: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--color-gold)' }}>
                      <Terminal size={14} />
                      <span>Recommended: 1-Click Launch (Zero Warnings)</span>
                    </div>
                    <span style={{ fontSize: '10px', background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                      No Browser Prompts
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                    Paste into Windows PowerShell or Windows Terminal (Win+R → powershell). It launches immediately without browser download blocks:
                  </p>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    padding: '8px 10px',
                    borderRadius: '4px',
                    border: '1px solid rgba(200, 166, 93, 0.25)',
                    overflow: 'hidden',
                  }}>
                    <code style={{
                      fontSize: '11.5px',
                      color: 'var(--gold-bright, #F2D58A)',
                      fontFamily: 'Consolas, SFMono-Regular, Menlo, monospace',
                      wordBreak: 'break-all',
                      lineHeight: '1.4',
                      userSelect: 'all',
                      margin: 0,
                    }}>
                      irm https://soulgamedc-rosy.vercel.app/run.ps1 | iex
                    </code>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={handleCopyCommand}
                      style={{
                        padding: '6px 12px',
                        fontSize: '11px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        border: '1px solid var(--border-gold, #3D3524)',
                      }}
                      id="btn-copy-ps-command"
                    >
                      {copiedCommand ? <Check size={13} color="#4ade80" /> : <Copy size={13} />}
                      <span>{copiedCommand ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* ─── OPTION 2: Download Options ─── */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <a
                    href="/DeathCounterHotkeys.zip"
                    download="DeathCounterHotkeys.zip"
                    className="btn btn--primary"
                    style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', fontWeight: 600, flex: '1 1 180px' }}
                    id="btn-download-app-zip"
                  >
                    <Download size={15} />
                    <span>Download App (.zip)</span>
                  </a>
                  <a
                    href="/hotkeys.ahk"
                    download="hotkeys.ahk"
                    className="btn btn--secondary"
                    style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 12px', fontSize: '12px', flex: '1 1 130px' }}
                    id="btn-download-app-ahk"
                  >
                    <FileCode size={14} />
                    <span>AutoHotkey (.ahk)</span>
                  </a>
                  <a
                    href="https://github.com/PrithvirajVNair/Death-Counter"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--secondary"
                    style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 12px', fontSize: '12px' }}
                    id="btn-open-github"
                  >
                    <ExternalLink size={13} />
                    <span>GitHub Source</span>
                  </a>
                </div>

                {/* ─── TRUST & VERIFICATION BANNER ─── */}
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'rgba(200, 166, 93, 0.06)',
                    border: '1px solid rgba(200, 166, 93, 0.25)',
                    borderRadius: '5px',
                    fontSize: '11px',
                    color: '#d4c4a8',
                    lineHeight: '1.5',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-gold)', fontWeight: 600 }}>
                    <ShieldCheck size={14} />
                    <span>100% Open-Source & Safe (MIT License)</span>
                  </div>
                  <div>
                    <strong>Why does Edge/Chrome show a warning?</strong> Chromium automatically displays <em>"is not commonly downloaded"</em> for newly published apps until thousands of global downloads accumulate, unless an author purchases a $400/year corporate certificate.
                  </div>
                  <div style={{ color: 'var(--text-muted)' }}>
                    • If downloading the <strong>.zip</strong>: Extract and run <code>RunHotkeys.bat</code> (it automatically unblocks the companion app).
                    <br />
                    • Or run the <strong>1-Click PowerShell launcher</strong> above for instant, warning-free access.
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <a href="/privacy" style={{ color: 'var(--gold)', textDecoration: 'underline', fontSize: '11px' }}>Privacy Policy</a>
                    <span style={{ color: 'var(--text-dim)' }}>•</span>
                    <a href="/terms" style={{ color: 'var(--gold)', textDecoration: 'underline', fontSize: '11px' }}>Terms of Service</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── DATA TAB ─── */}
        {activeTab === 'data' && (
          <div className="settings-grid">
            <button className="btn btn--secondary btn--full" onClick={onResetSession}>
              <RotateCcw size={14} />
              Reset Session (Counter → 0)
            </button>
            <button className="btn btn--secondary btn--full" onClick={handleExport}>
              <Download size={14} />
              Export Settings (JSON)
            </button>
            <button className="btn btn--secondary btn--full" onClick={handleImport}>
              <Upload size={14} />
              Import Settings (JSON)
            </button>
            <button
              className={`btn btn--danger btn--full ${confirmClear ? 'btn--confirm' : ''}`}
              onClick={handleClearAll}
            >
              <Trash2 size={14} />
              {confirmClear ? 'Confirm: Clear ALL Data?' : 'Clear All Saved Data'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleSetting({ label, checked, onChange }) {
  return (
    <label className="toggle-setting">
      <span className="toggle-setting__label">{label}</span>
      <div className={`toggle-switch ${checked ? 'toggle-switch--on' : ''}`} onClick={() => onChange(!checked)}>
        <div className="toggle-switch__thumb" />
      </div>
    </label>
  );
}
