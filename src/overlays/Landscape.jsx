import React from 'react';
import { Skull, Swords } from 'lucide-react';

export default function Landscape({
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
    animationsEnabled = true,
    runeVisible = true,
    sessionCountVisible = false,
    bossAttemptsInOverlay = false,
  } = settings;

  const glowPx = Math.round(glowIntensity * 15);

  return (
    <div className={`overlay-preset landscape ${deathAnim && animationsEnabled ? 'death-pulse' : ''}`}>
      <div className="landscape__inner">
        {/* Subtle landscape line art */}
        {runeVisible && (
          <div className="landscape__scenery" style={{ color: goldColor }}>
            <svg viewBox="0 0 200 40" width="200" height="40" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Distant mountain silhouette */}
              <path d="M0 38 L25 18 L40 28 L60 10 L80 25 L100 6 L120 22 L140 12 L160 26 L180 15 L200 38" 
                stroke="currentColor" strokeWidth="0.6" opacity="0.15" fill="none" />
              {/* Erdtree hint */}
              <line x1="100" y1="6" x2="100" y2="0" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
              <circle cx="100" cy="0" r="3" stroke="currentColor" strokeWidth="0.4" opacity="0.15" fill="none" />
            </svg>
          </div>
        )}

        <div className="landscape__content">
          <div className="landscape__left">
            {labelVisible ? (
              <div className="landscape__label" style={{ color: goldColor, opacity: 0.55 }}>
                {displayLabel}
              </div>
            ) : (
              <div className="landscape__icon-badge" style={{ color: goldColor, opacity: 0.85, display: 'flex', alignItems: 'center', marginBottom: 2 }}>
                {isBossMode ? (
                  <Swords size={20} strokeWidth={1.8} style={{ filter: `drop-shadow(0 0 ${glowPx}px ${goldColor}70)` }} />
                ) : (
                  <Skull size={20} strokeWidth={1.8} style={{ filter: `drop-shadow(0 0 ${glowPx}px ${goldColor}70)` }} />
                )}
              </div>
            )}
            {sessionCountVisible && (
              <div className="landscape__session" style={{ color: goldColor, opacity: 0.35, fontSize: '11px' }}>
                Session: {sessionDeaths}
              </div>
            )}
            {isBothMode && !isBossMode && (
              <div className="landscape__session" style={{ color: goldColor, opacity: 0.85, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Swords size={12} strokeWidth={1.8} />
                <span>{bossKills}</span>
              </div>
            )}
            {isBothMode && isBossMode && (
              <div className="landscape__session" style={{ color: goldColor, opacity: 0.85, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Skull size={12} strokeWidth={1.8} />
                <span>{rawDeaths}</span>
              </div>
            )}
          </div>

          <div className="landscape__divider" style={{ backgroundColor: `${goldColor}30` }} />

          <div
            className="landscape__number"
            style={{
              fontSize: `${fontSize}px`,
              color: goldColor,
              textShadow: `0 0 ${glowPx}px ${goldColor}40`,
            }}
          >
            {deaths}
          </div>
        </div>

        {bossAttemptsInOverlay && currentBoss && (
          <div className="landscape__boss" style={{ color: goldColor, opacity: 0.4 }}>
            {currentBoss}: {bossAttempts || 0}
          </div>
        )}

        {/* Bottom atmospheric line */}
        <div className="landscape__bottom-line" style={{ background: `linear-gradient(90deg, transparent, ${goldColor}25, transparent)` }} />
      </div>
    </div>
  );
}
