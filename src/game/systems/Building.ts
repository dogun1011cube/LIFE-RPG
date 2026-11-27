import * as THREE from 'three';
import { BUILD, WORLD } from '../config';
import { BUILDABLES, BUILDABLE_BY_ID, type BuildableDef, type BuildCategory } from '../data/buildables';
import { LOCATIONS } from '../data/locations';
import type { StationId } from '../data/recipes';
import type { PieceState } from '../state/types';
import type { Collider, BoxCollider } from '../world/Colliders';
import { Inv } from './Inventory';
import { getTemplate, instantiate, ghostObject, ghostMaterial, worldColliders, createCrops, type PieceObject } from './BuildMeshes';
import { settlementRadius } from '../data/village';
import type { Game } from '../Game';
import type { LightSource } from '../world/Landmarks';
import { computeStability, predictStability, touches, MIN_STABILITY, type StabNode } from './Stability';
import { loadBlueprints, saveBlueprint, deleteBlueprint, makeBlueprint, transformBlueprint, blueprintCost, type Blueprint } from './Blueprints';

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
  /** boxes used for the stability graph (falls back to the visual bounds for collider-less pieces) */
  sboxes: BoxCollider[];
}

export interface Placement {
  x: number;
  y: number;
  z: number;
  rot: number;
  valid: boolean;
  reason: string;
}

