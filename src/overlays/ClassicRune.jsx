import React from 'react';
import { Skull, Swords } from 'lucide-react';

export default function ClassicRune({
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

  const glowPx = Math.round(glowIntensity * 20);

  return (
    <div className={`overlay-preset classic-rune ${deathAnim && animationsEnabled ? 'death-pulse' : ''}`}>
      <div className="classic-rune__inner">
        {runeVisible && (
          <div className="classic-rune__emblem" style={{ color: goldColor }}>
            {isBossMode ? (
              <svg viewBox="0 0 120 120" width="80" height="80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="60" cy="60" r="54" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
                <circle cx="60" cy="60" r="44" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
                {/* Crossed Swords */}
                <line x1="32" y1="32" x2="88" y2="88" stroke="currentColor" strokeWidth="2.5" opacity="0.85" />
                <line x1="88" y1="32" x2="32" y2="88" stroke="currentColor" strokeWidth="2.5" opacity="0.85" />
                <line x1="38" y1="26" x2="26" y2="38" stroke="currentColor" strokeWidth="2.5" opacity="0.9" />
                <line x1="82" y1="26" x2="94" y2="38" stroke="currentColor" strokeWidth="2.5" opacity="0.9" />
                <circle cx="60" cy="60" r="8" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                <polygon points="60,20 64,32 60,28 56,32" fill="currentColor" opacity="0.8" />
                <polygon points="60,100 64,88 60,92 56,88" fill="currentColor" opacity="0.8" />
              </svg>
            ) : (
              <svg viewBox="0 0 120 120" width="80" height="80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="60" cy="60" r="54" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
                <circle cx="60" cy="60" r="44" stroke="currentColor" strokeWidth="1" opacity="0.3" />
                <circle cx="60" cy="60" r="34" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
                {/* Rune cross */}
                <line x1="60" y1="10" x2="60" y2="110" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
                <line x1="10" y1="60" x2="110" y2="60" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
                {/* Diagonal runes */}
                <line x1="20" y1="20" x2="100" y2="100" stroke="currentColor" strokeWidth="0.5" opacity="0.15" />
                <line x1="100" y1="20" x2="20" y2="100" stroke="currentColor" strokeWidth="0.5" opacity="0.15" />
                {/* Inner emblem */}
                <polygon points="60,26 74,50 60,44 46,50" fill="currentColor" opacity="0.7" />
                <polygon points="60,94 74,70 60,76 46,70" fill="currentColor" opacity="0.7" />
                <polygon points="26,60 50,46 44,60 50,74" fill="currentColor" opacity="0.5" />
                <polygon points="94,60 70,46 76,60 70,74" fill="currentColor" opacity="0.5" />
                {/* Center dot */}
                <circle cx="60" cy="60" r="3" fill="currentColor" opacity="0.8" />
              </svg>
            )}
          </div>
        )}

        <div className="classic-rune__content">
          <div className="classic-rune__line-top" style={{ backgroundColor: goldColor, opacity: 0.3 }} />
          {labelVisible ? (
            <div className="classic-rune__label" style={{ color: goldColor, opacity: 0.7 }}>
              {displayLabel}
            </div>
          ) : (
            <div className="classic-rune__icon-badge" style={{ color: goldColor, opacity: 0.85, display: 'flex', alignItems: 'center', gap: '6px' }}>
              {isBossMode ? (
                <Swords size={20} strokeWidth={1.8} style={{ filter: `drop-shadow(0 0 ${glowPx}px ${goldColor}70)` }} />
              ) : (
                <Skull size={20} strokeWidth={1.8} style={{ filter: `drop-shadow(0 0 ${glowPx}px ${goldColor}70)` }} />
              )}
            </div>
          )}
          <div
            className="classic-rune__number"
            style={{
              fontSize: `${fontSize}px`,
              color: goldColor,
              textShadow: `0 0 ${glowPx}px ${goldColor}60, 0 0 ${glowPx * 2}px ${goldColor}30`,
            }}
          >
            {deaths}
          </div>
          {sessionCountVisible && (
            <div className="classic-rune__session" style={{ color: goldColor, opacity: 0.5 }}>
              Session: {sessionDeaths}
            </div>
          )}
          {isBothMode && !isBossMode && (
            <div className="classic-rune__session" style={{ color: goldColor, opacity: 0.85, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Swords size={13} strokeWidth={1.8} />
              <span>Boss Slain: {bossKills}</span>
            </div>
          )}
          {isBothMode && isBossMode && (
            <div className="classic-rune__session" style={{ color: goldColor, opacity: 0.85, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Skull size={13} strokeWidth={1.8} />
              <span>Death: {rawDeaths}</span>
            </div>
          )}
          {bossAttemptsInOverlay && currentBoss && (
            <div className="classic-rune__boss" style={{ color: goldColor, opacity: 0.5 }}>
              {currentBoss}: {bossAttempts || 0}
            </div>
          )}
          <div className="classic-rune__line-bottom" style={{ backgroundColor: goldColor, opacity: 0.3 }} />
        </div>
      </div>
    </div>
  );
}
