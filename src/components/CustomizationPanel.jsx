import React, { useState } from 'react';
import {
  Download, Upload, Trash2, Monitor, RotateCcw,
} from 'lucide-react';
import { showToast } from './Toast';
import { exportAllSettings, importSettings, clearAllStorage } from '../lib/storage';

export default function CustomizationPanel({
  _settings,
  _onUpdateSettings,
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
                <li>Copy your overlay URL by clicking <strong>Copy OBS URL</strong> under <strong>Live Preview</strong>.</li>
                <li>Paste the copied URL into the <strong>URL</strong> field in OBS.</li>
                <li>Set <strong>Width</strong> to <strong>800</strong> and <strong>Height</strong> to <strong>250</strong> (or adjust to fit your scene layout).</li>
                <li>Leave <strong>Custom CSS</strong> as default (background is 100% transparent by default).</li>
                <li>Click <strong>OK</strong>. Every counter increment or button click updates OBS instantly in real-time!</li>
              </ol>
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
            <button className="btn btn--secondary btn--full" onClick={onResetAppearance}>
              <RotateCcw size={14} />
              Reset Appearance (Defaults)
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
