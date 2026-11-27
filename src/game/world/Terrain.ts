import * as THREE from 'three';
import { EMBER_ISLE, WORLD } from '../config';
import { Simplex2, fbm, ridged } from '../core/noise';
import { clamp, lerp, smoothstep } from '../core/math';
import { groundDetailTexture } from './textures';

export const BIOME = { beach: 0, meadow: 1, forest: 2, highlands: 3, peaks: 4, ocean: 5, ash: 6, volcano: 7, blacksand: 8 } as const;
export type BiomeId = (typeof BIOME)[keyof typeof BIOME];

export const REGIONS: { id: string; name: string; subtitle: string }[] = [
  { id: 'beach', name: '황금 해안', subtitle: '파도가 속삭이는 모래사장' },
  { id: 'meadow', name: '푸른 초원', subtitle: '바람에 일렁이는 풀밭' },
  { id: 'forest', name: '속삭이는 숲', subtitle: '늑대의 울음이 메아리치는 숲' },
  { id: 'highlands', name: '잿빛 고원', subtitle: '광맥과 골렘의 땅' },
  { id: 'peaks', name: '서리 봉우리', subtitle: '구름에 닿은 눈의 봉우리' },
  { id: 'ocean', name: '끝없는 바다', subtitle: '수평선 너머는 아직 미지의 세계' },
  { id: 'ash', name: '잿빛 평원', subtitle: '그을린 나무와 따뜻한 재의 들판' },
  { id: 'volcano', name: '불의 산', subtitle: '땅속에서 용암이 끓어오른다' },
  { id: 'blacksand', name: '검은 모래 해변', subtitle: '잿불 섬의 바닷가' },
];

export type IslandStyle = 'home' | 'ember';

export interface IslandOptions {
  cx: number;
  cz: number;
  size: number;
  res: number;
  style: IslandStyle;
}

/** Crater of the ember isle volcano, in world coordinates (the boss arena). */
export const VOLCANO = { x: EMBER_ISLE.cx + 15, z: EMBER_ISLE.cz - 25, floor: 44, craterR: 16, coneR: 118 };

export interface FlatZone {
  x: number;
  z: number;
  r: number;
  h?: number;
}

const C = (hex: number) => new THREE.Color(hex);
const COL = {
  meadow: C(0x6c9c3a),
  meadow2: C(0x93aa48),
  forest: C(0x3d6b28),
  forest2: C(0x4f7a2f),
  highland: C(0x7f7c5c),
  rock: C(0x7b766d),
  rockDark: C(0x5f5b55),
  snow: C(0xe9eef3),
  sand: C(0xd9c590),
  wetSand: C(0xa8976c),
  seabed: C(0x6f6a52),
  ash: C(0x6e6862),
  ash2: C(0x5c5752),
  dryGrass: C(0x7f7a4c),
  basalt: C(0x3f3b39),
  basaltDark: C(0x2c2928),
  scorched: C(0x6b4a3a),
  crater: C(0x2a1c16),
  blackSand: C(0x3d3936),
  blackWet: C(0x2a2725),
};

/**
 * One island's heightfield with biomes. Height / biome queries match the rendered mesh exactly
 * (same triangle split), so characters never float or sink. Coordinates are world coordinates;
 * the grid covers [cx - size/2, cx + size/2] x [cz - size/2, cz + size/2].
 */
export class IslandTerrain {
  readonly size: number;
  readonly res: number;
  readonly half: number;
  readonly cell: number;
  readonly verts: number;
  readonly cx: number;
  readonly cz: number;
  readonly style: IslandStyle;
  readonly heights: Float32Array;
  readonly biomes: Uint8Array;
  readonly forest: Float32Array;
  readonly colors: Float32Array;
  readonly mesh: THREE.Mesh;
  private noise: Simplex2;
  private zones: FlatZone[];
  private zoneHeights: number[] = [];
  private lastMask = 0;

