import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EMBER_ISLE, MAP_REGION, SPAWN } from '../config';
import { hash2, mulberry32 } from '../core/Random';
import { smoothstep } from '../core/math';
import { NODES, TREE_TYPES, type NodeTypeId } from '../data/nodes';
import { BIOME, VOLCANO, type Terrain } from './Terrain';
import type { CollisionWorld, CircleCollider } from './Colliders';

export interface ResourceNode {
  id: number;
  type: NodeTypeId;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  hp: number;
  alive: boolean;
  respawnAt: number;
  chunk: number;
  slot: number;
  collider: CircleCollider | null;
}

/** Shared time uniform for foliage / grass wind. */
export const windUniforms = { uTime: { value: 0 } };

function windMaterial(base: THREE.MeshStandardMaterialParameters, strength: number, startY: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial(base);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float hw = max(transformed.y - ${startY.toFixed(2)}, 0.0);
        transformed.x += sin(uTime * 1.4 + ip.x * 0.11 + ip.z * 0.07) * ${strength.toFixed(3)} * hw * hw;
        transformed.z += cos(uTime * 1.1 + ip.x * 0.05 + ip.z * 0.13) * ${(strength * 0.7).toFixed(3)} * hw * hw;`,
      );
  };
  mat.customProgramCacheKey = () => `wind_${strength}_${startY}`;
  return mat;
}

// ── Geometry helpers ─────────────────────────────────────────
function paint(geo: THREE.BufferGeometry, color: number, seed: number, variance = 0.12): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const c = new THREE.Color(color);
  const rng = mulberry32(seed);
  for (let i = 0; i < pos.count; i += 3) {
    const f = 1 - variance + rng() * variance * 2;
    for (let k = 0; k < 3; k++) {
      cols[(i + k) * 3] = c.r * f;
      cols[(i + k) * 3 + 1] = c.g * f;
      cols[(i + k) * 3 + 2] = c.b * f;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  g.computeVertexNormals();
  return g;
}

function jitter(geo: THREE.BufferGeometry, amount: number, seed: number) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const h = hash2(Math.round(x * 100), Math.round(y * 100) * 31 + Math.round(z * 100), seed);
    const h2 = hash2(Math.round(z * 100), Math.round(x * 100) * 17 + Math.round(y * 100), seed + 3);
    const s = 1 + (h - 0.5) * amount;
    pos.setXYZ(i, x * s, y * (1 + (h2 - 0.5) * amount), z * s);
  }
  return geo;
}

function at(geo: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  geo.scale(sx, sy, sz);
  if (rx) geo.rotateX(rx);
  if (rz) geo.rotateZ(rz);
  geo.translate(x, y, z);
  return geo;
}

interface PartDef {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  when: 'alive' | 'depleted' | 'always';
  shadow: boolean;
}

function buildVisuals(): Record<NodeTypeId, PartDef[]> {
  const foliage = windMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 }, 0.012, 1.8);
  const solid = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  const plant = windMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide }, 0.08, 0.1);
  const crystalMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.15,
    metalness: 0.1,
    emissive: new THREE.Color(0x2ab8d8),
    emissiveIntensity: 0.55,
  });

  const merge = (geos: THREE.BufferGeometry[]) => mergeGeometries(geos, false)!;

  const oak = merge([
    paint(at(new THREE.CylinderGeometry(0.17, 0.3, 2.8, 7), 0, 1.4, 0), 0x6b4a2e, 1, 0.08),
    paint(at(new THREE.CylinderGeometry(0.05, 0.1, 1.2, 5), 0.45, 2.3, 0, 1, 1, 1, 0, -0.8), 0x6b4a2e, 2, 0.08),
    paint(jitter(at(new THREE.IcosahedronGeometry(1.45, 1), 0, 3.5, 0), 0.18, 3), 0x4f8a34, 3),
    paint(jitter(at(new THREE.IcosahedronGeometry(1.05, 1), 0.95, 3.0, 0.35), 0.18, 4), 0x568f36, 4),
    paint(jitter(at(new THREE.IcosahedronGeometry(1.1, 1), -0.8, 3.1, -0.45), 0.18, 5), 0x4a8030, 5),
    paint(jitter(at(new THREE.IcosahedronGeometry(0.95, 1), 0.15, 4.35, -0.1), 0.18, 6), 0x5b9a3a, 6),
  ]);
  const pine = merge([
    paint(at(new THREE.CylinderGeometry(0.14, 0.26, 2.4, 6), 0, 1.2, 0), 0x5a3c24, 7, 0.08),
    paint(at(new THREE.ConeGeometry(1.7, 2.3, 8), 0, 2.4, 0), 0x2f5e34, 8),
    paint(at(new THREE.ConeGeometry(1.3, 2.0, 8), 0, 3.5, 0), 0x346638, 9),
    paint(at(new THREE.ConeGeometry(0.88, 1.7, 7), 0, 4.55, 0), 0x3a6f3c, 10),
    paint(at(new THREE.ConeGeometry(0.45, 1.1, 6), 0, 5.35, 0), 0x3f763f, 11),
  ]);
  const birch = merge([
    paint(at(new THREE.CylinderGeometry(0.1, 0.15, 3.6, 6), 0, 1.8, 0), 0xe4e0d4, 12, 0.18),
    paint(jitter(at(new THREE.IcosahedronGeometry(0.9, 1), 0, 3.9, 0), 0.2, 13), 0x9cbf4c, 13),
    paint(jitter(at(new THREE.IcosahedronGeometry(0.7, 1), 0.55, 3.4, 0.2), 0.2, 14), 0xa8c855, 14),
    paint(jitter(at(new THREE.IcosahedronGeometry(0.65, 1), -0.45, 3.5, -0.3), 0.2, 15), 0x8fb444, 15),
  ]);
  const stump = merge([
    paint(at(new THREE.CylinderGeometry(0.24, 0.32, 0.45, 7), 0, 0.22, 0), 0x6b4a2e, 16, 0.06),
    paint(at(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 7), 0, 0.455, 0), 0xc9a36a, 17, 0.04),
  ]);
  const rockGeo = () => jitter(at(new THREE.DodecahedronGeometry(1, 1), 0, 0.35, 0, 1.25, 0.85, 1.05), 0.28, 18);
  const rock = paint(rockGeo(), 0x8a8580, 19, 0.1);
  const copperChunks: THREE.BufferGeometry[] = [paint(rockGeo(), 0x77706a, 20, 0.1)];
  const crng = mulberry32(21);
  for (let i = 0; i < 7; i++) {
    const a = crng() * Math.PI * 2;
    const r = 0.75 + crng() * 0.35;
    copperChunks.push(
      paint(at(new THREE.OctahedronGeometry(0.22 + crng() * 0.12, 0), Math.cos(a) * r, 0.35 + crng() * 0.65, Math.sin(a) * r, 1, 1.3, 1, crng(), crng()), 0xe0823e, 22 + i, 0.15),
    );
  }
  const copper = merge(copperChunks);
  const crystalGeos: THREE.BufferGeometry[] = [];
  const xr = mulberry32(31);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + xr();
    const r = i === 0 ? 0 : 0.35 + xr() * 0.3;
    const h = i === 0 ? 1.4 : 0.6 + xr() * 0.7;
    crystalGeos.push(paint(at(new THREE.OctahedronGeometry(0.3, 0), Math.cos(a) * r, h * 0.5, Math.sin(a) * r, 0.8, h * 2.2, 0.8, (xr() - 0.5) * 0.6, (xr() - 0.5) * 0.6), 0x5fe0f0, 32 + i, 0.15));
  }
  crystalGeos.push(paint(jitter(at(new THREE.DodecahedronGeometry(0.6, 0), 0, 0.1, 0, 1.3, 0.5, 1.3), 0.2, 40), 0x6a6670, 41, 0.1));
  const crystal = merge(crystalGeos);

  const bushBody = merge([
    paint(jitter(at(new THREE.IcosahedronGeometry(0.62, 1), 0, 0.5, 0), 0.25, 50), 0x3c7a2e, 50),
    paint(jitter(at(new THREE.IcosahedronGeometry(0.5, 1), 0.45, 0.4, 0.15), 0.25, 51), 0x427f32, 51),
    paint(jitter(at(new THREE.IcosahedronGeometry(0.48, 1), -0.38, 0.42, -0.2), 0.25, 52), 0x37702a, 52),
  ]);
  const berries: THREE.BufferGeometry[] = [];
  const br = mulberry32(53);
  for (let i = 0; i < 12; i++) {
    const a = br() * Math.PI * 2;
    const y = 0.35 + br() * 0.5;
    const r = 0.55 + br() * 0.15;
    berries.push(paint(at(new THREE.IcosahedronGeometry(0.075, 0), Math.cos(a) * r, y, Math.sin(a) * r * 0.8), 0xd8283e, 54 + i, 0.15));
  }
  const berry = merge(berries);
  const blades: THREE.BufferGeometry[] = [];
  const fr = mulberry32(70);
  for (let i = 0; i < 9; i++) {
    const a = fr() * Math.PI * 2;
    const r = fr() * 0.25;
    blades.push(paint(at(new THREE.ConeGeometry(0.05, 1.0 + fr() * 0.5, 3), Math.cos(a) * r, 0.5, Math.sin(a) * r, 1, 1, 1, (fr() - 0.5) * 0.5, (fr() - 0.5) * 0.5), 0xa9c45a, 71 + i, 0.15));
  }
  blades.push(paint(at(new THREE.ConeGeometry(0.06, 0.25, 5), 0.05, 1.35, 0.02), 0xd6c27a, 90, 0.1));
  const fiber = merge(blades);

  // ── 잿불 섬 nodes
  const charred = merge([
    paint(at(new THREE.CylinderGeometry(0.12, 0.26, 3.4, 6), 0, 1.7, 0), 0x2e2724, 100, 0.12),
    paint(at(new THREE.CylinderGeometry(0.04, 0.09, 1.5, 5), 0.5, 2.6, 0, 1, 1, 1, 0, -0.9), 0x2a2420, 101, 0.1),
    paint(at(new THREE.CylinderGeometry(0.035, 0.08, 1.3, 5), -0.45, 2.9, 0.2, 1, 1, 1, 0.3, 0.8), 0x2a2420, 102, 0.1),
    paint(at(new THREE.CylinderGeometry(0.03, 0.06, 1.0, 5), 0.1, 3.5, -0.4, 1, 1, 1, -0.7, 0.2), 0x332a25, 103, 0.1),
    paint(at(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 6), 0, 3.42, 0), 0xb04a1a, 104, 0.05),
  ]);
  const charredStump = merge([paint(at(new THREE.CylinderGeometry(0.2, 0.28, 0.4, 6), 0, 0.2, 0), 0x2e2724, 105, 0.08)]);
  const ironChunks: THREE.BufferGeometry[] = [paint(rockGeo(), 0x5e5a56, 110, 0.1)];
  const irng = mulberry32(111);
  for (let i = 0; i < 8; i++) {
    const a = irng() * Math.PI * 2;
    const r = 0.72 + irng() * 0.38;
    ironChunks.push(paint(at(new THREE.BoxGeometry(0.28, 0.2, 0.22), Math.cos(a) * r, 0.3 + irng() * 0.7, Math.sin(a) * r, 1, 1, 1, irng(), irng()), i % 3 ? 0xa65a3a : 0xb8b8c0, 112 + i, 0.12));
  }
  const iron = merge(ironChunks);
  const obsGeos: THREE.BufferGeometry[] = [paint(jitter(at(new THREE.DodecahedronGeometry(0.7, 0), 0, 0.15, 0, 1.3, 0.45, 1.2), 0.2, 120), 0x2a2622, 121, 0.08)];
  const orng = mulberry32(122);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + orng();
    const r = i === 0 ? 0 : 0.3 + orng() * 0.35;
    const h = i === 0 ? 1.5 : 0.6 + orng() * 0.8;
    obsGeos.push(paint(at(new THREE.ConeGeometry(0.22, h * 1.6, 4), Math.cos(a) * r, h * 0.6, Math.sin(a) * r, 1, 1, 1, (orng() - 0.5) * 0.7, (orng() - 0.5) * 0.7), 0x1a1424, 123 + i, 0.15));
  }
  const obsidian = merge(obsGeos);
  const obsMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.1, metalness: 0.35, emissive: new THREE.Color(0x3a1a5a), emissiveIntensity: 0.35 });
  const emberBody = merge([
    paint(jitter(at(new THREE.IcosahedronGeometry(0.55, 1), 0, 0.45, 0), 0.3, 130), 0x4a3a28, 130),
    paint(jitter(at(new THREE.IcosahedronGeometry(0.42, 1), 0.4, 0.36, 0.12), 0.3, 131), 0x55402a, 131),
  ]);
  const emberFruits: THREE.BufferGeometry[] = [];
  const er = mulberry32(132);
  for (let i = 0; i < 9; i++) {
    const a = er() * Math.PI * 2;
    emberFruits.push(paint(at(new THREE.IcosahedronGeometry(0.09, 0), Math.cos(a) * 0.5, 0.35 + er() * 0.45, Math.sin(a) * 0.45), 0xff7a2a, 133 + i, 0.15));
  }
  const emberFruit = merge(emberFruits);
  const glowMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5, emissive: new THREE.Color(0xff5a1a), emissiveIntensity: 1.1 });

  return {
    charred: [
      { geo: charred, mat: solid, when: 'alive', shadow: true },
      { geo: charredStump, mat: solid, when: 'depleted', shadow: false },
    ],
    iron: [{ geo: iron, mat: solid, when: 'alive', shadow: true }],
    obsidian: [{ geo: obsidian, mat: obsMat, when: 'alive', shadow: true }],
    emberbush: [
      { geo: emberBody, mat: solid, when: 'always', shadow: true },
      { geo: emberFruit, mat: glowMat, when: 'alive', shadow: false },
    ],
    oak: [
      { geo: oak, mat: foliage, when: 'alive', shadow: true },
      { geo: stump, mat: solid, when: 'depleted', shadow: false },
    ],
    pine: [
      { geo: pine, mat: foliage, when: 'alive', shadow: true },
      { geo: stump, mat: solid, when: 'depleted', shadow: false },
    ],
    birch: [
      { geo: birch, mat: foliage, when: 'alive', shadow: true },
      { geo: stump, mat: solid, when: 'depleted', shadow: false },
    ],
    rock: [{ geo: rock, mat: solid, when: 'alive', shadow: true }],
    copper: [{ geo: copper, mat: solid, when: 'alive', shadow: true }],
    crystal: [{ geo: crystal, mat: crystalMat, when: 'alive', shadow: true }],
    bush: [
      { geo: bushBody, mat: solid, when: 'always', shadow: true },
      { geo: berry, mat: solid, when: 'alive', shadow: false },
    ],
    fiber: [{ geo: fiber, mat: plant, when: 'alive', shadow: false }],
  };
}

const CHUNK = 100;
const CHUNKS_PER_SIDE = Math.ceil(MAP_REGION.size / CHUNK);
const CX0 = MAP_REGION.cx - MAP_REGION.size / 2;
const CZ0 = MAP_REGION.cz - MAP_REGION.size / 2;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

interface Faller {
  mesh: THREE.Mesh;
  t: number;
  axis: THREE.Vector3;
  base: THREE.Quaternion;
}

/** All harvestable nodes: generation, chunked instanced rendering, hit/deplete/respawn. */
export class ResourceSystem {
  readonly nodes: ResourceNode[] = [];
  readonly group = new THREE.Group();
  private visuals: Record<NodeTypeId, PartDef[]>;
  /** meshes[type][chunk] = InstancedMesh per part */
  private meshes = new Map<string, THREE.InstancedMesh[]>();
  private chunkGroups: THREE.Group[] = [];
  private grid = new Map<number, ResourceNode[]>();
  private shaking = new Map<ResourceNode, number>();
  private growing = new Map<ResourceNode, number>();
  private fallers: Faller[] = [];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private cullTimer = 0;

  constructor(
    private terrain: Terrain,
    private colliders: CollisionWorld,
    private seed: number,
    private avoid: { x: number; z: number; r: number }[],
  ) {
    this.visuals = buildVisuals();
    this.generate();
    this.buildMeshes();
    this.group.name = 'resources';
  }

  private canPlace(x: number, z: number, minH = 1.3): boolean {
    const isle = this.terrain.islandOf(x, z);
    if (!isle || Math.abs(x - isle.cx) > isle.half - 8 || Math.abs(z - isle.cz) > isle.half - 8) return false;
    if (this.terrain.heightAt(x, z) < minH) return false;
    for (const a of this.avoid) if ((x - a.x) ** 2 + (z - a.z) ** 2 < a.r * a.r) return false;
    return true;
  }

  private add(type: NodeTypeId, x: number, z: number, rot: number, scale: number) {
    const id = this.nodes.length;
    const y = this.terrain.heightAt(x, z);
    const cx = Math.min(CHUNKS_PER_SIDE - 1, Math.max(0, Math.floor((x - CX0) / CHUNK)));
    const cz = Math.min(CHUNKS_PER_SIDE - 1, Math.max(0, Math.floor((z - CZ0) / CHUNK)));
    const sunk = type === 'rock' || type === 'copper' || type === 'iron' || type === 'obsidian';
    const node: ResourceNode = { id, type, x, y: y - (sunk ? 0.15 * scale : 0.05), z, rot, scale, hp: NODES[type].hp, alive: true, respawnAt: 0, chunk: cx + cz * CHUNKS_PER_SIDE, slot: 0, collider: null };
    this.nodes.push(node);
    const k = this.gridKey(x, z);
    let arr = this.grid.get(k);
    if (!arr) {
      arr = [];
      this.grid.set(k, arr);
    }
    arr.push(node);
  }

  private gridKey(x: number, z: number) {
    return (Math.floor(x / 8) + 1000) * 2000 + (Math.floor(z / 8) + 1000);
  }

  private generate() {
    const half = this.terrain.home.half;
    const step = 5;
    const seed = this.seed;
    let ix = 0;
    for (let gx = -half + step / 2; gx < half; gx += step, ix++) {
      let iz = 0;
      for (let gz = -half + step / 2; gz < half; gz += step, iz++) {
        const r1 = hash2(ix, iz, seed + 11);
        const x = gx + (hash2(ix, iz, seed + 12) - 0.5) * step * 0.9;
        const z = gz + (hash2(ix, iz, seed + 13) - 0.5) * step * 0.9;
        if (!this.canPlace(x, z)) continue;
        const biome = this.terrain.biomeAt(x, z);
        const slope = this.terrain.slopeAt(x, z);
        const r4 = hash2(ix, iz, seed + 14);
        const rot = hash2(ix, iz, seed + 15) * Math.PI * 2;
        const sc = hash2(ix, iz, seed + 16);
        let type: NodeTypeId | null = null;
        if (biome === BIOME.meadow) {
          if (r1 < 0.03) type = 'oak';
          else if (r1 < 0.045) type = 'birch';
          else if (r1 < 0.06) type = 'rock';
          else if (r1 < 0.085) type = 'bush';
          else if (r1 < 0.14) type = 'fiber';
        } else if (biome === BIOME.forest) {
          const dens = smoothstep(0.0, 0.45, this.terrain.forestAt(x, z));
          if (r1 < 0.18 + 0.5 * dens) type = r4 < 0.62 ? 'pine' : r4 < 0.9 ? 'oak' : 'birch';
          else if (r1 < 0.72) {
            const r5 = hash2(ix, iz, seed + 17);
            if (r5 < 0.08) type = 'rock';
            else if (r5 < 0.17) type = 'bush';
            else if (r5 < 0.27) type = 'fiber';
          }
        } else if (biome === BIOME.highlands) {
          if (r1 < 0.07) type = 'rock';
          else if (r1 < 0.115) type = 'copper';
          else if (r1 < 0.135 && slope < 0.6) type = 'pine';
          else if (r1 < 0.15) type = 'fiber';
        } else if (biome === BIOME.peaks) {
          if (r1 < 0.04) type = 'rock';
          else if (r1 < 0.05) type = 'crystal';
        } else if (biome === BIOME.beach) {
          if (r1 < 0.012) type = 'rock';
          else if (r1 < 0.05) type = 'fiber';
        }
        if (!type) continue;
        const isTree = type === 'oak' || type === 'pine' || type === 'birch';
        if (isTree && slope > 0.85) continue;
        const scale = isTree ? 0.8 + sc * 0.55 : type === 'rock' || type === 'copper' ? 0.65 + sc * 0.7 : 0.8 + sc * 0.4;
        this.add(type, x, z, rot, scale);
      }
    }
    // Guaranteed starter resources around the spawn camp
    const rng = mulberry32(seed + 99);
    const starter: [NodeTypeId, number][] = [
      ['oak', 8],
      ['birch', 4],
      ['rock', 7],
      ['bush', 5],
      ['fiber', 8],
    ];
    for (const [type, count] of starter) {
      let placed = 0;
      for (let tries = 0; tries < 200 && placed < count; tries++) {
        const a = rng() * Math.PI * 2;
        const r = 24 + rng() * 26;
        const x = SPAWN.x + Math.cos(a) * r;
        const z = SPAWN.z + Math.sin(a) * r;
        if (!this.canPlace(x, z)) continue;
        if (this.queryRadius(x, z, 3).length > 0) continue;
        this.add(type, x, z, rng() * Math.PI * 2, type === 'rock' ? 0.7 + rng() * 0.4 : 0.85 + rng() * 0.3);
        placed++;
      }
    }
    // Crystal hollow ring
    const ch = { x: 165, z: -140 };
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rng() * 0.3;
      const r = 26 + rng() * 14;
      const x = ch.x + Math.cos(a) * r;
      const z = ch.z + Math.sin(a) * r;
      if (this.terrain.heightAt(x, z) < 1.5) continue;
      this.add('crystal', x, z, rng() * Math.PI * 2, 0.9 + rng() * 0.5);
    }
    // Appended after the home island so saved node ids stay valid
    this.generateEmber();
  }

  /** The volcanic isle: charred trees, iron on the slopes, obsidian around the crater. */
  private generateEmber() {
    const E = EMBER_ISLE;
    const half = E.size / 2;
    const step = 5;
    const seed = this.seed + 5000;
    let ix = 0;
    for (let gx = E.cx - half + step / 2; gx < E.cx + half; gx += step, ix++) {
      let iz = 0;
      for (let gz = E.cz - half + step / 2; gz < E.cz + half; gz += step, iz++) {
        const r1 = hash2(ix, iz, seed + 11);
        const x = gx + (hash2(ix, iz, seed + 12) - 0.5) * step * 0.9;
        const z = gz + (hash2(ix, iz, seed + 13) - 0.5) * step * 0.9;
        if (!this.canPlace(x, z)) continue;
        const biome = this.terrain.biomeAt(x, z);
        const slope = this.terrain.slopeAt(x, z);
        const h = this.terrain.heightAt(x, z);
        const vd = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
        if (vd < VOLCANO.craterR + 3) continue; // keep the crater arena clear
        let type: NodeTypeId | null = null;
        if (biome === BIOME.ash) {
          const grass = this.terrain.forestAt(x, z);
          if (r1 < 0.045 + Math.max(0, grass) * 0.12) type = 'charred';
          else if (r1 < 0.08) type = 'rock';
          else if (r1 < 0.1) type = 'iron';
          else if (r1 < 0.125 && grass > 0.05) type = 'emberbush';
          else if (r1 < 0.16 && grass > 0.0) type = 'fiber';
        } else if (biome === BIOME.volcano) {
          if (r1 < 0.05) type = 'rock';
          else if (r1 < 0.1) type = 'iron';
          else if (r1 < 0.13 && h > 30) type = 'obsidian';
        } else if (biome === BIOME.blacksand) {
          if (r1 < 0.012) type = 'rock';
          else if (r1 < 0.03) type = 'fiber';
        }
        if (!type) continue;
        if (type === 'charred' && slope > 0.85) continue;
        const sc = hash2(ix, iz, seed + 16);
        const scale = type === 'charred' ? 0.8 + sc * 0.5 : type === 'rock' || type === 'iron' ? 0.65 + sc * 0.6 : 0.85 + sc * 0.4;
        this.add(type, x, z, hash2(ix, iz, seed + 15) * Math.PI * 2, scale);
      }
    }
  }

  private buildMeshes() {
    const counts = new Map<string, ResourceNode[]>();
    for (const n of this.nodes) {
      const key = `${n.type}:${n.chunk}`;
      let arr = counts.get(key);
      if (!arr) {
        arr = [];
        counts.set(key, arr);
      }
      n.slot = arr.length;
      arr.push(n);
    }
    for (let c = 0; c < CHUNKS_PER_SIDE * CHUNKS_PER_SIDE; c++) {
      const g = new THREE.Group();
      g.name = `chunk${c}`;
      this.chunkGroups.push(g);
      this.group.add(g);
    }
    for (const [key, list] of counts) {
      const [type, chunkStr] = key.split(':') as [NodeTypeId, string];
      const parts = this.visuals[type];
      const meshes: THREE.InstancedMesh[] = [];
      for (const p of parts) {
        const im = new THREE.InstancedMesh(p.geo, p.mat, list.length);
        im.castShadow = p.shadow;
        im.receiveShadow = true;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        meshes.push(im);
        this.chunkGroups[+chunkStr].add(im);
      }
      this.meshes.set(key, meshes);
      for (const n of list) this.refresh(n);
      for (const im of meshes) im.computeBoundingSphere();
    }
    for (const n of this.nodes) this.setCollider(n, n.alive);
  }

  private setCollider(n: ResourceNode, on: boolean) {
    const def = NODES[n.type];
    if (def.collider <= 0) return;
    if (on && !n.collider) {
      const tall = TREE_TYPES.includes(n.type);
      n.collider = { kind: 'circle', x: n.x, z: n.z, r: def.collider * n.scale, minY: n.y - 1, maxY: n.y + (tall ? 6 : 1.3 * n.scale), owner: n };
      this.colliders.add(n.collider);
    } else if (!on && n.collider) {
      this.colliders.remove(n.collider);
      n.collider = null;
    }
  }

  private composeMatrix(n: ResourceNode, scaleMul = 1, tilt = 0, tiltAxis?: THREE.Vector3): THREE.Matrix4 {
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), n.rot);
    if (tilt !== 0 && tiltAxis) {
      const tq = new THREE.Quaternion().setFromAxisAngle(tiltAxis, tilt);
      this.q.premultiply(tq);
    }
    const s = n.scale * scaleMul;
    return this.m4.compose(this.v.set(n.x, n.y, n.z), this.q, this.s.set(s, s, s));
  }

  /** Writes instance matrices for every part of a node according to its state. */
  private refresh(n: ResourceNode, scaleMul = 1, tilt = 0, axis?: THREE.Vector3) {
    const meshes = this.meshes.get(`${n.type}:${n.chunk}`);
    if (!meshes) return;
    const parts = this.visuals[n.type];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const visible = p.when === 'always' || (p.when === 'alive' ? n.alive : !n.alive);
      const mat = visible ? (p.when === 'alive' ? this.composeMatrix(n, scaleMul, tilt, axis) : this.composeMatrix(n)) : ZERO;
      meshes[i].setMatrixAt(n.slot, mat);
      meshes[i].instanceMatrix.needsUpdate = true;
    }
  }

  queryRadius(x: number, z: number, r: number): ResourceNode[] {
    const out: ResourceNode[] = [];
    for (let gx = Math.floor((x - r) / 8); gx <= Math.floor((x + r) / 8); gx++) {
      for (let gz = Math.floor((z - r) / 8); gz <= Math.floor((z + r) / 8); gz++) {
        const arr = this.grid.get((gx + 1000) * 2000 + (gz + 1000));
        if (!arr) continue;
        for (const n of arr) if ((n.x - x) ** 2 + (n.z - z) ** 2 <= r * r) out.push(n);
      }
    }
    return out;
  }

  /** Visual feedback for a hit. */
  shake(n: ResourceNode) {
    this.shaking.set(n, 0.32);
  }

  deplete(n: ResourceNode, playTime: number, fromX: number, fromZ: number) {
    n.alive = false;
    n.respawnAt = playTime + NODES[n.type].respawn;
    this.shaking.delete(n);
    this.setCollider(n, false);
    const isTree = TREE_TYPES.includes(n.type);
    if (isTree) {
      const part = this.visuals[n.type][0];
      const mesh = new THREE.Mesh(part.geo, part.mat);
      mesh.castShadow = true;
      mesh.position.set(n.x, n.y, n.z);
      mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), n.rot);
      mesh.scale.setScalar(n.scale);
      const away = new THREE.Vector3(n.x - fromX, 0, n.z - fromZ).normalize();
      if (away.lengthSq() < 0.01) away.set(1, 0, 0);
      const axis = new THREE.Vector3(away.z, 0, -away.x);
      this.group.add(mesh);
      this.fallers.push({ mesh, t: 0, axis, base: mesh.quaternion.clone() });
    }
    this.refresh(n);
  }

  respawnNode(n: ResourceNode, animate: boolean) {
    n.alive = true;
    n.hp = NODES[n.type].hp;
    n.respawnAt = 0;
    this.setCollider(n, true);
    if (animate) this.growing.set(n, 0);
    this.refresh(n, animate ? 0.05 : 1);
  }

  resetAll() {
    for (const n of this.nodes) {
      if (!n.alive) this.respawnNode(n, false);
      n.hp = NODES[n.type].hp;
    }
    this.shaking.clear();
    this.growing.clear();
  }

  applyDepleted(list: [number, number][]) {
    for (const [id, at] of list) {
      const n = this.nodes[id];
      if (!n) continue;
      n.alive = false;
      n.respawnAt = at;
      this.setCollider(n, false);
      this.refresh(n);
    }
  }

  getDepleted(): [number, number][] {
    const out: [number, number][] = [];
    for (const n of this.nodes) if (!n.alive) out.push([n.id, Math.round(n.respawnAt)]);
    return out;
  }

  private respawnCheckIndex = 0;

  update(dt: number, playTime: number, focus: THREE.Vector3, viewDistance: number) {
    windUniforms.uTime.value += dt;
    // shake animation
    for (const [n, t] of this.shaking) {
      const nt = t - dt;
      if (nt <= 0) {
        this.shaking.delete(n);
        this.refresh(n);
      } else {
        const tilt = Math.sin(nt * 40) * nt * 0.18;
        this.refresh(n, 1, tilt, this.v.set(Math.cos(n.rot), 0, Math.sin(n.rot)).clone());
        this.shaking.set(n, nt);
      }
    }
    for (const [n, t] of this.growing) {
      const nt = t + dt;
      if (nt >= 1) {
        this.growing.delete(n);
        this.refresh(n);
      } else {
        const e = 1 - Math.pow(1 - nt, 3);
        this.refresh(n, 0.05 + 0.95 * e);
        this.growing.set(n, nt);
      }
    }
    // falling trees
    for (let i = this.fallers.length - 1; i >= 0; i--) {
      const f = this.fallers[i];
      f.t += dt;
      const ang = Math.min(Math.PI / 2 - 0.1, f.t * f.t * 1.4);
      f.mesh.quaternion.copy(f.base).premultiply(new THREE.Quaternion().setFromAxisAngle(f.axis, ang));
      if (f.t > 1.6) f.mesh.position.y -= dt * 1.5;
      if (f.t > 3) {
        this.group.remove(f.mesh);
        this.fallers.splice(i, 1);
      }
    }
    // incremental respawn checks (spread over frames)
    const total = this.nodes.length;
    const batch = Math.min(total, 400);
    for (let k = 0; k < batch; k++) {
      const n = this.nodes[this.respawnCheckIndex];
      this.respawnCheckIndex = (this.respawnCheckIndex + 1) % total;
      if (!n.alive && playTime >= n.respawnAt) {
        const d2 = (n.x - focus.x) ** 2 + (n.z - focus.z) ** 2;
        if (d2 > 64) this.respawnNode(n, d2 < 3600);
      }
    }
    // distance culling of whole chunks
    this.cullTimer -= dt;
    if (this.cullTimer <= 0) {
      this.cullTimer = 0.5;
      const lim = viewDistance + CHUNK * 0.75;
      for (let c = 0; c < this.chunkGroups.length; c++) {
        const cx = (c % CHUNKS_PER_SIDE) * CHUNK + CX0 + CHUNK / 2;
        const cz = Math.floor(c / CHUNKS_PER_SIDE) * CHUNK + CZ0 + CHUNK / 2;
        this.chunkGroups[c].visible = Math.hypot(cx - focus.x, cz - focus.z) < lim;
      }
    }
  }
}
