import * as THREE from 'three';
import { WORLD } from '../config';
import { rampHeight, type Collider } from '../world/Colliders';
import type { Game } from '../Game';

/**
 * Walkability grid around the settlement (1m cells) with A* path finding for villagers.
 * Rebuilt lazily whenever buildings change. Doors count as passable (villagers open them),
 * roads are cheaper so villagers prefer them, water and cliffs are avoided.
 */
const CELL = 1;
const BODY_LOW = 0.45; // obstacles below this (above the floor) can be stepped over
const BODY_HIGH = 1.7;
const STEP = 0.55; // max height change between neighbouring cells
const RADIUS = 0.3;
const MAX_EXPANSIONS = 24000;

export class NavGrid {
  ox = 0;
  oz = 0;
  n = 0;
  /** 0 = free, 1 = blocked, 2 = door (passable) */
  cells = new Uint8Array(0);
  surface = new Float32Array(0);
  road = new Uint8Array(0);
  private builtVersion = -1;
  private builtKey = '';
  /** stats for tests / debugging */
  lastBuildMs = 0;
  lastExpansions = 0;
  private tmp: Collider[] = [];
  // A* scratch buffers
  private g = new Float32Array(0);
  private parent = new Int32Array(0);
  private closed = new Uint8Array(0);
  private heap: number[] = [];
  private heapF: number[] = [];

  constructor(private game: Game) {}

  get version() {
    return this.builtVersion;
  }

  /** Make sure the grid matches the current buildings / settlement size. Returns false if there is no settlement. */
  ensure(): boolean {
    const st = this.game.state.settlement;
    const c = this.game.settlement.center();
    if (!st.founded || !c) return false;
    const R = this.game.settlement.radius() + 14;
    const key = `${Math.round(c.x)},${Math.round(c.z)},${R}`;
    if (this.builtVersion === this.game.building.version && this.builtKey === key) return true;
    this.build(c.x, c.z, R);
    this.builtVersion = this.game.building.version;
    this.builtKey = key;
    return true;
  }

  private build(cx: number, cz: number, R: number) {
    const t0 = performance.now();
    this.n = Math.ceil((R * 2) / CELL);
    this.ox = cx - R;
    this.oz = cz - R;
    const N = this.n * this.n;
    this.cells = new Uint8Array(N);
    this.surface = new Float32Array(N);
    this.road = new Uint8Array(N);
    this.g = new Float32Array(N);
    this.parent = new Int32Array(N);
    this.closed = new Uint8Array(N);
    const building = this.game.building;
    for (let iz = 0; iz < this.n; iz++) {
      for (let ix = 0; ix < this.n; ix++) {
        const i = iz * this.n + ix;
        const x = this.ox + (ix + 0.5) * CELL;
        const z = this.oz + (iz + 0.5) * CELL;
        const s = this.surfaceAt(x, z);
        this.surface[i] = s;
        if (s < WORLD.waterLevel + 0.15) {
          this.cells[i] = 1;
          continue;
        }
        if (building.isRoadAt(x, z)) this.road[i] = 1;
        this.cells[i] = this.blockedAt(x, z, s);
      }
    }
    this.lastBuildMs = performance.now() - t0;
  }

