import * as THREE from 'three';
import { BUILD } from '../config';
import type { BuildableDef } from '../data/buildables';
import { boxGeo, woodTexture, stoneTexture, roofTexture, clothTexture } from '../world/textures';
import { createCampfire, createChest, createFlame, type Flame } from '../world/props';
import type { Collider } from '../world/Colliders';

const G = BUILD.grid;
const L = BUILD.level;
const T = BUILD.wallT;

export type LocalCollider =
  | { kind: 'box'; min: [number, number, number]; max: [number, number, number] }
  | { kind: 'ramp'; minX: number; maxX: number; minZ: number; maxZ: number; y0: number; y1: number };

export interface PieceTemplate {
  parts: { geo: THREE.BufferGeometry; mat: THREE.Material; door?: boolean }[];
  /** Extra non-mergeable objects (campfire, chest...) built per instance. */
  custom?: () => { object: THREE.Object3D; flame?: Flame };
  colliders: LocalCollider[];
  doorColliders?: LocalCollider[];
  flame?: { pos: [number, number, number]; scale: number };
  light?: [number, number, number];
  bounds: THREE.Box3;
}

// ── Materials ───────────────────────────────────────────────
let MATS: Record<string, THREE.MeshStandardMaterial> | null = null;
function mats() {
  if (!MATS) {
    MATS = {
      wood: new THREE.MeshStandardMaterial({ color: 0xffffff, map: woodTexture('#a8743f'), roughness: 0.85 }),
      woodDark: new THREE.MeshStandardMaterial({ color: 0xffffff, map: woodTexture('#6a4426'), roughness: 0.9 }),
      stone: new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture('#a7a196'), roughness: 0.95 }),
      stoneDark: new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture('#7a756c'), roughness: 0.95 }),
      roof: new THREE.MeshStandardMaterial({ color: 0xffffff, map: roofTexture('#8a3e26'), roughness: 0.9 }),
      cloth: new THREE.MeshStandardMaterial({ color: 0xffffff, map: clothTexture('#e8dcc0'), roughness: 0.95 }),
      blanket: new THREE.MeshStandardMaterial({ color: 0xffffff, map: clothTexture('#9a2c2c'), roughness: 0.95 }),
      banner: new THREE.MeshStandardMaterial({ color: 0xffffff, map: clothTexture('#2c4a8a'), roughness: 0.95, side: THREE.DoubleSide }),
      gold: new THREE.MeshStandardMaterial({ color: 0xc9a45c, roughness: 0.4, metalness: 0.7 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.5, metalness: 0.6 }),
      glow: new THREE.MeshStandardMaterial({ color: 0xff8a3a, emissive: 0xff6a1a, emissiveIntensity: 1.5, roughness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xbfe3ff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.35 }),
      marble: new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture('#e9e3d6'), roughness: 0.55 }),
      marbleTrim: new THREE.MeshStandardMaterial({ color: 0xd9b56e, roughness: 0.35, metalness: 0.6 }),
      castle: new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture('#8f897e', true), roughness: 0.95 }),
      road: new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture('#8a847a'), roughness: 1 }),
      dirt: new THREE.MeshStandardMaterial({ color: 0x8a6e4a, roughness: 1 }),
      rug: new THREE.MeshStandardMaterial({ color: 0xffffff, map: clothTexture('#8a2a2a'), roughness: 1 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x4f8a34, roughness: 0.9, flatShading: true }),
      flower: new THREE.MeshStandardMaterial({ color: 0xe86a8a, roughness: 0.7 }),
      lamp: new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffb050, emissiveIntensity: 1.6 }),
      books: new THREE.MeshStandardMaterial({ color: 0x7a3a2a, roughness: 0.8 }),
      soil: new THREE.MeshStandardMaterial({ color: 0x5a3e26, roughness: 1 }),
      awning: new THREE.MeshStandardMaterial({ color: 0xffffff, map: clothTexture('#b8402e'), roughness: 0.95, side: THREE.DoubleSide }),
      awning2: new THREE.MeshStandardMaterial({ color: 0xffffff, map: clothTexture('#e8dcc0'), roughness: 0.95, side: THREE.DoubleSide }),
      fruit: new THREE.MeshStandardMaterial({ color: 0xe0642a, roughness: 0.6 }),
      rock: new THREE.MeshStandardMaterial({ color: 0x7d776c, roughness: 0.95, flatShading: true }),
    };
  }
  return MATS;
}

