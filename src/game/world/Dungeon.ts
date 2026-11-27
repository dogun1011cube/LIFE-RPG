import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CollisionWorld, BoxCollider, Collider } from './Colliders';
import { boxGeo, stoneTexture, glowTexture } from './textures';
import { createChest, createFlame, type Flame } from './props';
import type { LightSource } from './Landmarks';
import { DUNGEONS, type DungeonDef, type LeverSymbol } from '../data/dungeons';

/** Origin of the crypt (kept for older code paths; each dungeon has its own `origin`). */
export const DUNGEON_ORIGIN = new THREE.Vector3(...DUNGEONS.crypt.origin);
const CELL = 2;

export type DungeonInteractKind = 'lever' | 'valve' | 'portal' | 'chest' | 'lore';

export interface DungeonInteractable {
  id: string;
  kind: DungeonInteractKind;
  pos: THREE.Vector3;
  radius: number;
  label: string;
  symbol?: LeverSymbol;
}

export interface DungeonSpawn {
  enemy: string;
  x: number;
  z: number;
}

export type PuzzleResult = 'progress' | 'solved' | 'wrong' | 'already';

/**
 * An interior dungeon built from a DungeonDef: grid rooms merged into few draw calls, a gate opened by
 * a puzzle (ordered levers or cooling valves), an optional breakable wall, lava strips, chests, portals
 * and a boss chamber.
 */
export class Dungeon {
  readonly group = new THREE.Group();
  readonly interactables: DungeonInteractable[] = [];
  readonly lights: LightSource[] = [];
  /** World-space centres of all floor cells (for the map). */
  readonly cells: { x: number; z: number }[] = [];
  readonly entryPos: THREE.Vector3;
  readonly origin: THREE.Vector3;
  gateOpen = false;
  wallBroken = false;
  bossSpawned = false;
  bossDefeated = false;
  /** levers pulled / valves turned so far */
  pulled: string[] = [];
  wallHp: number;
  private open = new Set<string>();
  private walled = new Set<string>();
  private flames: Flame[] = [];
  private gate: THREE.Group;
  private gateCollider: BoxCollider;
  private gateY = 0;
  private crackWall: THREE.Mesh | null = null;
  private crackCollider: BoxCollider | null = null;
  private handles = new Map<string, THREE.Object3D>();
  private lavaMats: { mat: THREE.MeshStandardMaterial; cools: boolean }[] = [];
  private time = 0;
  private resetTimer = 0;

