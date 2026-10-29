import React from 'react';
import { Skull, Swords } from 'lucide-react';

export default function Minimal({
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
    goldColor = '#C8A65D',
    glowIntensity = 0.6,
    animationsEnabled = true,
    runeVisible = true,
    sessionCountVisible = false,
    bossAttemptsInOverlay = false,
  } = settings;

  const glowPx = Math.round(glowIntensity * 15);
  const iconSize = Math.max(26, Math.round(fontSize * 0.46));

  return (
    <div className={`overlay-preset minimal ${deathAnim && animationsEnabled ? 'death-pulse' : ''}`}>
      <div className="minimal__inner">
        {isBothMode ? (
          <div className="minimal__both">
            {/* Deaths item */}
            <div className="minimal__item">
              <Skull
                size={iconSize}
                color={goldColor}
                strokeWidth={1.8}
                style={{ filter: `drop-shadow(0 0 ${glowPx}px ${goldColor}70)` }}
              />
              <span
                className="minimal__number"
                style={{
                  fontSize: `${fontSize}px`,
                  color: goldColor,
                  textShadow: `0 0 ${glowPx}px ${goldColor}50`,
                }}
              >
                {rawDeaths}
              </span>
            </div>

            {/* Boss Kills item */}
            <div className="minimal__item">
              <Swords
                size={iconSize}
                color={goldColor}
                strokeWidth={1.8}
                style={{ filter: `drop-shadow(0 0 ${glowPx}px ${goldColor}70)` }}
              />
              <span
                className="minimal__number"
                style={{
                  fontSize: `${fontSize}px`,
                  color: goldColor,
                  textShadow: `0 0 ${glowPx}px ${goldColor}50`,
                }}
              >
                {bossKills}
              </span>
            </div>
          </div>
        ) : (
          <>
            {runeVisible && (
              <div className="minimal__icon-wrap">
                {isBossMode ? (
                  <Swords
                    size={iconSize}
                    color={goldColor}
                    strokeWidth={1.8}
                    style={{ filter: `drop-shadow(0 0 ${glowPx}px ${goldColor}70)` }}
                  />
                ) : (
                  <Skull
                    size={iconSize}
                    color={goldColor}
                    strokeWidth={1.8}
                    style={{ filter: `drop-shadow(0 0 ${glowPx}px ${goldColor}70)` }}
                  />
                )}
              </div>
            )}
            <div
              className="minimal__number"
              style={{
                fontSize: `${fontSize}px`,
                color: goldColor,
                textShadow: `0 0 ${glowPx}px ${goldColor}50`,
              }}
            >
              {deaths}
            </div>
          </>
        )}

        {sessionCountVisible && (
          <div className="minimal__session" style={{ color: goldColor, opacity: 0.45 }}>
            S: {sessionDeaths}
          </div>
        )}
        {bossAttemptsInOverlay && currentBoss && (
          <div className="minimal__boss" style={{ color: goldColor, opacity: 0.45, fontSize: '12px' }}>
            {currentBoss}: {bossAttempts || 0}
          </div>
        )}
      </div>
    </div>
  );
}
