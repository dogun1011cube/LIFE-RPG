import * as THREE from 'three';
import { BUILD, WORLD } from '../config';
import { BUILDABLES, BUILDABLE_BY_ID, type BuildableDef, type BuildCategory } from '../data/buildables';
import { LOCATIONS } from '../data/locations';
import type { StationId } from '../data/recipes';
import type { PieceState } from '../state/types';
import type { Collider, BoxCollider } from '../world/Colliders';
import { Inv } from './Inventory';
import { getTemplate, instantiate, ghostObject, ghostMaterial, worldColliders, type PieceObject } from './BuildMeshes';
import type { Game } from '../Game';
import type { LightSource } from '../world/Landmarks';

const G = BUILD.grid;
const L = BUILD.level;

export interface PlacedPiece {
  state: PieceState;
  def: BuildableDef;
  obj: PieceObject;
  colliders: Collider[];
  /** World AABBs used for overlap / support tests (ramps converted to boxes). */
  boxes: BoxCollider[];
  doorColliders: Collider[];
  doorAngle: number;
}

export interface Placement {
  x: number;
  y: number;
  z: number;
  rot: number;
  valid: boolean;
  reason: string;
}

const CATEGORIES: BuildCategory[] = ['structure', 'stone', 'utility', 'decor'];
const EDGE_HEIGHT: Record<string, number> = { wall: L, doorway: L, window: L, fence: 1.15, gable: 1.25, door: 2.1 };

function boxesIntersect(a: BoxCollider, b: BoxCollider, shrink = 0.04): boolean {
  return (
    a.minX + shrink < b.maxX - shrink &&
    a.maxX - shrink > b.minX + shrink &&
    a.minY + shrink < b.maxY - shrink &&
    a.maxY - shrink > b.minY + shrink &&
    a.minZ + shrink < b.maxZ - shrink &&
    a.maxZ - shrink > b.minZ + shrink
  );
}

function toBox(c: Collider): BoxCollider {
  if (c.kind === 'box') return c;
  if (c.kind === 'ramp') return { kind: 'box', minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ, minY: Math.min(c.y0, c.y1) - 0.15, maxY: Math.max(c.y0, c.y1) };
  return { kind: 'box', minX: c.x - c.r, maxX: c.x + c.r, minZ: c.z - c.r, maxZ: c.z + c.r, minY: c.minY, maxY: c.maxY };
}

/** Player building: build mode, snapping, validation, placement/removal, interactive pieces. */
export class BuildSystem {
  readonly pieces = new Map<number, PlacedPiece>();
  readonly group = new THREE.Group();
  active = false;
  selected = 'wood_foundation';
  category: BuildCategory = 'structure';
  rotation = 0;
  heightOffset = 0;
  gridSnap = true;
  placement: Placement | null = null;
  hoverPiece: PlacedPiece | null = null;
  private ghost: THREE.Group | null = null;
  private ghostId = '';
  private hoverHelper: THREE.Box3Helper;
  private raycaster = new THREE.Raycaster();
  private pickables: THREE.Object3D[] = [];
  private floorCells = new Set<string>();
  private time = 0;
  private lastDenyAt = 0;

  constructor(private game: Game) {
    this.group.name = 'buildings';
    this.hoverHelper = new THREE.Box3Helper(new THREE.Box3(), 0xff5040);
    this.hoverHelper.visible = false;
    game.scene.add(this.hoverHelper);
  }

  // ── Lifecycle ───────────────────────────────────────────
  clear() {
    for (const p of [...this.pieces.values()]) this.destroy(p);
    this.pieces.clear();
    this.floorCells.clear();
  }

  load(list: PieceState[]) {
    this.clear();
    for (const s of list) {
      const def = BUILDABLE_BY_ID[s.type];
      if (!def) continue;
      this.create({ ...s, storage: s.storage ? s.storage.map((x) => (x ? { ...x } : null)) : undefined });
    }
  }

  serialize(): PieceState[] {
    return [...this.pieces.values()].map((p) => ({ ...p.state, storage: p.state.storage ? p.state.storage.map((s) => (s ? { ...s } : null)) : undefined }));
  }

  private cellKey(x: number, z: number) {
    return `${Math.floor(x / G)},${Math.floor(z / G)}`;
  }

