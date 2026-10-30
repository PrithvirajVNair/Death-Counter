import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import DeathCounter from '../components/DeathCounter';
import { useDeathCounter } from '../hooks/useDeathCounter';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import '../styles/overlay.css';

export default function Overlay() {
  const [searchParams] = useSearchParams();
  const auth = useAuth();
  const counter = useDeathCounter();
  const { deaths, sessionDeaths, bossKills, settings, deathAnim, bossSlainAnim, currentBoss, bosses, loadFullState } = counter;

  const keyParam = searchParams.get('key') || searchParams.get('streamerKey') || searchParams.get('channel') || searchParams.get('room');
  const effectiveKey = keyParam || auth?.streamerKey;

  // Direct Supabase Cloud Connection & Realtime push for OBS Studio
  useEffect(() => {
    if (!effectiveKey || !supabase) return;

    const loadFromCloud = async () => {
      try {
        const { data, error } = await supabase
          .from('streamer_states')
          .select('*')
          .eq('streamer_key', effectiveKey)
          .maybeSingle();

        if (!error && data) {
          loadFullState({
            deaths: data.deaths ?? 0,
            sessionDeaths: data.session_deaths ?? 0,
            allTimeDeaths: data.all_time_deaths ?? 0,
            bossKills: data.boss_kills ?? 0,
            settings: data.settings || {},
            shortcuts: data.shortcuts || {},
            bosses: data.bosses || {},
            currentBoss: data.current_boss || '',
            lastUpdated: data.last_updated ?? 0,
          });
        }
      } catch {}
    };

    // 1. Initial immediate load
    loadFromCloud();

    // 2. Realtime listener: instant push from Supabase (under 50ms)
    const channel = supabase
      .channel(`obs_overlay_${effectiveKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'streamer_states',
          filter: `streamer_key=eq.${effectiveKey}`,
        },
        (payload) => {
          const row = payload.new;
          if (row) {
            loadFullState({
              deaths: row.deaths ?? 0,
              sessionDeaths: row.session_deaths ?? 0,
              allTimeDeaths: row.all_time_deaths ?? 0,
              bossKills: row.boss_kills ?? 0,
              settings: row.settings || {},
              shortcuts: row.shortcuts || {},
              bosses: row.bosses || {},
              currentBoss: row.current_boss || '',
              lastUpdated: row.last_updated ?? 0,
            });
          }
        }
      )
      .subscribe();

    // 3. Fallback polling for OBS Studio CEF every 800ms
    const interval = setInterval(loadFromCloud, 800);

    return () => {
      clearInterval(interval);
      channel.unsubscribe();
    };
  }, [effectiveKey, loadFullState]);

  // Prevent scrollbars and keep transparent background in OBS
  useEffect(() => {
    document.body.classList.add('overlay-body');
    document.documentElement.classList.add('overlay-html');
    return () => {
      document.body.classList.remove('overlay-body');
      document.documentElement.classList.remove('overlay-html');
    };
  }, []);

  // Merge URL search parameters with live synced settings
  // URL params take precedence for preset/styling if explicitly provided in the URL
  const effectiveSettings = useMemo(() => {
    const merged = { ...settings };

    const presetParam = searchParams.get('preset');
    if (presetParam) merged.preset = presetParam;

    const modeParam = searchParams.get('mode');
    if (modeParam === 'boss-slain' || modeParam === 'boss') {
      merged.overlayMode = 'boss-slain';
    } else if (modeParam === 'both') {
      merged.overlayMode = 'both';
      merged.showBossKills = true;
    } else if (modeParam === 'deaths') {
      merged.overlayMode = 'deaths';
    }

    const bossKillsParam = searchParams.get('bossKills');
    if (bossKillsParam !== null) {
      merged.showBossKills = bossKillsParam === 'true' || bossKillsParam === '1';
    }

    const scaleParam = searchParams.get('scale');
    if (scaleParam && !isNaN(Number(scaleParam))) merged.scale = Number(scaleParam);

    const fontParam = searchParams.get('fontSize');
    if (fontParam && !isNaN(Number(fontParam))) merged.fontSize = Number(fontParam);

    const colorParam = searchParams.get('goldColor');
    if (colorParam) merged.goldColor = colorParam.startsWith('#') ? colorParam : `#${colorParam}`;

    const glowParam = searchParams.get('glowIntensity');
    if (glowParam && !isNaN(Number(glowParam))) merged.glowIntensity = Number(glowParam);

    const labelParam = searchParams.get('label');
    if (labelParam !== null) merged.labelVisible = labelParam === 'true' || labelParam === '1';

    const runeParam = searchParams.get('rune');
    if (runeParam !== null) merged.runeVisible = runeParam === 'true' || runeParam === '1';

    const sessionParam = searchParams.get('session');
    if (sessionParam !== null) merged.sessionCountVisible = sessionParam === 'true' || sessionParam === '1';

    const bossParam = searchParams.get('boss');
    if (bossParam !== null) merged.bossAttemptsInOverlay = bossParam === 'true' || bossParam === '1';

    return merged;
  }, [settings, searchParams]);

  const bossAttempts = currentBoss ? (bosses[currentBoss] || 0) : 0;

  return (
    <div className="overlay-page">
      <DeathCounter
        deaths={deaths}
        bossKills={bossKills}
        settings={effectiveSettings}
        deathAnim={deathAnim}
        bossSlainAnim={bossSlainAnim}
        sessionDeaths={sessionDeaths}
        currentBoss={currentBoss}
        bossAttempts={bossAttempts}
      />
    </div>
  );
}
