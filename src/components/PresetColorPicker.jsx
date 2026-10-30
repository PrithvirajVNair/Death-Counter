import React, { useState, useEffect } from 'react';
import { Palette, RotateCcw, Check } from 'lucide-react';
import { SOULS_PALETTE, PRESET_LIST } from '../lib/defaults';

export default function PresetColorPicker({
  currentPreset = 'classic-rune',
  currentColor = '#C8A65D',
  onColorChange,
  onResetColor,
}) {
  const [hexInput, setHexInput] = useState(() => (currentColor || '#C8A65D').replace('#', ''));

  useEffect(() => {
    if (currentColor) {
      setHexInput(currentColor.replace('#', ''));
    }
  }, [currentColor]);

  const presetInfo = PRESET_LIST.find((p) => p.id === currentPreset) || {
    name: currentPreset.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  };

  const handleHexChange = (e) => {
    const raw = e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6);
    setHexInput(raw);
    if (raw.length === 6 || raw.length === 3) {
      onColorChange(`#${raw}`);
    }
  };

  const handleNativeColorInput = (e) => {
    const hex = e.target.value;
    setHexInput(hex.replace('#', ''));
    onColorChange(hex);
  };

  const activeColorNormalized = (currentColor || '#C8A65D').toUpperCase();

  return (
    <div className="preset-color-picker">
      <div className="preset-color-picker__header">
        <div className="preset-color-picker__title">
          <Palette size={16} style={{ color: currentColor }} />
          <span>
            Preset Color: <strong style={{ color: currentColor }}>{presetInfo.name}</strong>
          </span>
        </div>
        <button
          type="button"
          className="btn btn--xs btn--secondary"
          onClick={onResetColor}
          title={`Reset ${presetInfo.name} color to default`}
        >
          <RotateCcw size={12} />
          <span>Reset Default</span>
        </button>
      </div>

      <div className="preset-color-picker__controls">
        {/* Color preview swatch + native color picker trigger */}
        <div className="preset-color-picker__input-wrap">
          <label className="color-swatch-label" title="Click to open color picker">
            <input
              type="color"
              className="color-input-hidden"
              value={currentColor && currentColor.startsWith('#') && currentColor.length === 7 ? currentColor : '#C8A65D'}
              onChange={handleNativeColorInput}
            />
            <span
              className="color-swatch-preview"
              style={{
                backgroundColor: currentColor,
                boxShadow: `0 0 12px ${currentColor}60`,
              }}
            />
          </label>

          <div className="color-hex-input-wrap">
            <span className="color-hex-prefix">#</span>
            <input
              type="text"
              className="color-hex-input"
              value={hexInput}
              onChange={handleHexChange}
              placeholder="C8A65D"
              maxLength={6}
              spellCheck={false}
              aria-label="Hex color code"
            />
          </div>
        </div>

        {/* Quick Souls Theme Palette */}
        <div className="preset-color-picker__palette" aria-label="Souls color swatches">
          {SOULS_PALETTE.map((swatch) => {
            const isSelected = activeColorNormalized === swatch.hex.toUpperCase();
            return (
              <button
                key={swatch.hex}
                type="button"
                className={`palette-swatch-btn ${isSelected ? 'palette-swatch-btn--active' : ''}`}
                style={{
                  backgroundColor: swatch.hex,
                  boxShadow: isSelected ? `0 0 10px ${swatch.hex}` : undefined,
                }}
                onClick={() => onColorChange(swatch.hex)}
                title={`${swatch.name} (${swatch.hex})`}
              >
                {isSelected && <Check size={13} strokeWidth={3} color="#FFFFFF" />}
              </button>
            );
          })}
        </div>
      </div>

      <span className="setting-hint" style={{ display: 'block', marginTop: '8px' }}>
        Click the color box or choose a Souls swatch. Each preset saves its own custom color independently.
      </span>
    </div>
  );
}