  private create(state: PieceState): PlacedPiece {
    const def = BUILDABLE_BY_ID[state.type];
    const tpl = getTemplate(def);
    const obj = instantiate(def);
    obj.object.position.set(state.x, state.y, state.z);
    obj.object.rotation.y = state.rot;
    obj.object.userData.pieceId = state.id;
    this.group.add(obj.object);
    obj.object.updateMatrixWorld(true);
    const colliders = worldColliders(tpl.colliders, state.x, state.y, state.z, state.rot, state.id);
    const doorColliders = tpl.doorColliders ? worldColliders(tpl.doorColliders, state.x, state.y, state.z, state.rot, state.id) : [];
    for (const c of colliders) this.game.colliders.add(c);
    if (!state.open) for (const c of doorColliders) this.game.colliders.add(c);
    const boxes = [...colliders, ...doorColliders].map(toBox);
    const p: PlacedPiece = { state, def, obj, colliders, boxes, doorColliders, doorAngle: state.open ? -1.9 : 0 };
    if (obj.doorPivot) obj.doorPivot.rotation.y = p.doorAngle;
    this.pieces.set(state.id, p);
    this.pickables.push(obj.object);
    if ((def.shape === 'foundation' || def.shape === 'floor') && state.y - this.game.terrain.heightAt(state.x, state.z) < 1.2) {
      this.floorCells.add(this.cellKey(state.x, state.z));
      this.game.grass.invalidateAt(state.x, state.z);
    }
    return p;
  }

  private destroy(p: PlacedPiece) {
    this.group.remove(p.obj.object);
    for (const c of p.colliders) this.game.colliders.remove(c);
    for (const c of p.doorColliders) this.game.colliders.remove(c);
    const i = this.pickables.indexOf(p.obj.object);
    if (i >= 0) this.pickables.splice(i, 1);
    this.pieces.delete(p.state.id);
    if (p.def.shape === 'foundation' || p.def.shape === 'floor') {
      const key = this.cellKey(p.state.x, p.state.z);
      const still = [...this.pieces.values()].some((o) => (o.def.shape === 'foundation' || o.def.shape === 'floor') && this.cellKey(o.state.x, o.state.z) === key);
      if (!still) this.floorCells.delete(key);
      this.game.grass.invalidateAt(p.state.x, p.state.z);
    }
  }

  isFloorAt(x: number, z: number) {
    return this.floorCells.has(this.cellKey(x, z));
  }

  // ── Knowledge ───────────────────────────────────────────
  isKnown(id: string) {
    return this.game.state.knownBuildables.includes(id);
  }

  available(category?: BuildCategory): BuildableDef[] {
    return BUILDABLES.filter((b) => this.isKnown(b.id) && (!category || b.category === category));
  }

  categoriesAvailable(): BuildCategory[] {
    return CATEGORIES.filter((c) => this.available(c).length > 0);
  }

  // ── Mode ────────────────────────────────────────────────
  setActive(on: boolean) {
    this.active = on;
    if (!on) {
      if (this.ghost) this.game.scene.remove(this.ghost);
      this.ghost = null;
      this.ghostId = '';
      this.hoverHelper.visible = false;
      this.placement = null;
      this.hoverPiece = null;
    } else {
      if (!this.isKnown(this.selected)) this.selected = this.available()[0]?.id ?? 'wood_foundation';
      this.category = BUILDABLE_BY_ID[this.selected].category;
    }
    this.game.bridge.bump();
  }

  select(id: string) {
    if (!this.isKnown(id)) return;
    if (this.selected !== id) this.heightOffset = 0;
    this.selected = id;
    this.category = BUILDABLE_BY_ID[id].category;
    this.game.audio.play('click');
    this.game.bridge.bump();
  }

  cycleCategory(dir = 1) {
    const cats = this.categoriesAvailable();
    if (cats.length === 0) return;
    const i = cats.indexOf(this.category);
    this.category = cats[(i + dir + cats.length) % cats.length];
    const first = this.available(this.category)[0];
    if (first) this.select(first.id);
  }

