import React, { useState, useMemo } from 'react';
import { Copy, ExternalLink, Skull, Swords } from 'lucide-react';
import { showToast } from './Toast';
import DeathCounter from './DeathCounter';

export default function OverlayPreview({
  deaths,
  bossKills = 0,
  settings = {},
  deathAnim,
  bossSlainAnim,
  sessionDeaths,
  currentBoss,
  bossAttempts,
  onUpdateSettings,
  transparentBg,
  onToggleTransparent,
  streamerKey,
}) {
  const [previewMode, setPreviewMode] = useState('deaths'); // 'deaths' | 'boss-slain' | 'both'

  const isTransparent = settings?.transparentBg !== false && transparentBg !== false;

  const effectivePreviewSettings = useMemo(() => {
    return {
      ...settings,
      overlayMode: previewMode,
      showBossKills: previewMode === 'both',
      transparentBg: isTransparent,
    };
  }, [settings, previewMode, isTransparent]);

  const origin = typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('undefined')
    ? window.location.origin
    : 'https://soulgamedc-rosy.vercel.app';

  const currentPreviewObsUrl = useMemo(() => {
    const preset = settings?.preset || 'classic-rune';
    const colorParam = settings?.goldColor ? `&goldColor=${encodeURIComponent(settings.goldColor)}` : '';
    const keyParam = streamerKey ? `&key=${encodeURIComponent(streamerKey)}` : '';
    const transParam = !isTransparent ? '&transparent=false' : '';
    if (previewMode === 'boss-slain') return `${origin}/overlay?preset=${preset}&mode=boss-slain${colorParam}${keyParam}${transParam}`;
    if (previewMode === 'both') return `${origin}/overlay?preset=${preset}&bossKills=true${colorParam}${keyParam}${transParam}`;
    return `${origin}/overlay?preset=${preset}${colorParam}${keyParam}${transParam}`;
  }, [origin, settings?.preset, settings?.goldColor, isTransparent, previewMode, streamerKey]);

  const handleCopyCurrentUrl = () => {
    navigator.clipboard.writeText(currentPreviewObsUrl).then(
      () => {
        const label = previewMode === 'boss-slain' ? 'Boss Slain' : previewMode === 'both' ? 'Combined' : 'Death';
        showToast(`${label} OBS URL copied! Paste into OBS Browser Source`);
      },
      () => showToast('Failed to copy URL', 'error')
    );
  };

  const handleToggleTransparent = (checked) => {
    if (onUpdateSettings) {
      onUpdateSettings({ transparentBg: checked });
    }
    if (onToggleTransparent) {
      onToggleTransparent(checked);
    }
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
          <label className="overlay-preview__toggle" title="Toggle between transparent floating runes and solid dark frame box">
            <input
              type="checkbox"
              id="chk-transparent-bg"
              checked={isTransparent}
              onChange={(e) => handleToggleTransparent(e.target.checked)}
            />
            <span className="overlay-preview__toggle-label">Transparent BG</span>
          </label>
        </div>
      </div>
      <div className={`overlay-preview__canvas ${isTransparent ? 'overlay-preview__canvas--transparent' : ''}`}>
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
