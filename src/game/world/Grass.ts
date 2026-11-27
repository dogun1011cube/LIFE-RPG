import * as THREE from 'three';
import { mulberry32 } from '../core/Random';
import { BIOME, type Terrain } from './Terrain';
import { windUniforms } from './Resources';

const CHUNK = 16;

function bladeGeometry(): THREE.BufferGeometry {
  // tapered 3-segment blade
  const levels = [0, 0.35, 0.7, 1];
  const widths = [0.05, 0.04, 0.024, 0];
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < levels.length; i++) {
    const y = levels[i];
    const w = widths[i];
    const bend = y * y * 0.12;
    const shade = 0.5 + y * 0.65;
    if (w > 0) {
      pos.push(-w, y, bend, w, y, bend);
      col.push(shade, shade, shade, shade, shade, shade);
    } else {
      pos.push(0, y, bend);
      col.push(shade, shade, shade);
    }
  }
  // indices: pairs (0,1)(2,3)(4,5) then tip 6
  idx.push(0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const normals = new Float32Array(pos.length);
  for (let i = 0; i < normals.length; i += 3) normals[i + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setIndex(idx);
  return g;
}

/** Instanced, wind-animated grass streamed in chunks around the player. */
export class GrassSystem {
  readonly group = new THREE.Group();
  private chunks = new Map<string, THREE.InstancedMesh>();
  private geo = bladeGeometry();
  private mat: THREE.MeshLambertMaterial;
  private radius = 42;
  private density = 0.7;
  private lastCx = Infinity;
  private lastCz = Infinity;
  private dirty = new Set<string>();
  /** Returns true where grass must not grow (e.g. under building floors). */
  blocked: (x: number, z: number) => boolean = () => false;

  constructor(private terrain: Terrain) {
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniforms.uTime;
      shader.vertexShader =
        'uniform float uTime;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float k = position.y * position.y;
          float gust = sin(uTime * 0.6 + ip.x * 0.02) * 0.5 + 0.5;
          transformed.x += sin(uTime * 2.1 + ip.x * 0.35 + ip.z * 0.22) * (0.1 + gust * 0.12) * k;
          transformed.z += cos(uTime * 1.7 + ip.x * 0.18 + ip.z * 0.31) * 0.08 * k;`,
        );
    };
    this.mat.customProgramCacheKey = () => 'grass';
    this.group.name = 'grass';
  }

  setQuality(radius: number, density: number) {
    if (radius === this.radius && density === this.density) return;
    this.radius = radius;
    this.density = density;
    this.clear();
  }

  clear() {
    for (const m of this.chunks.values()) {
      this.group.remove(m);
      m.dispose();
    }
    this.chunks.clear();
    this.lastCx = Infinity;
  }

  /** Rebuild the chunk containing (x,z) - call after placing/removing floors. */
  invalidateAt(x: number, z: number) {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) this.dirty.add(`${cx + dx},${cz + dz}`);
  }

  private build(cx: number, cz: number): THREE.InstancedMesh | null {
    const rng = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ 0x5bd1e995);
    const target = Math.floor(CHUNK * CHUNK * 4.2 * this.density);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    const mats: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];
    for (let i = 0; i < target; i++) {
      const x = cx * CHUNK + rng() * CHUNK;
      const z = cz * CHUNK + rng() * CHUNK;
      const b = this.terrain.biomeAt(x, z);
      if (b !== BIOME.meadow && b !== BIOME.forest && b !== BIOME.highlands) continue;
      if (b === BIOME.highlands && rng() < 0.6) continue;
      const h = this.terrain.heightAt(x, z);
      if (h < 1.6) continue;
      if (this.terrain.slopeAt(x, z) > 0.65) continue;
      if (this.blocked(x, z)) continue;
      const height = (b === BIOME.forest ? 0.26 : 0.32) + rng() * 0.3;
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      m4.compose(p.set(x, h - 0.03, z), q, s.set(1, height, 1));
      mats.push(m4.clone());
      this.terrain.colorAt(x, z, c);
      const f = 1.05 + rng() * 0.35;
      cols.push(c.clone().multiplyScalar(f));
    }
    if (mats.length === 0) return null;
    const im = new THREE.InstancedMesh(this.geo, this.mat, mats.length);
    for (let i = 0; i < mats.length; i++) {
      im.setMatrixAt(i, mats[i]);
      im.setColorAt(i, cols[i]);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.receiveShadow = true;
    return im;
  }

  update(focus: THREE.Vector3) {
    const cx = Math.floor(focus.x / CHUNK);
    const cz = Math.floor(focus.z / CHUNK);
    for (const key of this.dirty) {
      if (this.chunks.has(key)) {
        const m = this.chunks.get(key);
        if (m) {
          this.group.remove(m);
          m.dispose();
        }
        this.chunks.delete(key);
      }
      this.lastCx = Infinity;
    }
    this.dirty.clear();
    if (cx === this.lastCx && cz === this.lastCz) return;
    this.lastCx = cx;
    this.lastCz = cz;
    const r = Math.ceil(this.radius / CHUNK);
    const wanted = new Set<string>();
    let built = 0;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if ((dx * dx + dz * dz) * CHUNK * CHUNK > (this.radius + CHUNK) ** 2) continue;
        const key = `${cx + dx},${cz + dz}`;
        wanted.add(key);
        if (!this.chunks.has(key) && built < 40) {
          const m = this.build(cx + dx, cz + dz);
          built++;
          if (m) {
            this.chunks.set(key, m);
            this.group.add(m);
          } else this.chunks.set(key, null as unknown as THREE.InstancedMesh);
        }
      }
    }
    if (built >= 40) this.lastCx = Infinity; // continue streaming next frame
    for (const [key, m] of this.chunks) {
      if (!wanted.has(key)) {
        if (m) {
          this.group.remove(m);
          m.dispose();
        }
        this.chunks.delete(key);
      }
    }
  }
}