  // ── Raycast ─────────────────────────────────────────────
  private raycast(): { point: THREE.Vector3; normal: THREE.Vector3; piece: PlacedPiece | null; dist: number } | null {
    const cam = this.game.camera;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), cam);
    const camDist = this.game.cameraRig.distance;
    this.raycaster.far = BUILD.reach + camDist;
    this.raycaster.near = Math.max(0.1, camDist - 1.5);
    const hits = this.raycaster.intersectObjects(this.pickables, true);
    let best: { point: THREE.Vector3; normal: THREE.Vector3; piece: PlacedPiece | null; dist: number } | null = null;
    for (const h of hits) {
      if (!(h.object as THREE.Mesh).isMesh) continue;
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.pieceId === undefined) o = o.parent;
      if (!o) continue;
      const piece = this.pieces.get(o.userData.pieceId as number) ?? null;
      const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      best = { point: h.point.clone(), normal, piece, dist: h.distance };
      break;
    }
    const origin = this.raycaster.ray.origin;
    const dir = this.raycaster.ray.direction;
    const tDist = this.game.terrain.raycast(origin, dir, this.raycaster.far);
    if (tDist !== null && tDist > this.raycaster.near && (!best || tDist < best.dist)) {
      const point = origin.clone().addScaledVector(dir, tDist);
      best = { point, normal: this.game.terrain.normalAt(point.x, point.z), piece: null, dist: tDist };
    }
    return best;
  }

  private topOf(p: PlacedPiece, point: THREE.Vector3): number {
    const s = p.def.shape;
    if (s === 'foundation' || s === 'floor') return p.state.y;
    if (EDGE_HEIGHT[s] !== undefined) return p.state.y + EDGE_HEIGHT[s];
    if (s === 'pillar') return p.state.y + L;
    return point.y;
  }

  private computePlacement(def: BuildableDef): Placement | null {
    const hit = this.raycast();
    if (!hit) return null;
    const { point, normal, piece } = hit;
    const terrain = this.game.terrain;
    let x = point.x;
    let z = point.z;
    let y = point.y;
    let rot = 0;
    const up = normal.y > 0.7;

    if (def.snap === 'cell') {
      let px = point.x;
      let pz = point.z;
      let baseY: number;
      if (piece) {
        if (up) baseY = this.topOf(piece, point);
        else {
          px += normal.x * 0.3;
          pz += normal.z * 0.3;
          baseY = piece.state.y;
        }
      } else baseY = 0;
      x = Math.floor(px / G) * G + G / 2;
      z = Math.floor(pz / G) * G + G / 2;
      if (!piece) {
        if (def.shape === 'foundation') {
          const hs = [terrain.heightAt(x - G / 2, z - G / 2), terrain.heightAt(x + G / 2, z - G / 2), terrain.heightAt(x - G / 2, z + G / 2), terrain.heightAt(x + G / 2, z + G / 2), terrain.heightAt(x, z)];
          baseY = Math.ceil((Math.max(...hs) + 0.08) / 0.25) * 0.25;
        } else if (def.shape === 'floor') baseY = Math.ceil((terrain.heightAt(x, z) + 0.25) / 0.25) * 0.25;
        else baseY = terrain.heightAt(x, z);
      }
      y = baseY;
      rot = this.rotation;
    } else if (def.snap === 'edge') {
      let handled = false;
      let baseY = 0;
      let px = point.x;
      let pz = point.z;
      if (piece && EDGE_HEIGHT[piece.def.shape] !== undefined) {
        if (def.shape === 'door' && piece.def.shape === 'doorway') {
          x = piece.state.x;
          z = piece.state.z;
          y = piece.state.y;
          rot = piece.state.rot + (this.rotation % (Math.PI * 2) >= Math.PI ? Math.PI : 0);
          handled = true;
        } else if (up) {
          x = piece.state.x;
          z = piece.state.z;
          y = piece.state.y + EDGE_HEIGHT[piece.def.shape];
          rot = piece.state.rot;
          handled = true;
        } else {
          baseY = piece.state.y;
          px += normal.x * 0.3;
          pz += normal.z * 0.3;
        }
      } else if (piece) {
        baseY = up ? this.topOf(piece, point) : piece.state.y;
        if (!up) {
          px += normal.x * 0.3;
          pz += normal.z * 0.3;
        }
      }
      if (!handled) {
        const cellX = Math.floor(px / G) * G;
        const cellZ = Math.floor(pz / G) * G;
        const fx = px - cellX;
        const fz = pz - cellZ;
        const d = [fz, G - fz, fx, G - fx];
        const m = d.indexOf(Math.min(...d));
        if (m === 0) [x, z, rot] = [cellX + G / 2, cellZ, 0];
        else if (m === 1) [x, z, rot] = [cellX + G / 2, cellZ + G, 0];
        else if (m === 2) [x, z, rot] = [cellX, cellZ + G / 2, Math.PI / 2];
        else [x, z, rot] = [cellX + G, cellZ + G / 2, Math.PI / 2];
        if (!piece) baseY = terrain.heightAt(x, z);
        y = baseY;
        if (this.rotation % (Math.PI * 2) >= Math.PI) rot += Math.PI;
        if (def.shape === 'door') {
          const dw = [...this.pieces.values()].find((p) => p.def.shape === 'doorway' && Math.abs(p.state.x - x) < 0.05 && Math.abs(p.state.z - z) < 0.05 && Math.abs(p.state.y - y) < 1.5);
          if (dw) {
            y = dw.state.y;
            rot = dw.state.rot + (this.rotation % (Math.PI * 2) >= Math.PI ? Math.PI : 0);
          }
        }
      }
    } else if (def.snap === 'corner') {
      x = Math.round(point.x / G) * G;
      z = Math.round(point.z / G) * G;
      y = piece ? (up ? this.topOf(piece, point) : piece.state.y) : terrain.heightAt(x, z);
    } else {
      if (this.gridSnap) {
        x = Math.round(x * 2) / 2;
        z = Math.round(z * 2) / 2;
      }
      if (piece && up) y = point.y;
      else y = terrain.heightAt(x, z);
      rot = this.rotation;
    }
    y += this.heightOffset;
    const { valid, reason } = this.validate(def, x, y, z, rot);
    return { x, y, z, rot, valid, reason };
  }

  validate(def: BuildableDef, x: number, y: number, z: number, rot: number): { valid: boolean; reason: string } {
    const game = this.game;
    const terrain = game.terrain;
    if (!this.isKnown(def.id)) return { valid: false, reason: '아직 모르는 건축물입니다' };
    if (Math.abs(x) > WORLD.size / 2 - 10 || Math.abs(z) > WORLD.size / 2 - 10) return { valid: false, reason: '세계의 끝입니다' };
    if (y < WORLD.waterLevel + 0.05 && def.shape !== 'foundation') return { valid: false, reason: '물속에는 지을 수 없습니다' };
    for (const loc of LOCATIONS) {
      const r = loc.kind === 'camp' ? 9 : loc.flatRadius * 0.85;
      if ((x - loc.x) ** 2 + (z - loc.z) ** 2 < r * r) return { valid: false, reason: '유적 근처에는 지을 수 없습니다' };
    }
    const tpl = getTemplate(def);
    const cand = [...worldColliders(tpl.colliders, x, y, z, rot, -1), ...(tpl.doorColliders ? worldColliders(tpl.doorColliders, x, y, z, rot, -1) : [])];
    const candBoxes = cand.filter((c) => c.kind === 'box') as BoxCollider[];
    const allBoxes = cand.map(toBox);

    // Same-slot duplicates (cell pieces) and overlaps
    const slotClass = def.shape === 'foundation' || def.shape === 'floor' ? 'floor' : def.shape;
    for (const p of this.pieces.values()) {
      const pc = p.def.shape === 'foundation' || p.def.shape === 'floor' ? 'floor' : p.def.shape;
      if (def.snap === 'cell' && p.def.snap === 'cell' && pc === slotClass && Math.abs(p.state.x - x) < 0.05 && Math.abs(p.state.z - z) < 0.05 && Math.abs(p.state.y - y) < 0.3)
        return { valid: false, reason: '이미 설치되어 있습니다' };
      if (def.snap === 'edge' && p.def.snap === 'edge' && p.def.shape === def.shape && Math.abs(p.state.x - x) < 0.05 && Math.abs(p.state.z - z) < 0.05 && Math.abs(p.state.y - y) < 0.3)
        return { valid: false, reason: '이미 설치되어 있습니다' };
      for (const a of candBoxes) {
        for (const b of p.boxes) {
          if (p.def.shape === 'roof' || p.def.shape === 'stairs') continue;
          // generous shrink so perpendicular walls can share a corner
          if (boxesIntersect(a, b, 0.12)) return { valid: false, reason: '다른 건축물과 겹칩니다' };
        }
      }
    }
    // Obstacles: trees, rocks, ruins
    const qb = allBoxes.reduce(
      (acc, b) => ({ minX: Math.min(acc.minX, b.minX), maxX: Math.max(acc.maxX, b.maxX), minZ: Math.min(acc.minZ, b.minZ), maxZ: Math.max(acc.maxZ, b.maxZ) }),
      { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
    );
    const near = game.colliders.query(qb.minX, qb.minZ, qb.maxX, qb.maxZ);
    for (const c of near) {
      if (typeof c.owner === 'number') continue; // our own pieces handled above
      const cb = toBox(c);
      for (const a of allBoxes) {
        if (c.kind === 'circle') {
          const cx = Math.max(a.minX, Math.min(c.x, a.maxX));
          const cz = Math.max(a.minZ, Math.min(c.z, a.maxZ));
          if ((cx - c.x) ** 2 + (cz - c.z) ** 2 < (c.r - 0.05) ** 2 && a.minY < c.maxY && a.maxY > c.minY) return { valid: false, reason: '장애물이 있습니다' };
        } else if (boxesIntersect(a, cb, 0.05)) return { valid: false, reason: '장애물이 있습니다' };
      }
    }
    // Player overlap
    const pp = game.player.body.pos;
    const pb: BoxCollider = { kind: 'box', minX: pp.x - 0.35, maxX: pp.x + 0.35, minZ: pp.z - 0.35, maxZ: pp.z + 0.35, minY: pp.y + 0.1, maxY: pp.y + 1.8 };
    const liftable = def.shape === 'foundation' || def.shape === 'floor';
    if (!liftable) for (const a of candBoxes) if (boxesIntersect(a, pb, 0)) return { valid: false, reason: '플레이어와 겹칩니다' };

    // Door must sit inside a doorway
    if (def.shape === 'door') {
      const dw = [...this.pieces.values()].find((p) => p.def.shape === 'doorway' && Math.abs(p.state.x - x) < 0.05 && Math.abs(p.state.z - z) < 0.05 && Math.abs(p.state.y - y) < 0.05);
      if (!dw) return { valid: false, reason: '문틀 벽에만 설치할 수 있습니다' };
    }
    // Support
    if (def.shape === 'foundation') {
      const hs = [terrain.heightAt(x - G / 2, z - G / 2), terrain.heightAt(x + G / 2, z - G / 2), terrain.heightAt(x - G / 2, z + G / 2), terrain.heightAt(x + G / 2, z + G / 2)];
      const minH = Math.min(...hs);
      const maxH = Math.max(...hs);
      const attached = this.touchesPiece(allBoxes);
      if (y - minH > 2.9 && !attached) return { valid: false, reason: '지면에서 너무 높습니다' };
      if (maxH - y > 1.0) return { valid: false, reason: '지면에 너무 깊이 묻힙니다' };
    } else {
      const bottom = y + tpl.bounds.min.y;
      const th = terrain.heightAt(x, z);
      const grounded = th >= bottom - 0.4 && th <= bottom + 1.3;
      if (!grounded && !this.touchesPiece(allBoxes)) return { valid: false, reason: '받침이 없습니다' };
      if (def.snap === 'free' && Math.abs(th - y) < 0.2 && terrain.slopeAt(x, z) > 0.6) return { valid: false, reason: '경사가 너무 급합니다' };
    }
    if (!Inv.hasAll(game.state.player.inventory, def.cost)) return { valid: false, reason: '재료가 부족합니다' };
    return { valid: true, reason: '' };
  }

  private touchesPiece(boxes: BoxCollider[]): boolean {
    for (const p of this.pieces.values()) {
      for (const b of p.boxes) {
        for (const a of boxes) {
          if (a.minX - 0.12 < b.maxX && a.maxX + 0.12 > b.minX && a.minY - 0.12 < b.maxY && a.maxY + 0.12 > b.minY && a.minZ - 0.12 < b.maxZ && a.maxZ + 0.12 > b.minZ) return true;
        }
      }
    }
    return false;
  }

  // ── Actions ─────────────────────────────────────────────
  private deny(reason: string) {
    const now = performance.now();
    if (now - this.lastDenyAt > 700) {
      this.game.audio.play('deny');
      this.game.events.emit('notify', { text: reason, kind: 'warn' });
      this.lastDenyAt = now;
    }
  }

  tryPlace(): boolean {
    const def = BUILDABLE_BY_ID[this.selected];
    const pl = this.placement;
    if (!pl) return false;
    if (!pl.valid) {
      this.deny(pl.reason);
      return false;
    }
    return this.placeAt(def, pl.x, pl.y, pl.z, pl.rot);
  }

  /** Place a piece at an explicit position (used by the cursor flow and automated tests). */
  placeAt(def: BuildableDef, x: number, y: number, z: number, rot: number, skipValidation = false): boolean {
    if (!skipValidation) {
      const v = this.validate(def, x, y, z, rot);
      if (!v.valid) {
        this.deny(v.reason);
        return false;
      }
    }
    const inv = this.game.state.player.inventory;
    if (!Inv.removeAll(inv, def.cost)) {
      this.deny('재료가 부족합니다');
      return false;
    }
    const state: PieceState = { id: this.game.state.nextPieceId++, type: def.id, x, y, z, rot };
    if (def.storage) state.storage = Array.from({ length: def.storage }, () => null);
    if (def.interact === 'door') state.open = false;
    const placed = this.create(state);
    // stand the player on top of a floor placed underneath them
    const pp = this.game.player.body.pos;
    for (const b of placed.boxes) {
      if (pp.x > b.minX - 0.3 && pp.x < b.maxX + 0.3 && pp.z > b.minZ - 0.3 && pp.z < b.maxZ + 0.3 && pp.y < b.maxY && pp.y > b.minY - 1) {
        pp.y = b.maxY + 0.02;
        this.game.player.body.vel.y = 0;
      }
    }
    this.game.onPiecePlaced(def, x, y, z);
    return true;
  }

  removePiece(p: PlacedPiece, refund = true) {
    if (refund) {
      for (const c of p.def.cost) this.game.giveItem(c.item, c.qty, 'refund', false);
      if (p.state.storage) for (const s of p.state.storage) if (s) this.game.giveItem(s.id, s.qty, 'refund', false);
    }
    // remove a door hanging in a removed doorway
    if (p.def.shape === 'doorway') {
      for (const o of [...this.pieces.values()]) {
        if (o.def.shape === 'door' && Math.abs(o.state.x - p.state.x) < 0.05 && Math.abs(o.state.z - p.state.z) < 0.05 && Math.abs(o.state.y - p.state.y) < 0.05) this.removePiece(o, refund);
      }
    }
    this.destroy(p);
    this.game.audio.play('remove');
    this.game.particles.burst(new THREE.Vector3(p.state.x, p.state.y + 0.8, p.state.z), 0x9a7048, 14, 3);
    this.game.bridge.bump();
  }

  tryRemove() {
    const p = this.hoverPiece;
    if (!p) return;
    this.removePiece(p, true);
    this.game.events.emit('notify', { text: `${p.def.name} 철거 (재료 반환)`, kind: 'info' });
  }

  copyHovered() {
    const p = this.hoverPiece;
    if (!p || !this.isKnown(p.def.id)) return;
    this.select(p.def.id);
    if (p.def.snap === 'cell' || p.def.snap === 'free') this.rotation = p.state.rot;
  }

  rotate() {
    const def = BUILDABLE_BY_ID[this.selected];
    const step = def.snap === 'free' ? Math.PI / 4 : def.snap === 'edge' ? Math.PI : Math.PI / 2;
    this.rotation = (this.rotation + step) % (Math.PI * 2);
    this.game.audio.play('click');
  }

  toggleDoor(p: PlacedPiece) {
    p.state.open = !p.state.open;
    if (p.state.open) for (const c of p.doorColliders) this.game.colliders.remove(c);
    else for (const c of p.doorColliders) this.game.colliders.add(c);
    this.game.audio.play('door');
  }

  // ── Queries ─────────────────────────────────────────────
  stationsNear(pos: THREE.Vector3, r = 4): Set<StationId> {
    const out = new Set<StationId>();
    for (const p of this.pieces.values()) {
      if (!p.def.station) continue;
      if ((p.state.x - pos.x) ** 2 + (p.state.z - pos.z) ** 2 + (p.state.y - pos.y) ** 2 < r * r) out.add(p.def.station);
    }
    return out;
  }

  interactableNear(pos: THREE.Vector3, facing: THREE.Vector3, r = 2.4): PlacedPiece | null {
    let best: PlacedPiece | null = null;
    let bestScore = Infinity;
    for (const p of this.pieces.values()) {
      if (!p.def.interact) continue;
      const dx = p.state.x - pos.x;
      const dz = p.state.z - pos.z;
      const dy = p.state.y - pos.y;
      const d = Math.hypot(dx, dz);
      if (d > r || Math.abs(dy) > 2) continue;
      const dot = d > 0.01 ? (dx * facing.x + dz * facing.z) / d : 1;
      const score = d - dot * 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  countShapes(shapes: string[]): number {
    let n = 0;
    for (const p of this.pieces.values()) if (shapes.includes(p.def.shape)) n++;
    return n;
  }

  isSafeAt(x: number, z: number): boolean {
    for (const p of this.pieces.values()) {
      const r = p.def.safeRadius;
      if (r && (p.state.x - x) ** 2 + (p.state.z - z) ** 2 < r * r) return true;
    }
    return false;
  }

  lightSources(out: LightSource[]) {
    for (const p of this.pieces.values()) {
      const l = p.def.light;
      if (!l) continue;
      const tpl = getTemplate(p.def);
      const off = tpl.light ?? [0, 1, 0];
      const c = Math.cos(p.state.rot);
      const s = Math.sin(p.state.rot);
      out.push({
        pos: new THREE.Vector3(p.state.x + off[0] * c + off[2] * s, p.state.y + off[1], p.state.z - off[0] * s + off[2] * c),
        color: l.color,
        intensity: l.intensity,
        distance: l.distance,
      });
    }
  }

  getPiece(id: number) {
    return this.pieces.get(id);
  }

  // ── Per-frame ───────────────────────────────────────────
  update(dt: number, focus: THREE.Vector3) {
    this.time += dt;
    for (const p of this.pieces.values()) {
      if (p.obj.flame && (p.state.x - focus.x) ** 2 + (p.state.z - focus.z) ** 2 < 3600) p.obj.flame.update(this.time);
      if (p.obj.doorPivot) {
        const target = p.state.open ? -1.9 : 0;
        p.doorAngle += (target - p.doorAngle) * Math.min(1, dt * 8);
        p.obj.doorPivot.rotation.y = p.doorAngle;
      }
    }
    if (!this.active) return;
    const def = BUILDABLE_BY_ID[this.selected];
    if (this.ghostId !== def.id) {
      if (this.ghost) this.game.scene.remove(this.ghost);
      this.ghost = ghostObject(def);
      this.ghostId = def.id;
      this.game.scene.add(this.ghost);
    }
    this.placement = this.computePlacement(def);
    if (this.ghost) {
      if (this.placement) {
        this.ghost.visible = true;
        this.ghost.position.set(this.placement.x, this.placement.y, this.placement.z);
        this.ghost.rotation.y = this.placement.rot;
        ghostMaterial.color.setHex(this.placement.valid ? 0x6cff8a : 0xff4a4a);
        ghostMaterial.opacity = 0.38 + Math.sin(this.time * 6) * 0.06;
      } else this.ghost.visible = false;
    }
    // hover piece for removal / copy
    const hit = this.raycast();
    this.hoverPiece = hit?.piece ?? null;
    if (this.hoverPiece) {
      const box = new THREE.Box3().setFromObject(this.hoverPiece.obj.object);
      (this.hoverHelper.box as THREE.Box3).copy(box);
      this.hoverHelper.visible = true;
    } else this.hoverHelper.visible = false;
  }
}
