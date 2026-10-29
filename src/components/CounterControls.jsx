import React, { useState } from 'react';
import { Skull, Undo2, RotateCcw, Swords, Copy, ExternalLink, Edit3, Check, X } from 'lucide-react';
import { showToast } from './Toast';

export default function CounterControls({
  deaths,
  sessionDeaths,
  allTimeDeaths,
  onAdd,
  onUndo,
  onReset,
  onSetDeathCount,
  bossKills = 0,
  onAddBossKill,
  onUndoBossKill,
  onResetBossKills,
  onSetBossKillCount,
  sessionCountVisible,
  preset = 'classic-rune',
  goldColor,
}) {
  const [showConfirmDeath, setShowConfirmDeath] = useState(false);
  const [showConfirmBoss, setShowConfirmBoss] = useState(false);

  const [isEditingDeath, setIsEditingDeath] = useState(false);
  const [deathInput, setDeathInput] = useState('');

  const [isEditingBoss, setIsEditingBoss] = useState(false);
  const [bossInput, setBossInput] = useState('');

  const origin = typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('undefined')
    ? window.location.origin
    : 'https://soulgamedc-rosy.vercel.app';
  const colorParam = goldColor ? `&goldColor=${encodeURIComponent(goldColor)}` : '';
  const bossOverlayUrl = `${origin}/overlay?preset=${preset}&mode=boss-slain${colorParam}`;
  const deathOverlayUrl = `${origin}/overlay?preset=${preset}${colorParam}`;

  const handleCopyBossUrl = () => {
    navigator.clipboard.writeText(bossOverlayUrl).then(
      () => showToast('Boss Slain OBS Overlay URL copied! Paste into OBS Browser Source'),
      () => showToast('Failed to copy URL', 'error')
    );
  };

  const handleCopyDeathUrl = () => {
    navigator.clipboard.writeText(deathOverlayUrl).then(
      () => showToast('Death OBS Overlay URL copied! Paste into OBS Browser Source'),
      () => showToast('Failed to copy URL', 'error')
    );
  };

  const handleResetDeath = () => {
    if (showConfirmDeath) {
      onReset();
      setShowConfirmDeath(false);
    } else {
      setShowConfirmDeath(true);
      setTimeout(() => setShowConfirmDeath(false), 3000);
    }
  };

  const handleResetBoss = () => {
    if (showConfirmBoss) {
      onResetBossKills && onResetBossKills();
      setShowConfirmBoss(false);
    } else {
      setShowConfirmBoss(true);
      setTimeout(() => setShowConfirmBoss(false), 3000);
    }
  };

  const handleSaveDeath = (e) => {
    e.preventDefault();
    const val = parseInt(deathInput, 10);
    if (isNaN(val) || val < 0) {
      showToast('Please enter a valid non-negative number', 'error');
      return;
    }
    if (onSetDeathCount) {
      onSetDeathCount(val);
      setIsEditingDeath(false);
      showToast(`Death counter set to ${val}`);
    }
  };

  const handleSaveBoss = (e) => {
    e.preventDefault();
    const val = parseInt(bossInput, 10);
    if (isNaN(val) || val < 0) {
      showToast('Please enter a valid non-negative number', 'error');
      return;
    }
    if (onSetBossKillCount) {
      onSetBossKillCount(val);
      setIsEditingBoss(false);
      showToast(`Boss Slain counter set to ${val}`);
    }
  };

  return (
    <div className="counter-controls-wrapper">
      {/* ─── Deaths Counter ─── */}
      <div className="counter-controls">
        <div className="counter-controls__display">
          {isEditingDeath ? (
            <form onSubmit={handleSaveDeath} className="counter-controls__edit-form">
              <div className="counter-controls__input-row">
                <input
                  type="number"
                  min="0"
                  max="999999"
                  className="counter-controls__number-input"
                  value={deathInput}
                  onChange={(e) => setDeathInput(e.target.value)}
                  autoFocus
                  placeholder="Count"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setIsEditingDeath(false);
                  }}
                  aria-label="Set custom death count"
                />
                <button type="submit" className="btn btn--primary btn--sm" title="Apply count">
                  <Check size={14} />
                  <span>Set</span>
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setIsEditingDeath(false)}
                  title="Cancel"
                >
                  <X size={14} />
                </button>
              </div>
            </form>
          ) : (
            <div
              className="counter-controls__count counter-controls__count--clickable"
              onClick={() => {
                setDeathInput(String(deaths));
                setIsEditingDeath(true);
              }}
              title="Click to type a custom death value"
            >
              <span>{deaths}</span>
              <span className="counter-controls__edit-badge" title="Type custom value">
                <Edit3 size={13} />
              </span>
            </div>
          )}

          <div className="counter-controls__label">Death</div>
          {sessionCountVisible && (
            <div className="counter-controls__stats">
              <span className="counter-controls__stat">Session: {sessionDeaths}</span>
              <span className="counter-controls__stat-divider">•</span>
              <span className="counter-controls__stat">All Time: {allTimeDeaths}</span>
            </div>
          )}
        </div>

        <div className="counter-controls__buttons">
          <button className="btn btn--death" onClick={onAdd} id="btn-add-death" title="Increment death count (F8)">
            <Skull size={18} />
            <span>+1 Death</span>
          </button>
          <button className="btn btn--secondary" onClick={onUndo} disabled={deaths <= 0} id="btn-undo">
            <Undo2 size={16} />
            <span>Undo</span>
          </button>
          <button
            className={`btn btn--danger ${showConfirmDeath ? 'btn--confirm' : ''}`}
            onClick={handleResetDeath}
            id="btn-reset"
          >
            <RotateCcw size={16} />
            <span>{showConfirmDeath ? 'Confirm?' : 'Reset'}</span>
          </button>
        </div>

        <div className="counter-controls__quick-obs">
          <button
            type="button"
            className="btn btn--xs btn--secondary"
            onClick={handleCopyDeathUrl}
            title="Copy Death OBS Browser Source URL"
          >
            <Copy size={12} />
            <span>Copy Death OBS URL</span>
          </button>
          <button
            type="button"
            className="btn btn--xs btn--icon"
            onClick={() => window.open(deathOverlayUrl, '_blank')}
            title="Preview Death overlay in new tab"
          >
            <ExternalLink size={12} />
          </button>
        </div>
      </div>

      {/* ─── Boss Slain / Kill Counter ─── */}
      <div className="counter-controls counter-controls--boss">
        <div className="counter-controls__display">
          {isEditingBoss ? (
            <form onSubmit={handleSaveBoss} className="counter-controls__edit-form">
              <div className="counter-controls__input-row">
                <input
                  type="number"
                  min="0"
                  max="999999"
                  className="counter-controls__number-input counter-controls__number-input--gold"
                  value={bossInput}
                  onChange={(e) => setBossInput(e.target.value)}
                  autoFocus
                  placeholder="Count"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setIsEditingBoss(false);
                  }}
                  aria-label="Set custom boss slain count"
                />
                <button type="submit" className="btn btn--gold btn--sm" title="Apply count">
                  <Check size={14} />
                  <span>Set</span>
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setIsEditingBoss(false)}
                  title="Cancel"
                >
                  <X size={14} />
                </button>
              </div>
            </form>
          ) : (
            <div
              className="counter-controls__count counter-controls__count--gold counter-controls__count--clickable"
              onClick={() => {
                setBossInput(String(bossKills));
                setIsEditingBoss(true);
              }}
              title="Click to type a custom boss slain value"
            >
              <span>{bossKills}</span>
              <span className="counter-controls__edit-badge counter-controls__edit-badge--gold" title="Type custom value">
                <Edit3 size={13} />
              </span>
            </div>
          )}

          <div className="counter-controls__label counter-controls__label--gold">Boss Slain</div>
        </div>

        <div className="counter-controls__buttons">
          <button className="btn btn--gold" onClick={onAddBossKill} id="btn-add-boss-kill" title="Increment boss kills (F9)">
            <Swords size={18} />
            <span>+1 Boss Slain</span>
          </button>
          <button className="btn btn--secondary" onClick={onUndoBossKill} disabled={bossKills <= 0} id="btn-undo-boss">
            <Undo2 size={16} />
            <span>Undo</span>
          </button>
          <button
            className={`btn btn--danger ${showConfirmBoss ? 'btn--confirm' : ''}`}
            onClick={handleResetBoss}
            id="btn-reset-boss"
          >
            <RotateCcw size={16} />
            <span>{showConfirmBoss ? 'Confirm?' : 'Reset'}</span>
          </button>
        </div>

        <div className="counter-controls__quick-obs">
          <button
            type="button"
            className="btn btn--xs btn--gold"
            onClick={handleCopyBossUrl}
            title="Copy Boss Slain OBS Browser Source URL"
          >
            <Copy size={12} />
            <span>Copy Boss Slain OBS URL</span>
          </button>
          <button
            type="button"
            className="btn btn--xs btn--icon"
            onClick={() => window.open(bossOverlayUrl, '_blank')}
            title="Preview Boss Slain overlay in new tab"
          >
            <ExternalLink size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
