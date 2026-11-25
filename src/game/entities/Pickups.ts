import * as THREE from 'three';
import { ITEMS, RARITY_COLOR } from '../data/items';
import { glowTexture } from '../world/textures';
import type { Terrain } from '../world/Terrain';

export interface Pickup {
  id: string;
  qty: number;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  settled: boolean;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function geoFor(category: string): THREE.BufferGeometry {
  let g = geoCache.get(category);
  if (!g) {
    switch (category) {
      case 'weapon':
      case 'tool':
        g = new THREE.BoxGeometry(0.08, 0.5, 0.08);
        break;
      case 'consumable':
        g = new THREE.SphereGeometry(0.16, 10, 8);
        break;
      case 'armor':
        g = new THREE.BoxGeometry(0.35, 0.3, 0.18);
        break;
      default:
        g = new THREE.IcosahedronGeometry(0.17, 0);
    }
    geoCache.set(category, g);
  }
  return g;
}

/** Loot lying in the world. Bobs, spins, and is magnetically collected by the player. */
export class PickupSystem {
  readonly group = new THREE.Group();
  readonly list: Pickup[] = [];

  constructor(private terrain: Terrain) {
    this.group.name = 'pickups';
  }

  spawn(id: string, qty: number, pos: THREE.Vector3) {
    const def = ITEMS[id];
    if (!def) return;
    const g = new THREE.Group();
    const color = new THREE.Color(def.icon.c1);
    const mesh = new THREE.Mesh(geoFor(def.category), new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.25 }));
    mesh.castShadow = true;
    g.add(mesh);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(RARITY_COLOR[def.rarity]), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glow.scale.set(0.9, 0.9, 1);
    g.add(glow);
    g.position.copy(pos);
    this.group.add(g);
    const vel = new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3);
    this.list.push({ id, qty, mesh: g, pos: g.position, vel, age: 0, settled: false });
  }

  remove(p: Pickup) {
    this.group.remove(p.mesh);
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
  }

  clear() {
    for (const p of [...this.list]) this.remove(p);
  }

  /** Returns pickups that reached the player this frame. */
  update(dt: number, target: THREE.Vector3, canCollect: (p: Pickup) => boolean): Pickup[] {
    const collected: Pickup[] = [];
    for (const p of [...this.list]) {
      p.age += dt;
      if (p.age > 300) {
        this.remove(p);
        continue;
      }
      const dx = target.x - p.pos.x;
      const dy = target.y + 0.9 - p.pos.y;
      const dz = target.z - p.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (p.age > 0.5 && d < 5 && canCollect(p)) {
        const pull = 16 * (1 - d / 5.2) + 5;
        p.pos.x += (dx / d) * pull * dt;
        p.pos.y += (dy / d) * pull * dt;
        p.pos.z += (dz / d) * pull * dt;
        if (d < 0.7) {
          collected.push(p);
          continue;
        }
      } else if (!p.settled) {
        p.vel.y -= 14 * dt;
        p.pos.addScaledVector(p.vel, dt);
        const g = this.terrain.heightAt(p.pos.x, p.pos.z) + 0.35;
        if (p.pos.y <= g) {
          p.pos.y = g;
          p.vel.multiplyScalar(0.3);
          if (Math.abs(p.vel.y) < 0.6) {
            p.settled = true;
          } else p.vel.y = Math.abs(p.vel.y);
        }
      } else {
        const g = this.terrain.heightAt(p.pos.x, p.pos.z) + 0.45;
        p.pos.y = g + Math.sin(p.age * 3) * 0.08;
      }
      p.mesh.children[0].rotation.y += dt * 2.5;
      p.mesh.children[0].rotation.x = Math.sin(p.age * 2) * 0.3;
    }
    return collected;
  }
}