  constructor(
    public readonly seed: number,
    zones: FlatZone[],
    opts: IslandOptions = { cx: 0, cz: 0, size: WORLD.size, res: WORLD.res, style: 'home' },
  ) {
    this.size = opts.size;
    this.res = opts.res;
    this.half = opts.size / 2;
    this.cell = opts.size / opts.res;
    this.verts = opts.res + 1;
    this.cx = opts.cx;
    this.cz = opts.cz;
    this.style = opts.style;
    // only the flat zones on this island matter
    this.zones = zones.filter((z) => this.contains(z.x, z.z));
    this.noise = new Simplex2(seed);
    const n = this.verts * this.verts;
    this.heights = new Float32Array(n);
    this.biomes = new Uint8Array(n);
    this.forest = new Float32Array(n);
    this.colors = new Float32Array(n * 3);
    for (const z of this.zones) this.zoneHeights.push(z.h ?? Math.max(2.6, this.rawHeight(z.x - this.cx, z.z - this.cz)));
    this.generate();
    this.mesh = this.buildMesh();
  }

  contains(x: number, z: number): boolean {
    return Math.abs(x - this.cx) < this.half && Math.abs(z - this.cz) < this.half;
  }

  /** Height before flat zones, in island-local coordinates. */
  private rawHeight(x: number, z: number): number {
    if (this.style === 'ember') return this.rawEmber(x, z);
    const n = this.noise;
    const R = this.half * 0.86;
    const wx = x + fbm(n, x * 0.003 + 31, z * 0.003 - 17, 3) * 45;
    const wz = z + fbm(n, x * 0.003 - 71, z * 0.003 + 53, 3) * 45;
    const d = Math.hypot(wx, wz) / R;
    const coast = smoothstep(1.02, 0.8, d);

    let h = 4.2 + fbm(n, x * 0.0045 + 5, z * 0.0045 + 9, 5) * 6.5 + fbm(n, x * 0.02, z * 0.02, 3) * 1.1;
    const mz = z + fbm(n, x * 0.004 + 100, z * 0.004, 3) * 70;
    const mask = smoothstep(-25, -165, mz);
    this.lastMask = mask;
    const r = ridged(n, x * 0.0068 + 300, z * 0.0068 + 300, 5);
    h += mask * (r * 54 + 5);
    const hills = Math.max(0, fbm(n, x * 0.009 + 500, z * 0.009 + 500, 4)) * 11;
    h += hills * (1 - mask) * 0.85;
    // gentle beaches: compress heights near sea level on the coast
    const coastal = lerp(-13, h, Math.pow(coast, 0.8));
    return coastal;
  }

  /** The volcanic isle: ash plains around one big cone with a crater (the boss arena). */
  private rawEmber(x: number, z: number): number {
    const n = this.noise;
    const R = this.half * 0.8;
    const wx = x + fbm(n, x * 0.004 + 11, z * 0.004 - 7, 3) * 30;
    const wz = z + fbm(n, x * 0.004 - 41, z * 0.004 + 23, 3) * 30;
    const d = Math.hypot(wx, wz) / R;
    const coast = smoothstep(1.02, 0.78, d);
    let h = 3.4 + fbm(n, x * 0.006 + 5, z * 0.006 + 9, 4) * 4 + fbm(n, x * 0.025, z * 0.025, 2) * 0.8;
    const vx = x - (VOLCANO.x - this.cx);
    const vz = z - (VOLCANO.z - this.cz);
    const vd = Math.hypot(vx, vz) + fbm(n, x * 0.02 + 70, z * 0.02, 2) * 5;
    const cone = Math.max(0, 1 - vd / VOLCANO.coneR);
    this.lastMask = cone;
    h += Math.pow(cone, 1.6) * 72 + ridged(n, x * 0.02 + 40, z * 0.02, 3) * cone * 5;
    // the crater: a flat floor inside a rim
    const exact = Math.hypot(vx, vz);
    h = lerp(h, VOLCANO.floor, smoothstep(VOLCANO.craterR + 9, VOLCANO.craterR, exact));
    return lerp(-13, h, Math.pow(coast, 0.8));
  }

