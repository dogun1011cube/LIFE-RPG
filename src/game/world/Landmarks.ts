import * as THREE from 'three';
import { LOCATIONS, type LocationDef } from '../data/locations';
import { mulberry32 } from '../core/Random';
import type { Terrain } from './Terrain';
import type { CollisionWorld, BoxCollider } from './Colliders';
import { boxGeo, woodTexture, clothTexture, glowTexture } from './textures';
import { createCampfire, createChest, ruinStoneMaterial, type Flame } from './props';

export type LandmarkInteractKind = 'lore' | 'chest' | 'altar' | 'station' | 'dungeon';

export interface LandmarkInteractable {
  id: string;
  kind: LandmarkInteractKind;
  locationId: string;
  pos: THREE.Vector3;
  radius: number;
  label: string;
  /** for chests: mesh to hide once opened */
  object?: THREE.Object3D;
}

export interface LightSource {
  pos: THREE.Vector3;
  color: number;
  intensity: number;
  distance: number;
}

/** Hand-placed points of interest: ruins, camp, shipwreck... built procedurally from primitives. */
export class Landmarks {
  readonly group = new THREE.Group();
  readonly interactables: LandmarkInteractable[] = [];
  readonly lights: LightSource[] = [];
  readonly safeZones: { x: number; z: number; r: number }[] = [];
  private flames: Flame[] = [];
  private pulses: { mat: THREE.MeshStandardMaterial; base: number; speed: number }[] = [];
  private stone = ruinStoneMaterial();
  private darkStone = new THREE.MeshStandardMaterial({ color: 0x7d776c, roughness: 0.95 });
  private wood = new THREE.MeshStandardMaterial({ color: 0x9a7048, map: woodTexture('#8a6038'), roughness: 0.9 });
  private time = 0;

  constructor(
    private terrain: Terrain,
    private colliders: CollisionWorld,
  ) {
    this.group.name = 'landmarks';
    for (const loc of LOCATIONS) this.build(loc);
  }

  private y(x: number, z: number) {
    return this.terrain.heightAt(x, z);
  }

