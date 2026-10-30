import React, { useState } from 'react';
import {
  Download, Upload, Trash2, Monitor, RotateCcw,
  ShieldCheck, ExternalLink, Laptop
} from 'lucide-react';
import { showToast } from './Toast';
import { exportAllSettings, importSettings, clearAllStorage } from '../lib/storage';

export default function CustomizationPanel({
  settings,
  onUpdateSettings,
  onResetAppearance,
  onResetSession,
}) {
  const [activeTab, setActiveTab] = useState('obs');
  const [confirmClear, setConfirmClear] = useState(false);

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

  const tabs = [
    { id: 'obs', label: 'OBS Setup', icon: Monitor },
    { id: 'app', label: 'Desktop App', icon: Laptop },
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

        {/* ─── DESKTOP COMPANION APP TAB ─── */}
        {activeTab === 'app' && (
          <div className="settings-grid">
            <div className="setting-group">
              <label className="setting-label">PC Hotkey Companion App</label>
              <div className="hotkey-download-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  To record deaths and boss kills with global in-game hotkeys while playing fullscreen games, run the desktop companion app. All actions sync directly to your OBS overlay in real-time.
                </p>

                {/* Direct .exe Download Button (Direct EXE file, no zip, no batch script) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
                  <a
                    href="/DeathCounterHotkeys.exe"
                    download="DeathCounterHotkeys.exe"
                    className="btn btn--primary btn--full"
                    style={{
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '11px 14px',
                      fontWeight: 600,
                      fontSize: '13px',
                      width: '100%',
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      whiteSpace: 'normal',
                      textAlign: 'center',
                    }}
                    id="btn-download-app-exe"
                  >
                    <Download size={16} style={{ flexShrink: 0 }} />
                    <span>Download App (DeathCounterHotkeys.exe)</span>
                  </a>
                  <a
                    href="https://github.com/PrithvirajVNair/Death-Counter"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--secondary btn--full"
                    style={{
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '7px 12px',
                      fontSize: '11.5px',
                      width: '100%',
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      whiteSpace: 'normal',
                      textAlign: 'center',
                    }}
                    id="btn-open-github"
                  >
                    <ExternalLink size={13} style={{ flexShrink: 0 }} />
                    <span>GitHub Source Code</span>
                  </a>
                </div>

                {/* Default Hotkeys Card */}
                <div
                  style={{
                    padding: '12px',
                    background: 'rgba(20, 22, 18, 0.85)',
                    border: '1px solid rgba(200, 166, 93, 0.25)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    lineHeight: '1.6',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ color: 'var(--color-gold)', fontWeight: 600 }}>
                    In-Game Hotkeys:
                  </div>
                  <div style={{ color: '#d4c4a8' }}>
                    • <strong style={{ color: 'var(--gold-bright)' }}>F8</strong>: +1 Death<br />
                    • <strong style={{ color: 'var(--gold-bright)' }}>F7</strong>: Undo Death<br />
                    • <strong style={{ color: 'var(--gold-bright)' }}>F9</strong>: +1 Boss Slain<br />
                    • <strong style={{ color: 'var(--gold-bright)' }}>F10</strong>: Undo Boss Slain
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>
                    * Hotkeys are supported exclusively in the desktop app and can be remapped directly inside the app window.
                  </div>
                </div>

                {/* Trust & Safe Info */}
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'rgba(200, 166, 93, 0.06)',
                    border: '1px solid rgba(200, 166, 93, 0.2)',
                    borderRadius: '5px',
                    fontSize: '11.5px',
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
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                    Sign in with your Streamer Account on the companion app to link your cloud tally and activate in-game hotkeys.
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '2px', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
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