  constructor(
    readonly def: DungeonDef,
    private colliders: CollisionWorld,
  ) {
    this.origin = new THREE.Vector3(...def.origin);
    this.group.name = `dungeon_${def.id}`;
    this.group.visible = false;
    for (const r of def.rooms) for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) this.open.add(`${x},${z}`);
    for (const [x, z, nx, nz] of def.walledEdges ?? []) {
      this.walled.add(`${x},${z}|${nx},${nz}`);
      this.walled.add(`${nx},${nz}|${x},${z}`);
    }
    this.wallHp = def.crack?.hp ?? 0;
    this.entryPos = this.w(def.entry[0], def.entry[1]);
    this.buildShell();
    const g = this.buildGate();
    this.gate = g.gate;
    this.gateCollider = g.collider;
    if (def.crack) {
      const c = this.buildCrackWall(def.crack.at);
      this.crackWall = c.mesh;
      this.crackCollider = c.collider;
    }
    this.buildProps();
  }

  // ── compatibility names used by older code and tests ───
  get keeperSpawned() {
    return this.bossSpawned;
  }
  set keeperSpawned(v: boolean) {
    this.bossSpawned = v;
  }
  get keeperDefeated() {
    return this.bossDefeated;
  }
  set keeperDefeated(v: boolean) {
    this.bossDefeated = v;
  }

  /** local metres -> world */
  w(lx: number, lz: number, ly = 0): THREE.Vector3 {
    return new THREE.Vector3(this.origin.x + lx, this.origin.y + ly, this.origin.z + lz);
  }

  private isOpen(x: number, z: number) {
    return this.open.has(`${x},${z}`);
  }

  private heightAtCell(x: number, z: number) {
    for (const r of this.def.rooms) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r.h ?? this.def.wallH;
    return this.def.wallH;
  }

  private addBoxCollider(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): BoxCollider {
    const O = this.origin;
    const c: BoxCollider = { kind: 'box', minX: O.x + x0, maxX: O.x + x1, minY: O.y + y0, maxY: O.y + y1, minZ: O.z + z0, maxZ: O.z + z1, owner: 'dungeon' };
    this.colliders.add(c);
    return c;
  }

  private crackEdge(x: number, z: number, nx: number, nz: number): boolean {
    const c = this.def.crack;
    if (!c) return false;
    const cx = Math.round(c.at[0] / CELL);
    const cz = Math.floor(c.at[1] / CELL);
    return z === cz && nz === cz && ((x === cx - 1 && nx === cx) || (x === cx && nx === cx - 1));
  }

  private buildShell() {
    const def = this.def;
    const floorGeos: THREE.BufferGeometry[] = [];
    const wallGeos: THREE.BufferGeometry[] = [];
    const ceilGeos: THREE.BufferGeometry[] = [];
    const T = 0.6;
    for (const key of this.open) {
      const [x, z] = key.split(',').map(Number);
      const cx = x * CELL + CELL / 2;
      const cz = z * CELL + CELL / 2;
      const h = this.heightAtCell(x, z);
      this.cells.push({ x: this.origin.x + cx, z: this.origin.z + cz });
      const f = boxGeo(CELL, 1, CELL, 2);
      f.translate(cx, -0.5, cz);
      floorGeos.push(f);
      const c = boxGeo(CELL, 1, CELL, 2);
      c.translate(cx, h + 0.5, cz);
      ceilGeos.push(c);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const nz = z + dz;
        const forced = this.walled.has(`${x},${z}|${nx},${nz}`);
        if (this.isOpen(nx, nz) && !forced) {
          // inner partition between rooms of different heights: fill the gap above the lower ceiling
          const nh = this.heightAtCell(nx, nz);
          if (nh < h && dz !== 0) {
            const g = boxGeo(CELL, h - nh, 0.4, 2);
            g.translate(cx, nh + (h - nh) / 2, cz + dz * (CELL / 2));
            wallGeos.push(g);
          }
          continue;
        }
        if (this.crackEdge(x, z, nx, nz)) continue;
        const wx = cx + dx * (CELL / 2 + T / 2);
        const wz = cz + dz * (CELL / 2 + T / 2);
        const sx = dx !== 0 ? T : CELL + T * 2;
        const sz = dz !== 0 ? T : CELL + T * 2;
        const g = boxGeo(sx, h, sz, 2);
        g.translate(wx, h / 2, wz);
        wallGeos.push(g);
        this.addBoxCollider(wx - sx / 2, 0, wz - sz / 2, wx + sx / 2, h, wz + sz / 2);
      }
    }
    // one big floor collider per room
    for (const r of def.rooms) this.addBoxCollider(r.x0 * CELL, -1, r.z0 * CELL, (r.x1 + 1) * CELL, 0, (r.z1 + 1) * CELL);
    const th = def.theme;
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture(th.floor), roughness: 0.95 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture(th.wall, true), roughness: 0.95 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: th.ceilTint, map: stoneTexture(th.ceil), roughness: 1 });
    for (const [geos, m] of [
      [floorGeos, floorMat],
      [wallGeos, wallMat],
      [ceilGeos, ceilMat],
    ] as const) {
      const merged = mergeGeometries(geos as THREE.BufferGeometry[], false)!;
      const mesh = new THREE.Mesh(merged, m);
      mesh.receiveShadow = true;
      mesh.position.copy(this.origin);
      this.group.add(mesh);
    }
  }

  private buildGate(): { gate: THREE.Group; collider: BoxCollider } {
    const gd = this.def.gate;
    const gate = new THREE.Group();
    const valves = this.def.puzzle.kind === 'valves';
    if (valves) {
      // a basalt slab door
      const slab = new THREE.Mesh(boxGeo(gd.width, gd.height, 0.5, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture('#2e2826', true), roughness: 0.9 }));
      slab.position.y = gd.height / 2;
      const runeMat = new THREE.MeshStandardMaterial({ color: 0xff6a2a, emissive: 0xff4a0a, emissiveIntensity: 1.2 });
      const rune = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.6, 3), runeMat);
      rune.position.set(0, gd.height * 0.55, 0.26);
      gate.add(slab, rune);
    } else {
      const iron = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.5, metalness: 0.7 });
      for (let i = 0; i < 9; i++) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, gd.height, 6), iron);
        bar.position.set(-gd.width / 2 + 0.25 + i * ((gd.width - 0.5) / 8), gd.height / 2, 0);
        gate.add(bar);
      }
      for (const y of [0.6, gd.height / 2 + 0.1, gd.height - 0.4]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(gd.width, 0.12, 0.12), iron);
        rail.position.set(0, y, 0);
        gate.add(rail);
      }
    }
    gate.position.copy(this.w(gd.at[0], gd.at[1]));
    this.group.add(gate);
    const h = this.def.wallH;
    const lintel = new THREE.Mesh(boxGeo(gd.width + 0.4, h - gd.height, 0.6, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture(this.def.theme.wall, true), roughness: 0.95 }));
    lintel.position.copy(this.w(gd.at[0], gd.at[1], gd.height + (h - gd.height) / 2));
    this.group.add(lintel);
    const collider = this.addBoxCollider(gd.at[0] - gd.width / 2, 0, gd.at[1] - 0.2, gd.at[0] + gd.width / 2, gd.height, gd.at[1] + 0.2);
    return { gate, collider };
  }

  private buildCrackWall(at: [number, number]): { mesh: THREE.Mesh; collider: BoxCollider } {
    const h = this.def.wallH;
    const mat = new THREE.MeshStandardMaterial({ color: 0xc8a898, map: stoneTexture(this.def.theme.crack), roughness: 0.95 });
    const mesh = new THREE.Mesh(boxGeo(0.6, h, CELL, 2), mat);
    mesh.position.copy(this.w(at[0], at[1], h / 2));
    const crackMat = new THREE.MeshBasicMaterial({ color: 0x1a1410 });
    for (const [y, rz, len] of [
      [1.2, 0.5, 1.4],
      [1.9, -0.7, 1.1],
      [2.6, 0.3, 1.3],
      [0.9, -0.2, 0.8],
    ]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.02, len, 0.05), crackMat);
      c.position.set(-0.31, y - h / 2, ((y * 7) % 1) - 0.5);
      c.rotation.x = rz;
      mesh.add(c);
    }
    mesh.castShadow = true;
    this.group.add(mesh);
    const collider = this.addBoxCollider(at[0] - 0.3, 0, at[1] - 1, at[0] + 0.3, h, at[1] + 1);
    return { mesh, collider };
  }

  private torch(lx: number, lz: number, faceX: number, faceZ: number) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), new THREE.MeshStandardMaterial({ color: 0x3a3028, metalness: 0.4, roughness: 0.6 }));
    const p = this.w(lx, lz, 2.6);
    bracket.position.copy(p);
    this.group.add(bracket);
    const flame = createFlame(0.55);
    flame.group.position.set(p.x + faceX * 0.1, p.y + 0.25, p.z + faceZ * 0.1);
    this.group.add(flame.group);
    this.flames.push(flame);
    this.lights.push({ pos: new THREE.Vector3(p.x + faceX * 0.6, p.y + 0.4, p.z + faceZ * 0.6), color: this.def.theme.torch, intensity: 24, distance: 18 });
  }

  private portal(id: string, lx: number, lz: number, label: string, rotY = 0) {
    const col = this.def.theme.portal;
    const ringMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.3, roughness: 0.3 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 8, 28), ringMat);
    const p = this.w(lx, lz, 1.4);
    ring.position.copy(p);
    ring.rotation.y = rotY;
    ring.name = 'portalRing';
    this.group.add(ring);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(3, 3, 1);
    glow.position.copy(p);
    this.group.add(glow);
    this.lights.push({ pos: p.clone(), color: col, intensity: 8, distance: 10 });
    this.interactables.push({ id, kind: 'portal', pos: p.clone().setY(this.origin.y + 1), radius: 2.6, label });
  }

  private lever(symbol: LeverSymbol, lx: number, lz: number, rotY: number) {
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0x6a655c, roughness: 0.9 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.4), stone);
    base.position.y = 0.5;
    const handle = new THREE.Group();
    handle.position.set(0, 0.95, 0.15);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0x4a3a2a }));
    stick.position.y = 0.4;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshStandardMaterial({ color: 0x8a7a5a, metalness: 0.5 }));
    knob.position.y = 0.8;
    handle.add(stick, knob);
    handle.rotation.x = -0.6;
    handle.name = 'handle';
    const color = symbol === 'sun' ? 0xffc84a : symbol === 'moon' ? 0xbfd8ff : 0xb06aff;
    const symMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 });
    let sym: THREE.Mesh;
    if (symbol === 'sun') sym = new THREE.Mesh(new THREE.CircleGeometry(0.17, 16), symMat);
    else if (symbol === 'moon') sym = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.18, 16, 1, 0.6, Math.PI * 1.4), symMat);
    else {
      const shape = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 0.2 : 0.08;
        const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
        if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      sym = new THREE.Mesh(new THREE.ShapeGeometry(shape), symMat);
    }
    sym.position.set(0, 0.55, 0.205);
    g.add(base, handle, sym);
    g.position.copy(this.w(lx, lz));
    g.rotation.y = rotY;
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    this.group.add(g);
    this.handles.set(symbol, handle);
    this.addBoxCollider(lx - 0.4, 0, lz - 0.4, lx + 0.4, 1.0, lz + 0.4);
    const names = { sun: '해', moon: '달', star: '별' };
    this.interactables.push({ id: `lever_${symbol}`, kind: 'lever', pos: this.w(lx, lz, 1), radius: 2.2, label: `${names[symbol]} 문양 레버 당기기`, symbol });
  }

  /** A cooling valve: an obsidian wheel on a pipe. */
  private valve(id: string, lx: number, lz: number, rotY: number) {
    const g = new THREE.Group();
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, metalness: 0.6, roughness: 0.4 });
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.6, 8), pipeMat);
    pipe.position.y = 1.3;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.5), pipeMat);
    box.position.y = 1.1;
    const wheel = new THREE.Group();
    wheel.position.set(0, 1.1, 0.32);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 6, 16), new THREE.MeshStandardMaterial({ color: 0x2a2433, metalness: 0.4, roughness: 0.2, emissive: 0xff4a0a, emissiveIntensity: 0.6 }));
    for (let i = 0; i < 3; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.04), rim.material);
      spoke.rotation.z = (i / 3) * Math.PI;
      wheel.add(spoke);
    }
    wheel.add(rim);
    wheel.name = 'wheel';
    g.add(pipe, box, wheel);
    g.position.copy(this.w(lx, lz));
    g.rotation.y = rotY;
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    this.group.add(g);
    this.handles.set(id, wheel);
    this.addBoxCollider(lx - 0.35, 0, lz - 0.35, lx + 0.35, 2.6, lz + 0.35);
    this.interactables.push({ id, kind: 'valve', pos: this.w(lx, lz, 1), radius: 2.3, label: '냉각 밸브 돌리기' });
  }

  private pillar(lx: number, lz: number, h: number) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, h, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture(this.def.theme.wall, true), roughness: 0.95 }));
    m.position.copy(this.w(lx, lz, h / 2));
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    const O = this.origin;
    const c: Collider = { kind: 'circle', x: O.x + lx, z: O.z + lz, r: 0.65, minY: O.y - 1, maxY: O.y + h, owner: 'dungeon' };
    this.colliders.add(c);
  }

  private chest(id: string, lx: number, lz: number, rotY: number, label: string) {
    const c = createChest(0x5a3a2a);
    c.position.copy(this.w(lx, lz));
    c.rotation.y = rotY;
    this.group.add(c);
    this.interactables.push({ id, kind: 'chest', pos: this.w(lx, lz, 0.5), radius: 2.2, label });
    this.addBoxCollider(lx - 0.5, 0, lz - 0.4, lx + 0.5, 0.8, lz + 0.4);
  }

  private brazier(x: number, z: number) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0x3a3028, metalness: 0.5, roughness: 0.5 }));
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x2a2420, metalness: 0.4 }));
    const p = this.w(x, z);
    stand.position.set(p.x, p.y + 0.55, p.z);
    bowl.position.set(p.x, p.y + 1.25, p.z);
    this.group.add(stand, bowl);
    const flame = createFlame(1.1);
    flame.group.position.set(p.x, p.y + 1.4, p.z);
    this.group.add(flame.group);
    this.flames.push(flame);
    this.lights.push({ pos: new THREE.Vector3(p.x, p.y + 2.4, p.z), color: 0xffa050, intensity: 30, distance: 22 });
    this.addBoxCollider(x - 0.5, 0, z - 0.5, x + 0.5, 1.5, z + 0.5);
  }

  private buildProps() {
    const def = this.def;
    for (const p of def.portals) this.portal(p.id, p.at[0], p.at[1], p.label, p.rot);
    for (const [x, z, fx, fz] of def.torches) this.torch(x, z, fx, fz);
    for (const [x, z, h] of def.pillars) this.pillar(x, z, h);
    for (const [x, z] of def.braziers) this.brazier(x, z);
    for (const c of def.chests) this.chest(c.id, c.at[0], c.at[1], c.rot, c.label);
    if (def.puzzle.kind === 'levers') for (const l of def.puzzle.levers) this.lever(l.symbol, l.at[0], l.at[1], l.rot);
    else for (const v of def.puzzle.valves) this.valve(v.id, v.at[0], v.at[1], v.rot);
    // lore slab
    const L = def.lore;
    const slab = new THREE.Mesh(boxGeo(1.2, 1.6, 0.25, 2), new THREE.MeshStandardMaterial({ color: 0x7d776c, roughness: 0.95 }));
    slab.position.copy(this.w(L.at[0], L.at[1], 0.8));
    slab.rotation.y = L.rot;
    this.group.add(slab);
    this.interactables.push({ id: `dlore_${def.id}`, kind: 'lore', pos: this.w(L.at[0], L.at[1], 1), radius: 2.2, label: L.label });
    // lava strips
    for (const lv of def.lava ?? []) {
      const [x0, x1, z0, z1] = lv.rect;
      const mat = new THREE.MeshStandardMaterial({ color: 0xff5a1a, emissive: 0xff4a0a, emissiveIntensity: 1.6, roughness: 0.6 });
      this.lavaMats.push({ mat, cools: !!lv.cooled });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0, 4, 4), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.copy(this.w((x0 + x1) / 2, (z0 + z1) / 2, 0.04));
      this.group.add(m);
      for (let i = 0; i <= Math.floor((x1 - x0) / 8); i++) {
        const lx = x0 + 2 + i * 8;
        if (lx > x1) break;
        this.lights.push({ pos: this.w(lx, (z0 + z1) / 2, 1.2), color: 0xff5a1a, intensity: 18, distance: 14 });
      }
    }
    // decorations
    for (const d of def.decor ?? []) {
      const s = d.size ?? 1;
      if (d.kind === 'sarcophagus') {
        const sarc = new THREE.Mesh(boxGeo(2.4, 1.0, 1.2, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture('#8a847a'), roughness: 0.9 }));
        sarc.position.copy(this.w(d.at[0], d.at[1], 0.5));
        sarc.castShadow = true;
        this.group.add(sarc);
        this.addBoxCollider(d.at[0] - 1.2, 0, d.at[1] - 0.6, d.at[0] + 1.2, 1.0, d.at[1] + 0.6);
      } else if (d.kind === 'stalagmite') {
        const m = new THREE.Mesh(new THREE.ConeGeometry(0.7 * s, 2.6 * s, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture(def.theme.wall), roughness: 0.95, flatShading: true }));
        m.position.copy(this.w(d.at[0], d.at[1], 1.3 * s));
        m.castShadow = true;
        this.group.add(m);
        const top = m.clone();
        top.rotation.x = Math.PI;
        top.scale.setScalar(0.7);
        top.position.copy(this.w(d.at[0] + 0.4, d.at[1] - 0.3, this.heightAtCell(Math.floor(d.at[0] / CELL), Math.floor(d.at[1] / CELL)) - 0.9 * s));
        this.group.add(top);
        const O = this.origin;
        this.colliders.add({ kind: 'circle', x: O.x + d.at[0], z: O.z + d.at[1], r: 0.6 * s, minY: O.y - 1, maxY: O.y + 2.6 * s, owner: 'dungeon' });
      } else {
        const mat = new THREE.MeshStandardMaterial({ color: 0x2a2433, roughness: 0.15, metalness: 0.3, emissive: 0x5a2a8a, emissiveIntensity: 0.6 });
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.22 * s, (1 + (i % 3) * 0.4) * s, 4), mat);
          c.position.copy(this.w(d.at[0] + Math.cos(a) * 0.4 * s, d.at[1] + Math.sin(a) * 0.4 * s, 0.5 * s));
          c.rotation.set(Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4);
          this.group.add(c);
        }
        this.lights.push({ pos: this.w(d.at[0], d.at[1], 1.2), color: 0x8a4aff, intensity: 6, distance: 8 });
        const O = this.origin;
        this.colliders.add({ kind: 'circle', x: O.x + d.at[0], z: O.z + d.at[1], r: 0.7 * s, minY: O.y - 1, maxY: O.y + 1.6 * s, owner: 'dungeon' });
      }
    }
  }

  /** Enemies placed every time the dungeon is entered (the boss spawns when its chamber is reached). */
  spawns(): DungeonSpawn[] {
    return this.def.spawns.map(([enemy, lx, lz]) => {
      const p = this.w(lx, lz);
      return { enemy, x: p.x, z: p.z };
    });
  }

  bossSpawn(): THREE.Vector3 {
    return this.w(this.def.boss.at[0], this.def.boss.at[1]);
  }

  /** @deprecated use bossSpawn */
  keeperSpawn(): THREE.Vector3 {
    return this.bossSpawn();
  }

  inBossChamber(pos: THREE.Vector3): boolean {
    const [x0, x1, z0, z1] = this.def.boss.chamber;
    const lx = pos.x - this.origin.x;
    const lz = pos.z - this.origin.z;
    return lx > x0 && lx < x1 && lz > z0 && lz < z1;
  }

  contains(pos: THREE.Vector3): boolean {
    const [x0, x1, z0, z1] = this.def.bounds;
    const lx = pos.x - this.origin.x;
    const lz = pos.z - this.origin.z;
    return lx > x0 && lx < x1 && lz > z0 && lz < z1;
  }

  /** Is this (world) point on burning lava? */
  lavaAt(pos: THREE.Vector3): boolean {
    if (pos.y > this.origin.y + 0.6) return false;
    const lx = pos.x - this.origin.x;
    const lz = pos.z - this.origin.z;
    for (const lv of this.def.lava ?? []) {
      if (lv.cooled && this.gateOpen) continue;
      const [x0, x1, z0, z1] = lv.rect;
      if (lx > x0 && lx < x1 && lz > z0 && lz < z1) return true;
    }
    return false;
  }

  /** Called on each entry. */
  reset() {
    this.pulled = [];
    this.gateOpen = false;
    this.gateY = 0;
    this.gate.position.y = this.origin.y;
    this.colliders.remove(this.gateCollider);
    this.colliders.add(this.gateCollider);
    this.wallBroken = false;
    this.wallHp = this.def.crack?.hp ?? 0;
    if (this.crackWall && this.crackCollider) {
      this.crackWall.visible = true;
      this.colliders.remove(this.crackCollider);
      this.colliders.add(this.crackCollider);
    }
    this.bossSpawned = false;
    this.bossDefeated = false;
    for (const [id, h] of this.handles) {
      if (id.startsWith('valve')) h.rotation.z = 0;
      else h.rotation.x = -0.6;
    }
    this.setLava(false);
  }

  private setLava(cooled: boolean) {
    for (const l of this.lavaMats) {
      if (!l.cools) continue;
      l.mat.color.setHex(cooled ? 0x3a302c : 0xff5a1a);
      l.mat.emissive.setHex(cooled ? 0x2a0a00 : 0xff4a0a);
      l.mat.emissiveIntensity = cooled ? 0.4 : 1.6;
    }
  }

  private openGate() {
    this.gateOpen = true;
    this.colliders.remove(this.gateCollider);
    this.setLava(true);
  }

  /** Pull a lever / turn a valve. */
  usePuzzle(id: string): PuzzleResult {
    const pz = this.def.puzzle;
    if (this.gateOpen || this.pulled.includes(id) || this.resetTimer > 0) return 'already';
    this.pulled.push(id);
    if (pz.kind === 'levers') {
      const h = this.handles.get(id);
      if (h) h.rotation.x = 0.6;
      const idx = this.pulled.length - 1;
      if (pz.order[idx] !== id) {
        this.resetTimer = 1.2;
        return 'wrong';
      }
      if (this.pulled.length === pz.order.length) {
        this.openGate();
        return 'solved';
      }
      return 'progress';
    }
    const h = this.handles.get(id);
    if (h) h.rotation.z = Math.PI * 1.5;
    if (this.pulled.length >= pz.valves.length) {
      this.openGate();
      return 'solved';
    }
    return 'progress';
  }

  /** @deprecated crypt-era name */
  pullLever(symbol: LeverSymbol): PuzzleResult {
    return this.usePuzzle(symbol);
  }

  /** Damage the breakable wall. Returns true when it breaks. */
  hitCrackWall(heavy: boolean): boolean {
    if (this.wallBroken || !this.crackWall || !this.crackCollider) return false;
    this.wallHp -= heavy ? 3 : 1;
    if (this.wallHp <= 0) {
      this.wallBroken = true;
      this.crackWall.visible = false;
      this.colliders.remove(this.crackCollider);
      return true;
    }
    return false;
  }

  crackWallPos(): THREE.Vector3 {
    const at = this.def.crack?.at ?? [0, 0];
    return this.w(at[0], at[1], 1.5);
  }

  hasCrack(): boolean {
    return !!this.def.crack;
  }

  update(dt: number) {
    this.time += dt;
    for (const f of this.flames) f.update(this.time);
    const gh = this.def.gate.height + 0.1;
    if (this.gateOpen && this.gateY > -gh) {
      this.gateY = Math.max(-gh, this.gateY - dt * 2.5);
      this.gate.position.y = this.origin.y + this.gateY;
    }
    if (this.resetTimer > 0) {
      this.resetTimer -= dt;
      if (this.resetTimer <= 0) {
        this.pulled = [];
        for (const h of this.handles.values()) h.rotation.x = -0.6;
      }
    }
    for (const l of this.lavaMats) {
      if (l.cools && this.gateOpen) continue;
      const base = l.cools ? 1.6 - 0.4 * this.pulled.length : 1.6;
      l.mat.emissiveIntensity = base + Math.sin(this.time * 1.8) * 0.25;
    }
    this.group.traverse((o) => {
      if (o.name === 'portalRing') o.rotateZ(dt * 0.6);
    });
  }
}

export function createDungeons(colliders: CollisionWorld): Record<string, Dungeon> {
  const out: Record<string, Dungeon> = {};
  for (const d of Object.values(DUNGEONS)) out[d.id] = new Dungeon(d, colliders);
  return out;
}