/** Box from min/max corners. */
function bx(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, unit = 2): THREE.BufferGeometry {
  const g = boxGeo(x1 - x0, y1 - y0, z1 - z0, unit);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

function col(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): LocalCollider {
  return { kind: 'box', min: [x0, y0, z0], max: [x1, y1, z1] };
}

function boundsOf(parts: { geo: THREE.BufferGeometry }[], extra?: THREE.Box3): THREE.Box3 {
  const b = new THREE.Box3();
  for (const p of parts) {
    p.geo.computeBoundingBox();
    b.union(p.geo.boundingBox!);
  }
  if (extra) b.union(extra);
  return b;
}

/** Main / trim materials per building material. */
function matsFor(def: BuildableDef) {
  const m = mats();
  if (def.material === 'marble') return { main: m.marble, dark: m.marbleTrim, base: m.marble, trim: true };
  if (def.material === 'stone') return { main: m.stone, dark: m.stoneDark, base: m.stone, trim: false };
  return { main: m.wood, dark: m.woodDark, base: m.woodDark, trim: true };
}

function wallParts(def: BuildableDef, pieces: [number, number, number, number][], trim: boolean) {
  // pieces: [x0, y0, x1, y1] rectangles in wall plane
  const { main, dark } = matsFor(def);
  const parts: PieceTemplate['parts'] = [];
  const colliders: LocalCollider[] = [];
  for (const [x0, y0, x1, y1] of pieces) {
    parts.push({ geo: bx(x0, y0, -T / 2, x1, y1, T / 2), mat: main });
    colliders.push(col(x0, y0, -T / 2, x1, y1, T / 2));
  }
  if (trim) {
    // beams: bottom/top and end posts for a timber-frame look
    parts.push({ geo: bx(-G / 2, 0, -T / 2 - 0.03, G / 2, 0.18, T / 2 + 0.03), mat: dark });
    parts.push({ geo: bx(-G / 2, L - 0.18, -T / 2 - 0.03, G / 2, L, T / 2 + 0.03), mat: dark });
    parts.push({ geo: bx(-G / 2, 0, -T / 2 - 0.04, -G / 2 + 0.16, L, T / 2 + 0.04), mat: dark });
    parts.push({ geo: bx(G / 2 - 0.16, 0, -T / 2 - 0.04, G / 2, L, T / 2 + 0.04), mat: dark });
  }
  return { parts, colliders };
}

function makeTemplate(def: BuildableDef): PieceTemplate {
  const m = mats();
  const isStone = def.material !== 'wood';
  const { main, dark, base, trim } = matsFor(def);
  switch (def.shape) {
    case 'foundation': {
      const parts = [
        { geo: bx(-G / 2, -3, -G / 2, G / 2, 0, G / 2), mat: base },
        { geo: bx(-G / 2 + 0.02, -0.12, -G / 2 + 0.02, G / 2 - 0.02, 0.005, G / 2 - 0.02), mat: main },
      ];
      return { parts, colliders: [col(-G / 2, -3, -G / 2, G / 2, 0, G / 2)], bounds: boundsOf(parts) };
    }
    case 'floor': {
      const parts = [{ geo: bx(-G / 2, -BUILD.floorT, -G / 2, G / 2, 0, G / 2), mat: main }];
      return { parts, colliders: [col(-G / 2, -BUILD.floorT, -G / 2, G / 2, 0, G / 2)], bounds: boundsOf(parts) };
    }
    case 'wall': {
      const { parts, colliders } = wallParts(def, [[-G / 2, 0, G / 2, L]], trim);
      return { parts, colliders, bounds: boundsOf(parts) };
    }
    case 'doorway': {
      const ow = 0.56;
      const oh = 2.15;
      const { parts, colliders } = wallParts(
        def,
        [
          [-G / 2, 0, -ow, L],
          [ow, 0, G / 2, L],
          [-ow, oh, ow, L],
        ],
        false,
      );
      parts.push({ geo: bx(-ow - 0.06, 0, -T / 2 - 0.04, -ow, oh, T / 2 + 0.04), mat: dark });
      parts.push({ geo: bx(ow, 0, -T / 2 - 0.04, ow + 0.06, oh, T / 2 + 0.04), mat: dark });
      parts.push({ geo: bx(-ow - 0.06, oh, -T / 2 - 0.04, ow + 0.06, oh + 0.12, T / 2 + 0.04), mat: dark });
      return { parts, colliders, bounds: boundsOf(parts) };
    }
    case 'window': {
      const ww = 0.46;
      const y0 = 1.0;
      const y1 = 1.85;
      const { parts, colliders } = wallParts(
        def,
        [
          [-G / 2, 0, G / 2, y0],
          [-G / 2, y1, G / 2, L],
          [-G / 2, y0, -ww, y1],
          [ww, y0, G / 2, y1],
        ],
        false,
      );
      parts.push({ geo: bx(-ww, y0 - 0.06, -T / 2 - 0.08, ww, y0, T / 2 + 0.08), mat: dark });
      parts.push({ geo: bx(-0.03, y0, -0.03, 0.03, y1, 0.03), mat: dark });
      parts.push({ geo: bx(-ww, (y0 + y1) / 2 - 0.03, -0.03, ww, (y0 + y1) / 2 + 0.03, 0.03), mat: dark });
      parts.push({ geo: bx(-ww, y0, -0.01, ww, y1, 0.01), mat: m.glass });
      colliders.push(col(-ww, y0, -0.05, ww, y1, 0.05));
      return { parts, colliders, bounds: boundsOf(parts) };
    }
    case 'door': {
      // hinge at x=-0.53 (pivot handled by instantiate)
      const w = 1.06;
      const parts = [
        { geo: bx(0, 0.02, -0.05, w, 2.1, 0.05), mat: m.wood, door: true },
        { geo: bx(0.05, 0.3, -0.07, w - 0.05, 0.42, 0.07), mat: m.woodDark, door: true },
        { geo: bx(0.05, 1.6, -0.07, w - 0.05, 1.72, 0.07), mat: m.woodDark, door: true },
        { geo: bx(w - 0.22, 1.0, -0.1, w - 0.12, 1.1, 0.1), mat: m.metal, door: true },
      ];
      return { parts, colliders: [], doorColliders: [col(-0.53, 0, -0.08, 0.53, 2.1, 0.08)], bounds: new THREE.Box3(new THREE.Vector3(-0.53, 0, -0.1), new THREE.Vector3(0.53, 2.1, 0.1)) };
    }
    case 'roof': {
      const rise = 1.25;
      const run = G;
      const len = Math.hypot(run, rise) + 0.35;
      const ang = Math.atan2(rise, run);
      const slab = boxGeo(G + 0.2, 0.14, len, 2);
      slab.rotateX(-ang);
      // bottom surface runs from (z=-1,y=0) to (z=1,y=rise); the extra 0.35 length overhangs the low (eave) end
      const sa = Math.sin(ang);
      const ca = Math.cos(ang);
      slab.translate(0, rise / 2 + 0.07 * ca - 0.175 * sa, -0.07 * sa - 0.175 * ca);
      const parts = [
        { geo: slab, mat: m.roof },
        { geo: bx(-G / 2 - 0.1, rise - 0.06, G / 2 - 0.14, G / 2 + 0.1, rise + 0.08, G / 2 + 0.02), mat: m.woodDark },
      ];
      return { parts, colliders: [{ kind: 'ramp', minX: -G / 2, maxX: G / 2, minZ: -G / 2, maxZ: G / 2, y0: 0.16, y1: rise + 0.16 }], bounds: boundsOf(parts) };
    }
    case 'gable': {
      const rise = 1.25;
      const shape = new THREE.Shape();
      shape.moveTo(-G / 2, 0);
      shape.lineTo(G / 2, 0);
      shape.lineTo(G / 2, rise);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
      geo.translate(0, 0, -T / 2);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
      const parts = [{ geo, mat: main }];
      return {
        parts,
        colliders: [col(-G / 2, 0, -T / 2, G / 2, rise * 0.5, T / 2), col(0, rise * 0.5, -T / 2, G / 2, rise, T / 2)],
        bounds: boundsOf(parts),
      };
    }
    case 'stairs': {
      const steps = 7;
      const parts: PieceTemplate['parts'] = [];
      for (let i = 0; i < steps; i++) {
        const z0 = -G / 2 + (i * G) / steps;
        const top = ((i + 1) * L) / steps;
        parts.push({ geo: bx(-0.9, top - 0.12, z0, 0.9, top, z0 + G / steps + 0.02), mat: main });
      }
      // stringers
      const strL = Math.hypot(G, L);
      const ang = Math.atan2(L, G);
      for (const x of [-0.95, 0.95]) {
        const s = boxGeo(0.1, 0.3, strL, 2);
        s.rotateX(-ang);
        s.translate(x, L / 2 - 0.1, 0);
        parts.push({ geo: s, mat: dark });
      }
      return { parts, colliders: [{ kind: 'ramp', minX: -0.95, maxX: 0.95, minZ: -G / 2, maxZ: G / 2, y0: 0, y1: L }], bounds: boundsOf(parts) };
    }
    case 'pillar': {
      const parts = [
        { geo: bx(-0.18, 0, -0.18, 0.18, L, 0.18), mat: base },
        { geo: bx(-0.24, 0, -0.24, 0.24, 0.2, 0.24), mat: dark },
        { geo: bx(-0.24, L - 0.2, -0.24, 0.24, L, 0.24), mat: dark },
      ];
      return { parts, colliders: [col(-0.18, 0, -0.18, 0.18, L, 0.18)], bounds: boundsOf(parts) };
    }
    case 'fence': {
      const parts = [
        { geo: bx(-G / 2, 0, -0.07, -G / 2 + 0.14, 1.15, 0.07), mat: m.woodDark },
        { geo: bx(G / 2 - 0.14, 0, -0.07, G / 2, 1.15, 0.07), mat: m.woodDark },
        { geo: bx(-G / 2, 0.42, -0.04, G / 2, 0.54, 0.04), mat: m.wood },
        { geo: bx(-G / 2, 0.86, -0.04, G / 2, 0.98, 0.04), mat: m.wood },
      ];
      return { parts, colliders: [col(-G / 2, 0, -0.08, G / 2, 1.15, 0.08)], bounds: boundsOf(parts) };
    }
    case 'workbench': {
      const parts = [
        { geo: bx(-0.8, 0.82, -0.42, 0.8, 0.94, 0.42, 1), mat: m.wood },
        { geo: bx(-0.75, 0, -0.37, -0.63, 0.82, -0.25, 1), mat: m.woodDark },
        { geo: bx(0.63, 0, -0.37, 0.75, 0.82, -0.25, 1), mat: m.woodDark },
        { geo: bx(-0.75, 0, 0.25, -0.63, 0.82, 0.37, 1), mat: m.woodDark },
        { geo: bx(0.63, 0, 0.25, 0.75, 0.82, 0.37, 1), mat: m.woodDark },
        { geo: bx(-0.7, 0.3, -0.35, 0.7, 0.36, 0.35, 1), mat: m.woodDark },
        { geo: bx(-0.5, 0.94, -0.1, -0.1, 0.99, 0.15, 1), mat: m.metal },
        { geo: bx(0.2, 0.94, 0.05, 0.6, 1.02, 0.12, 1), mat: m.woodDark },
        { geo: bx(0.45, 0.94, -0.3, 0.55, 1.12, -0.2, 1), mat: m.metal },
      ];
      return { parts, colliders: [col(-0.8, 0, -0.42, 0.8, 0.95, 0.42)], bounds: boundsOf(parts) };
    }
    case 'campfire': {
      return {
        parts: [],
        custom: () => {
          const c = createCampfire();
          return { object: c.group, flame: c.flame };
        },
        colliders: [col(-0.55, 0, -0.55, 0.55, 0.3, 0.55)],
        light: [0, 0.9, 0],
        bounds: new THREE.Box3(new THREE.Vector3(-0.7, 0, -0.7), new THREE.Vector3(0.7, 0.8, 0.7)),
      };
    }
    case 'furnace': {
      const parts = [
        { geo: bx(-0.65, 0, -0.65, 0.65, 1.3, 0.65, 1), mat: m.stone },
        { geo: bx(-0.75, 1.3, -0.75, 0.75, 1.45, 0.75, 1), mat: m.stoneDark },
        { geo: bx(-0.25, 1.45, -0.25, 0.25, 2.3, 0.25, 1), mat: m.stoneDark },
        { geo: bx(-0.3, 0.25, 0.6, 0.3, 0.75, 0.67, 1), mat: m.glow },
      ];
      return { parts, colliders: [col(-0.7, 0, -0.7, 0.7, 1.45, 0.7)], light: [0, 0.6, 0.9], flame: { pos: [0, 2.3, 0], scale: 0.5 }, bounds: boundsOf(parts) };
    }
    case 'chest': {
      return {
        parts: [],
        custom: () => ({ object: createChest() }),
        colliders: [col(-0.5, 0, -0.31, 0.5, 0.82, 0.31)],
        bounds: new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.31), new THREE.Vector3(0.5, 0.82, 0.31)),
      };
    }
    case 'bed': {
      const parts = [
        { geo: bx(-0.55, 0, -1.1, 0.55, 0.32, 1.1, 1), mat: m.woodDark },
        { geo: bx(-0.55, 0, -1.1, 0.55, 0.85, -0.98, 1), mat: m.woodDark },
        { geo: bx(-0.48, 0.32, -0.98, 0.48, 0.48, 1.05, 1), mat: m.cloth },
        { geo: bx(-0.35, 0.48, -0.95, 0.35, 0.6, -0.6, 1), mat: m.cloth },
        { geo: bx(-0.5, 0.4, -0.45, 0.5, 0.53, 1.08, 1), mat: m.blanket },
      ];
      return { parts, colliders: [col(-0.55, 0, -1.1, 0.55, 0.55, 1.1)], bounds: boundsOf(parts) };
    }
    case 'torch': {
      const parts = [
        { geo: new THREE.CylinderGeometry(0.045, 0.06, 1.6, 6).translate(0, 0.8, 0), mat: m.woodDark },
        { geo: new THREE.CylinderGeometry(0.1, 0.07, 0.2, 8).translate(0, 1.65, 0), mat: m.metal },
      ];
      return { parts, colliders: [col(-0.08, 0, -0.08, 0.08, 1.7, 0.08)], flame: { pos: [0, 1.72, 0], scale: 0.55 }, light: [0, 2.0, 0], bounds: boundsOf(parts) };
    }
    case 'table': {
      const parts = [
        { geo: bx(-0.7, 0.75, -0.45, 0.7, 0.84, 0.45, 1), mat: m.wood },
        ...[
          [-0.6, -0.36],
          [0.6, -0.36],
          [-0.6, 0.36],
          [0.6, 0.36],
        ].map(([x, z]) => ({ geo: bx(x - 0.05, 0, z - 0.05, x + 0.05, 0.75, z + 0.05, 1), mat: m.woodDark })),
      ];
      return { parts, colliders: [col(-0.7, 0, -0.45, 0.7, 0.84, 0.45)], bounds: boundsOf(parts) };
    }
    case 'chair': {
      const parts = [
        { geo: bx(-0.25, 0.42, -0.25, 0.25, 0.48, 0.25, 1), mat: m.wood },
        { geo: bx(-0.25, 0.48, -0.25, 0.25, 1.0, -0.2, 1), mat: m.woodDark },
        ...[
          [-0.2, -0.2],
          [0.2, -0.2],
          [-0.2, 0.2],
          [0.2, 0.2],
        ].map(([x, z]) => ({ geo: bx(x - 0.03, 0, z - 0.03, x + 0.03, 0.42, z + 0.03, 1), mat: m.woodDark })),
      ];
      return { parts, colliders: [col(-0.25, 0, -0.25, 0.25, 0.48, 0.25)], bounds: boundsOf(parts) };
    }
    case 'road': {
      // placeholder slab (ghost / hover); placed roads get a terrain-conforming mesh
      const parts = [{ geo: bx(-G / 2, -0.05, -G / 2, G / 2, 0.06, G / 2), mat: def.material === 'stone' ? m.road : m.dirt }];
      return { parts, colliders: [], bounds: new THREE.Box3(new THREE.Vector3(-G / 2, -0.2, -G / 2), new THREE.Vector3(G / 2, 0.1, G / 2)) };
    }
    case 'bridge': {
      const len = 6;
      const parts: PieceTemplate['parts'] = [{ geo: bx(-1, -0.2, -len / 2, 1, 0, len / 2), mat: m.wood }];
      for (const z of [-len / 2, -len / 6, len / 6, len / 2]) {
        for (const x of [-0.95, 0.95]) parts.push({ geo: bx(x - 0.07, -0.9, z - 0.07, x + 0.07, 1.0, z + 0.07, 1), mat: m.woodDark });
      }
      for (const x of [-0.95, 0.95]) parts.push({ geo: bx(x - 0.05, 0.85, -len / 2, x + 0.05, 0.95, len / 2, 1), mat: m.woodDark });
      return {
        parts,
        colliders: [col(-1, -0.2, -len / 2, 1, 0, len / 2), col(-1.02, 0, -len / 2, -0.88, 1.0, len / 2), col(0.88, 0, -len / 2, 1.02, 1.0, len / 2)],
        bounds: boundsOf(parts),
      };
    }
    case 'castle_wall': {
      const H = 5;
      const th = 1.0;
      const parts: PieceTemplate['parts'] = [
        { geo: bx(-G / 2, 0, -th / 2, G / 2, H, th / 2), mat: m.castle },
        { geo: bx(-G / 2 - 0.02, H - 0.25, -th / 2 - 0.08, G / 2 + 0.02, H, th / 2 + 0.08), mat: m.stoneDark },
      ];
      const colliders: LocalCollider[] = [col(-G / 2, 0, -th / 2, G / 2, H, th / 2)];
      // merlons on the outer (+z) edge
      for (const x of [-0.6, 0.6]) {
        parts.push({ geo: bx(x - 0.3, H, th / 2 - 0.35, x + 0.3, H + 0.7, th / 2), mat: m.castle });
        colliders.push(col(x - 0.3, H, th / 2 - 0.35, x + 0.3, H + 0.7, th / 2));
      }
      return { parts, colliders, bounds: boundsOf(parts) };
    }
    case 'tower': {
      const H = 7.5;
      const R = 2.1;
      const body = new THREE.CylinderGeometry(R * 0.95, R, H, 16).translate(0, H / 2, 0);
      const uv = body.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 3.5);
      const parts: PieceTemplate['parts'] = [
        { geo: body, mat: m.castle },
        { geo: new THREE.CylinderGeometry(R + 0.25, R + 0.25, 0.35, 16).translate(0, H - 0.1, 0), mat: m.stoneDark },
        { geo: new THREE.CylinderGeometry(0.5, 0.35, 0.6, 10).translate(0, H + 0.3, 0), mat: m.metal },
      ];
      const colliders: LocalCollider[] = [col(-R, 0, -R, R, H, R)];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = Math.cos(a) * (R + 0.05);
        const z = Math.sin(a) * (R + 0.05);
        const g = boxGeo(0.7, 0.75, 0.45, 2);
        g.rotateY(-a + Math.PI / 2);
        g.translate(x, H + 0.4, z);
        parts.push({ geo: g, mat: m.castle });
        colliders.push(col(x - 0.3, H, z - 0.3, x + 0.3, H + 0.8, z + 0.3));
      }
      return { parts, colliders, flame: { pos: [0, H + 0.55, 0], scale: 1.0 }, light: [0, H + 1.5, 0], bounds: boundsOf(parts) };
    }
    case 'bookshelf': {
      const parts: PieceTemplate['parts'] = [
        { geo: bx(-0.8, 0, -0.2, 0.8, 2.0, -0.16, 1), mat: m.woodDark },
        { geo: bx(-0.8, 0, -0.2, -0.74, 2.0, 0.2, 1), mat: m.woodDark },
        { geo: bx(0.74, 0, -0.2, 0.8, 2.0, 0.2, 1), mat: m.woodDark },
      ];
      for (const y of [0.05, 0.62, 1.22, 1.9]) parts.push({ geo: bx(-0.8, y, -0.2, 0.8, y + 0.06, 0.2, 1), mat: m.wood });
      const bookColors = [m.books, m.blanket, m.banner, m.books];
      for (let r = 0; r < 3; r++) {
        let x = -0.7;
        for (let k = 0; k < 9 && x < 0.65; k++) {
          const w = 0.08 + ((k * 7 + r * 3) % 5) * 0.025;
          const h = 0.38 + ((k * 3 + r) % 4) * 0.04;
          parts.push({ geo: bx(x, 0.11 + r * 0.6, -0.14, x + w, 0.11 + r * 0.6 + h, 0.12, 1), mat: bookColors[(k + r) % 4] });
          x += w + 0.015;
        }
      }
      return { parts, colliders: [col(-0.8, 0, -0.2, 0.8, 2.0, 0.2)], bounds: boundsOf(parts) };
    }
    case 'rug': {
      const parts = [
        { geo: bx(-1.0, 0, -0.65, 1.0, 0.025, 0.65, 2), mat: m.rug },
        { geo: bx(-1.05, 0, -0.7, 1.05, 0.02, 0.7, 2), mat: m.marbleTrim },
      ];
      return { parts, colliders: [], bounds: new THREE.Box3(new THREE.Vector3(-1.05, 0, -0.7), new THREE.Vector3(1.05, 0.1, 0.7)) };
    }
    case 'planter': {
      const parts: PieceTemplate['parts'] = [
        { geo: new THREE.CylinderGeometry(0.3, 0.22, 0.45, 10).translate(0, 0.22, 0), mat: m.stoneDark },
        { geo: new THREE.CylinderGeometry(0.27, 0.27, 0.04, 10).translate(0, 0.43, 0), mat: m.dirt },
        { geo: new THREE.IcosahedronGeometry(0.3, 0).translate(0, 0.7, 0), mat: m.leaf },
      ];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        parts.push({ geo: new THREE.SphereGeometry(0.07, 6, 4).translate(Math.cos(a) * 0.2, 0.88 + (i % 2) * 0.06, Math.sin(a) * 0.2), mat: m.flower });
      }
      return { parts, colliders: [col(-0.3, 0, -0.3, 0.3, 0.6, 0.3)], bounds: boundsOf(parts) };
    }
    case 'lantern': {
      const parts = [
        { geo: new THREE.CylinderGeometry(0.06, 0.09, 2.6, 6).translate(0, 1.3, 0), mat: m.woodDark },
        { geo: bx(-0.25, 0, -0.25, 0.25, 0.2, 0.25, 1), mat: m.stoneDark },
        { geo: bx(0, 2.45, -0.03, 0.55, 2.52, 0.03, 1), mat: m.metal },
        { geo: bx(0.38, 1.95, -0.12, 0.62, 2.3, 0.12, 1), mat: m.lamp },
        { geo: bx(0.35, 2.3, -0.15, 0.65, 2.36, 0.15, 1), mat: m.metal },
      ];
      return { parts, colliders: [col(-0.12, 0, -0.12, 0.12, 2.6, 0.12)], light: [0.5, 2.1, 0], bounds: boundsOf(parts) };
    }
    case 'town_hall': {
      const roofA = boxGeo(5.4, 0.16, 2.6, 2);
      roofA.rotateX(-0.6);
      roofA.translate(0, 4.05, 1.05);
      const roofB = boxGeo(5.4, 0.16, 2.6, 2);
      roofB.rotateX(0.6);
      roofB.translate(0, 4.05, -1.05);
      const parts: PieceTemplate['parts'] = [
        { geo: bx(-2.7, 0, -2.2, 2.7, 0.45, 2.2), mat: m.stone },
        { geo: bx(-2.35, 0.45, -1.85, 2.35, 3.3, 1.85), mat: m.wood },
        { geo: bx(-2.4, 3.15, -1.9, 2.4, 3.35, 1.9), mat: m.woodDark },
        { geo: bx(-2.4, 0.45, 1.84, -2.2, 3.3, 1.92), mat: m.woodDark },
        { geo: bx(2.2, 0.45, 1.84, 2.4, 3.3, 1.92), mat: m.woodDark },
        { geo: bx(-0.6, 0.45, 1.85, 0.6, 2.5, 1.95), mat: m.woodDark },
        { geo: bx(-1.8, 1.4, 1.85, -1.0, 2.2, 1.9), mat: m.glass },
        { geo: bx(1.0, 1.4, 1.85, 1.8, 2.2, 1.9), mat: m.glass },
        { geo: roofA, mat: m.roof },
        { geo: roofB, mat: m.roof },
        { geo: bx(-0.45, 4.6, -0.45, 0.45, 5.6, 0.45, 1), mat: m.wood },
        { geo: new THREE.ConeGeometry(0.75, 0.9, 4).rotateY(Math.PI / 4).translate(0, 6.05, 0), mat: m.roof },
        { geo: new THREE.SphereGeometry(0.22, 10, 8).translate(0, 5.05, 0.3), mat: m.gold },
        { geo: bx(0.95, 2.3, 2.0, 1.15, 2.6, 2.2, 1), mat: m.lamp },
        { geo: bx(-2.8, 0, 2.2, 2.8, 0.18, 3.0), mat: m.stoneDark },
      ];
      return { parts, colliders: [col(-2.7, 0, -2.2, 2.7, 0.45, 2.2), col(-2.35, 0.45, -1.85, 2.35, 4.5, 1.85)], light: [1.05, 2.5, 2.6], bounds: boundsOf(parts) };
    }
    case 'warehouse': {
      const parts: PieceTemplate['parts'] = [
        { geo: bx(-1.9, 0, -1.4, 1.9, 2.5, 1.4), mat: m.wood },
        { geo: bx(-2.1, 2.5, -1.6, 2.1, 2.7, 1.6), mat: m.roof },
        { geo: bx(-0.8, 0, 1.38, 0.8, 2.0, 1.46), mat: m.woodDark },
        { geo: bx(-0.05, 0, 1.45, 0.05, 2.0, 1.5), mat: m.metal },
        { geo: bx(2.0, 0, 0.2, 2.8, 0.8, 1.0, 1), mat: m.woodDark },
        { geo: bx(2.05, 0.8, 0.35, 2.65, 1.4, 0.95, 1), mat: m.wood },
        { geo: bx(2.0, 0, -1.0, 2.7, 0.7, -0.3, 1), mat: m.wood },
      ];
      return { parts, colliders: [col(-1.9, 0, -1.4, 1.9, 2.7, 1.4), col(2.0, 0, -1.0, 2.8, 1.4, 1.0)], bounds: boundsOf(parts) };
    }
    case 'farm_plot': {
      const parts: PieceTemplate['parts'] = [{ geo: bx(-G / 2 + 0.05, -0.05, -G / 2 + 0.05, G / 2 - 0.05, 0.1, G / 2 - 0.05), mat: m.soil }];
      for (const z of [-0.6, 0, 0.6]) parts.push({ geo: bx(-0.9, 0.1, z - 0.06, 0.9, 0.16, z + 0.06), mat: m.dirt });
      return { parts, colliders: [], bounds: new THREE.Box3(new THREE.Vector3(-G / 2, -0.1, -G / 2), new THREE.Vector3(G / 2, 0.4, G / 2)) };
    }
    case 'lumber_camp': {
      const parts: PieceTemplate['parts'] = [];
      for (let r = 0; r < 3; r++) {
        for (let k = 0; k < 4 - r; k++) {
          parts.push({ geo: new THREE.CylinderGeometry(0.2, 0.2, 2.2, 8).rotateZ(Math.PI / 2).translate(-0.6, 0.2 + r * 0.36, -0.6 + k * 0.42 + r * 0.21), mat: m.woodDark });
        }
      }
      parts.push({ geo: new THREE.CylinderGeometry(0.35, 0.4, 0.6, 10).translate(1.1, 0.3, 0.6), mat: m.wood });
      parts.push({ geo: bx(1.07, 0.6, 0.45, 1.13, 1.2, 0.51, 1), mat: m.woodDark });
      parts.push({ geo: bx(0.98, 1.05, 0.38, 1.22, 1.22, 0.62, 1), mat: m.metal });
      parts.push({ geo: bx(-1.9, 0, 1.1, -1.75, 1.8, 1.25, 1), mat: m.woodDark });
      parts.push({ geo: bx(0.6, 0, 1.1, 0.75, 1.8, 1.25, 1), mat: m.woodDark });
      const lean = boxGeo(2.9, 0.1, 1.6, 2);
      lean.rotateX(0.35);
      lean.translate(-0.6, 1.6, 0.55);
      parts.push({ geo: lean, mat: m.roof });
      return { parts, colliders: [col(-1.8, 0, -0.9, 0.6, 1.1, 0.9), col(0.7, 0, 0.2, 1.5, 0.6, 1.0)], bounds: boundsOf(parts) };
    }
    case 'mine_shaft': {
      const mound = new THREE.DodecahedronGeometry(1.9, 0);
      mound.scale(1.3, 0.9, 1.1);
      mound.translate(0, 0.6, -0.9);
      const parts: PieceTemplate['parts'] = [
        { geo: mound, mat: m.rock },
        { geo: bx(-0.9, 0, 0.6, -0.65, 2.1, 0.85, 1), mat: m.woodDark },
        { geo: bx(0.65, 0, 0.6, 0.9, 2.1, 0.85, 1), mat: m.woodDark },
        { geo: bx(-1.0, 2.0, 0.55, 1.0, 2.3, 0.9, 1), mat: m.woodDark },
        { geo: bx(-0.65, 0, 0.55, 0.65, 2.0, 0.6, 1), mat: new THREE.MeshBasicMaterial({ color: 0x0a0806 }) },
        { geo: bx(-0.45, 0.02, 0.9, -0.38, 0.06, 3.0, 1), mat: m.metal },
        { geo: bx(0.38, 0.02, 0.9, 0.45, 0.06, 3.0, 1), mat: m.metal },
        { geo: bx(-0.5, 0.25, 1.9, 0.5, 0.75, 2.7, 1), mat: m.woodDark },
        { geo: new THREE.DodecahedronGeometry(0.28, 0).translate(0, 0.85, 2.3), mat: m.rock },
      ];
      return { parts, colliders: [col(-2.2, 0, -2.6, 2.2, 2.2, 0.55), col(-0.5, 0, 1.9, 0.5, 0.75, 2.7)], bounds: boundsOf(parts) };
    }
    case 'market_stall': {
      const parts: PieceTemplate['parts'] = [];
      for (const [x, z] of [
        [-1.3, -0.8],
        [1.3, -0.8],
        [-1.3, 0.8],
        [1.3, 0.8],
      ])
        parts.push({ geo: bx(x - 0.07, 0, z - 0.07, x + 0.07, 2.4, z + 0.07, 1), mat: m.woodDark });
      for (let i = 0; i < 6; i++) {
        const strip = boxGeo(0.46, 0.04, 2.1, 1);
        strip.rotateX(0.25);
        strip.translate(-1.15 + i * 0.46, 2.45, 0.1);
        parts.push({ geo: strip, mat: i % 2 === 0 ? m.awning : m.awning2 });
      }
      parts.push({ geo: bx(-1.25, 0, 0.45, 1.25, 0.95, 0.85, 1), mat: m.wood });
      parts.push({ geo: bx(-1.0, 0.95, 0.5, -0.4, 1.2, 0.8, 1), mat: m.woodDark });
      for (let i = 0; i < 5; i++) parts.push({ geo: new THREE.SphereGeometry(0.09, 8, 6).translate(0.1 + (i % 3) * 0.2, 1.05, 0.6 + Math.floor(i / 3) * 0.15), mat: m.fruit });
      parts.push({ geo: bx(0.7, 0.95, 0.5, 1.1, 1.15, 0.8, 1), mat: m.books });
      return { parts, colliders: [col(-1.3, 0, 0.4, 1.3, 1.0, 0.9)], bounds: boundsOf(parts) };
    }
    case 'well': {
      const ring = new THREE.CylinderGeometry(0.85, 0.9, 0.85, 14, 1, true).translate(0, 0.42, 0);
      const parts: PieceTemplate['parts'] = [
        { geo: ring, mat: m.stone },
        { geo: new THREE.CylinderGeometry(0.75, 0.75, 0.05, 14).translate(0, 0.3, 0), mat: new THREE.MeshStandardMaterial({ color: 0x2a5a7a, roughness: 0.2 }) },
        { geo: new THREE.TorusGeometry(0.88, 0.08, 6, 16).rotateX(Math.PI / 2).translate(0, 0.86, 0), mat: m.stoneDark },
        { geo: bx(-0.85, 0.85, -0.06, -0.73, 2.2, 0.06, 1), mat: m.woodDark },
        { geo: bx(0.73, 0.85, -0.06, 0.85, 2.2, 0.06, 1), mat: m.woodDark },
        { geo: new THREE.CylinderGeometry(0.06, 0.06, 1.7, 6).rotateZ(Math.PI / 2).translate(0, 1.8, 0), mat: m.wood },
        { geo: new THREE.ConeGeometry(1.15, 0.7, 4).rotateY(Math.PI / 4).translate(0, 2.5, 0), mat: m.roof },
        { geo: new THREE.CylinderGeometry(0.14, 0.11, 0.22, 8).translate(0, 1.2, 0), mat: m.woodDark },
      ];
      return { parts, colliders: [col(-0.9, 0, -0.9, 0.9, 0.9, 0.9)], bounds: boundsOf(parts) };
    }
    case 'banner': {
      const clothGeo = new THREE.PlaneGeometry(0.9, 1.6, 1, 4);
      clothGeo.translate(0.5, 2.0, 0);
      const parts = [
        { geo: new THREE.CylinderGeometry(0.05, 0.06, 3.2, 6).translate(0, 1.6, 0), mat: m.woodDark },
        { geo: bx(0, 2.75, -0.03, 1.0, 2.82, 0.03, 1), mat: m.woodDark },
        { geo: clothGeo, mat: m.banner },
        { geo: new THREE.CircleGeometry(0.22, 12).translate(0.5, 2.1, 0.01), mat: m.gold },
        { geo: new THREE.SphereGeometry(0.08, 8, 6).translate(0, 3.25, 0), mat: m.gold },
      ];
      return { parts, colliders: [col(-0.07, 0, -0.07, 0.07, 3.2, 0.07)], bounds: boundsOf(parts) };
    }
  }
}

