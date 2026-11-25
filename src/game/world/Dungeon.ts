import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CollisionWorld, BoxCollider, Collider } from './Colliders';
import { boxGeo, stoneTexture, glowTexture } from './textures';
import { createChest, createFlame, type Flame } from './props';
import type { LightSource } from './Landmarks';

/**
 * "잊혀진 묘소" - an interior dungeon built far outside the island (so it never overlaps the overworld).
 * Layout is a 2m cell grid; walls/ceilings are generated around open cells and merged into few draw calls.
 */
export const DUNGEON_ORIGIN = new THREE.Vector3(1400, 30, 0);
const CELL = 2;
const WALL_H = 6;

export type DungeonInteractKind = 'lever' | 'portal' | 'chest' | 'lore';

export interface DungeonInteractable {
  id: string;
  kind: DungeonInteractKind;
  pos: THREE.Vector3;
  radius: number;
  label: string;
  symbol?: 'sun' | 'moon' | 'star';
}

export interface DungeonSpawn {
  enemy: string;
  x: number;
  z: number;
}

interface Rect {
  x0: number; // cell coords, inclusive
  x1: number;
  z0: number;
  z1: number;
  h?: number;
}

const ROOMS: Rect[] = [
  { x0: -3, x1: 2, z0: 0, z1: 5 }, // entry hall
  { x0: -1, x1: 0, z0: 6, z1: 10 }, // corridor 1
  { x0: -4, x1: 3, z0: 11, z1: 18 }, // lever chamber
  { x0: -1, x1: 0, z0: 19, z1: 23 }, // corridor 2
  { x0: 1, x1: 3, z0: 20, z1: 22 }, // hidden treasure room
  { x0: -5, x1: 4, z0: 24, z1: 33, h: 8 }, // boss chamber
];
const LEVER_ORDER: ('sun' | 'moon' | 'star')[] = ['sun', 'moon', 'star'];

export class Dungeon {
  readonly group = new THREE.Group();
  readonly interactables: DungeonInteractable[] = [];
  readonly lights: LightSource[] = [];
  /** World-space centres of all floor cells (for the minimap). */
  readonly cells: { x: number; z: number }[] = [];
  readonly entryPos: THREE.Vector3;
  gateOpen = false;
  wallBroken = false;
  keeperSpawned = false;
  keeperDefeated = false;
  pulled: string[] = [];
  private open = new Set<string>();
  private flames: Flame[] = [];
  private gate: THREE.Group;
  private gateCollider: BoxCollider;
  private gateY = 0;
  private crackWall: THREE.Mesh;
  private crackCollider: BoxCollider;
  wallHp = 3;
  private levers = new Map<string, THREE.Object3D>();
  private time = 0;
  private resetTimer = 0;

