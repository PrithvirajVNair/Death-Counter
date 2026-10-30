import React from 'react';
import ClassicRune from '../overlays/ClassicRune';
import Minimal from '../overlays/Minimal';
import OrnamentalFrame from '../overlays/OrnamentalFrame';
import CrimsonDeath from '../overlays/CrimsonDeath';
import VerticalRune from '../overlays/VerticalRune';
import Landscape from '../overlays/Landscape';

const PRESETS = {
  'classic-rune': ClassicRune,
  'minimal': Minimal,
  'ornamental-frame': OrnamentalFrame,
  'crimson-death': CrimsonDeath,
  'vertical-rune': VerticalRune,
  'landscape': Landscape,
};

export default function DeathCounter({
  deaths,
  bossKills = 0,
  settings = {},
  deathAnim,
  bossSlainAnim,
  sessionDeaths,
  currentBoss,
  bossAttempts,
}) {
  const {
    preset = 'classic-rune',
    scale = 1,
    padding = 20,
    overlayMode = 'deaths',
    showBossKills = false,
  } = settings;

  const PresetComponent = PRESETS[preset] || ClassicRune;

  const isBossMode = overlayMode === 'boss-slain';
  const isBothMode = overlayMode === 'both' || showBossKills;

  // In dedicated Boss Slain mode, display boss kills as the main counter!
  const displayDeaths = isBossMode ? bossKills : deaths;
  const displayLabel = isBossMode ? 'BOSS SLAIN' : 'DEATH';
  const activeAnim = isBossMode ? (bossSlainAnim || deathAnim) : (deathAnim || bossSlainAnim);

  return (
    <div
      className={`death-counter-root ${isBossMode ? 'death-counter-root--boss-mode' : ''} ${settings.transparentBg === false ? 'death-counter-root--solid-bg' : ''}`}
      style={{
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        padding: `${padding}px`,
      }}
    >
      <PresetComponent
        deaths={displayDeaths}
        rawDeaths={deaths}
        bossKills={bossKills}
        isBossMode={isBossMode}
        isBothMode={isBothMode}
        displayLabel={displayLabel}
        settings={settings}
        deathAnim={activeAnim}
        bossSlainAnim={bossSlainAnim}
        sessionDeaths={sessionDeaths}
        currentBoss={currentBoss}
        bossAttempts={bossAttempts}
      />
    </div>
  );
}
