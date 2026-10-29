import React, { useState } from 'react';
import { Swords, Plus, Undo2, RotateCcw, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { DEFAULT_BOSSES } from '../lib/defaults';

export default function BossTracker({
  bosses,
  currentBoss,
  onAddAttempt,
  onUndoAttempt,
  onResetAttempts,
  onSelectBoss,
  onAddCustomBoss,
  onRemoveBoss,
}) {
  const [newBossName, setNewBossName] = useState('');
  const [showAllBosses, setShowAllBosses] = useState(false);
  const [confirmReset, setConfirmReset] = useState('');

  const bossNames = Object.keys(bosses);
  const hasAnyBosses = bossNames.length > 0;
  const displayedBosses = showAllBosses ? bossNames : bossNames.slice(0, 5);

  const handleAddCustom = () => {
    if (newBossName.trim()) {
      onAddCustomBoss(newBossName.trim());
      setNewBossName('');
    }
  };

  const handleAddDefault = (name) => {
    onAddCustomBoss(name);
    onSelectBoss(name);
  };

  const handleResetAttempts = (bossName) => {
    if (confirmReset === bossName) {
      onResetAttempts(bossName);
      setConfirmReset('');
    } else {
      setConfirmReset(bossName);
      setTimeout(() => setConfirmReset(''), 3000);
    }
  };

  return (
    <div className="boss-tracker">
      <h3 className="panel-title">
        <Swords size={16} />
        Boss Attempts
      </h3>

      {/* Current boss */}
      {currentBoss && (
        <div className="boss-tracker__current">
          <div className="boss-tracker__current-name">{currentBoss}</div>
          <div className="boss-tracker__current-count">{bosses[currentBoss] || 0} attempts</div>
          <div className="boss-tracker__current-actions">
            <button className="btn btn--sm btn--death" onClick={() => onAddAttempt(currentBoss)}>
              <Plus size={14} /> Attempt
            </button>
            <button
              className="btn btn--sm btn--secondary"
              onClick={() => onUndoAttempt(currentBoss)}
              disabled={!bosses[currentBoss]}
            >
              <Undo2 size={14} />
            </button>
            <button
              className={`btn btn--sm btn--danger ${confirmReset === currentBoss ? 'btn--confirm' : ''}`}
              onClick={() => handleResetAttempts(currentBoss)}
            >
              <RotateCcw size={14} />
              {confirmReset === currentBoss ? ' Confirm?' : ''}
            </button>
          </div>
        </div>
      )}

      {/* Boss list */}
      {hasAnyBosses && (
        <div className="boss-tracker__list">
          {displayedBosses.map((name) => (
            <div
              key={name}
              className={`boss-tracker__item ${currentBoss === name ? 'boss-tracker__item--active' : ''}`}
              onClick={() => onSelectBoss(name)}
            >
              <span className="boss-tracker__item-name">{name}</span>
              <span className="boss-tracker__item-count">{bosses[name] || 0}</span>
              <button
                className="boss-tracker__item-remove"
                onClick={(e) => { e.stopPropagation(); onRemoveBoss(name); }}
                title="Remove boss"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {bossNames.length > 5 && (
            <button className="btn btn--sm btn--ghost" onClick={() => setShowAllBosses(!showAllBosses)}>
              {showAllBosses ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showAllBosses ? 'Show less' : `Show all (${bossNames.length})`}
            </button>
          )}
        </div>
      )}

      {/* Add custom boss */}
      <div className="boss-tracker__add">
        <input
          type="text"
          className="input"
          placeholder="Enter boss name..."
          value={newBossName}
          onChange={(e) => setNewBossName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
        />
        <button className="btn btn--sm btn--secondary" onClick={handleAddCustom} disabled={!newBossName.trim()}>
          <Plus size={14} /> Add
        </button>
      </div>

      {/* Quick add defaults */}
      {!hasAnyBosses && (
        <div className="boss-tracker__defaults">
          <div className="boss-tracker__defaults-label">Quick add:</div>
          <div className="boss-tracker__defaults-grid">
            {DEFAULT_BOSSES.slice(0, 8).map((name) => (
              <button
                key={name}
                className="btn btn--xs btn--ghost"
                onClick={() => handleAddDefault(name)}
              >
                {name.split(',')[0]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