  private heightFn(wxp: number, wzp: number): number {
    const x = wxp - this.cx;
    const z = wzp - this.cz;
    let h = this.rawHeight(x, z);
    for (let i = 0; i < this.zones.length; i++) {
      const zn = this.zones[i];
      const d = Math.hypot(wxp - zn.x, wzp - zn.z);
      if (d < zn.r) {
        const w = smoothstep(zn.r, zn.r * 0.5, d);
        h = lerp(h, this.zoneHeights[i], w);
      }
    }
    return h;
  }

  private generate() {
    const V = this.verts;
    const masks = new Float32Array(V * V);
    for (let iz = 0; iz < V; iz++) {
      for (let ix = 0; ix < V; ix++) {
        const x = this.cx - this.half + ix * this.cell;
        const z = this.cz - this.half + iz * this.cell;
        const i = iz * V + ix;
        this.heights[i] = this.heightFn(x, z);
        masks[i] = this.lastMask;
        this.forest[i] = fbm(this.noise, x * 0.011 + 900, z * 0.011 - 300, 3);
      }
    }
    const c = new THREE.Color();
    const tmp = new THREE.Color();
    for (let iz = 0; iz < V; iz++) {
      for (let ix = 0; ix < V; ix++) {
        const i = iz * V + ix;
        const x = this.cx - this.half + ix * this.cell;
        const z = this.cz - this.half + iz * this.cell;
        const h = this.heights[i];
        const hx = this.heights[iz * V + Math.min(V - 1, ix + 1)] - this.heights[iz * V + Math.max(0, ix - 1)];
        const hz = this.heights[Math.min(V - 1, iz + 1) * V + ix] - this.heights[Math.max(0, iz - 1) * V + ix];
        const slope = Math.hypot(hx, hz) / (2 * this.cell);
        const f = this.forest[i];
        const mask = masks[i];
        const jitter = this.noise.noise(x * 0.15, z * 0.15) * 0.5 + this.noise.noise(x * 0.6 + 7, z * 0.6) * 0.5;
        if (this.style === 'ember') {
          this.biomes[i] = this.colourEmber(i, x, z, h, slope, f, mask, jitter, c, tmp);
          continue;
        }

        const forestW = smoothstep(-0.02, 0.18, f);
        c.copy(COL.meadow).lerp(COL.meadow2, clamp(0.5 + jitter * 0.6, 0, 1) * 0.5);
        tmp.copy(COL.forest).lerp(COL.forest2, clamp(0.5 + jitter, 0, 1));
        c.lerp(tmp, forestW);
        const hw = clamp(smoothstep(17, 27, h) + mask * smoothstep(9, 17, h), 0, 1);
        c.lerp(COL.highland, hw);
        const rockW = smoothstep(0.42, 0.75, slope) * (h > 1.5 ? 1 : 0.3);
        tmp.copy(COL.rock).lerp(COL.rockDark, clamp(0.5 + jitter, 0, 1));
        c.lerp(tmp, rockW);
        const snowW = smoothstep(39, 47, h + jitter * 4) * (1 - smoothstep(0.7, 1.1, slope) * 0.7);
        c.lerp(COL.snow, snowW);
        const beachW = smoothstep(2.1, 1.0, h);
        tmp.copy(COL.sand).lerp(COL.wetSand, smoothstep(0.6, -0.4, h));
        c.lerp(tmp, beachW);
        c.lerp(COL.seabed, smoothstep(-1.5, -6, h));
        const bright = 1 + jitter * 0.06;
        this.colors[i * 3] = c.r * bright;
        this.colors[i * 3 + 1] = c.g * bright;
        this.colors[i * 3 + 2] = c.b * bright;

        let b: BiomeId;
        if (h < -2) b = BIOME.ocean;
        else if (beachW > 0.5) b = BIOME.beach;
        else if (snowW > 0.5) b = BIOME.peaks;
        else if (hw > 0.5) b = BIOME.highlands;
        else if (forestW > 0.5) b = BIOME.forest;
        else b = BIOME.meadow;
        this.biomes[i] = b;
      }
    }
  }

