import * as THREE from 'three';
import { MAP_REGION, WORLD } from '../config';
import { dampAngle } from '../core/math';
import { boxGeo, clothTexture, woodTexture } from '../world/textures';
import { Inv } from '../systems/Inventory';
import type { Game } from '../Game';

const MAX_SPEED = 10;
const SAIL_BONUS = 1.35;
const DRAFT = -0.55; // the hull needs water at least this deep

/** The player's sailing boat: launch from the shore, steer with WASD, step off near land. */
export class BoatSystem {
  readonly group = new THREE.Group();
  onBoard = false;
  speed = 0;
  private yaw = 0;
  private bob = 0;
  private sail: THREE.Mesh;
  private wake: THREE.Mesh;

  constructor(private game: Game) {
    this.group.name = 'boat';
    this.group.visible = false;
    const wood = new THREE.MeshStandardMaterial({ color: 0xffffff, map: woodTexture('#8a5a32'), roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0xffffff, map: woodTexture('#5a3a20'), roughness: 0.9 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0xffffff, map: clothTexture('#e8dcc0'), roughness: 0.95, side: THREE.DoubleSide });
    // hull: a tapered box with raised sides
    const hullGeo = boxGeo(1.8, 0.5, 4.4, 2);
    const pos = hullGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      const y = pos.getY(i);
      const taper = z > 1.2 ? 1 - (z - 1.2) / 1.4 : z < -1.6 ? 1 - (-1.6 - z) / 2.2 : 1;
      pos.setX(i, pos.getX(i) * Math.max(0.15, taper) * (y < 0 ? 0.75 : 1));
    }
    hullGeo.computeVertexNormals();
    const hull = new THREE.Mesh(hullGeo, wood);
    hull.position.y = 0.05;
    const rimL = new THREE.Mesh(boxGeo(0.1, 0.25, 3.6, 1), dark);
    rimL.position.set(-0.86, 0.38, -0.2);
    const rimR = rimL.clone();
    rimR.position.x = 0.86;
    const bench = new THREE.Mesh(boxGeo(1.5, 0.08, 0.4, 1), dark);
    bench.position.set(0, 0.35, -0.9);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 6), dark);
    mast.position.set(0, 2.3, 0.6);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5), dark);
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 0.9, -0.4);
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 4.2, 0.6, 0, 0.95, 0.6, 0, 0.95, -1.45], 3));
    sailGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0], 2));
    sailGeo.computeVertexNormals();
    this.sail = new THREE.Mesh(sailGeo, cloth);
    this.wake = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    this.wake.rotation.x = -Math.PI / 2;
    this.wake.position.set(0, -0.12, -3.6);
    for (const m of [hull, rimL, rimR, bench, mast, boom, this.sail]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    this.group.add(hull, rimL, rimR, bench, mast, boom, this.sail, this.wake);
    game.scene.add(this.group);
  }

  get placed(): boolean {
    return !!this.game.state.boat;
  }

  /** Restore from the save. */
  load() {
    const b = this.game.state.boat;
    this.onBoard = false;
    this.speed = 0;
    this.game.player.mounted = false;
    this.group.visible = !!b;
    if (b) {
      this.yaw = b.yaw;
      this.group.position.set(b.x, WORLD.waterLevel, b.z);
      this.group.rotation.set(0, b.yaw, 0);
    }
  }

  private depth(x: number, z: number) {
    return this.game.terrain.heightAt(x, z);
  }

  /** Use the boat item: put it on nearby water and climb in. */
  launch(): boolean {
    const game = this.game;
    if (this.placed) {
      game.events.emit('notify', { text: '이미 바다에 띄운 배가 있습니다', kind: 'warn' });
      return false;
    }
    if (game.inDungeon) return false;
    const p = game.player.body.pos;
    let best: THREE.Vector3 | null = null;
    for (let r = 1; r <= 6 && !best; r += 1) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const x = p.x + Math.cos(a) * r;
        const z = p.z + Math.sin(a) * r;
        if (this.depth(x, z) < DRAFT - 0.2 && this.depth(x + Math.cos(a) * 2, z + Math.sin(a) * 2) < DRAFT) {
          best = new THREE.Vector3(x, 0, z);
          break;
        }
      }
    }
    if (!best) {
      game.events.emit('notify', { text: '배를 띄울 물이 없습니다. 바닷가 얕은 물이나 선착장 끝에서 사용하세요', kind: 'warn' });
      game.audio.play('deny');
      return false;
    }
    if (!Inv.remove(game.state.player.inventory, 'boat', 1)) return false;
    const yaw = Math.atan2(best.x - p.x, best.z - p.z);
    game.state.boat = { x: best.x, z: best.z, yaw };
    this.load();
    this.board();
    game.events.emit('notify', { text: '배를 띄웠다! [W/S] 속도 · [A/D] 방향 · 육지 가까이에서 [E]로 내리기', kind: 'info' });
    game.audio.play('place');
    game.bridge.bump();
    return true;
  }

  near(pos: THREE.Vector3, r = 3.2): boolean {
    return this.placed && !this.onBoard && Math.hypot(pos.x - this.group.position.x, pos.z - this.group.position.z) < r;
  }

  board() {
    if (!this.placed) return;
    this.onBoard = true;
    this.speed = 0;
    this.game.player.mounted = true;
    this.game.audio.play('door', 0.6);
    const c = this.game.state.counters;
    c['boat:boarded'] = (c['boat:boarded'] ?? 0) + 1;
  }

  /** A spot on land close to the boat, or null. */
  landingSpot(): THREE.Vector3 | null {
    const b = this.group.position;
    let best: THREE.Vector3 | null = null;
    let bd = Infinity;
    for (let r = 1.5; r <= 6; r += 0.75) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
        const x = b.x + Math.cos(a) * r;
        const z = b.z + Math.sin(a) * r;
        const h = this.depth(x, z);
        if (h < WORLD.waterLevel + 0.15 || this.game.terrain.slopeAt(x, z) > 0.8) continue;
        if (r < bd) {
          bd = r;
          best = new THREE.Vector3(x, h, z);
        }
      }
      if (best) break;
    }
    return best;
  }

  disembark(): boolean {
    const spot = this.landingSpot();
    if (!spot) {
      this.game.events.emit('notify', { text: '육지 가까이에서만 내릴 수 있습니다', kind: 'warn' });
      return false;
    }
    this.onBoard = false;
    this.speed = 0;
    this.game.player.mounted = false;
    this.game.player.body.pos.copy(spot).setY(spot.y + 0.05);
    this.game.player.body.vel.set(0, 0, 0);
    this.save();
    this.game.audio.play('door', 0.6);
    return true;
  }

  private save() {
    const b = this.group.position;
    this.game.state.boat = { x: b.x, z: b.z, yaw: this.yaw };
  }

  update(dt: number, inputEnabled: boolean) {
    const game = this.game;
    if (!this.placed) return;
    this.bob += dt;
    const g = this.group;
    const storm = game.weather.kind === 'storm';
    if (this.onBoard) {
      const input = game.input;
      let throttle = 0;
      let turn = 0;
      if (inputEnabled) {
        if (input.isDown('KeyW')) throttle += 1;
        if (input.isDown('KeyS')) throttle -= 0.5;
        if (input.isDown('KeyA')) turn += 1;
        if (input.isDown('KeyD')) turn -= 1;
      }
      const max = MAX_SPEED * (game.state.boatSail ? SAIL_BONUS : 1) * game.weather.sailMult;
      this.speed += (throttle * max - this.speed) * Math.min(1, dt * (throttle ? 0.6 : 0.9));
      this.yaw += turn * dt * (0.6 + Math.min(1, Math.abs(this.speed) / 4) * 0.6);
      const nx = g.position.x + Math.sin(this.yaw) * this.speed * dt;
      const nz = g.position.z + Math.cos(this.yaw) * this.speed * dt;
      // the bow must stay in water deep enough for the hull
      const bowX = nx + Math.sin(this.yaw) * 2.2 * Math.sign(this.speed || 1);
      const bowZ = nz + Math.cos(this.yaw) * 2.2 * Math.sign(this.speed || 1);
      if (this.depth(bowX, bowZ) < DRAFT && this.depth(nx, nz) < DRAFT) {
        g.position.x = nx;
        g.position.z = nz;
      } else {
        if (Math.abs(this.speed) > 3) game.audio.play('remove', 0.4);
        this.speed *= -0.2;
      }
      const M = MAP_REGION;
      const lim = M.size / 2 - 25;
      g.position.x = Math.max(M.cx - lim, Math.min(M.cx + lim, g.position.x));
      g.position.z = Math.max(M.cz - lim, Math.min(M.cz + lim, g.position.z));
      const c = game.state.counters;
      c['boat:distance'] = (c['boat:distance'] ?? 0) + Math.abs(this.speed) * dt;
      // seat the player
      const pl = game.player;
      pl.body.pos.set(g.position.x - Math.sin(this.yaw) * 0.9, g.position.y + 0.35, g.position.z - Math.cos(this.yaw) * 0.9);
      pl.body.vel.set(0, 0, 0);
      pl.yaw = dampAngle(pl.yaw, this.yaw, 8, dt);
    }
    const rock = storm ? 2.2 : 1;
    g.position.y = WORLD.waterLevel - 0.12 + Math.sin(this.bob * 1.6) * 0.06 * rock;
    g.rotation.set(Math.sin(this.bob * 1.1) * 0.03 * rock, this.yaw, Math.sin(this.bob * 1.4) * 0.05 * rock - (this.onBoard ? this.speed * 0.004 : 0));
    this.sail.scale.z = 0.8 + Math.min(1, Math.abs(this.speed) / MAX_SPEED) * 0.25;
    (this.wake.material as THREE.MeshBasicMaterial).opacity = Math.min(0.35, Math.abs(this.speed) * 0.04);
  }
}
