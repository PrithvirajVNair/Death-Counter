import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skull, ExternalLink, Swords, Shield, Zap } from 'lucide-react';
import '../styles/global.css';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      {/* Floating embers */}
      <HomeEmbers />

      <div className="home-content">
        {/* Rune emblem */}
        <div className="home-emblem">
          <svg viewBox="0 0 200 200" width="160" height="160" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="100" cy="100" r="90" stroke="#C8A65D" strokeWidth="1" opacity="0.3" />
            <circle cx="100" cy="100" r="75" stroke="#C8A65D" strokeWidth="0.8" opacity="0.2" />
            <circle cx="100" cy="100" r="60" stroke="#C8A65D" strokeWidth="0.6" opacity="0.15" />
            <line x1="100" y1="15" x2="100" y2="185" stroke="#C8A65D" strokeWidth="0.5" opacity="0.15" />
            <line x1="15" y1="100" x2="185" y2="100" stroke="#C8A65D" strokeWidth="0.5" opacity="0.15" />
            <line x1="30" y1="30" x2="170" y2="170" stroke="#C8A65D" strokeWidth="0.4" opacity="0.1" />
            <line x1="170" y1="30" x2="30" y2="170" stroke="#C8A65D" strokeWidth="0.4" opacity="0.1" />
            <polygon points="100,30 115,65 100,55 85,65" fill="#C8A65D" opacity="0.5" />
            <polygon points="100,170 115,135 100,145 85,135" fill="#C8A65D" opacity="0.5" />
            <polygon points="30,100 65,85 55,100 65,115" fill="#C8A65D" opacity="0.4" />
            <polygon points="170,100 135,85 145,100 135,115" fill="#C8A65D" opacity="0.4" />
            <circle cx="100" cy="100" r="8" fill="#C8A65D" opacity="0.6" />
            <circle cx="100" cy="100" r="4" fill="#C8A65D" opacity="0.9" />
          </svg>
        </div>

        <h1 className="home-title">Death Counter</h1>
        <p className="home-subtitle">Souls Game Chronicle</p>
        <p className="home-description">
          Track your deaths and boss kills across dangerous realms.<br />
          A premium OBS streaming overlay for Souls games.
        </p>

        <div className="home-actions">
          <button className="btn btn--primary btn--lg" onClick={() => navigate('/controller')}>
            <Skull size={20} />
            Open Controller
          </button>
          <button className="btn btn--ghost btn--lg" onClick={() => navigate('/overlay')}>
            <ExternalLink size={18} />
            View Overlay
          </button>
        </div>

        <div className="home-features">
          <div className="home-feature">
            <div className="home-feature__icon"><Swords size={20} /></div>
            <h3 className="home-feature__title">6 Overlay Presets</h3>
            <p className="home-feature__desc">From minimal to ornamental, find the perfect style.</p>
          </div>
          <div className="home-feature">
            <div className="home-feature__icon"><Shield size={20} /></div>
            <h3 className="home-feature__title">Boss Slain Counter</h3>
            <p className="home-feature__desc">Record every vanquished foe alongside your death tally.</p>
          </div>
          <div className="home-feature">
            <div className="home-feature__icon"><Zap size={20} /></div>
            <h3 className="home-feature__title">Real-Time Sync</h3>
            <p className="home-feature__desc">Controller and overlay sync instantly via BroadcastChannel.</p>
          </div>
        </div>
      </div>

      <footer className="home-footer">
        <p>Designed for OBS Studio • Not affiliated with any brand</p>
        <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', marginTop: '10px', fontSize: '12px' }}>
          <button
            type="button"
            onClick={() => navigate('/privacy')}
            style={{ background: 'none', border: 'none', color: 'var(--gold, #C8A65D)', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', padding: 0 }}
          >
            Privacy Policy
          </button>
          <span style={{ color: 'var(--text-dim, #5C5647)' }}>•</span>
          <button
            type="button"
            onClick={() => navigate('/terms')}
            style={{ background: 'none', border: 'none', color: 'var(--gold, #C8A65D)', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', padding: 0 }}
          >
            Terms of Service
          </button>
        </div>
      </footer>
    </div>
  );
}

function HomeEmbers({ count = 12 }) {
  const positions = useMemo(() =>
    Array.from({ length: count }, () => ({
      left: `${5 + Math.random() * 90}%`,
      animationDelay: `${Math.random() * 6}s`,
      animationDuration: `${4 + Math.random() * 4}s`,
    })),
    [count]
  );

  return (
    <div className="embers" aria-hidden="true">
      {positions.map((style, i) => (
        <div key={i} className="ember" style={style} />
      ))}
    </div>
  );
}