  /** Highest floor a villager could stand on at (x, z): terrain, foundations, floors, ramps. */
  private surfaceAt(x: number, z: number): number {
    const th = this.game.terrain.heightAt(x, z);
    let g = th;
    const list = this.game.colliders.query(x - 0.05, z - 0.05, x + 0.05, z + 0.05, this.tmp);
    for (const c of list) {
      if (c.kind === 'box') {
        if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.maxY <= th + 1.3 && c.maxY > g) g = c.maxY;
      } else if (c.kind === 'ramp') {
        if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) {
          const h = rampHeight(c, x, z);
          if (h <= th + 1.3 && h > g) g = h;
        }
      }
    }
    return g;
  }

  private blockedAt(x: number, z: number, s: number): number {
    const h = CELL / 2 + RADIUS - 0.08;
    const list = this.game.colliders.query(x - h, z - h, x + h, z + h, this.tmp);
    let door = false;
    for (const c of list) {
      if (c.kind === 'ramp') continue; // stairs are walkable; height steps are checked between cells
      if (c.maxY <= s + BODY_LOW || c.minY >= s + BODY_HIGH) continue;
      if (c.kind === 'box') {
        if (x + h <= c.minX || x - h >= c.maxX || z + h <= c.minZ || z - h >= c.maxZ) continue;
        const piece = typeof c.owner === 'number' ? this.game.building.pieces.get(c.owner) : undefined;
        if (piece && piece.def.interact === 'door') {
          door = true;
          continue;
        }
        return 1;
      } else if (c.kind === 'circle') {
        if (Math.hypot(c.x - x, c.z - z) < c.r + RADIUS + 0.2) return 1;
      }
    }
    return door ? 2 : 0;
  }

  inBounds(x: number, z: number): boolean {
    return this.n > 0 && x >= this.ox && z >= this.oz && x < this.ox + this.n * CELL && z < this.oz + this.n * CELL;
  }

  private index(x: number, z: number): number {
    const ix = Math.floor((x - this.ox) / CELL);
    const iz = Math.floor((z - this.oz) / CELL);
    if (ix < 0 || iz < 0 || ix >= this.n || iz >= this.n) return -1;
    return iz * this.n + ix;
  }

  isFree(x: number, z: number): boolean {
    const i = this.index(x, z);
    return i >= 0 && this.cells[i] !== 1;
  }

  /** Nearest walkable cell within a few metres (targets often sit inside a workplace's collider). */
  private nearestFree(i: number, maxR = 4): number {
    if (i < 0) return -1;
    if (this.cells[i] !== 1) return i;
    const n = this.n;
    const ix = i % n;
    const iz = (i / n) | 0;
    for (let r = 1; r <= maxR; r++) {
      let best = -1;
      let bd = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = ix + dx;
          const z = iz + dz;
          if (x < 0 || z < 0 || x >= n || z >= n) continue;
          const j = z * n + x;
          if (this.cells[j] === 1) continue;
          const d = dx * dx + dz * dz;
          if (d < bd) {
            bd = d;
            best = j;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  private canStep(a: number, b: number): boolean {
    return Math.abs(this.surface[a] - this.surface[b]) <= STEP;
  }

  // binary heap keyed by f
  private push(i: number, f: number) {
    const h = this.heap;
    const hf = this.heapF;
    h.push(i);
    hf.push(f);
    let k = h.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[p] <= hf[k]) break;
      [h[p], h[k]] = [h[k], h[p]];
      [hf[p], hf[k]] = [hf[k], hf[p]];
      k = p;
    }
  }

  private pop(): number {
    const h = this.heap;
    const hf = this.heapF;
    const top = h[0];
    const last = h.pop()!;
    const lastF = hf.pop()!;
    if (h.length) {
      h[0] = last;
      hf[0] = lastF;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < h.length && hf[l] < hf[m]) m = l;
        if (r < h.length && hf[r] < hf[m]) m = r;
        if (m === k) break;
        [h[m], h[k]] = [h[k], h[m]];
        [hf[m], hf[k]] = [hf[k], hf[m]];
        k = m;
      }
    }
    return top;
  }

  /**
   * A* from `from` to `to`. Returns smoothed world-space waypoints (excluding the start),
   * or null when either end is outside the grid or no route exists.
   */
  findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
    if (!this.ensure()) return null;
    const s = this.nearestFree(this.index(from.x, from.z), 3);
    const t = this.nearestFree(this.index(to.x, to.z), 4);
    if (s < 0 || t < 0) return null;
    if (s === t) return [to.clone()];
    const n = this.n;
    this.g.fill(Infinity);
    this.closed.fill(0);
    this.heap.length = 0;
    this.heapF.length = 0;
    const tx = t % n;
    const tz = (t / n) | 0;
    const hFn = (i: number) => {
      const dx = Math.abs((i % n) - tx);
      const dz = Math.abs(((i / n) | 0) - tz);
      return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)) * 0.75;
    };
    this.g[s] = 0;
    this.parent[s] = -1;
    this.push(s, hFn(s));
    let expansions = 0;
    let found = false;
    while (this.heap.length) {
      const u = this.pop();
      if (this.closed[u]) continue;
      if (u === t) {
        found = true;
        break;
      }
      this.closed[u] = 1;
      if (++expansions > MAX_EXPANSIONS) break;
      const ux = u % n;
      const uz = (u / n) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const x = ux + dx;
          const z = uz + dz;
          if (x < 0 || z < 0 || x >= n || z >= n) continue;
          const v = z * n + x;
          if (this.closed[v] || this.cells[v] === 1 || !this.canStep(u, v)) continue;
          if (dx && dz) {
            // no corner cutting past walls
            const a = uz * n + x;
            const b = z * n + ux;
            if (this.cells[a] === 1 || this.cells[b] === 1) continue;
          }
          let cost = dx && dz ? Math.SQRT2 : 1;
          if (this.road[v]) cost *= 0.75;
          cost += Math.abs(this.surface[v] - this.surface[u]) * 0.8;
          const ng = this.g[u] + cost;
          if (ng < this.g[v]) {
            this.g[v] = ng;
            this.parent[v] = u;
            this.push(v, ng + hFn(v));
          }
        }
      }
    }
    this.lastExpansions = expansions;
    if (!found) return null;
    const cells: number[] = [];
    for (let i = t; i !== -1; i = this.parent[i]) cells.push(i);
    cells.reverse();
    // string pulling: keep only the waypoints needed for straight, clear segments
    const out: THREE.Vector3[] = [];
    let anchor = 0;
    while (anchor < cells.length - 1) {
      let next = anchor + 1;
      for (let k = cells.length - 1; k > anchor + 1; k--) {
        if (this.clearLine(cells[anchor], cells[k])) {
          next = k;
          break;
        }
      }
      out.push(this.cellPos(cells[next]));
      anchor = next;
    }
    // finish exactly at the requested target if it is reachable from the last cell
    const last = out[out.length - 1];
    if (last && Math.hypot(last.x - to.x, last.z - to.z) < 1.6) last.set(to.x, last.y, to.z);
    return out;
  }

  private cellPos(i: number): THREE.Vector3 {
    const n = this.n;
    return new THREE.Vector3(this.ox + ((i % n) + 0.5) * CELL, this.surface[i], this.oz + (((i / n) | 0) + 0.5) * CELL);
  }

  /** Straight walk between two cells stays on free cells without big steps. */
  private clearLine(a: number, b: number): boolean {
    const n = this.n;
    const ax = (a % n) + 0.5;
    const az = ((a / n) | 0) + 0.5;
    const bx = (b % n) + 0.5;
    const bz = ((b / n) | 0) + 0.5;
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / 0.3);
    let prev = a;
    for (let k = 1; k <= steps; k++) {
      const f = k / steps;
      const x = ax + (bx - ax) * f;
      const z = az + (bz - az) * f;
      // check the cell and its neighbours across the body width
      for (const [ox, oz] of [
        [0, 0],
        [RADIUS, 0],
        [-RADIUS, 0],
        [0, RADIUS],
        [0, -RADIUS],
      ]) {
        const ix = Math.floor(x + ox);
        const iz = Math.floor(z + oz);
        if (ix < 0 || iz < 0 || ix >= n || iz >= n) return false;
        const i = iz * n + ix;
        if (this.cells[i] === 1) return false;
      }
      const i = Math.floor(z) * n + Math.floor(x);
      if (i !== prev) {
        if (!this.canStep(prev, i)) return false;
        prev = i;
      }
    }
    return true;
  }
}
