import React from 'react';
import { Skull, Swords } from 'lucide-react';

export default function OrnamentalFrame({
  deaths,
  rawDeaths,
  bossKills = 0,
  isBossMode = false,
  isBothMode = false,
  displayLabel = 'DEATH',
  settings = {},
  deathAnim,
  sessionDeaths,
  currentBoss,
  bossAttempts,
}) {
  const {
    fontSize = 72,
    labelVisible = true,
    goldColor = '#C8A65D',
    glowIntensity = 0.6,
    frameVisible = true,
    animationsEnabled = true,
    sessionCountVisible = false,
    bossAttemptsInOverlay = false,
  } = settings;

  const glowPx = Math.round(glowIntensity * 18);

  return (
    <div className={`overlay-preset ornamental-frame ${deathAnim && animationsEnabled ? 'death-pulse' : ''}`}>
      <div className="ornamental-frame__inner" style={{ borderColor: frameVisible ? `${goldColor}40` : 'transparent' }}>
        {/* Corner ornaments */}
        {frameVisible && (
          <>
            <div className="ornamental-frame__corner ornamental-frame__corner--tl" style={{ borderColor: `${goldColor}60` }} />
            <div className="ornamental-frame__corner ornamental-frame__corner--tr" style={{ borderColor: `${goldColor}60` }} />
            <div className="ornamental-frame__corner ornamental-frame__corner--bl" style={{ borderColor: `${goldColor}60` }} />
            <div className="ornamental-frame__corner ornamental-frame__corner--br" style={{ borderColor: `${goldColor}60` }} />
          </>
        )}
        
        {/* Small top ornament */}
        <div className="ornamental-frame__top-ornament" style={{ color: goldColor }}>
          <svg viewBox="0 0 80 16" width="80" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="0" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
            <polygon points="40,2 44,8 40,14 36,8" fill="currentColor" opacity="0.5" />
            <line x1="52" y1="8" x2="80" y2="8" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
          </svg>
        </div>

        {labelVisible ? (
          <div className="ornamental-frame__label" style={{ color: goldColor, opacity: 0.6 }}>
            {displayLabel}
          </div>
        ) : (
          <div className="ornamental-frame__icon-badge" style={{ color: goldColor, opacity: 0.85, display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
            {isBossMode ? (
              <Swords size={22} strokeWidth={1.8} style={{ filter: `drop-shadow(0 0 ${glowPx}px ${goldColor}70)` }} />
            ) : (
              <Skull size={22} strokeWidth={1.8} style={{ filter: `drop-shadow(0 0 ${glowPx}px ${goldColor}70)` }} />
            )}
          </div>
        )}
        <div
          className="ornamental-frame__number"
          style={{
            fontSize: `${fontSize}px`,
            color: goldColor,
            textShadow: `0 0 ${glowPx}px ${goldColor}50, 0 0 ${glowPx * 2}px ${goldColor}20`,
          }}
        >
          {deaths}
        </div>
        {sessionCountVisible && (
          <div className="ornamental-frame__session" style={{ color: goldColor, opacity: 0.45 }}>
            Session: {sessionDeaths}
          </div>
        )}
        {isBothMode && !isBossMode && (
          <div className="ornamental-frame__session" style={{ color: goldColor, opacity: 0.85, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Swords size={13} strokeWidth={1.8} />
            <span>Boss Slain: {bossKills}</span>
          </div>
        )}
        {isBothMode && isBossMode && (
          <div className="ornamental-frame__session" style={{ color: goldColor, opacity: 0.85, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Skull size={13} strokeWidth={1.8} />
            <span>Death: {rawDeaths}</span>
          </div>
        )}
        {bossAttemptsInOverlay && currentBoss && (
          <div className="ornamental-frame__boss" style={{ color: goldColor, opacity: 0.45 }}>
            {currentBoss}: {bossAttempts || 0}
          </div>
        )}

        {/* Bottom ornament */}
        <div className="ornamental-frame__bottom-ornament" style={{ color: goldColor }}>
          <svg viewBox="0 0 80 16" width="80" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="0" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
            <polygon points="40,2 44,8 40,14 36,8" fill="currentColor" opacity="0.5" />
            <line x1="52" y1="8" x2="80" y2="8" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
          </svg>
        </div>
      </div>
    </div>
  );
}
