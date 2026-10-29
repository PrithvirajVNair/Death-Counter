import React from 'react';
import { Skull, Swords } from 'lucide-react';

export default function VerticalRune({
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
    runeVisible = true,
    goldColor = '#C8A65D',
    glowIntensity = 0.6,
    animationsEnabled = true,
    sessionCountVisible = false,
    bossAttemptsInOverlay = false,
  } = settings;

  const glowPx = Math.round(glowIntensity * 18);

  return (
    <div className={`overlay-preset vertical-rune ${deathAnim && animationsEnabled ? 'death-pulse' : ''}`}>
      <div className="vertical-rune__inner">
        {runeVisible && (
          <div className="vertical-rune__emblem" style={{ color: goldColor }}>
            {isBossMode ? (
              <svg viewBox="0 0 80 80" width="56" height="56" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                <circle cx="40" cy="40" r="28" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
                {/* Crossed Swords in Vertical Emblem */}
                <line x1="22" y1="22" x2="58" y2="58" stroke="currentColor" strokeWidth="2" opacity="0.8" />
                <line x1="58" y1="22" x2="22" y2="58" stroke="currentColor" strokeWidth="2" opacity="0.8" />
                <polygon points="40,14 46,26 40,23 34,26" fill="currentColor" opacity="0.7" />
                <polygon points="40,66 46,54 40,57 34,54" fill="currentColor" opacity="0.7" />
                <circle cx="40" cy="40" r="3" fill="currentColor" opacity="0.7" />
              </svg>
            ) : (
              <svg viewBox="0 0 80 80" width="56" height="56" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                <circle cx="40" cy="40" r="28" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
                {/* Vertical rune symbol */}
                <line x1="40" y1="8" x2="40" y2="72" stroke="currentColor" strokeWidth="0.6" opacity="0.3" />
                <line x1="8" y1="40" x2="72" y2="40" stroke="currentColor" strokeWidth="0.6" opacity="0.3" />
                <polygon points="40,14 48,32 40,28 32,32" fill="currentColor" opacity="0.6" />
                <polygon points="40,66 48,48 40,52 32,48" fill="currentColor" opacity="0.6" />
                <circle cx="40" cy="40" r="4" fill="currentColor" opacity="0.7" />
                {/* Small accent circles */}
                <circle cx="40" cy="14" r="2" fill="currentColor" opacity="0.4" />
                <circle cx="40" cy="66" r="2" fill="currentColor" opacity="0.4" />
              </svg>
            )}
          </div>
        )}

        {labelVisible ? (
          <div className="vertical-rune__label" style={{ color: goldColor, opacity: 0.6 }}>
            {displayLabel}
          </div>
        ) : (
          <div className="vertical-rune__icon-badge" style={{ color: goldColor, opacity: 0.85, display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
            {isBossMode ? (
              <Swords size={22} strokeWidth={1.8} style={{ filter: `drop-shadow(0 0 ${glowPx}px ${goldColor}70)` }} />
            ) : (
              <Skull size={22} strokeWidth={1.8} style={{ filter: `drop-shadow(0 0 ${glowPx}px ${goldColor}70)` }} />
            )}
          </div>
        )}

        <div
          className="vertical-rune__number"
          style={{
            fontSize: `${fontSize}px`,
            color: goldColor,
            textShadow: `0 0 ${glowPx}px ${goldColor}50, 0 0 ${glowPx * 2}px ${goldColor}20`,
          }}
        >
          {deaths}
        </div>

        {sessionCountVisible && (
          <div className="vertical-rune__session" style={{ color: goldColor, opacity: 0.45 }}>
            Session: {sessionDeaths}
          </div>
        )}
        {isBothMode && !isBossMode && (
          <div className="vertical-rune__session" style={{ color: goldColor, opacity: 0.85, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Swords size={13} strokeWidth={1.8} />
            <span>Boss Slain: {bossKills}</span>
          </div>
        )}
        {isBothMode && isBossMode && (
          <div className="vertical-rune__session" style={{ color: goldColor, opacity: 0.85, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Skull size={13} strokeWidth={1.8} />
            <span>Death: {rawDeaths}</span>
          </div>
        )}
        {bossAttemptsInOverlay && currentBoss && (
          <div className="vertical-rune__boss" style={{ color: goldColor, opacity: 0.45 }}>
            {currentBoss}: {bossAttempts || 0}
          </div>
        )}
      </div>
    </div>
  );
}
