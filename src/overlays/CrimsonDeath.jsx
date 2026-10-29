import React from 'react';
import { Skull, Swords } from 'lucide-react';

export default function CrimsonDeath({
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
  const crimson = '#762D2D';

  return (
    <div className={`overlay-preset crimson-death ${deathAnim && animationsEnabled ? 'crimson-flash' : ''}`}>
      {/* Crimson flash overlay */}
      {deathAnim && animationsEnabled && (
        <div className="crimson-death__flash" />
      )}
      
      <div className="crimson-death__inner">
        {runeVisible && (
          <div className="crimson-death__emblem">
            {isBossMode ? (
              <svg viewBox="0 0 60 60" width="48" height="48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="30" cy="30" r="26" stroke={goldColor} strokeWidth="1" opacity="0.6" />
                <circle cx="30" cy="30" r="20" stroke={crimson} strokeWidth="1" opacity="0.5" />
                {/* Crossed Swords in emblem */}
                <line x1="18" y1="18" x2="42" y2="42" stroke={goldColor} strokeWidth="1.8" opacity="0.85" />
                <line x1="42" y1="18" x2="18" y2="42" stroke={goldColor} strokeWidth="1.8" opacity="0.85" />
                <circle cx="30" cy="30" r="3" fill={goldColor} opacity="0.7" />
              </svg>
            ) : (
              <svg viewBox="0 0 60 60" width="48" height="48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="30" cy="30" r="26" stroke={goldColor} strokeWidth="1" opacity="0.5" />
                <circle cx="30" cy="30" r="20" stroke={crimson} strokeWidth="0.8" opacity="0.4" />
                {/* Blood drops */}
                <path d="M30 8 C30 8, 34 16, 30 20 C26 16, 30 8, 30 8Z" fill={crimson} opacity="0.5" />
                <path d="M30 40 C30 40, 34 48, 30 52 C26 48, 30 40, 30 40Z" fill={crimson} opacity="0.4" />
                <circle cx="30" cy="30" r="3" fill={goldColor} opacity="0.6" />
              </svg>
            )}
          </div>
        )}

        <div className="crimson-death__content">
          {labelVisible ? (
            <div className="crimson-death__label" style={{ color: goldColor, opacity: 0.6 }}>
              {displayLabel}
            </div>
          ) : (
            <div className="crimson-death__icon-badge" style={{ color: goldColor, opacity: 0.85, display: 'flex', alignItems: 'center', margin: '2px 0' }}>
              {isBossMode ? (
                <Swords size={20} strokeWidth={1.8} style={{ filter: `drop-shadow(0 0 ${glowPx}px ${goldColor}70)` }} />
              ) : (
                <Skull size={20} strokeWidth={1.8} style={{ filter: `drop-shadow(0 0 ${glowPx}px ${goldColor}70)` }} />
              )}
            </div>
          )}
          <div
            className="crimson-death__number"
            style={{
              fontSize: `${fontSize}px`,
              color: goldColor,
              textShadow: `0 0 ${glowPx}px ${goldColor}50, 0 2px ${glowPx}px ${crimson}30`,
            }}
          >
            {deaths}
          </div>
          {/* Crimson underline */}
          <div className="crimson-death__underline" style={{ background: `linear-gradient(90deg, transparent, ${crimson}80, transparent)` }} />
          {sessionCountVisible && (
            <div className="crimson-death__session" style={{ color: goldColor, opacity: 0.45 }}>
              Session: {sessionDeaths}
            </div>
          )}
          {isBothMode && !isBossMode && (
            <div className="crimson-death__session" style={{ color: goldColor, opacity: 0.85, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Swords size={13} strokeWidth={1.8} />
              <span>Boss Slain: {bossKills}</span>
            </div>
          )}
          {isBothMode && isBossMode && (
            <div className="crimson-death__session" style={{ color: goldColor, opacity: 0.85, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Skull size={13} strokeWidth={1.8} />
              <span>Death: {rawDeaths}</span>
            </div>
          )}
          {bossAttemptsInOverlay && currentBoss && (
            <div className="crimson-death__boss" style={{ color: goldColor, opacity: 0.45 }}>
              {currentBoss}: {bossAttempts || 0}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