  private colourEmber(i: number, x: number, z: number, h: number, slope: number, f: number, cone: number, jitter: number, c: THREE.Color, tmp: THREE.Color): BiomeId {
    c.copy(COL.ash).lerp(COL.ash2, clamp(0.5 + jitter * 0.7, 0, 1));
    const grassW = smoothstep(0.05, 0.3, f) * (1 - smoothstep(0.15, 0.4, cone));
    c.lerp(COL.dryGrass, grassW * 0.75);
    const volcW = smoothstep(0.25, 0.45, cone);
    tmp.copy(COL.scorched).lerp(COL.basalt, clamp(0.5 + jitter, 0, 1));
    c.lerp(tmp, volcW);
    const rockW = smoothstep(0.45, 0.8, slope);
    tmp.copy(COL.basalt).lerp(COL.basaltDark, clamp(0.5 + jitter, 0, 1));
    c.lerp(tmp, rockW);
    const vd = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    const craterW = smoothstep(VOLCANO.craterR + 4, VOLCANO.craterR - 2, vd);
    c.lerp(COL.crater, craterW);
    const beachW = smoothstep(2.1, 1.0, h);
    tmp.copy(COL.blackSand).lerp(COL.blackWet, smoothstep(0.6, -0.4, h));
    c.lerp(tmp, beachW);
    c.lerp(COL.seabed, smoothstep(-1.5, -6, h));
    const bright = 1 + jitter * 0.06;
    this.colors[i * 3] = c.r * bright;
    this.colors[i * 3 + 1] = c.g * bright;
    this.colors[i * 3 + 2] = c.b * bright;
    if (h < -2) return BIOME.ocean;
    if (beachW > 0.5) return BIOME.blacksand;
    if (volcW > 0.5 || craterW > 0.5) return BIOME.volcano;
    return BIOME.ash;
  }

