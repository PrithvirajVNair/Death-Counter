import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, Lock, Database, EyeOff, Scale } from 'lucide-react';
import '../styles/global.css';
import '../styles/legal.css';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="legal-page">
      <LegalEmbers />

      <div className="legal-container">
        {/* Header navigation */}
        <div className="legal-nav">
          <button className="btn btn--secondary" onClick={() => navigate('/controller')}>
            <ArrowLeft size={16} />
            <span>Back to Controller</span>
          </button>
          <button className="btn btn--ghost" onClick={() => navigate('/')}>
            <span>Home</span>
          </button>
        </div>

        {/* Header */}
        <header className="legal-header">
          <div className="legal-icon">
            <ShieldCheck size={36} color="var(--gold)" />
          </div>
          <h1 className="legal-title">Privacy Policy</h1>
          <p className="legal-subtitle">Souls Game Death Counter • Effective October 2026</p>
          <div className="legal-badge">
            <span>Zero Tracking • No Accounts • Local-First Architecture</span>
          </div>
        </header>

        {/* Content */}
        <div className="legal-card">
          <section className="legal-section">
            <h2 className="legal-section__title">
              <EyeOff size={18} color="var(--gold)" />
              1. Our Core Privacy Philosophy
            </h2>
            <p>
              Souls Game Death Counter is built as a transparent, client-centric utility for streamers and gamers.
              We firmly believe you should not have to sacrifice privacy to track your gaming journey.
            </p>
            <ul className="legal-list">
              <li><strong>No User Accounts:</strong> You do not need an email, password, or registration to use this tool locally.</li>
              <li><strong>No Advertisements:</strong> We do not run ad networks, marketing pixels, or third-party behavioral trackers.</li>
              <li><strong>No Personal Data Harvesting:</strong> We do not log IP addresses, names, locations, or hardware fingerprints.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2 className="legal-section__title">
              <Database size={18} color="var(--gold)" />
              2. Data We Store & How It Is Used
            </h2>
            <p>The application only processes gameplay tallies strictly required to operate the overlay and controller:</p>
            <ul className="legal-list">
              <li>
                <strong>Gameplay Counts:</strong> Death count, session deaths, all-time deaths, and boss slain tallies.
                These are saved directly in your web browser&apos;s <code>localStorage</code>.
              </li>
              <li>
                <strong>Visual Customizations:</strong> Your selected overlay preset, rune colors, font sizes, glow intensity, and layout.
                These settings never leave your browser unless synchronized to your own OBS Browser Source.
              </li>
              <li>
                <strong>Overlay Synchronization:</strong> To allow your local controller page to update your OBS Browser Source in real time,
                counts are transmitted over an ephemeral synchronized endpoint. No identifying personal information is included in these packets.
              </li>
            </ul>
          </section>

          <section className="legal-section">
            <h2 className="legal-section__title">
              <Lock size={18} color="var(--gold)" />
              3. Cookies & Local Storage
            </h2>
            <p>
              We do not use tracking or advertising cookies. We utilize standard HTML5 <code>localStorage</code> solely to preserve
              your death counts and overlay configurations across browser reloads. You may wipe this data at any time via the Controller
              Settings (<em>Data → Reset All Data</em>) or by clearing your browser cache.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section__title">
              <Scale size={18} color="var(--gold)" />
              4. Open-Source Transparency & Contact
            </h2>
            <p>
              This project is published under the open-source MIT License. You are welcome to audit, fork, or self-host
              the repository on your own server.
            </p>
            <p style={{ marginTop: '8px' }}>
              For questions, audit inquiries, or issue reporting, please visit our public GitHub repository at{' '}
              <a
                href="https://github.com/PrithvirajVNair/Death-Counter"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--gold)', textDecoration: 'underline' }}
              >
                github.com/PrithvirajVNair/Death-Counter
              </a>.
            </p>
          </section>
        </div>

        {/* Footer */}
        <footer className="legal-footer">
          <p>Souls Game Death Counter • An Independent Open-Source Project</p>
          <div className="legal-footer__links">
            <span onClick={() => navigate('/terms')} style={{ cursor: 'pointer', color: 'var(--gold)', textDecoration: 'underline' }}>
              Terms of Service
            </span>
            <span>•</span>
            <span onClick={() => navigate('/controller')} style={{ cursor: 'pointer', color: 'var(--gold)', textDecoration: 'underline' }}>
              Controller
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function LegalEmbers({ count = 10 }) {
  const positions = useMemo(() =>
    Array.from({ length: count }, () => ({
      left: `${5 + Math.random() * 90}%`,
      animationDelay: `${Math.random() * 6}s`,
      animationDuration: `${5 + Math.random() * 5}s`,
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