  /** Adds a box mesh (optionally rotated around Y) with an AABB collider. */
  private box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, rotY = 0, collide = true, tilt = 0): THREE.Mesh {
    const m = new THREE.Mesh(boxGeo(w, h, d, 2), mat);
    m.position.set(x, y + h / 2, z);
    m.rotation.set(tilt, rotY, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    if (collide) {
      const c = Math.abs(Math.cos(rotY));
      const s = Math.abs(Math.sin(rotY));
      const hw = (w * c + d * s) / 2;
      const hd = (w * s + d * c) / 2;
      const col: BoxCollider = { kind: 'box', minX: x - hw, maxX: x + hw, minY: y - 0.5, maxY: y + h, minZ: z - hd, maxZ: z + hd, owner: 'landmark' };
      this.colliders.add(col);
    }
    return m;
  }

  private cylinder(r: number, h: number, x: number, y: number, z: number, mat: THREE.Material, collide = true, sides = 10): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, sides), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    if (collide) this.colliders.add({ kind: 'circle', x, z, r, minY: y - 0.5, maxY: y + h, owner: 'landmark' });
    return m;
  }

  private tablet(loc: LocationDef, x: number, z: number, rotY: number) {
    const y = this.y(x, z);
    const slab = this.box(1.2, 1.6, 0.25, x, y - 0.1, z, this.darkStone, rotY);
    slab.rotation.x = -0.08;
    const runeMat = new THREE.MeshStandardMaterial({ color: 0x5fe0d8, emissive: 0x5fe0d8, emissiveIntensity: 0.8, roughness: 0.4 });
    this.pulses.push({ mat: runeMat, base: 0.8, speed: 2 });
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), runeMat);
    rune.position.set(x + Math.sin(rotY) * 0.135, y + 0.85, z + Math.cos(rotY) * 0.135);
    rune.rotation.y = rotY;
    this.group.add(rune);
    this.interactables.push({ id: `lore_${loc.id}`, kind: 'lore', locationId: loc.id, pos: new THREE.Vector3(x, y + 1, z), radius: 2.4, label: `읽기: ${loc.lore.title}` });
  }

  private chest(loc: LocationDef, x: number, z: number, rotY: number) {
    const y = this.y(x, z);
    const c = createChest(0x7a4a2a);
    c.position.set(x, y, z);
    c.rotation.y = rotY;
    this.group.add(c);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd27a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(2.2, 2.2, 1);
    glow.position.y = 0.6;
    c.add(glow);
    this.interactables.push({ id: `chest_${loc.id}`, kind: 'chest', locationId: loc.id, pos: new THREE.Vector3(x, y + 0.5, z), radius: 2.2, label: '열기: 오래된 상자', object: c });
  }

  private build(loc: LocationDef) {
    const rng = mulberry32(loc.x * 13 + loc.z * 7);
    const cx = loc.x;
    const cz = loc.z;
    const base = this.y(cx, cz);
    switch (loc.kind) {
      case 'camp': {
        const { group, flame } = createCampfire();
        group.position.set(cx, base, cz);
        this.group.add(group);
        this.flames.push(flame);
        this.colliders.add({ kind: 'circle', x: cx, z: cz, r: 0.6, minY: base - 1, maxY: base + 0.4, owner: 'landmark' });
        this.lights.push({ pos: new THREE.Vector3(cx, base + 1, cz), color: 0xff8a3a, intensity: 18, distance: 16 });
        this.safeZones.push({ x: cx, z: cz, r: 30 });
        this.interactables.push({ id: 'camp_fire', kind: 'station', locationId: loc.id, pos: new THREE.Vector3(cx, base + 0.5, cz), radius: 2.4, label: '요리하기: 모닥불' });
        // log seats
        for (const [a, len] of [
          [0.4, 1.8],
          [2.3, 1.6],
          [4.1, 1.7],
        ] as const) {
          const x = cx + Math.cos(a) * 2.4;
          const z = cz + Math.sin(a) * 2.4;
          const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, len, 8), new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.95 }));
          log.rotation.z = Math.PI / 2;
          log.rotation.y = -a + Math.PI / 2;
          log.position.set(x, this.y(x, z) + 0.2, z);
          log.castShadow = true;
          log.receiveShadow = true;
          this.group.add(log);
        }
        // tent
        const tx = cx - 5;
        const tz = cz - 3;
        const ty = this.y(tx, tz);
        const cloth = new THREE.MeshStandardMaterial({ color: 0xc9b48a, map: clothTexture('#c9b48a'), roughness: 0.95, side: THREE.DoubleSide });
        const tentGeo = new THREE.CylinderGeometry(1.6, 1.6, 3, 3, 1, true);
        const tent = new THREE.Mesh(tentGeo, cloth);
        tent.rotation.z = Math.PI / 2;
        tent.rotation.y = 0.5;
        tent.position.set(tx, ty + 0.8, tz);
        tent.castShadow = true;
        this.group.add(tent);
        this.colliders.add({ kind: 'box', minX: tx - 1.5, maxX: tx + 1.5, minZ: tz - 1.4, maxZ: tz + 1.4, minY: ty - 1, maxY: ty + 2.2, owner: 'landmark' });
        // crates
        this.box(0.8, 0.8, 0.8, cx + 4.5, this.y(cx + 4.5, cz - 2), cz - 2, this.wood, 0.3);
        this.box(0.6, 0.6, 0.6, cx + 5.3, this.y(cx + 5.3, cz - 1.2), cz - 1.2, this.wood, 0.9);
        this.tablet(loc, cx - 3.6, cz + 3.2, 2.3);
        break;
      }
      case 'tower': {
        const s = 6;
        const heights = [9, 6.5, 3.5, 8];
        const corners = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ];
        const floorY = base;
        this.box(s + 1.2, 0.4, s + 1.2, cx, floorY - 0.3, cz, this.stone);
        corners.forEach(([sx, sz], i) => this.box(1.2, heights[i], 1.2, cx + (sx * s) / 2, floorY, cz + (sz * s) / 2, this.stone));
        // walls with gaps
        this.box(s - 1.2, 3.5, 0.6, cx, floorY, cz - s / 2, this.stone);
        this.box(0.6, 2.2, s - 1.2, cx + s / 2, floorY, cz, this.stone);
        this.box(0.6, 4.5, 2.0, cx - s / 2, floorY, cz - 1.4, this.stone);
        this.box(1.6, 1.4, 0.6, cx - 1.5, floorY, cz + s / 2, this.stone);
        // upper floor remains
        this.box(3.5, 0.35, 3.0, cx + 1.0, floorY + 5.8, cz - 1.2, this.wood, 0, false);
        // rubble
        for (let i = 0; i < 14; i++) {
          const a = rng() * Math.PI * 2;
          const r = 4.5 + rng() * 6;
          const x = cx + Math.cos(a) * r;
          const z = cz + Math.sin(a) * r;
          const sz = 0.4 + rng() * 0.8;
          this.box(sz, sz * 0.7, sz, x, this.y(x, z) - 0.1, z, this.stone, rng() * 3, sz > 0.8, (rng() - 0.5) * 0.4);
        }
        this.chest(loc, cx + 1.2, cz + 1.0, Math.PI);
        this.tablet(loc, cx - 1.6, cz + 0.6, 0.4);
        break;
      }
      case 'stones': {
        const n = 9;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const x = cx + Math.cos(a) * 9;
          const z = cz + Math.sin(a) * 9;
          const h = 3.2 + rng() * 2;
          const m = this.box(1.1, h, 0.7, x, this.y(x, z) - 0.3, z, this.darkStone, -a + Math.PI / 2);
          m.rotation.x = (rng() - 0.5) * 0.15;
          m.rotation.z = (rng() - 0.5) * 0.15;
          if (i % 3 === 0) {
            // lintel on some pairs
            const a2 = ((i + 1) / n) * Math.PI * 2;
            const x2 = cx + Math.cos(a2) * 9;
            const z2 = cz + Math.sin(a2) * 9;
            const lin = new THREE.Mesh(boxGeo(1.0, 0.6, Math.hypot(x2 - x, z2 - z) + 1.2, 2), this.darkStone);
            lin.position.set((x + x2) / 2, this.y(x, z) + Math.min(h, 3.6) + 0.1, (z + z2) / 2);
            lin.lookAt(x2, lin.position.y, z2);
            lin.castShadow = true;
            this.group.add(lin);
          }
        }
        // central altar
        this.box(2.4, 0.9, 1.4, cx, base - 0.1, cz, this.stone);
        const runeMat = new THREE.MeshStandardMaterial({ color: 0x5fe0d8, emissive: 0x5fe0d8, emissiveIntensity: 1, roughness: 0.4 });
        this.pulses.push({ mat: runeMat, base: 1, speed: 1.3 });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.45, 24), runeMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(cx, base + 0.81, cz);
        this.group.add(ring);
        this.interactables.push({ id: `lore_${loc.id}`, kind: 'lore', locationId: loc.id, pos: new THREE.Vector3(cx, base + 1, cz), radius: 2.6, label: `읽기: ${loc.lore.title}` });
        break;
      }
      case 'shrine': {
        // stepped platform
        const tiers = [
          [24, 0.5],
          [18, 0.5],
          [11, 0.5],
        ] as const;
        let y = base - 0.2;
        for (const [size, h] of tiers) {
          this.box(size, h, size, cx, y, cz, this.stone);
          y += h;
        }
        const top = y;
        // pillars
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const x = cx + Math.cos(a) * 10.2;
          const z = cz + Math.sin(a) * 10.2;
          const broken = i % 3 === 1;
          const h = broken ? 1.5 + rng() * 1.5 : 6.5;
          this.cylinder(0.55, h, x, base + 0.3, z, this.stone);
          if (!broken) this.box(1.4, 0.4, 1.4, x, base + 0.3 + h, z, this.stone, a, false);
          else {
            const fx = x + Math.cos(a + 1.2) * 2.5;
            const fz = z + Math.sin(a + 1.2) * 2.5;
            const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 3.5, 10), this.stone);
            fallen.rotation.z = Math.PI / 2;
            fallen.rotation.y = a;
            fallen.position.set(fx, this.y(fx, fz) + 0.4, fz);
            fallen.castShadow = true;
            this.group.add(fallen);
          }
        }
        // altar
        this.box(2.2, 1.1, 2.2, cx, top, cz, this.darkStone);
        const crystalMat = new THREE.MeshStandardMaterial({ color: 0x5fe0d8, emissive: 0x2ab8c8, emissiveIntensity: 1.2, roughness: 0.2 });
        this.pulses.push({ mat: crystalMat, base: 1.2, speed: 1.6 });
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), crystalMat);
        crystal.scale.set(1, 1.8, 1);
        crystal.position.set(cx, top + 1.1 + 0.9, cz);
        crystal.name = 'shrineCrystal';
        this.group.add(crystal);
        this.interactables.push({ id: 'shrine_altar', kind: 'altar', locationId: loc.id, pos: new THREE.Vector3(cx, top + 1, cz), radius: 2.8, label: '고대 인장 바치기' });
        this.tablet(loc, cx + 4, cz + 7.5, 0.3);
        break;
      }
      case 'crystal': {
        const crystalMat = new THREE.MeshStandardMaterial({ color: 0x6fe6f6, emissive: 0x2ab8d8, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.1, flatShading: true });
        this.pulses.push({ mat: crystalMat, base: 0.9, speed: 0.9 });
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + rng();
          const r = i === 0 ? 0 : 3 + rng() * 5;
          const x = cx + Math.cos(a) * r;
          const z = cz + Math.sin(a) * r;
          const h = i === 0 ? 8 : 2.5 + rng() * 3.5;
          const m = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), crystalMat);
          m.scale.set(h * 0.18, h * 0.6, h * 0.18);
          m.position.set(x, this.y(x, z) + h * 0.35, z);
          m.rotation.set((rng() - 0.5) * 0.5, rng() * 3, (rng() - 0.5) * 0.5);
          m.castShadow = true;
          this.group.add(m);
          this.colliders.add({ kind: 'circle', x, z, r: h * 0.16 + 0.2, minY: this.y(x, z) - 1, maxY: this.y(x, z) + h, owner: 'landmark' });
        }
        this.lights.push({ pos: new THREE.Vector3(cx, base + 4, cz), color: 0x5fe0f0, intensity: 14, distance: 20 });
        this.tablet(loc, cx + 6, cz + 6, 0.8);
        break;
      }
      case 'crypt': {
        // grassy burial mound with a stone archway and steps leading down
        const moundMat = new THREE.MeshStandardMaterial({ color: 0x4f6f34, roughness: 1, flatShading: true });
        const mound = new THREE.Mesh(new THREE.SphereGeometry(9, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), moundMat);
        mound.scale.set(1, 0.55, 1);
        mound.position.set(cx, base - 0.6, cz - 6);
        mound.receiveShadow = true;
        mound.castShadow = true;
        this.group.add(mound);
        this.colliders.add({ kind: 'circle', x: cx, z: cz - 6, r: 8.2, minY: base - 2, maxY: base + 4.2, owner: 'landmark' });
        this.box(1.0, 4.2, 1.0, cx - 2.1, base, cz + 2.2, this.stone);
        this.box(1.0, 4.2, 1.0, cx + 2.1, base, cz + 2.2, this.stone);
        this.box(5.4, 0.9, 1.2, cx, base + 4.2, cz + 2.2, this.darkStone);
        // dark doorway
        const door = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.1), new THREE.MeshBasicMaterial({ color: 0x050405 }));
        door.position.set(cx, base + 2.05, cz + 1.75);
        this.group.add(door);
        for (let i = 0; i < 3; i++) this.box(3.2, 0.25, 0.8, cx, base - 0.1 - i * 0.12, cz + 3.4 + i * 0.8, this.stone, 0, false);
        const runeMat = new THREE.MeshStandardMaterial({ color: 0xb06aff, emissive: 0x8a4aff, emissiveIntensity: 1.2 });
        this.pulses.push({ mat: runeMat, base: 1.2, speed: 1.4 });
        for (const [x, kind] of [
          [-1.2, 0],
          [0, 1],
          [1.2, 2],
        ] as const) {
          const geo = kind === 0 ? new THREE.CircleGeometry(0.22, 14) : kind === 1 ? new THREE.RingGeometry(0.12, 0.22, 14, 1, 0.6, Math.PI * 1.4) : new THREE.CircleGeometry(0.2, 5);
          const m = new THREE.Mesh(geo, runeMat);
          m.position.set(cx + x, base + 4.65, cz + 2.81);
          this.group.add(m);
        }
        this.lights.push({ pos: new THREE.Vector3(cx, base + 2, cz + 3), color: 0xb06aff, intensity: 8, distance: 12 });
        this.interactables.push({ id: 'crypt_door', kind: 'dungeon', locationId: loc.id, pos: new THREE.Vector3(cx, base + 1, cz + 2.4), radius: 2.8, label: '묘소로 들어가기' });
        this.tablet(loc, cx + 4.5, cz + 4.5, -0.5);
        break;
      }
      case 'wreck': {
        const rot = 0.6;
        const g = new THREE.Group();
        g.position.set(cx, base - 0.3, cz);
        g.rotation.set(0.08, rot, 0.25);
        const plank = this.wood;
        const hullL = new THREE.Mesh(boxGeo(0.3, 2.2, 12, 2), plank);
        hullL.position.set(-1.6, 1.0, 0);
        hullL.rotation.z = 0.35;
        const hullR = new THREE.Mesh(boxGeo(0.3, 1.6, 9, 2), plank);
        hullR.position.set(1.6, 0.7, -1.2);
        hullR.rotation.z = -0.35;
        const deck = new THREE.Mesh(boxGeo(3.2, 0.2, 10, 2), plank);
        deck.position.set(0, 0.2, -0.5);
        const keel = new THREE.Mesh(boxGeo(0.5, 0.5, 13, 2), plank);
        keel.position.set(0, -0.1, 0);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 8), plank);
        mast.position.set(0.4, 2.5, 1.5);
        mast.rotation.z = 0.9;
        for (const m of [hullL, hullR, deck, keel, mast]) {
          m.castShadow = true;
          m.receiveShadow = true;
          g.add(m);
        }
        this.group.add(g);
        this.colliders.add({ kind: 'box', minX: cx - 2.4, maxX: cx - 1.2, minZ: cz - 5, maxZ: cz + 5, minY: base - 1, maxY: base + 2.2, owner: 'landmark' });
        this.chest(loc, cx + 2.5, cz + 3.5, 0.2);
        this.tablet(loc, cx + 3.5, cz - 2.5, -0.5);
        break;
      }
    }
  }

  markChestOpened(id: string) {
    const it = this.interactables.find((i) => i.id === id);
    if (it?.object) {
      it.object.traverse((o) => {
        if ((o as THREE.Sprite).isSprite) o.visible = false;
      });
      it.object.rotation.x = 0;
      it.object.scale.y = 0.96;
    }
  }

  update(dt: number) {
    this.time += dt;
    for (const f of this.flames) f.update(this.time);
    for (const p of this.pulses) p.mat.emissiveIntensity = p.base * (0.75 + 0.25 * Math.sin(this.time * p.speed));
    const crystal = this.group.getObjectByName('shrineCrystal');
    if (crystal) {
      crystal.rotation.y += dt * 0.8;
      crystal.position.y += Math.sin(this.time * 1.5) * 0.002;
    }
  }
}
