export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  mouseSensitivity: number; // 0.2 .. 3
  invertY: boolean;
  quality: Quality;
  volume: number; // 0 .. 1
  showFps: boolean;
  cameraDistance: number;
}

export interface QualityProfile {
  pixelRatio: number;
  shadows: boolean;
  shadowSize: number;
  grassRadius: number;
  grassDensity: number;
  viewDistance: number;
  maxEnemies: number;
}

const KEY = 'eternum_settings_v1';

export const DEFAULT_SETTINGS: Settings = {
  mouseSensitivity: 1,
  invertY: false,
  quality: 'medium',
  volume: 0.7,
  showFps: false,
  cameraDistance: 6.5,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function qualityProfile(q: Quality): QualityProfile {
  const dpr = window.devicePixelRatio || 1;
  switch (q) {
    case 'low':
      return { pixelRatio: 1, shadows: false, shadowSize: 1024, grassRadius: 28, grassDensity: 0.45, viewDistance: 260, maxEnemies: 9 };
    case 'high':
      return { pixelRatio: Math.min(dpr, 2), shadows: true, shadowSize: 2048, grassRadius: 58, grassDensity: 1, viewDistance: 460, maxEnemies: 14 };
    default:
      return { pixelRatio: Math.min(dpr, 1.25), shadows: true, shadowSize: 1024, grassRadius: 42, grassDensity: 0.7, viewDistance: 360, maxEnemies: 12 };
  }
}
