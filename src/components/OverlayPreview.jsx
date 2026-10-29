import React, { useState, useMemo } from 'react';
import { Copy, ExternalLink, Skull, Swords } from 'lucide-react';
import { showToast } from './Toast';
import DeathCounter from './DeathCounter';

export default function OverlayPreview({
  deaths,
  bossKills = 0,
  settings,
  deathAnim,
  bossSlainAnim,
  sessionDeaths,
  currentBoss,
  bossAttempts,
  transparentBg,
  onToggleTransparent,
}) {
  const [previewMode, setPreviewMode] = useState('deaths'); // 'deaths' | 'boss-slain' | 'both'

  const effectivePreviewSettings = useMemo(() => {
    return {
      ...settings,
      overlayMode: previewMode,
      showBossKills: previewMode === 'both',
    };
  }, [settings, previewMode]);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  const currentPreviewObsUrl = useMemo(() => {
    const preset = settings?.preset || 'classic-rune';
    const colorParam = settings?.goldColor ? `&goldColor=${encodeURIComponent(settings.goldColor)}` : '';
    if (previewMode === 'boss-slain') return `${origin}/overlay?preset=${preset}&mode=boss-slain${colorParam}`;
    if (previewMode === 'both') return `${origin}/overlay?preset=${preset}&bossKills=true${colorParam}`;
    return `${origin}/overlay?preset=${preset}${colorParam}`;
  }, [origin, settings?.preset, settings?.goldColor, previewMode]);

  const handleCopyCurrentUrl = () => {
    navigator.clipboard.writeText(currentPreviewObsUrl).then(
      () => {
        const label = previewMode === 'boss-slain' ? 'Boss Slain' : previewMode === 'both' ? 'Combined' : 'Death';
        showToast(`${label} OBS URL copied! Paste into OBS Browser Source`);
      },
      () => showToast('Failed to copy URL', 'error')
    );
  };

  return (
    <div className="overlay-preview">
      <div className="overlay-preview__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <h3 className="overlay-preview__title">Live Preview</h3>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              type="button"
              className={`btn btn--xs ${previewMode === 'deaths' ? 'btn--primary' : 'btn--secondary'}`}
              onClick={() => setPreviewMode('deaths')}
            >
              <Skull size={12} />
              <span>Death</span>
            </button>
            <button
              type="button"
              className={`btn btn--xs ${previewMode === 'boss-slain' ? 'btn--gold' : 'btn--secondary'}`}
              onClick={() => setPreviewMode('boss-slain')}
            >
              <Swords size={12} />
              <span>Boss Slain</span>
            </button>
            <button
              type="button"
              className={`btn btn--xs ${previewMode === 'both' ? 'btn--primary' : 'btn--secondary'}`}
              onClick={() => setPreviewMode('both')}
            >
              <span>Both</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn btn--xs ${previewMode === 'boss-slain' ? 'btn--gold' : 'btn--secondary'}`}
            onClick={handleCopyCurrentUrl}
            title="Copy this overlay's URL for OBS Studio"
          >
            <Copy size={12} />
            <span>Copy OBS URL</span>
          </button>
          <button
            type="button"
            className="btn btn--xs btn--icon"
            onClick={() => window.open(currentPreviewObsUrl, '_blank')}
            title="Open overlay in new tab to test"
          >
            <ExternalLink size={12} />
          </button>
          <label className="overlay-preview__toggle">
            <input
              type="checkbox"
              checked={transparentBg}
              onChange={(e) => onToggleTransparent(e.target.checked)}
            />
            <span className="overlay-preview__toggle-label">Transparent BG</span>
          </label>
        </div>
      </div>
      <div className={`overlay-preview__canvas ${transparentBg ? 'overlay-preview__canvas--transparent' : ''}`}>
        <DeathCounter
          deaths={deaths}
          bossKills={bossKills}
          settings={effectivePreviewSettings}
          deathAnim={deathAnim}
          bossSlainAnim={bossSlainAnim}
          sessionDeaths={sessionDeaths}
          currentBoss={currentBoss}
          bossAttempts={bossAttempts}
        />
      </div>
    </div>
  );
}
