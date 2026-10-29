import React from 'react';
import { PRESET_LIST, DEFAULT_PRESET_COLORS } from '../lib/defaults';
import PresetColorPicker from './PresetColorPicker';

export default function PresetSelector({
  currentPreset = 'classic-rune',
  onSelect,
  currentColor = '#C8A65D',
  presetColors = {},
  onColorChange,
  onResetColor,
}) {
  return (
    <div className="preset-selector">
      <h3 className="panel-title">Overlay Preset</h3>
      <div className="preset-selector__grid">
        {PRESET_LIST.map((preset) => {
          const presetColor = presetColors[preset.id] || DEFAULT_PRESET_COLORS[preset.id] || '#C8A65D';
          const isActive = currentPreset === preset.id;
          return (
            <button
              key={preset.id}
              className={`preset-card ${isActive ? 'preset-card--active' : ''}`}
              onClick={() => onSelect(preset.id)}
              title={`${preset.name}: ${preset.description}`}
              style={isActive ? { borderColor: presetColor, boxShadow: `0 0 14px ${presetColor}25` } : undefined}
            >
              <div className="preset-card__icon" style={{ color: presetColor }}>
                <PresetIcon id={preset.id} color={presetColor} />
              </div>
              <div className="preset-card__name" style={isActive ? { color: presetColor } : undefined}>
                {preset.name}
              </div>
              <span
                className="preset-card__color-dot"
                style={{ backgroundColor: presetColor, boxShadow: `0 0 6px ${presetColor}` }}
                title={`Active color: ${presetColor}`}
              />
            </button>
          );
        })}
      </div>

      {/* Preset Color Customizer */}
      {onColorChange && (
        <PresetColorPicker
          currentPreset={currentPreset}
          currentColor={currentColor}
          onColorChange={onColorChange}
          onResetColor={onResetColor}
        />
      )}
    </div>
  );
}

function PresetIcon({ id, color = '#C8A65D' }) {
  switch (id) {
    case 'classic-rune':
      return (
        <svg viewBox="0 0 40 40" width="32" height="32" fill="none">
          <circle cx="20" cy="20" r="16" stroke={color} strokeWidth="1" opacity="0.5" />
          <circle cx="10" cy="20" r="1.5" fill={color} opacity="0.5" />
          <rect x="22" y="16" width="14" height="2" rx="1" fill={color} opacity="0.6" />
          <rect x="22" y="22" width="10" height="2" rx="1" fill={color} opacity="0.4" />
        </svg>
      );
    case 'minimal':
      return (
        <svg viewBox="0 0 40 40" width="32" height="32" fill="none">
          <circle cx="14" cy="20" r="4" stroke={color} strokeWidth="1" opacity="0.5" />
          <rect x="22" y="17" width="12" height="6" rx="1" fill={color} opacity="0.5" />
        </svg>
      );
    case 'ornamental-frame':
      return (
        <svg viewBox="0 0 40 40" width="32" height="32" fill="none">
          <rect x="4" y="8" width="32" height="24" rx="1" stroke={color} strokeWidth="1" opacity="0.4" />
          <line x1="8" y1="8" x2="8" y2="14" stroke={color} strokeWidth="1.5" opacity="0.6" />
          <line x1="4" y1="12" x2="10" y2="12" stroke={color} strokeWidth="1.5" opacity="0.6" />
          <rect x="14" y="16" width="12" height="8" rx="1" fill={color} opacity="0.4" />
        </svg>
      );
    case 'crimson-death':
      return (
        <svg viewBox="0 0 40 40" width="32" height="32" fill="none">
          <circle cx="14" cy="20" r="6" stroke="#762D2D" strokeWidth="1" opacity="0.5" />
          <circle cx="14" cy="20" r="2" fill="#762D2D" opacity="0.5" />
          <rect x="24" y="17" width="10" height="6" rx="1" fill={color} opacity="0.5" />
        </svg>
      );
    case 'vertical-rune':
      return (
        <svg viewBox="0 0 40 40" width="32" height="32" fill="none">
          <circle cx="20" cy="12" r="6" stroke={color} strokeWidth="1" opacity="0.5" />
          <rect x="14" y="22" width="12" height="6" rx="1" fill={color} opacity="0.5" />
          <rect x="16" y="30" width="8" height="3" rx="1" fill={color} opacity="0.3" />
        </svg>
      );
    case 'landscape':
      return (
        <svg viewBox="0 0 40 40" width="32" height="32" fill="none">
          <path d="M4 30 L12 18 L18 24 L26 14 L34 28 L38 30" stroke={color} strokeWidth="0.8" opacity="0.3" />
          <rect x="4" y="32" width="32" height="1" fill={color} opacity="0.2" />
          <rect x="14" y="34" width="12" height="4" rx="1" fill={color} opacity="0.4" />
        </svg>
      );
    default:
      return null;
  }
}
