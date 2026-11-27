import { BUILD } from '../config';
import { BUILDABLE_BY_ID } from '../data/buildables';
import type { Cost } from '../data/recipes';

/**
 * Blueprints: saved groups of building pieces, stored per browser (shared by all save slots)
 * so a design made in one world can be reused in another.
 */
export interface BlueprintPiece {
  type: string;
  dx: number;
  dy: number;
  dz: number;
  rot: number;
}

export interface Blueprint {
  id: string;
  name: string;
  pieces: BlueprintPiece[];
  createdAt: number;
  builtin?: boolean;
}

const KEY = 'eternum_blueprints_v1';
const G = BUILD.grid;
const L = BUILD.level;

/** A ready-made 2x2 cottage so new players can try blueprint placement right away. */
const COTTAGE: Blueprint = {
  id: 'builtin_cottage',
  name: '작은 오두막',
  builtin: true,
  createdAt: 0,
  pieces: [
    ...[
      [1, 1],
      [3, 1],
      [1, 3],
      [3, 3],
    ].map(([x, z]) => ({ type: 'wood_foundation', dx: x, dy: 0, dz: z, rot: 0 })),
    { type: 'wood_wall', dx: 1, dy: 0, dz: 0, rot: 0 },
    { type: 'wood_doorway', dx: 3, dy: 0, dz: 0, rot: 0 },
    { type: 'wood_door', dx: 3, dy: 0, dz: 0, rot: 0 },
    { type: 'wood_wall', dx: 1, dy: 0, dz: 4, rot: 0 },
    { type: 'wood_window', dx: 3, dy: 0, dz: 4, rot: 0 },
    { type: 'wood_wall', dx: 0, dy: 0, dz: 1, rot: Math.PI / 2 },
    { type: 'wood_wall', dx: 0, dy: 0, dz: 3, rot: Math.PI / 2 },
    { type: 'wood_wall', dx: 4, dy: 0, dz: 1, rot: Math.PI / 2 },
    { type: 'wood_window', dx: 4, dy: 0, dz: 3, rot: Math.PI / 2 },
    { type: 'wood_roof', dx: 1, dy: L, dz: 1, rot: 0 },
    { type: 'wood_roof', dx: 3, dy: L, dz: 1, rot: 0 },
    { type: 'wood_roof', dx: 1, dy: L, dz: 3, rot: Math.PI },
    { type: 'wood_roof', dx: 3, dy: L, dz: 3, rot: Math.PI },
    { type: 'wood_gable', dx: 0, dy: L, dz: 1, rot: -Math.PI / 2 },
    { type: 'wood_gable', dx: 0, dy: L, dz: 3, rot: Math.PI / 2 },
    { type: 'wood_gable', dx: 4, dy: L, dz: 1, rot: -Math.PI / 2 },
    { type: 'wood_gable', dx: 4, dy: L, dz: 3, rot: Math.PI / 2 },
    { type: 'bed', dx: 1, dy: 0, dz: 2.4, rot: 0 },
    { type: 'torch', dx: 3.3, dy: 0, dz: 3.4, rot: 0 },
  ],
};

export function loadBlueprints(): Blueprint[] {
  let mine: Blueprint[] = [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) mine = (JSON.parse(raw) as Blueprint[]).filter((b) => Array.isArray(b.pieces));
  } catch {
    /* ignore corrupt data */
  }
  return [COTTAGE, ...mine];
}

function storeMine(list: Blueprint[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.filter((b) => !b.builtin)));
  } catch {
    /* storage full / unavailable */
  }
}

export function saveBlueprint(bp: Blueprint) {
  const list = loadBlueprints().filter((b) => b.id !== bp.id);
  list.push(bp);
  storeMine(list);
}

export function deleteBlueprint(id: string) {
  storeMine(loadBlueprints().filter((b) => b.id !== id));
}

/** Build a blueprint from world pieces; the anchor is the grid corner below the group's minimum. */
export function makeBlueprint(name: string, pieces: { type: string; x: number; y: number; z: number; rot: number }[]): Blueprint {
  const ax = Math.floor(Math.min(...pieces.map((p) => p.x)) / G) * G;
  const az = Math.floor(Math.min(...pieces.map((p) => p.z)) / G) * G;
  const floors = pieces.filter((p) => BUILDABLE_BY_ID[p.type]?.shape === 'foundation');
  const ay = floors.length ? Math.min(...floors.map((p) => p.y)) : Math.min(...pieces.map((p) => p.y));
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return {
    id: `bp_${Date.now().toString(36)}`,
    name,
    createdAt: Date.now(),
    pieces: pieces.map((p) => ({ type: p.type, dx: r(p.x - ax), dy: r(p.y - ay), dz: r(p.z - az), rot: r(p.rot) })),
  };
}

/** Pieces in world space for an anchor (grid corner) and a number of quarter turns. */
export function transformBlueprint(bp: Blueprint, ax: number, ay: number, az: number, quarter: number) {
  const a = (quarter % 4) * (Math.PI / 2);
  const c = Math.round(Math.cos(a));
  const s = Math.round(Math.sin(a));
  return bp.pieces.map((p) => ({
    type: p.type,
    x: ax + p.dx * c + p.dz * s,
    y: ay + p.dy,
    z: az - p.dx * s + p.dz * c,
    rot: p.rot + a,
  }));
}

export function blueprintCost(bp: Blueprint): Cost[] {
  const m = new Map<string, number>();
  for (const p of bp.pieces) for (const c of BUILDABLE_BY_ID[p.type]?.cost ?? []) m.set(c.item, (m.get(c.item) ?? 0) + c.qty);
  return [...m.entries()].map(([item, qty]) => ({ item, qty }));
}