const cache = new Map<string, PieceTemplate>();
export function getTemplate(def: BuildableDef): PieceTemplate {
  let t = cache.get(def.id);
  if (!t) {
    t = makeTemplate(def);
    cache.set(def.id, t);
  }
  return t;
}

export interface PieceObject {
  object: THREE.Group;
  flame?: Flame;
  doorPivot?: THREE.Group;
}

export function instantiate(def: BuildableDef): PieceObject {
  const tpl = getTemplate(def);
  const group = new THREE.Group();
  let doorPivot: THREE.Group | undefined;
  if (def.shape === 'door') {
    doorPivot = new THREE.Group();
    doorPivot.position.x = -0.53;
    group.add(doorPivot);
  }
  for (const p of tpl.parts) {
    const mesh = new THREE.Mesh(p.geo, p.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    (p.door && doorPivot ? doorPivot : group).add(mesh);
  }
  let flame: Flame | undefined;
  if (tpl.custom) {
    const c = tpl.custom();
    group.add(c.object);
    flame = c.flame;
  }
  if (tpl.flame) {
    flame = createFlame(tpl.flame.scale);
    flame.group.position.set(...tpl.flame.pos);
    group.add(flame.group);
  }
  return { object: group, flame, doorPivot };
}

const ghostCache = new Map<string, THREE.Group>();
export const ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x6cff8a, transparent: true, opacity: 0.42, depthWrite: false });

