export const DEFAULT_PRESET_COLORS = {
  'classic-rune': '#C8A65D',
  'minimal': '#C8A65D',
  'ornamental-frame': '#C8A65D',
  'crimson-death': '#A82222',
  'vertical-rune': '#C8A65D',
  'landscape': '#C8A65D',
};

export const SOULS_PALETTE = [
  { name: 'Grace Gold', hex: '#C8A65D' },
  { name: 'Erdtree Amber', hex: '#E29D32' },
  { name: 'Blood Crimson', hex: '#A82222' },
  { name: 'Moonlight Silver', hex: '#9BB5C9' },
  { name: 'Ghostflame Cyan', hex: '#38BDF8' },
  { name: 'Abyssal Violet', hex: '#8B5CF6' },
  { name: 'Blight Green', hex: '#10B981' },
  { name: 'Bone White', hex: '#E2E8F0' },
];

export const DEFAULT_SETTINGS = {
  preset: 'classic-rune',
  fontSize: 72,
  labelVisible: true,
  runeVisible: true,
  goldColor: '#C8A65D',
  presetColors: { ...DEFAULT_PRESET_COLORS },
  glowIntensity: 0.6,
  alignment: 'center',
  layout: 'horizontal',
  frameVisible: true,
  animationsEnabled: true,
  animationIntensity: 0.7,
  padding: 20,
  scale: 1,
  sessionCountVisible: false,
  bossAttemptsInOverlay: false,
  showBossKills: false,
  overlayMode: 'deaths',
};

export const DEFAULT_SHORTCUTS = {
  addDeath: 'F8',
  undoDeath: 'F7',
  addBossKill: 'F9',
  undoBossKill: 'F10',
  enabled: true,
};

export const PRESET_LIST = [
  { id: 'classic-rune', name: 'Classic Rune', description: 'Circular golden rune emblem with ornamental lines' },
  { id: 'minimal', name: 'Minimal', description: 'Compact golden sigil with large number' },
  { id: 'ornamental-frame', name: 'Ornamental Frame', description: 'Decorative rectangular gold frame' },
  { id: 'crimson-death', name: 'Crimson Death', description: 'Gold typography with dark crimson accents' },
  { id: 'vertical-rune', name: 'Vertical Rune', description: 'Rune above number, vertical layout' },
  { id: 'landscape', name: 'Landscape', description: 'Compact atmospheric landscape treatment' },
];

export const DEFAULT_BOSSES = [
  'Margit, the Fell Omen',
  'Godrick the Grafted',
  'Rennala, Queen of the Full Moon',
  'Starscourge Radahn',
  'Morgott, the Omen King',
  'Maliketh, the Black Blade',
  'Malenia, Blade of Miquella',
  'Radagon of the Erdtree',
  'Fire Giant',
  'Godfrey, First Lord',
  'Rykard, Lord of Blasphemy',
  'Mohg, Lord of Blood',
  'Dragonlord Placidusax',
];

export const STORAGE_VERSION = 'v1';
export const STORAGE_PREFIX = `death-counter-${STORAGE_VERSION}`;
export const SYNC_CHANNEL_NAME = 'death-counter-sync';
