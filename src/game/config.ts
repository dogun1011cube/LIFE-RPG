// Global tuning constants. Gameplay data (items, enemies, recipes...) lives in ./data.

export const WORLD = {
  size: 800, // world spans [-400, 400] on X and Z
  res: 320, // terrain grid resolution (cells per side)
  waterLevel: 0,
  defaultSeed: 20251125,
};

export const SPAWN = { x: 0, z: 150 };

export const BUILD = {
  grid: 2, // building grid cell size (m)
  level: 2.5, // wall height (m)
  floorT: 0.2,
  wallT: 0.2,
  reach: 14, // max placement distance from camera
};

export const PLAYER = {
  radius: 0.35,
  height: 1.8,
  walkSpeed: 4.8,
  runSpeed: 8.0,
  swimSpeed: 2.6,
  jumpVel: 7.4,
  gravity: 22,
  stepHeight: 0.5,
};

export const DAY = {
  lengthSec: 720, // real seconds for a full 24h cycle (night runs faster, see Environment)
  startTime: 0.3, // 07:12
};

export const SAVE_VERSION = 2;
export const SAVE_SLOTS = 3;