export function ghostObject(def: BuildableDef): THREE.Group {
  let g = ghostCache.get(def.id);
  if (!g) {
    const inst = instantiate(def);
    inst.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = ghostMaterial;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
      if ((o as THREE.Sprite).isSprite) o.visible = false;
    });
    g = inst.object;
    ghostCache.set(def.id, g);
  }
  return g;
}

/** Transform template colliders into world space. */
export function worldColliders(locals: LocalCollider[], x: number, y: number, z: number, rot: number, owner: unknown): Collider[] {
  const out: Collider[] = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const tx = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  for (const lc of locals) {
    if (lc.kind === 'box') {
      const corners = [
        tx(lc.min[0], lc.min[2]),
        tx(lc.max[0], lc.min[2]),
        tx(lc.min[0], lc.max[2]),
        tx(lc.max[0], lc.max[2]),
      ];
      out.push({
        kind: 'box',
        minX: Math.min(...corners.map((p) => p[0])),
        maxX: Math.max(...corners.map((p) => p[0])),
        minZ: Math.min(...corners.map((p) => p[1])),
        maxZ: Math.max(...corners.map((p) => p[1])),
        minY: y + lc.min[1],
        maxY: y + lc.max[1],
        owner,
      });
    } else {
      // Ramps only support quarter-turn rotations
      const q = (((Math.round(rot / (Math.PI / 2)) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
      const corners = [tx(lc.minX, lc.minZ), tx(lc.maxX, lc.maxZ)];
      const minX = Math.min(corners[0][0], corners[1][0]);
      const maxX = Math.max(corners[0][0], corners[1][0]);
      const minZ = Math.min(corners[0][1], corners[1][1]);
      const maxZ = Math.max(corners[0][1], corners[1][1]);
      const axis = q === 1 || q === 3 ? 'x' : 'z';
      const dir = q === 0 || q === 1 ? 1 : -1;
      out.push({ kind: 'ramp', minX, maxX, minZ, maxZ, y0: y + lc.y0, y1: y + lc.y1, axis, dir, owner });
    }
  }
  return out;
}

/** Wheat rows for a farm plot; the settlement scales/colours them by growth. */
export function createCrops(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'crops';
  const stem = new THREE.MeshStandardMaterial({ color: 0x6f9a3a, roughness: 0.9 });
  const head = new THREE.MeshStandardMaterial({ color: 0x9ab84a, roughness: 0.8 });
  g.userData.head = head;
  g.userData.stem = stem;
  for (const z of [-0.6, 0, 0.6]) {
    for (let i = 0; i < 6; i++) {
      const x = -0.75 + i * 0.3 + ((i * 7 + Math.round(z * 10)) % 3) * 0.03;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.6, 4), stem);
      s.position.set(x, 0.42, z);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.18, 5), head);
      h.position.set(x, 0.78, z);
      g.add(s, h);
    }
  }
  return g;
}