  private buildMesh(): THREE.Mesh {
    const V = this.verts;
    const pos = new Float32Array(V * V * 3);
    const uv = new Float32Array(V * V * 2);
    for (let iz = 0; iz < V; iz++) {
      for (let ix = 0; ix < V; ix++) {
        const i = iz * V + ix;
        const x = this.cx - this.half + ix * this.cell;
        const z = this.cz - this.half + iz * this.cell;
        pos[i * 3] = x;
        pos[i * 3 + 1] = this.heights[i];
        pos[i * 3 + 2] = z;
        uv[i * 2] = x / 5;
        uv[i * 2 + 1] = z / 5;
      }
    }
    const idx = new Uint32Array(this.res * this.res * 6);
    let k = 0;
    for (let iz = 0; iz < this.res; iz++) {
      for (let ix = 0; ix < this.res; ix++) {
        const a = iz * V + ix; // 00
        const b = (iz + 1) * V + ix; // 01
        const c = iz * V + ix + 1; // 10
        const d = (iz + 1) * V + ix + 1; // 11
        idx[k++] = a;
        idx[k++] = b;
        idx[k++] = c;
        idx[k++] = b;
        idx[k++] = d;
        idx[k++] = c;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: groundDetailTexture(),
      roughness: 0.96,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = `terrain_${this.style}`;
    return mesh;
  }

  private H(ix: number, iz: number) {
    ix = ix < 0 ? 0 : ix > this.res ? this.res : ix;
    iz = iz < 0 ? 0 : iz > this.res ? this.res : iz;
    return this.heights[iz * this.verts + ix];
  }

  /** Exact surface height (matches the mesh triangulation). */
  heightAt(x: number, z: number): number {
    const gx = (x - this.cx + this.half) / this.cell;
    const gz = (z - this.cz + this.half) / this.cell;
    if (gx < 0 || gz < 0 || gx >= this.res || gz >= this.res) return -13;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const h00 = this.H(ix, iz);
    const h10 = this.H(ix + 1, iz);
    const h01 = this.H(ix, iz + 1);
    const h11 = this.H(ix + 1, iz + 1);
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  normalAt(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    const e = 0.6;
    const hl = this.heightAt(x - e, z);
    const hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e);
    const hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  /** 0 = flat, ~1 = 45 degrees. */
  slopeAt(x: number, z: number): number {
    const e = 1;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  private nearestIndex(x: number, z: number): number {
    const ix = clamp(Math.round((x - this.cx + this.half) / this.cell), 0, this.res);
    const iz = clamp(Math.round((z - this.cz + this.half) / this.cell), 0, this.res);
    return iz * this.verts + ix;
  }

  biomeAt(x: number, z: number): BiomeId {
    if (!this.contains(x, z)) return BIOME.ocean;
    return this.biomes[this.nearestIndex(x, z)] as BiomeId;
  }

  forestAt(x: number, z: number): number {
    return this.forest[this.nearestIndex(x, z)];
  }

  colorAt(x: number, z: number, out: THREE.Color): THREE.Color {
    const i = this.nearestIndex(x, z) * 3;
    return out.setRGB(this.colors[i], this.colors[i + 1], this.colors[i + 2]);
  }

  /** Ray vs heightfield. Returns hit distance or null. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): number | null {
    const step = 0.5;
    let prevT = 0;
    for (let t = step; t <= maxDist; t += step) {
      const x = origin.x + dir.x * t;
      const y = origin.y + dir.y * t;
      const z = origin.z + dir.z * t;
      if (y <= this.heightAt(x, z)) {
        let lo = prevT;
        let hi = t;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          const my = origin.y + dir.y * mid;
          if (my <= this.heightAt(origin.x + dir.x * mid, origin.z + dir.z * mid)) hi = mid;
          else lo = mid;
        }
        return hi;
      }
      prevT = t;
    }
    return null;
  }
}

export type IslandId = 'home' | 'ember';

/**
 * The whole world: the home island plus the ember isle, with the sea in between.
 * Every query is routed to the island under (x, z); open sea is 13 m deep.
 */
export class Terrain {
  readonly home: IslandTerrain;
  readonly ember: IslandTerrain;
  readonly islands: IslandTerrain[];
  readonly mesh = new THREE.Group();

  constructor(
    public readonly seed: number,
    zones: FlatZone[],
  ) {
    this.home = new IslandTerrain(seed, zones);
    this.ember = new IslandTerrain(seed + 7717, zones, { ...EMBER_ISLE, style: 'ember' });
    this.islands = [this.home, this.ember];
    this.mesh.name = 'terrain';
    for (const t of this.islands) this.mesh.add(t.mesh);
  }

  islandOf(x: number, z: number): IslandTerrain | null {
    const h = this.home;
    if (Math.abs(x - h.cx) < h.half && Math.abs(z - h.cz) < h.half) return h;
    const e = this.ember;
    if (Math.abs(x - e.cx) < e.half && Math.abs(z - e.cz) < e.half) return e;
    return null;
  }

  /** Which island a point belongs to (null = open sea). */
  islandId(x: number, z: number): IslandId | null {
    const t = this.islandOf(x, z);
    return t ? (t.style as IslandId) : null;
  }

  heightAt(x: number, z: number): number {
    const t = this.islandOf(x, z);
    return t ? t.heightAt(x, z) : -13;
  }

  normalAt(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    const e = 0.6;
    const hl = this.heightAt(x - e, z);
    const hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e);
    const hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  slopeAt(x: number, z: number): number {
    const e = 1;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  biomeAt(x: number, z: number): BiomeId {
    const t = this.islandOf(x, z);
    return t ? t.biomeAt(x, z) : BIOME.ocean;
  }

  forestAt(x: number, z: number): number {
    const t = this.islandOf(x, z);
    return t ? t.forestAt(x, z) : -1;
  }

  colorAt(x: number, z: number, out: THREE.Color): THREE.Color {
    const t = this.islandOf(x, z);
    return t ? t.colorAt(x, z, out) : out.copy(COL.seabed);
  }

  /** Ray vs heightfield. Returns hit distance or null. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): number | null {
    const step = 0.5;
    let prevT = 0;
    for (let t = step; t <= maxDist; t += step) {
      const x = origin.x + dir.x * t;
      const y = origin.y + dir.y * t;
      const z = origin.z + dir.z * t;
      if (y <= this.heightAt(x, z)) {
        let lo = prevT;
        let hi = t;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          const my = origin.y + dir.y * mid;
          if (my <= this.heightAt(origin.x + dir.x * mid, origin.z + dir.z * mid)) hi = mid;
          else lo = mid;
        }
        return hi;
      }
      prevT = t;
    }
    return null;
  }
}
