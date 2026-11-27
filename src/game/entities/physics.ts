import * as THREE from 'three';
import type { Terrain } from '../world/Terrain';
import { CollisionWorld, rampHeight, type Collider } from '../world/Colliders';

export interface Body {
  pos: THREE.Vector3; // feet position
  vel: THREE.Vector3;
  radius: number;
  height: number;
  stepHeight: number;
  grounded: boolean;
}

const tmp: Collider[] = [];

/** Highest walkable surface under (x,z) that is not above feetY + step. */
export function groundAt(terrain: Terrain, world: CollisionWorld, x: number, z: number, r: number, feetY: number, step: number): number {
  let g = terrain.heightAt(x, z);
  const fr = r * 0.7;
  const list = world.query(x - r, z - r, x + r, z + r, tmp);
  for (const c of list) {
    if (c.kind === 'box') {
      if (x + fr > c.minX && x - fr < c.maxX && z + fr > c.minZ && z - fr < c.maxZ) {
        if (c.maxY <= feetY + step + 0.001 && c.maxY > g) g = c.maxY;
      }
    } else if (c.kind === 'ramp') {
      if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) {
        const h = rampHeight(c, x, z);
        if (h <= feetY + step + 0.4 && h > g) g = h;
      }
    }
  }
  return g;
}

export function resolveHorizontal(world: CollisionWorld, pos: THREE.Vector3, r: number, feetY: number, height: number, step: number): boolean {
  const list = world.query(pos.x - r - 0.5, pos.z - r - 0.5, pos.x + r + 0.5, pos.z + r + 0.5, tmp);
  let hit = false;
  for (let iter = 0; iter < 2; iter++) {
    for (const c of list) {
      if (c.kind === 'ramp') continue;
      if (c.maxY <= feetY + step || c.minY >= feetY + height) continue;
      if (c.kind === 'circle') {
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const d = Math.hypot(dx, dz);
        const min = r + c.r;
        if (d < min) {
          hit = true;
          if (d > 1e-5) {
            const push = (min - d) / d;
            pos.x += dx * push;
            pos.z += dz * push;
          } else pos.x += min;
        }
      } else {
        const cx = pos.x < c.minX ? c.minX : pos.x > c.maxX ? c.maxX : pos.x;
        const cz = pos.z < c.minZ ? c.minZ : pos.z > c.maxZ ? c.maxZ : pos.z;
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          hit = true;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            pos.x += (dx / d) * (r - d);
            pos.z += (dz / d) * (r - d);
          } else {
            const l = pos.x - c.minX + r;
            const rr = c.maxX - pos.x + r;
            const b = pos.z - c.minZ + r;
            const f = c.maxZ - pos.z + r;
            const m = Math.min(l, rr, b, f);
            if (m === l) pos.x -= l;
            else if (m === rr) pos.x += rr;
            else if (m === b) pos.z -= b;
            else pos.z += f;
          }
        }
      }
    }
  }
  return hit;
}

export function moveBody(body: Body, dt: number, terrain: Terrain, world: CollisionWorld, gravity: number, noGravity = false) {
  const p = body.pos;
  p.x += body.vel.x * dt;
  p.z += body.vel.z * dt;
  resolveHorizontal(world, p, body.radius, p.y, body.height, body.stepHeight);

  if (!noGravity) body.vel.y -= gravity * dt;
  const newY = p.y + body.vel.y * dt;
  const ground = groundAt(terrain, world, p.x, p.z, body.radius, p.y, body.stepHeight);
  if (body.vel.y <= 0 && newY <= ground) {
    p.y = ground;
    body.vel.y = 0;
    body.grounded = true;
  } else if (body.grounded && body.vel.y <= 0 && p.y - ground < 0.65 && p.y >= ground) {
    p.y = ground; // stick to slopes and stairs going down
    body.vel.y = 0;
    body.grounded = true;
  } else {
    let y = newY;
    if (body.vel.y > 0) {
      const list = world.query(p.x - body.radius, p.z - body.radius, p.x + body.radius, p.z + body.radius, tmp);
      for (const c of list) {
        if (c.kind !== 'box') continue;
        if (p.x + body.radius * 0.6 < c.minX || p.x - body.radius * 0.6 > c.maxX || p.z + body.radius * 0.6 < c.minZ || p.z - body.radius * 0.6 > c.maxZ) continue;
        if (c.minY >= p.y + body.height - 0.05 && c.minY < y + body.height) {
          y = c.minY - body.height;
          body.vel.y = 0;
        }
      }
    }
    if (y < ground) y = ground;
    p.y = y;
    body.grounded = false;
  }
}
