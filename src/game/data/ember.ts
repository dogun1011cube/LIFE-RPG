import { VOLCANO } from '../world/Terrain';

/** 잿불 섬 points: the three obsidian braziers on the volcano slopes and the lava pools in the crater. */
export const BRAZIERS = [0.5, 2.6, 4.7].map((a, i) => ({ id: i, x: VOLCANO.x + Math.cos(a) * 42, z: VOLCANO.z + Math.sin(a) * 42 }));

export const LAVA_POOLS = [1.1, 3.2, 5.3].map((a) => ({ x: VOLCANO.x + Math.cos(a) * 11.5, z: VOLCANO.z + Math.sin(a) * 11.5, r: 2.6 }));

/** Charcoal needed to light one brazier. */
export const BRAZIER_COST = 2;
