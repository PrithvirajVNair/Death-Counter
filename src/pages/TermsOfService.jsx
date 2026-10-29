import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scale, ArrowLeft, Shield, AlertTriangle, FileText, CheckCircle, Code } from 'lucide-react';
import '../styles/global.css';
import '../styles/legal.css';

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="legal-page">
      <LegalEmbers />

      <div className="legal-container">
        {/* Navigation */}
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
            <Scale size={36} color="var(--gold)" />
          </div>
          <h1 className="legal-title">Terms of Service</h1>
          <p className="legal-subtitle">Souls Game Death Counter • Effective October 2026</p>
          <div className="legal-badge" style={{ color: 'var(--gold-bright)', borderColor: 'rgba(200, 166, 93, 0.4)', background: 'rgba(200, 166, 93, 0.1)' }}>
            <span>Free & Open Source Software • MIT License</span>
          </div>
        </header>

        {/* Content */}
        <div className="legal-card">
          <section className="legal-section">
            <h2 className="legal-section__title">
              <FileText size={18} color="var(--gold)" />
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing, browsing, downloading, or using the <strong>Souls Game Death Counter</strong> web overlay,
              the browser controller, or the companion desktop application, you agree to be bound by these Terms of Service.
              If you do not agree to these terms, please discontinue use of this software.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section__title">
              <Code size={18} color="var(--gold)" />
              2. Open-Source License & Permitted Use
            </h2>
            <p>
              Souls Game Death Counter is distributed freely under the <strong>MIT License</strong>.
              You are granted permission to:
            </p>
            <ul className="legal-list">
              <li>Use the software for personal gameplay tracking, streaming (Twitch, YouTube, Kick, etc.), and content creation.</li>
              <li>Include the overlay in live broadcasts, video recordings, and esports competitions without paying royalties or fees.</li>
              <li>Inspect, modify, adapt, or self-host the source code in accordance with the MIT License terms.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2 className="legal-section__title">
              <Shield size={18} color="var(--gold)" />
              3. Companion Desktop Utility & Anti-Cheat Safety
            </h2>
            <p>
              The native Windows hotkey utility (<code>DeathCounterHotkeys.exe</code> / <code>hotkeys.ahk</code>) is designed to operate safely
              alongside video games:
            </p>
            <ul className="legal-list">
              <li>
                <strong>No Game Memory Modification:</strong> The software does not read, inject into, hook, or modify game memory (RAM),
                game files, or executable processes.
              </li>
              <li>
                <strong>No Game Automation:</strong> The utility does not generate automated in-game macros, botting scripts, or game inputs.
                It only captures user keystrokes assigned to update the death counter tally.
              </li>
              <li>
                <strong>User Responsibility:</strong> While standard global hotkey listeners are universally permitted in single-player and
                streaming setups, users are responsible for complying with the specific rules and terms of any competitive multiplayer games they play.
              </li>
            </ul>
          </section>

          <section className="legal-section">
            <h2 className="legal-section__title">
              <AlertTriangle size={18} color="var(--gold)" />
              4. Disclaimer of Warranties & Limitation of Liability
            </h2>
            <p>
              THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
              TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT.
            </p>
            <p style={{ marginTop: '8px' }}>
              IN NO EVENT SHALL THE AUTHORS, CONTRIBUTORS, OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY,
              WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE
              USE OR OTHER DEALINGS IN THE SOFTWARE.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section__title">
              <CheckCircle size={18} color="var(--gold)" />
              5. Trademark & Fair Use Disclaimer
            </h2>
            <p>
              &quot;Dark Souls&quot;, &quot;Elden Ring&quot;, &quot;Bloodborne&quot;, &quot;Demon&apos;s Souls&quot;, and &quot;Sekiro&quot; are registered trademarks
              of FromSoftware, Inc. and Bandai Namco Entertainment Inc.
            </p>
            <p style={{ marginTop: '8px' }}>
              Souls Game Death Counter is an independent, non-commercial fan-created streaming tool and is not affiliated with, endorsed by,
              or sponsored by FromSoftware, Bandai Namco, Sony Interactive Entertainment, or any related entity.
            </p>
          </section>
        </div>

        {/* Footer */}
        <footer className="legal-footer">
          <p>Souls Game Death Counter • Free & Open Source Software</p>
          <div className="legal-footer__links">
            <span onClick={() => navigate('/privacy')} style={{ cursor: 'pointer', color: 'var(--gold)', textDecoration: 'underline' }}>
              Privacy Policy
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