  constructor(private colliders: CollisionWorld) {
    this.group.name = 'dungeon';
    this.group.visible = false;
    for (const r of ROOMS) for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) this.open.add(`${x},${z}`);
    this.entryPos = this.w(0, 6.5);
    this.buildShell();
    const { gate, collider } = this.buildGate();
    this.gate = gate;
    this.gateCollider = collider;
    const crack = this.buildCrackWall();
    this.crackWall = crack.mesh;
    this.crackCollider = crack.collider;
    this.buildProps();
  }

  /** local metres -> world */
  w(lx: number, lz: number, ly = 0): THREE.Vector3 {
    return new THREE.Vector3(DUNGEON_ORIGIN.x + lx, DUNGEON_ORIGIN.y + ly, DUNGEON_ORIGIN.z + lz);
  }

  private isOpen(x: number, z: number) {
    return this.open.has(`${x},${z}`);
  }

  private heightAtCell(x: number, z: number) {
    for (const r of ROOMS) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r.h ?? WALL_H;
    return WALL_H;
  }

  private addBoxCollider(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): BoxCollider {
    const O = DUNGEON_ORIGIN;
    const c: BoxCollider = { kind: 'box', minX: O.x + x0, maxX: O.x + x1, minY: O.y + y0, maxY: O.y + y1, minZ: O.z + z0, maxZ: O.z + z1, owner: 'dungeon' };
    this.colliders.add(c);
    return c;
  }

  private buildShell() {
    const floorGeos: THREE.BufferGeometry[] = [];
    const wallGeos: THREE.BufferGeometry[] = [];
    const ceilGeos: THREE.BufferGeometry[] = [];
    const T = 0.6;
    const isGate = (x: number, z: number, nx: number, nz: number) => (z === 18 && nz === 19 && (x === -1 || x === 0)) || (z === 19 && nz === 18 && (x === -1 || x === 0));
    const isCrack = (x: number, z: number, nx: number) => z === 21 && ((x === 0 && nx === 1) || (x === 1 && nx === 0));
    // the hidden room shares a boundary with corridor 2 that must stay walled (except the breakable cell)
    const isHiddenBoundary = (x: number, z: number, nx: number) => z >= 20 && z <= 22 && ((x === 0 && nx === 1) || (x === 1 && nx === 0));
    for (const key of this.open) {
      const [x, z] = key.split(',').map(Number);
      const cx = x * CELL + CELL / 2;
      const cz = z * CELL + CELL / 2;
      const h = this.heightAtCell(x, z);
      this.cells.push({ x: DUNGEON_ORIGIN.x + cx, z: DUNGEON_ORIGIN.z + cz });
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
        if (this.isOpen(nx, nz) && !(isHiddenBoundary(x, z, nx) && !isCrack(x, z, nx))) {
          // inner partition between rooms of different heights: fill the gap above the lower ceiling
          const nh = this.heightAtCell(nx, nz);
          if (nh < h && dz !== 0 && !isGate(x, z, nx, nz)) {
            const g = boxGeo(CELL, h - nh, 0.4, 2);
            g.translate(cx, nh + (h - nh) / 2, cz + dz * (CELL / 2));
            wallGeos.push(g);
          }
          continue;
        }
        if (isCrack(x, z, nx)) continue;
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
    for (const r of ROOMS) this.addBoxCollider(r.x0 * CELL, -1, r.z0 * CELL, (r.x1 + 1) * CELL, 0, (r.z1 + 1) * CELL);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture('#5c5850'), roughness: 0.95 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture('#77716a', true), roughness: 0.95 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x8a847a, map: stoneTexture('#4a4640'), roughness: 1 });
    for (const [geos, m] of [
      [floorGeos, floorMat],
      [wallGeos, wallMat],
      [ceilGeos, ceilMat],
    ] as const) {
      const merged = mergeGeometries(geos as THREE.BufferGeometry[], false)!;
      const mesh = new THREE.Mesh(merged, m);
      mesh.receiveShadow = true;
      mesh.position.copy(DUNGEON_ORIGIN);
      this.group.add(mesh);
    }
  }

  private buildGate(): { gate: THREE.Group; collider: BoxCollider } {
    const gate = new THREE.Group();
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.5, metalness: 0.7 });
    for (let i = 0; i < 9; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 6), iron);
      bar.position.set(-2 + 0.25 + i * 0.44, 2.1, 0);
      gate.add(bar);
    }
    for (const y of [0.6, 2.2, 3.8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.12, 0.12), iron);
      rail.position.set(0, y, 0);
      gate.add(rail);
    }
    gate.position.copy(this.w(0, 38));
    this.group.add(gate);
    // wall above the gate opening
    const lintel = new THREE.Mesh(boxGeo(4.4, WALL_H - 4.2, 0.6, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture('#77716a', true), roughness: 0.95 }));
    lintel.position.copy(this.w(0, 38, 4.2 + (WALL_H - 4.2) / 2));
    this.group.add(lintel);
    const collider = this.addBoxCollider(-2, 0, 37.8, 2, 4.2, 38.2);
    return { gate, collider };
  }

  private buildCrackWall(): { mesh: THREE.Mesh; collider: BoxCollider } {
    const mat = new THREE.MeshStandardMaterial({ color: 0xc8a898, map: stoneTexture('#8a7a70'), roughness: 0.95 });
    const mesh = new THREE.Mesh(boxGeo(0.6, WALL_H, CELL, 2), mat);
    mesh.position.copy(this.w(2, 43, WALL_H / 2));
    // crack lines
    const crackMat = new THREE.MeshBasicMaterial({ color: 0x1a1410 });
    for (const [y, rz, len] of [
      [1.2, 0.5, 1.4],
      [1.9, -0.7, 1.1],
      [2.6, 0.3, 1.3],
      [0.9, -0.2, 0.8],
    ]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.02, len, 0.05), crackMat);
      c.position.set(-0.31, y - WALL_H / 2, (Math.random() - 0.5) * 0.8);
      c.rotation.x = rz;
      mesh.add(c);
    }
    mesh.castShadow = true;
    this.group.add(mesh);
    const collider = this.addBoxCollider(1.7, 0, 42, 2.3, WALL_H, 44);
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
    this.lights.push({ pos: new THREE.Vector3(p.x + faceX * 0.6, p.y + 0.4, p.z + faceZ * 0.6), color: 0xff9a4a, intensity: 24, distance: 18 });
  }

  private portal(id: string, lx: number, lz: number, label: string, rotY = 0) {
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x5fe0f0, emissive: 0x2ab8d8, emissiveIntensity: 1.6, roughness: 0.3 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 8, 28), ringMat);
    const p = this.w(lx, lz, 1.4);
    ring.position.copy(p);
    ring.rotation.y = rotY;
    ring.name = 'portalRing';
    this.group.add(ring);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x5fe0f0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(3, 3, 1);
    glow.position.copy(p);
    this.group.add(glow);
    this.lights.push({ pos: p.clone(), color: 0x5fe0f0, intensity: 8, distance: 10 });
    this.interactables.push({ id, kind: 'portal', pos: p.clone().setY(DUNGEON_ORIGIN.y + 1), radius: 2.6, label });
  }

  private lever(symbol: 'sun' | 'moon' | 'star', lx: number, lz: number, rotY: number) {
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
    this.levers.set(symbol, handle);
    this.addBoxCollider(lx - 0.4, 0, lz - 0.4, lx + 0.4, 1.0, lz + 0.4);
    const names = { sun: '해', moon: '달', star: '별' };
    this.interactables.push({ id: `lever_${symbol}`, kind: 'lever', pos: this.w(lx, lz, 1), radius: 2.2, label: `${names[symbol]} 문양 레버 당기기`, symbol });
  }

  private pillar(lx: number, lz: number, h: number) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, h, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture('#77716a', true), roughness: 0.95 }));
    m.position.copy(this.w(lx, lz, h / 2));
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    const O = DUNGEON_ORIGIN;
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

  private buildProps() {
    // entry hall
    this.portal('dportal_entry', -5.2, 3, '묘소에서 나가기', Math.PI / 2);
    this.torch(-5.7, 6, 1, 0);
    this.torch(5.7, 6, -1, 0);
    const slab = new THREE.Mesh(boxGeo(1.2, 1.6, 0.25, 2), new THREE.MeshStandardMaterial({ color: 0x7d776c, roughness: 0.95 }));
    slab.position.copy(this.w(-4, 10, 0.8));
    slab.rotation.y = 0.7;
    this.group.add(slab);
    this.interactables.push({ id: 'dlore_hall', kind: 'lore', pos: this.w(-4, 10, 1), radius: 2.2, label: '읽기: 묘지기의 기록' });
    // corridor 1
    this.torch(-1.7, 16, 1, 0);
    // lever chamber (order to solve: sun -> moon -> star)
    this.lever('star', -7.4, 28, Math.PI / 2);
    this.lever('sun', 4.5, 37.4, Math.PI);
    this.lever('moon', 7.4, 26, -Math.PI / 2);
    this.torch(-7.7, 33, 1, 0);
    this.torch(7.7, 33, -1, 0);
    this.torch(-3, 22.3, 0, 1);
    this.pillar(-3.5, 30, WALL_H);
    this.pillar(3.5, 30, WALL_H);
    // corridor 2 + hidden room
    this.torch(-1.7, 44, 1, 0);
    this.chest('dchest_hidden', 5, 43, -Math.PI / 2, '열기: 먼지 쌓인 보물함');
    // boss chamber
    for (const [x, z] of [
      [-6, 52],
      [6, 52],
      [-6, 62],
      [6, 62],
    ])
      this.pillar(x, z, 8);
    this.torch(-9.7, 56, 1, 0);
    this.torch(9.7, 56, -1, 0);
    this.torch(-9.7, 64, 1, 0);
    this.torch(9.7, 64, -1, 0);
    // braziers light the boss chamber
    for (const x of [-4, 4]) {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0x3a3028, metalness: 0.5, roughness: 0.5 }));
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x2a2420, metalness: 0.4 }));
      const p = this.w(x, 57);
      stand.position.set(p.x, p.y + 0.55, p.z);
      bowl.position.set(p.x, p.y + 1.25, p.z);
      this.group.add(stand, bowl);
      const flame = createFlame(1.1);
      flame.group.position.set(p.x, p.y + 1.4, p.z);
      this.group.add(flame.group);
      this.flames.push(flame);
      this.lights.push({ pos: new THREE.Vector3(p.x, p.y + 2.4, p.z), color: 0xffa050, intensity: 30, distance: 22 });
      this.addBoxCollider(x - 0.5, 0, 56.5, x + 0.5, 1.5, 57.5);
    }
    // sarcophagus
    const sarc = new THREE.Mesh(boxGeo(2.4, 1.0, 1.2, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTexture('#8a847a'), roughness: 0.9 }));
    sarc.position.copy(this.w(0, 64, 0.5));
    sarc.castShadow = true;
    this.group.add(sarc);
    this.addBoxCollider(-1.2, 0, 63.4, 1.2, 1.0, 64.6);
    this.chest('dchest_boss', 0, 66, Math.PI, '열기: 왕의 보물함');
    this.portal('dportal_exit', -7, 66, '묘소에서 나가기');
  }

  /** Enemies placed every time the dungeon is entered (the keeper spawns when the boss chamber is reached). */
  spawns(): DungeonSpawn[] {
    const s = (enemy: string, lx: number, lz: number): DungeonSpawn => {
      const p = this.w(lx, lz);
      return { enemy, x: p.x, z: p.z };
    };
    return [s('skeleton', 0, 18), s('skeleton', -2, 33), s('skeleton', 2, 26), s('skeleton_archer', 0, 35.5), s('skeleton_archer', 0, 46)];
  }

  keeperSpawn(): THREE.Vector3 {
    return this.w(0, 58);
  }

  inBossChamber(pos: THREE.Vector3): boolean {
    return pos.z - DUNGEON_ORIGIN.z > 49 && Math.abs(pos.x - DUNGEON_ORIGIN.x) < 11;
  }

  contains(pos: THREE.Vector3): boolean {
    return Math.abs(pos.x - DUNGEON_ORIGIN.x) < 40 && pos.z - DUNGEON_ORIGIN.z > -5 && pos.z - DUNGEON_ORIGIN.z < 75;
  }

  /** Called on each entry. */
  reset() {
    this.pulled = [];
    this.gateOpen = false;
    this.gateY = 0;
    this.gate.position.y = this.w(0, 38).y;
    this.colliders.remove(this.gateCollider);
    this.colliders.add(this.gateCollider);
    this.wallBroken = false;
    this.wallHp = 3;
    this.crackWall.visible = true;
    this.colliders.remove(this.crackCollider);
    this.colliders.add(this.crackCollider);
    this.keeperSpawned = false;
    this.keeperDefeated = false;
    for (const h of this.levers.values()) h.rotation.x = -0.6;
  }

  /** Pull a lever. Returns 'progress' | 'solved' | 'wrong' | 'already'. */
  pullLever(symbol: 'sun' | 'moon' | 'star'): 'progress' | 'solved' | 'wrong' | 'already' {
    if (this.gateOpen || this.pulled.includes(symbol) || this.resetTimer > 0) return 'already';
    this.pulled.push(symbol);
    const h = this.levers.get(symbol);
    if (h) h.rotation.x = 0.6;
    const idx = this.pulled.length - 1;
    if (LEVER_ORDER[idx] !== symbol) {
      this.resetTimer = 1.2;
      return 'wrong';
    }
    if (this.pulled.length === LEVER_ORDER.length) {
      this.gateOpen = true;
      this.colliders.remove(this.gateCollider);
      return 'solved';
    }
    return 'progress';
  }

  /** Damage the cracked wall. Returns true when it breaks. */
  hitCrackWall(heavy: boolean): boolean {
    if (this.wallBroken) return false;
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
    return this.w(2, 43, 1.5);
  }

  update(dt: number) {
    this.time += dt;
    for (const f of this.flames) f.update(this.time);
    if (this.gateOpen && this.gateY > -4.3) {
      this.gateY = Math.max(-4.3, this.gateY - dt * 2.5);
      this.gate.position.y = DUNGEON_ORIGIN.y + this.gateY;
    }
    if (this.resetTimer > 0) {
      this.resetTimer -= dt;
      if (this.resetTimer <= 0) {
        this.pulled = [];
        for (const h of this.levers.values()) h.rotation.x = -0.6;
      }
    }
    this.group.traverse((o) => {
      if (o.name === 'portalRing') o.rotateZ(dt * 0.6);
    });
  }
}