export type PaletteCategory = BuildCategory | 'blueprint';
const CATEGORIES: BuildCategory[] = ['structure', 'stone', 'marble', 'fortress', 'path', 'utility', 'village', 'city', 'decor'];
const EDGE_HEIGHT: Record<string, number> = { wall: L, doorway: L, window: L, fence: 1.15, gable: 1.25, door: 2.1, castle_wall: 5 };
const MATERIAL_ORDER = ['wood', 'stone', 'marble'];

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
  category: PaletteCategory = 'structure';
  /** bumps whenever pieces are added / removed (navigation grid rebuilds) */
  version = 0;
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
  /** structural stability per piece id (0..1) */
  readonly stability = new Map<number, number>();
  private neighbors = new Map<number, number[]>();
  private grounded = new Map<number, boolean>();
  private roadCells = new Set<string>();
  /** predicted stability of the current ghost */
  ghostStability = 1;
  // Blueprints
  blueprints: Blueprint[] = loadBlueprints();
  selectedBlueprint: string | null = null;
  bpRotation = 0;
  bpPlacement: { ax: number; ay: number; az: number; valid: boolean; reason: string; count: number } | null = null;
  /** piece the player was looking at when starting a blueprint capture */
  captureTarget: number | null = null;
  private bpGhost: THREE.Group | null = null;
  private bpGhostKey = '';

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
    this.roadCells.clear();
    this.neighbors.clear();
    this.stability.clear();
    this.grounded.clear();
  }

  load(list: PieceState[]) {
    this.clear();
    for (const s of list) {
      const def = BUILDABLE_BY_ID[s.type];
      if (!def) continue;
      this.create({ ...s, storage: s.storage ? s.storage.map((x) => (x ? { ...x } : null)) : undefined });
    }
    this.recomputeStability();
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
    const sboxes = boxes.length ? boxes : this.boundsBoxes(def, state.x, state.y, state.z, state.rot);
    if (def.shape === 'road') this.buildRoadMesh(obj.object, state);
    if (def.shape === 'farm_plot') obj.object.add(createCrops());
    const p: PlacedPiece = { state, def, obj, colliders, boxes, doorColliders, doorAngle: state.open ? -1.9 : 0, sboxes };
    // stability graph
    this.grounded.set(state.id, def.shape === 'road' || this.isGroundedBoxes(sboxes));
    const nb: number[] = [];
    for (const o of this.pieces.values()) {
      if (Math.abs(o.state.x - state.x) > 12 || Math.abs(o.state.z - state.z) > 12) continue;
      if (touches(o.sboxes, sboxes)) {
        nb.push(o.state.id);
        this.neighbors.get(o.state.id)?.push(state.id);
      }
    }
    this.neighbors.set(state.id, nb);
    if (def.shape === 'road') {
      this.roadCells.add(this.cellKey(state.x, state.z));
      this.floorCells.add(this.cellKey(state.x, state.z));
      this.game.grass.invalidateAt(state.x, state.z);
    }
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
    for (const n of this.neighbors.get(p.state.id) ?? []) {
      const arr = this.neighbors.get(n);
      if (arr) {
        const k = arr.indexOf(p.state.id);
        if (k >= 0) arr.splice(k, 1);
      }
    }
    this.neighbors.delete(p.state.id);
    this.stability.delete(p.state.id);
    this.grounded.delete(p.state.id);
    if (p.def.shape === 'road') {
      const key = this.cellKey(p.state.x, p.state.z);
      this.roadCells.delete(key);
      if (![...this.pieces.values()].some((o) => o.def.shape === 'road' && this.cellKey(o.state.x, o.state.z) === key)) this.floorCells.delete(key);
      this.game.grass.invalidateAt(p.state.x, p.state.z);
    }
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

  isRoadAt(x: number, z: number) {
    return this.roadCells.has(this.cellKey(x, z));
  }

  /** World AABB of a piece's visual bounds (for collider-less pieces like rugs). */
  private boundsBoxes(def: BuildableDef, x: number, y: number, z: number, rot: number): BoxCollider[] {
    const b = getTemplate(def).bounds;
    return worldColliders([{ kind: 'box', min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] }], x, y, z, rot, -1) as BoxCollider[];
  }

  /** Touching the ground: the terrain reaches the piece's bottom somewhere under its footprint. */
  private isGroundedBoxes(boxes: BoxCollider[]): boolean {
    if (!boxes.length) return false;
    const minY = Math.min(...boxes.map((b) => b.minY));
    const t = this.game.terrain;
    for (const b of boxes) {
      for (const [x, z] of [
        [b.minX, b.minZ],
        [b.maxX, b.minZ],
        [b.minX, b.maxZ],
        [b.maxX, b.maxZ],
        [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2],
      ]) {
        if (t.heightAt(x, z) >= minY - 0.4) return true;
      }
    }
    return false;
  }

  private stabNodes(): StabNode[] {
    return [...this.pieces.values()].map((p) => ({ id: p.state.id, boxes: p.sboxes, grounded: this.grounded.get(p.state.id) ?? false, material: p.def.material }));
  }

  recomputeStability() {
    this.version++;
    const s = computeStability(this.stabNodes(), this.neighbors);
    this.stability.clear();
    for (const [k, v] of s) this.stability.set(k, v);
  }

  /** Stability a candidate piece would have. */
  private predict(def: BuildableDef, boxes: BoxCollider[]): number {
    const node: StabNode = { id: -1, boxes, grounded: def.shape === 'road' || this.isGroundedBoxes(boxes), material: def.material };
    if (node.grounded) return 1;
    const others: { node: StabNode; stability: number }[] = [];
    const cx = (boxes[0].minX + boxes[0].maxX) / 2;
    const cz = (boxes[0].minZ + boxes[0].maxZ) / 2;
    for (const p of this.pieces.values()) {
      if (Math.abs(p.state.x - cx) > 12 || Math.abs(p.state.z - cz) > 12) continue;
      others.push({ node: { id: p.state.id, boxes: p.sboxes, grounded: false, material: p.def.material }, stability: this.stability.get(p.state.id) ?? 0 });
    }
    return predictStability(node, others);
  }

  /** Remove pieces that lost their support; returns how many fell. */
  private collapseUnstable(previous: Map<number, number>): number {
    this.recomputeStability();
    const falling = [...this.pieces.values()].filter((p) => (this.stability.get(p.state.id) ?? 0) < MIN_STABILITY && (previous.get(p.state.id) ?? 1) >= MIN_STABILITY);
    for (const p of falling) {
      // half of the materials survive the fall
      for (const c of p.def.cost) {
        const q = Math.ceil(c.qty / 2);
        if (q > 0) this.game.pickups.spawn(c.item, q, new THREE.Vector3(p.state.x, p.state.y + 0.8, p.state.z));
      }
      if (p.state.storage) for (const s of p.state.storage) if (s) this.game.pickups.spawn(s.id, s.qty, new THREE.Vector3(p.state.x, p.state.y + 0.8, p.state.z));
      this.game.particles.burst(new THREE.Vector3(p.state.x, p.state.y + 1, p.state.z), 0x9a8a78, 18, 4, 0.14);
      this.destroy(p);
    }
    if (falling.length) {
      this.recomputeStability();
      this.game.audio.play('treefall');
      this.game.cameraRig.shake(0.3);
      this.game.events.emit('notify', { text: `받침을 잃은 건축물 ${falling.length}개가 무너졌습니다`, kind: 'warn' });
    }
    return falling.length;
  }

  /** Terrain-following road surface. */
  private buildRoadMesh(obj: THREE.Group, s: PieceState) {
    const def = BUILDABLE_BY_ID[s.type];
    const old = obj.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
    const mat = old?.material as THREE.Material;
    for (const c of [...obj.children]) obj.remove(c);
    const geo = new THREE.PlaneGeometry(G, G, 4, 4);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const c = Math.cos(s.rot);
    const sn = Math.sin(s.rot);
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const wx = s.x + lx * c + lz * sn;
      const wz = s.z - lx * sn + lz * c;
      pos.setY(i, this.game.terrain.heightAt(wx, wz) - s.y + (def.material === 'stone' ? 0.05 : 0.035));
    }
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1, uv.getY(i) * 1);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    obj.add(mesh);
  }

  // ── Knowledge ───────────────────────────────────────────
  isKnown(id: string) {
    return this.game.state.knownBuildables.includes(id);
  }

  available(category?: PaletteCategory): BuildableDef[] {
    if (category === 'blueprint') return [];
    return BUILDABLES.filter((b) => this.isKnown(b.id) && (!category || b.category === category));
  }

  categoriesAvailable(): PaletteCategory[] {
    return [...CATEGORIES.filter((c) => this.available(c).length > 0), 'blueprint'];
  }

  get blueprintMode() {
    return this.category === 'blueprint';
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
      if (this.category !== 'blueprint') this.category = BUILDABLE_BY_ID[this.selected].category;
      this.blueprints = loadBlueprints();
    }
    this.hideBpGhost();
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
    if (this.category === 'blueprint') {
      this.blueprints = loadBlueprints();
      if (!this.selectedBlueprint || !this.blueprints.some((b) => b.id === this.selectedBlueprint)) this.selectedBlueprint = this.blueprints[0]?.id ?? null;
      this.game.audio.play('click');
      this.game.bridge.bump();
      return;
    }
    this.hideBpGhost();
    const first = this.available(this.category)[0];
    if (first) this.select(first.id);
  }

  setCategory(c: PaletteCategory) {
    const cats = this.categoriesAvailable();
    this.cycleCategory(cats.indexOf(c) - cats.indexOf(this.category));
  }

  /** Cycle the selected shape through its materials (wood -> stone -> marble). */
  cycleMaterial() {
    if (this.blueprintMode) return;
    const def = BUILDABLE_BY_ID[this.selected];
    const variants = BUILDABLES.filter((b) => b.shape === def.shape && this.isKnown(b.id)).sort((a, b) => MATERIAL_ORDER.indexOf(a.material) - MATERIAL_ORDER.indexOf(b.material));
    if (variants.length < 2) {
      this.deny('이 건축물의 다른 재료가 아직 없습니다');
      return;
    }
    const i = variants.findIndex((v) => v.id === def.id);
    this.select(variants[(i + 1) % variants.length].id);
    this.game.events.emit('notify', { text: `재료 변경: ${BUILDABLE_BY_ID[this.selected].name}`, kind: 'info' });
  }

  materialVariants(): BuildableDef[] {
    const def = BUILDABLE_BY_ID[this.selected];
    return BUILDABLES.filter((b) => b.shape === def.shape && this.isKnown(b.id)).sort((a, b) => MATERIAL_ORDER.indexOf(a.material) - MATERIAL_ORDER.indexOf(b.material));
  }

  /** Pick up the hovered piece (full refund) and continue placing it elsewhere. */
  moveHovered() {
    const p = this.hoverPiece;
    if (!p) return;
    const rot = p.state.rot;
    this.removePiece(p, true);
    if (this.category === 'blueprint') this.category = p.def.category;
    this.select(p.def.id);
    if (p.def.snap === 'cell' || p.def.snap === 'free') this.rotation = rot;
    this.game.events.emit('notify', { text: `옮기는 중: ${p.def.name} — 원하는 곳에 다시 설치하세요`, kind: 'info' });
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
    if (s === 'tower') return p.state.y + 7.5;
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
    if (def.shape === 'road') y = terrain.heightAt(x, z);
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
    const allBoxes = cand.length ? cand.map(toBox) : this.boundsBoxes(def, x, y, z, rot);
    const clash = this.clashCheck(def, x, y, z, candBoxes, allBoxes);
    if (clash) return { valid: false, reason: clash };
    // Settlement rules: one town hall; village buildings belong inside the settlement radius
    if (def.id === 'town_hall' && [...this.pieces.values()].some((p) => p.def.id === 'town_hall')) return { valid: false, reason: '마을 회관은 하나만 지을 수 있습니다' };
    if ((def.category === 'village' || def.category === 'city') && def.id !== 'town_hall') {
      const hall = [...this.pieces.values()].find((p) => p.def.id === 'town_hall');
      const R = settlementRadius(this.game.state.settlement.tier);
      if (!hall || (hall.state.x - x) ** 2 + (hall.state.z - z) ** 2 > R ** 2) return { valid: false, reason: `마을 회관 반경 ${R}m 안에만 지을 수 있습니다` };
    }
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
      if (def.shape !== 'road' && th > bottom + 1.3 && def.snap !== 'free') return { valid: false, reason: '지면에 너무 깊이 묻힙니다' };
      if (def.snap === 'free' && Math.abs(th - y) < 0.2 && terrain.slopeAt(x, z) > 0.6) return { valid: false, reason: '경사가 너무 급합니다' };
      if (def.shape === 'road' && terrain.slopeAt(x, z) > 1.0) return { valid: false, reason: '경사가 너무 급합니다' };
    }
    const stab = this.predict(def, allBoxes);
    this.ghostStability = stab;
    if (stab <= 0) return { valid: false, reason: '받침이 없습니다' };
    if (stab < MIN_STABILITY) return { valid: false, reason: `구조가 불안정합니다 (안정도 ${Math.round(stab * 100)}%)` };
    if (!Inv.hasAll(game.state.player.inventory, def.cost)) return { valid: false, reason: '재료가 부족합니다' };
    return { valid: true, reason: '' };
  }

  /** Overlap / obstacle / player checks shared by single pieces and blueprints. Returns a reason or null. */
  private clashCheck(def: BuildableDef, x: number, y: number, z: number, candBoxes: BoxCollider[], allBoxes: BoxCollider[], ignore?: Set<number>): string | null {
    const game = this.game;

    if (Math.abs(x) > WORLD.size / 2 - 10 || Math.abs(z) > WORLD.size / 2 - 10) return '세계의 끝입니다';
    if (y < WORLD.waterLevel + 0.05 && def.shape !== 'foundation' && def.shape !== 'bridge') return '물속에는 지을 수 없습니다';
    for (const loc of LOCATIONS) {
      const r = loc.kind === 'camp' ? 9 : loc.flatRadius * 0.85;
      if ((x - loc.x) ** 2 + (z - loc.z) ** 2 < r * r) return '유적 근처에는 지을 수 없습니다';
    }
    // Same-slot duplicates (cell pieces) and overlaps
    const slotClass = def.shape === 'foundation' || def.shape === 'floor' ? 'floor' : def.shape;
    for (const p of this.pieces.values()) {
      if (ignore?.has(p.state.id)) continue;
      const pc = p.def.shape === 'foundation' || p.def.shape === 'floor' ? 'floor' : p.def.shape;
      if (def.snap === 'cell' && p.def.snap === 'cell' && pc === slotClass && Math.abs(p.state.x - x) < 0.05 && Math.abs(p.state.z - z) < 0.05 && Math.abs(p.state.y - y) < 0.3)
        return '이미 설치되어 있습니다';
      if (def.snap === 'edge' && p.def.snap === 'edge' && p.def.shape === def.shape && Math.abs(p.state.x - x) < 0.05 && Math.abs(p.state.z - z) < 0.05 && Math.abs(p.state.y - y) < 0.3)
        return '이미 설치되어 있습니다';
      for (const a of candBoxes) {
        for (const b of p.boxes) {
          if (p.def.shape === 'roof' || p.def.shape === 'stairs') continue;
          // generous shrink so perpendicular walls can share a corner
          if (boxesIntersect(a, b, 0.12)) return '다른 건축물과 겹칩니다';
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
          if ((cx - c.x) ** 2 + (cz - c.z) ** 2 < (c.r - 0.05) ** 2 && a.minY < c.maxY && a.maxY > c.minY) return '장애물이 있습니다';
        } else if (boxesIntersect(a, cb, 0.05)) return '장애물이 있습니다';
      }
    }
    // Player overlap
    const pp = game.player.body.pos;
    const pb: BoxCollider = { kind: 'box', minX: pp.x - 0.35, maxX: pp.x + 0.35, minZ: pp.z - 0.35, maxZ: pp.z + 0.35, minY: pp.y + 0.1, maxY: pp.y + 1.8 };
    const liftable = def.shape === 'foundation' || def.shape === 'floor';
    if (!liftable) for (const a of candBoxes) if (boxesIntersect(a, pb, 0)) return '플레이어와 겹칩니다';

    return null;
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
    if (this.blueprintMode) return this.placeBlueprint();
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
    this.recomputeStability();
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
    const before = new Map(this.stability);
    this.destroy(p);
    this.game.audio.play('remove');
    this.game.particles.burst(new THREE.Vector3(p.state.x, p.state.y + 0.8, p.state.z), 0x9a7048, 14, 3);
    this.collapseUnstable(before);
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
    if (this.blueprintMode) {
      this.bpRotation = (this.bpRotation + 1) % 4;
      this.game.audio.play('click');
      return;
    }
    const def = BUILDABLE_BY_ID[this.selected];
    const step = def.snap === 'free' ? Math.PI / 4 : def.snap === 'edge' ? Math.PI : Math.PI / 2;
    this.rotation = (this.rotation + step) % (Math.PI * 2);
    this.game.audio.play('click');
  }

  toggleDoor(p: PlacedPiece, silent = false) {
    p.state.open = !p.state.open;
    if (p.state.open) for (const c of p.doorColliders) this.game.colliders.remove(c);
    else for (const c of p.doorColliders) this.game.colliders.add(c);
    if (!silent) this.game.audio.play('door');
  }

  // ── Blueprints ──────────────────────────────────────────
  selectBlueprint(id: string) {
    this.selectedBlueprint = id;
    if (this.category !== 'blueprint') this.category = 'blueprint';
    this.game.audio.play('click');
    this.game.bridge.bump();
  }

  /** All pieces connected (touching) to the given piece. */
  connectedGroup(start: PlacedPiece): PlacedPiece[] {
    const seen = new Set<number>([start.state.id]);
    const queue = [start.state.id];
    while (queue.length) {
      const id = queue.pop()!;
      for (const n of this.neighbors.get(id) ?? []) {
        if (seen.has(n)) continue;
        const np = this.pieces.get(n);
        if (!np || np.def.shape === 'road') continue;
        seen.add(n);
        queue.push(n);
      }
    }
    return [...seen].map((id) => this.pieces.get(id)!).filter(Boolean);
  }

  /** Save the structure connected to `pieceId` as a named blueprint. */
  captureBlueprint(name: string, pieceId: number): Blueprint | null {
    const start = this.pieces.get(pieceId);
    if (!start) return null;
    const group = this.connectedGroup(start);
    if (group.length > 400) {
      this.deny('설계도에 담기에는 너무 큰 건물입니다 (최대 400개)');
      return null;
    }
    const bp = makeBlueprint(name.trim() || '이름 없는 설계도', group.map((p) => ({ type: p.def.id, x: p.state.x, y: p.state.y, z: p.state.z, rot: p.state.rot })));
    saveBlueprint(bp);
    this.blueprints = loadBlueprints();
    this.selectedBlueprint = bp.id;
    const st = this.game.state;
    st.counters['blueprint:save'] = (st.counters['blueprint:save'] ?? 0) + 1;
    this.game.events.emit('notify', { text: `설계도 저장: ${bp.name} (${bp.pieces.length}개)`, kind: 'unlock' });
    this.game.audio.play('craft');
    this.game.quests.check();
    this.game.bridge.bump();
    return bp;
  }

  removeBlueprint(id: string) {
    deleteBlueprint(id);
    this.blueprints = loadBlueprints();
    if (this.selectedBlueprint === id) this.selectedBlueprint = this.blueprints[0]?.id ?? null;
    this.game.bridge.bump();
  }

  blueprintCostOf(bp: Blueprint) {
    return blueprintCost(bp);
  }

  private hideBpGhost() {
    if (this.bpGhost) this.game.scene.remove(this.bpGhost);
    this.bpGhost = null;
    this.bpGhostKey = '';
    this.bpPlacement = null;
  }

  /** Anchor height so every foundation sits on the terrain like a hand-placed one. */
  private blueprintAnchorY(bp: Blueprint, ax: number, az: number): number {
    const list = transformBlueprint(bp, ax, 0, az, this.bpRotation);
    const t = this.game.terrain;
    let ay = -Infinity;
    for (const p of list) {
      if (BUILDABLE_BY_ID[p.type]?.shape !== 'foundation') continue;
      const hs = [t.heightAt(p.x - G / 2, p.z - G / 2), t.heightAt(p.x + G / 2, p.z - G / 2), t.heightAt(p.x - G / 2, p.z + G / 2), t.heightAt(p.x + G / 2, p.z + G / 2), t.heightAt(p.x, p.z)];
      const top = Math.ceil((Math.max(...hs) + 0.08) / 0.25) * 0.25;
      ay = Math.max(ay, top - p.y);
    }
    if (ay === -Infinity) ay = t.heightAt(ax, az) - Math.min(...bp.pieces.map((p) => p.dy));
    return ay;
  }

  validateBlueprint(bp: Blueprint, ax: number, ay: number, az: number): { valid: boolean; reason: string } {
    const list = transformBlueprint(bp, ax, ay, az, this.bpRotation);
    const t = this.game.terrain;
    for (const p of list) {
      const def = BUILDABLE_BY_ID[p.type];
      if (!def) return { valid: false, reason: '알 수 없는 건축물이 포함되어 있습니다' };
      if (!this.isKnown(def.id)) return { valid: false, reason: `아직 모르는 건축물: ${def.name}` };
      const tpl = getTemplate(def);
      const cand = [...worldColliders(tpl.colliders, p.x, p.y, p.z, p.rot, -1), ...(tpl.doorColliders ? worldColliders(tpl.doorColliders, p.x, p.y, p.z, p.rot, -1) : [])];
      const candBoxes = cand.filter((c) => c.kind === 'box') as BoxCollider[];
      const allBoxes = cand.length ? cand.map(toBox) : this.boundsBoxes(def, p.x, p.y, p.z, p.rot);
      const clash = this.clashCheck(def, p.x, p.y, p.z, candBoxes, allBoxes);
      if (clash) return { valid: false, reason: clash };
      if (def.shape === 'foundation') {
        const hs = [t.heightAt(p.x - G / 2, p.z - G / 2), t.heightAt(p.x + G / 2, p.z - G / 2), t.heightAt(p.x - G / 2, p.z + G / 2), t.heightAt(p.x + G / 2, p.z + G / 2)];
        if (p.y - Math.min(...hs) > 2.9) return { valid: false, reason: '토대가 지면에서 너무 높습니다 (평평한 곳을 고르세요)' };
      }
    }
    if (!Inv.hasAll(this.game.state.player.inventory, blueprintCost(bp))) return { valid: false, reason: '재료가 부족합니다' };
    return { valid: true, reason: '' };
  }

  /** Place a blueprint at an explicit anchor (cursor flow uses the computed placement). */
  placeBlueprintAt(bp: Blueprint, ax: number, az: number, quarter = this.bpRotation): boolean {
    this.bpRotation = quarter;
    const ay = this.blueprintAnchorY(bp, ax, az);
    const v = this.validateBlueprint(bp, ax, ay, az);
    if (!v.valid) {
      this.deny(v.reason);
      return false;
    }
    if (!Inv.removeAll(this.game.state.player.inventory, blueprintCost(bp))) return false;
    const list = transformBlueprint(bp, ax, ay, az, quarter);
    for (const p of list) {
      const def = BUILDABLE_BY_ID[p.type];
      const state: PieceState = { id: this.game.state.nextPieceId++, type: def.id, x: p.x, y: p.y, z: p.z, rot: p.rot };
      if (def.storage) state.storage = Array.from({ length: def.storage }, () => null);
      if (def.interact === 'door') state.open = false;
      this.create(state);
      const key = `build:${def.id}`;
      this.game.state.counters[key] = (this.game.state.counters[key] ?? 0) + 1;
    }
    this.recomputeStability();
    this.game.audio.play('place');
    this.game.audio.play('craft');
    this.game.particles.burst(new THREE.Vector3(ax + 2, ay + 1.5, az + 2), 0xc9b48a, 40, 5, 0.12);
    this.game.events.emit('notify', { text: `설계도 건설 완료: ${bp.name} (${list.length}개)`, kind: 'info' });
    this.game.gainXp(Math.min(60, list.length * 2), '설계도 건설');
    this.game.quests.check();
    this.game.requestAutosave();
    this.game.bridge.bump();
    return true;
  }

  private placeBlueprint(): boolean {
    const bp = this.blueprints.find((b) => b.id === this.selectedBlueprint);
    const pl = this.bpPlacement;
    if (!bp || !pl) return false;
    if (!pl.valid) {
      this.deny(pl.reason);
      return false;
    }
    return this.placeBlueprintAt(bp, pl.ax, pl.az);
  }

  private updateBlueprintGhost(bp: Blueprint) {
    const key = `${bp.id}:${this.bpRotation}`;
    if (this.bpGhostKey !== key) {
      if (this.bpGhost) this.game.scene.remove(this.bpGhost);
      const g = new THREE.Group();
      for (const p of transformBlueprint(bp, 0, 0, 0, this.bpRotation)) {
        const def = BUILDABLE_BY_ID[p.type];
        if (!def) continue;
        const ghost = ghostObject(def).clone();
        ghost.position.set(p.x, p.y, p.z);
        ghost.rotation.y = p.rot;
        g.add(ghost);
      }
      this.bpGhost = g;
      this.bpGhostKey = key;
      this.game.scene.add(g);
    }
    const hit = this.raycast();
    if (!hit || !this.bpGhost) {
      if (this.bpGhost) this.bpGhost.visible = false;
      this.bpPlacement = null;
      return;
    }
    const ax = Math.round(hit.point.x / G) * G;
    const az = Math.round(hit.point.z / G) * G;
    const ay = this.blueprintAnchorY(bp, ax, az);
    const v = this.validateBlueprint(bp, ax, ay, az);
    this.bpPlacement = { ax, ay, az, valid: v.valid, reason: v.reason, count: bp.pieces.length };
    this.bpGhost.visible = true;
    this.bpGhost.position.set(ax, ay, az);
    ghostMaterial.color.setHex(v.valid ? 0x6cff8a : 0xff4a4a);
    ghostMaterial.opacity = 0.32 + Math.sin(this.time * 6) * 0.06;
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
      if (d > (p.def.reach ?? r) || Math.abs(dy) > 2.5) continue;
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
    if (this.blueprintMode) {
      if (this.ghost) this.ghost.visible = false;
      this.placement = null;
      const bp = this.blueprints.find((b) => b.id === this.selectedBlueprint);
      if (bp) this.updateBlueprintGhost(bp);
      else this.hideBpGhost();
    } else if (this.bpGhost) this.hideBpGhost();
    const def = BUILDABLE_BY_ID[this.selected];
    if (!this.blueprintMode && this.ghostId !== def.id) {
      if (this.ghost) this.game.scene.remove(this.ghost);
      this.ghost = ghostObject(def);
      this.ghostId = def.id;
      this.game.scene.add(this.ghost);
    }
    if (!this.blueprintMode) this.placement = this.computePlacement(def);
    if (this.ghost && !this.blueprintMode) {
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
      const st = this.stability.get(this.hoverPiece.state.id) ?? 0;
      (this.hoverHelper.material as THREE.LineBasicMaterial).color.setHex(st >= 0.6 ? 0x6cff8a : st >= 0.3 ? 0xffd24a : 0xff5040);
    } else this.hoverHelper.visible = false;
  }
}
