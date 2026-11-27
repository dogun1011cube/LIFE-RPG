import * as THREE from 'three';
import { glowTexture } from '../world/textures';
import type { Terrain } from '../world/Terrain';
import type { CollisionWorld } from '../world/Colliders';

export interface Projectile {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  damage: number;
  life: number;
  radius: number;
  homing: number;
  slow: boolean;
  color: number;
  owner: 'enemy' | 'player';
  /** homing target for player projectiles */
  target?: { body: { pos: THREE.Vector3 }; removed?: boolean };
  /** fired by a town defence (archer tower) instead of the player */
  source?: 'tower';
}

const coreGeo = new THREE.SphereGeometry(0.18, 10, 8);

/** Enemy projectiles (wisp orbs, warden shards). Blocked by terrain and building walls. */
export class ProjectileSystem {
  readonly group = new THREE.Group();
  readonly list: Projectile[] = [];

  constructor(
    private terrain: Terrain,
    private colliders: CollisionWorld,
  ) {
    this.group.name = 'projectiles';
  }

  spawn(pos: THREE.Vector3, vel: THREE.Vector3, damage: number, color: number, opts: { homing?: number; slow?: boolean; life?: number; owner?: 'enemy' | 'player'; target?: Projectile['target']; source?: 'tower' } = {}) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(1.3, 1.3, 1);
    g.add(core, glow);
    g.position.copy(pos);
    this.group.add(g);
    this.list.push({ mesh: g, pos: g.position, vel: vel.clone(), damage, life: opts.life ?? 4, radius: 0.35, homing: opts.homing ?? 0, slow: !!opts.slow, color, owner: opts.owner ?? 'enemy', target: opts.target, source: opts.source });
  }

  clear() {
    for (const p of this.list) this.group.remove(p.mesh);
    this.list.length = 0;
  }

  /** Moves projectiles; calls onHit for those touching the target. Returns impact positions for FX. */
  update(
    dt: number,
    target: THREE.Vector3,
    targetRadius: number,
    onHit: (p: Projectile) => boolean,
    onImpact: (pos: THREE.Vector3, color: number) => void,
    onPlayerProjectile: (p: Projectile) => boolean = () => false,
  ) {
    const tmp = new THREE.Vector3();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.homing > 0) {
        const t = p.owner === 'player' ? (p.target && !p.target.removed ? p.target.body.pos : null) : target;
        if (t) {
          tmp.set(t.x - p.pos.x, t.y + 1.1 - p.pos.y, t.z - p.pos.z).normalize().multiplyScalar(p.vel.length());
          p.vel.lerp(tmp, Math.min(1, p.homing * dt));
        }
      }
      p.pos.addScaledVector(p.vel, dt);
      let dead = p.life <= 0;
      if (!dead && p.pos.y < this.terrain.heightAt(p.pos.x, p.pos.z)) dead = true;
      if (!dead) {
        const near = this.colliders.query(p.pos.x - 0.3, p.pos.z - 0.3, p.pos.x + 0.3, p.pos.z + 0.3);
        for (const c of near) {
          if (c.kind === 'box' && p.pos.x > c.minX && p.pos.x < c.maxX && p.pos.z > c.minZ && p.pos.z < c.maxZ && p.pos.y > c.minY && p.pos.y < c.maxY) {
            dead = true;
            break;
          }
        }
      }
      if (!dead && p.owner === 'player') {
        if (onPlayerProjectile(p)) dead = true;
      } else if (!dead) {
        const dx = target.x - p.pos.x;
        const dy = target.y + 1.0 - p.pos.y;
        const dz = target.z - p.pos.z;
        if (dx * dx + dz * dz < (p.radius + targetRadius) ** 2 && Math.abs(dy) < 1.1) {
          if (onHit(p)) dead = true;
        }
      }
      if (dead) {
        onImpact(p.pos.clone(), p.color);
        this.group.remove(p.mesh);
        this.list.splice(i, 1);
      } else {
        p.mesh.children[1].scale.setScalar(1.2 + Math.sin(p.life * 20) * 0.15);
      }
    }
  }
}
