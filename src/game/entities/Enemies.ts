import * as THREE from 'three';
import { ENEMIES, type AttackDef, type EnemyDef } from '../data/enemies';
import { BOSS_ARENA } from '../data/locations';
import { WORLD } from '../config';
import { angleDiff, dampAngle } from '../core/math';
import { BIOME, VOLCANO } from '../world/Terrain';
import { ringTexture } from '../world/textures';
import { buildEnemyRig, type EnemyRig } from './EnemyModels';
import { moveBody, groundAt, type Body } from './physics';
import type { Game } from '../Game';
import type { RaidTarget } from '../systems/Defense';

export type EnemyState = 'idle' | 'wander' | 'chase' | 'windup' | 'attack' | 'recover' | 'hurt' | 'dead' | 'return';

let nextEnemyId = 1;

export class Enemy {
  readonly id = nextEnemyId++;
  readonly rig: EnemyRig;
  readonly body: Body;
  hp: number;
  maxHp: number;
  state: EnemyState = 'idle';
  stateTime = 0;
  yaw = Math.random() * Math.PI * 2;
  home: THREE.Vector3;
  wanderTarget = new THREE.Vector3();
  attack: AttackDef | null = null;
  attackHit = false;
  cooldown = 1;
  aggro = false;
  phase: 1 | 2 = 1;
  flash = 0;
  telegraph: THREE.Mesh | null = null;
  slamCenter = new THREE.Vector3();
  lungeDir = new THREE.Vector3();
  removed = false;
  lastDamagedAt = -100;
  time = Math.random() * 10;
  despawning = 0;
  /** Simple obstacle avoidance: when progress stalls, steer sideways for a moment. */
  stuck = 0;
  /** seconds of frost slow remaining */
  slowTime = 0;
  /** custom stagger duration for the current hurt state (parry) */
  staggerFor = 0;
  detour = 0;
  detourSign = 1;
  lastPos = new THREE.Vector3();
  /** part of a raid on the settlement: targets guards / villagers / the town hall instead of only the player */
  raid = false;
  raidTarget: RaidTarget | null = null;
  retarget = 0;

  constructor(
    readonly def: EnemyDef,
    pos: THREE.Vector3,
  ) {
    this.rig = buildEnemyRig(def.model, def.scale);
    this.body = { pos: pos.clone(), vel: new THREE.Vector3(), radius: def.radius, height: def.height, stepHeight: 0.6, grounded: false };
    this.hp = this.maxHp = def.hp;
    this.home = pos.clone();
    this.wanderTarget.copy(pos);
    this.rig.root.position.copy(pos);
  }

  setState(s: EnemyState) {
    this.state = s;
    this.stateTime = 0;
  }
}

const SPAWN_TABLE: Record<number, { day: [string, number][]; night: [string, number][] }> = {
  [BIOME.meadow]: { day: [['slime', 1]], night: [['slime', 0.6], ['wisp', 1]] },
  [BIOME.forest]: { day: [['wolf', 1], ['slime', 0.35]], night: [['wolf', 1], ['wisp', 0.9]] },
  [BIOME.highlands]: { day: [['golem', 1]], night: [['golem', 1], ['wisp', 0.7]] },
  [BIOME.peaks]: { day: [['golem', 1]], night: [['golem', 1]] },
  [BIOME.beach]: { day: [['slime', 0.5]], night: [['slime', 0.5], ['wisp', 0.5]] },
};

/** 잿불 섬 */
const SPAWN_TABLE_EMBER: Record<number, { day: [string, number][]; night: [string, number][] }> = {
  [BIOME.ash]: { day: [['ash_wolf', 1], ['magma_slime', 0.8]], night: [['ash_wolf', 1], ['fire_wisp', 1]] },
  [BIOME.volcano]: { day: [['lava_golem', 1], ['magma_slime', 0.7]], night: [['lava_golem', 1], ['fire_wisp', 0.8]] },
  [BIOME.blacksand]: { day: [['magma_slime', 0.6]], night: [['magma_slime', 0.5], ['fire_wisp', 0.5]] },
};

const GROUP: Record<string, [number, number]> = { slime: [1, 3], wolf: [2, 3], golem: [1, 1], wisp: [1, 2], magma_slime: [1, 3], ash_wolf: [2, 3], lava_golem: [1, 1], fire_wisp: [1, 2] };
const TYPE_CAP: Record<string, number> = { golem: 3, wolf: 6, wisp: 4, slime: 8, magma_slime: 7, ash_wolf: 6, lava_golem: 3, fire_wisp: 4 };

/** Spawning, AI, combat resolution for all hostile creatures. */
export class EnemyManager {
  readonly list: Enemy[] = [];
  readonly group = new THREE.Group();
  boss: Enemy | null = null;
  private spawnTimer = 2;
  private tmp = new THREE.Vector3();

  constructor(private game: Game) {
    this.group.name = 'enemies';
  }

  clear() {
    for (const e of this.list) this.removeEnemy(e, false);
    this.list.length = 0;
    this.boss = null;
  }

  spawn(defId: string, x: number, z: number, atY?: number): Enemy {
    const def = ENEMIES[defId];
    // top-most walkable surface (ruins / buildings included), not just the terrain underneath
    const y = atY ?? groundAt(this.game.terrain, this.game.colliders, x, z, def.radius, this.game.terrain.heightAt(x, z) + 30, 0);
    const e = new Enemy(def, new THREE.Vector3(x, y + (def.flying ? 0.6 : 0), z));
    this.list.push(e);
    this.group.add(e.rig.root);
    if (def.boss) this.boss = e;
    return e;
  }

  /** Remove an enemy without a death (raiders fleeing at dawn). */
  despawn(e: Enemy) {
    this.removeEnemy(e);
  }

  private removeEnemy(e: Enemy, splice = true) {
    e.removed = true;
    this.group.remove(e.rig.root);
    if (e.telegraph) {
      this.game.scene.remove(e.telegraph);
      e.telegraph = null;
    }
    if (splice) {
      const i = this.list.indexOf(e);
      if (i >= 0) this.list.splice(i, 1);
    }
    if (this.boss === e) this.boss = null;
  }

  /** 잿불 섬: the lava titan rises from the crater seal. */
  summonTitan(): Enemy | null {
    if (this.boss) return null;
    const e = this.spawn('lava_titan', VOLCANO.x, VOLCANO.z - 4);
    e.home.set(VOLCANO.x, e.body.pos.y, VOLCANO.z);
    e.aggro = true;
    e.setState('chase');
    e.cooldown = 2.5;
    this.game.audio.play('boss');
    this.game.audio.play('slam');
    this.game.events.emit('banner', { title: e.def.name, subtitle: e.def.bossTitle ?? '', kind: 'boss' });
    this.game.particles.burst(e.body.pos.clone().setY(e.body.pos.y + 2), 0xff6a2a, 50, 9, 0.22);
    this.game.cameraRig.shake(1.0);
    return e;
  }

  summonBoss() {
    if (this.boss) return;
    const e = this.spawn('warden', BOSS_ARENA.x, BOSS_ARENA.z - 5);
    e.home.set(BOSS_ARENA.x, e.body.pos.y, BOSS_ARENA.z);
    e.aggro = true;
    e.setState('chase');
    e.cooldown = 2;
    this.game.audio.play('boss');
    this.game.events.emit('banner', { title: e.def.name, subtitle: e.def.bossTitle ?? '', kind: 'boss' });
    this.game.particles.burst(e.body.pos.clone().setY(e.body.pos.y + 2), 0x5fe0f0, 40, 8, 0.2);
    this.game.cameraRig.shake(0.8);
  }

  private isSafe(x: number, z: number) {
    for (const s of this.game.landmarks.safeZones) if ((x - s.x) ** 2 + (z - s.z) ** 2 < s.r * s.r) return true;
    return this.game.building.isSafeAt(x, z);
  }

  private trySpawn() {
    const game = this.game;
    if (game.inDungeon) return;
    const max = game.quality.maxEnemies;
    if (this.list.length >= max) return;
    const p = game.player.body.pos;
    const night = game.env.isNight;
    for (let attempt = 0; attempt < 6; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const d = 38 + Math.random() * 32;
      const x = p.x + Math.cos(a) * d;
      const z = p.z + Math.sin(a) * d;
      const isle = game.terrain.islandOf(x, z);
      if (!isle || Math.abs(x - isle.cx) > isle.half - 20 || Math.abs(z - isle.cz) > isle.half - 20) continue;
      if (game.terrain.heightAt(x, z) < 1.2) continue;
      const biome = game.terrain.biomeAt(x, z);
      const table = game.terrain.islandId(x, z) === 'ember' ? SPAWN_TABLE_EMBER[biome] : SPAWN_TABLE[biome];
      if (!table) continue;
      const opts = night ? table.night : table.day;
      const total = opts.reduce((s, o) => s + o[1], 0);
      let r = Math.random() * total;
      let type = opts[0][0];
      for (const [t, w] of opts) {
        r -= w;
        if (r <= 0) {
          type = t;
          break;
        }
      }
      const def = ENEMIES[type];
      if (def.nightOnly && !night) continue;
      if (this.isSafe(x, z) && (def.nightOnly || night)) continue;
      if (this.isSafe(x, z) && type !== 'slime') continue;
      const count = this.list.filter((e) => e.def.id === type).length;
      if (count >= (TYPE_CAP[type] ?? 6)) continue;
      const [gmin, gmax] = GROUP[type] ?? [1, 1];
      const n = Math.min(gmin + Math.floor(Math.random() * (gmax - gmin + 1)), max - this.list.length);
      for (let i = 0; i < n; i++) {
        const ox = x + (Math.random() - 0.5) * 6;
        const oz = z + (Math.random() - 0.5) * 6;
        if (game.terrain.heightAt(ox, oz) < 1.2) continue;
        this.spawn(type, ox, oz);
      }
      return;
    }
  }

  private chooseAttack(e: Enemy, dist: number): AttackDef | null {
    const minions = (id?: string) => this.list.filter((o) => !o.removed && o.state !== 'dead' && o !== e && o.def.id === id).length;
    const opts = e.def.attacks.filter((a) => dist <= a.range && dist >= (a.minRange ?? 0) && (a.phase ?? 1) <= e.phase && (a.kind !== 'summon' || minions(a.summon) < 3));
    if (opts.length === 0) return null;
    const total = opts.reduce((s, a) => s + (a.weight ?? 1), 0);
    let r = Math.random() * total;
    for (const a of opts) {
      r -= a.weight ?? 1;
      if (r <= 0) return a;
    }
    return opts[0];
  }

  private showTelegraph(e: Enemy, radius: number) {
    if (!e.telegraph) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, opacity: 0.9, toneMapped: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 2;
      e.telegraph = m;
      this.game.scene.add(m);
    }
    const y = this.game.terrain.heightAt(e.slamCenter.x, e.slamCenter.z) + 0.08;
    e.telegraph.position.set(e.slamCenter.x, Math.max(y, e.body.pos.y + 0.05), e.slamCenter.z);
    e.telegraph.scale.setScalar(radius * 2);
  }

  private hideTelegraph(e: Enemy) {
    if (e.telegraph) {
      this.game.scene.remove(e.telegraph);
      (e.telegraph.material as THREE.Material).dispose();
      e.telegraph = null;
    }
  }

  /** A perfect parry: long stagger, cancels the attack. */
  onParried(e: Enemy) {
    if (e.state === 'dead' || e.removed) return;
    this.hideTelegraph(e);
    e.setState('hurt');
    e.staggerFor = e.def.boss ? 0.9 : 1.5;
    e.body.vel.set(0, 0, 0);
    e.flash = 1;
  }

  /** Called by combat when the player hits an enemy. */
  onDamaged(e: Enemy, amount: number, knock: THREE.Vector3, heavy: boolean) {
    e.aggro = true;
    e.flash = 1;
    e.lastDamagedAt = this.game.state.playTime;
    if (e.hp <= 0) {
      this.hideTelegraph(e);
      e.setState('dead');
      e.body.vel.set(0, 0, 0);
      return;
    }
    if (e.def.boss && e.phase === 1 && e.hp < e.maxHp * 0.5) {
      e.phase = 2;
      this.game.events.emit('banner', { title: `${e.def.name}이(가) 분노한다!`, subtitle: '공격 패턴이 바뀌었다', kind: 'boss' });
      this.game.audio.play('boss');
      this.game.cameraRig.shake(0.6);
    }
    const stagger = e.def.poise === 0 || amount >= e.def.poise;
    if (stagger && e.state !== 'dead') {
      this.hideTelegraph(e);
      e.setState('hurt');
      const kb = (heavy ? 7 : 4) * (e.def.boss ? 0.2 : e.def.model === 'golem' ? 0.4 : 1);
      e.body.vel.x = knock.x * kb;
      e.body.vel.z = knock.z * kb;
    } else if (e.state === 'idle' || e.state === 'wander' || e.state === 'return') e.setState('chase');
  }

  update(dt: number) {
    const game = this.game;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2.5;
      this.trySpawn();
    }
    const pp = game.player.body.pos;
    game.floatText.beginPlates();
    for (const e of [...this.list]) {
      if (e.removed) continue;
      e.time += dt;
      e.stateTime += dt;
      e.cooldown -= dt;
      const def = e.def;
      // the real player distance (for despawning, nameplates and personal space)
      const pdx = pp.x - e.body.pos.x;
      const pdz = pp.z - e.body.pos.z;
      const pdist = Math.hypot(pdx, pdz);
      // raiders chase their raid target; everyone else chases the player
      const rt = e.raid && e.state !== 'dead' ? game.defense.targetFor(e, dt) : null;
      const tp = rt ? rt.pos : pp;
      const dx = tp.x - e.body.pos.x;
      const dz = tp.z - e.body.pos.z;
      const dist = Math.hypot(dx, dz);
      const toPlayerYaw = Math.atan2(dx, dz);
      const playerDead = rt ? false : game.player.dead;
      let moveSpeed = 0;
      let targetYaw = e.yaw;

      // Despawn far / daylight wisps
      if (!def.boss && !def.dungeon && !e.raid && !e.aggro && pdist > 115) {
        this.removeEnemy(e);
        continue;
      }
      if (def.nightOnly && !game.env.isNight && e.state !== 'dead') {
        e.despawning += dt;
        if (e.despawning > 2) {
          game.particles.burst(e.body.pos.clone().setY(e.body.pos.y + 1), 0x9a6aff, 12, 2);
          this.removeEnemy(e);
          continue;
        }
      }
      if (def.boss && dist > 70 && e.state !== 'dead') {
        // player fled - reset boss
        e.hp = e.maxHp;
        e.phase = 1;
        e.aggro = false;
        e.body.pos.copy(e.home);
        e.setState('idle');
      }

      switch (e.state) {
        case 'idle':
        case 'wander': {
          if (e.raid) {
            e.setState('chase');
            break;
          }
          if (!playerDead && dist < def.aggroRange && (game.env.isNight || def.id !== 'slime' || dist < def.aggroRange * 0.75)) {
            e.aggro = true;
            e.setState('chase');
            if (def.id === 'wolf') game.audio.play('hurt', 0.3);
            break;
          }
          if (e.state === 'idle') {
            if (e.stateTime > 2 + Math.random() * 3) {
              const a = Math.random() * Math.PI * 2;
              const r = 3 + Math.random() * 7;
              e.wanderTarget.set(e.home.x + Math.cos(a) * r, 0, e.home.z + Math.sin(a) * r);
              e.setState('wander');
            }
          } else {
            const wx = e.wanderTarget.x - e.body.pos.x;
            const wz = e.wanderTarget.z - e.body.pos.z;
            const wd = Math.hypot(wx, wz);
            if (wd < 0.8 || e.stateTime > 8) e.setState('idle');
            else {
              moveSpeed = def.speed;
              targetYaw = Math.atan2(wx, wz);
            }
          }
          break;
        }
        case 'chase': {
          if (playerDead) {
            e.aggro = false;
            e.setState('return');
            break;
          }
          const fromHome = Math.hypot(e.body.pos.x - e.home.x, e.body.pos.z - e.home.z);
          if (!e.raid && fromHome > def.leash && dist > def.attacks[0].range + 2) {
            e.aggro = false;
            e.setState('return');
            break;
          }
          targetYaw = toPlayerYaw;
          if (e.cooldown <= 0) {
            const atk = this.chooseAttack(e, dist);
            if (atk) {
              e.attack = atk;
              e.attackHit = false;
              e.setState('windup');
              if (atk.kind === 'slam') {
                const reach = Math.min(dist, atk.range * 0.55);
                e.slamCenter.set(e.body.pos.x + Math.sin(toPlayerYaw) * reach, e.body.pos.y, e.body.pos.z + Math.cos(toPlayerYaw) * reach);
              }
              break;
            }
          }
          const keep = def.keepDistance ?? 0;
          if (keep > 0) {
            if (dist > keep + 2) moveSpeed = def.chaseSpeed;
            else if (dist < keep - 2) {
              moveSpeed = -def.chaseSpeed * 0.7;
            } else {
              // strafe
              moveSpeed = def.chaseSpeed * 0.5;
              targetYaw = toPlayerYaw + Math.PI / 2;
            }
          } else if (dist > def.attacks[0].range * 0.75) moveSpeed = def.chaseSpeed;
          break;
        }
        case 'windup': {
          const atk = e.attack!;
          const wind = atk.windup * (e.phase === 2 ? 0.8 : 1);
          if (atk.kind !== 'slam') targetYaw = toPlayerYaw;
          if (atk.kind === 'slam' && atk.aoe) this.showTelegraph(e, atk.aoe * Math.min(1, 0.4 + e.stateTime / wind));
          if (e.stateTime >= wind) {
            e.setState('attack');
            this.beginAttack(e, atk, toPlayerYaw);
          }
          break;
        }
        case 'attack': {
          const atk = e.attack!;
          if (atk.kind === 'lunge') {
            e.body.vel.x = e.lungeDir.x * (atk.lungeSpeed ?? 8);
            e.body.vel.z = e.lungeDir.z * (atk.lungeSpeed ?? 8);
            if (!e.attackHit && dist < def.radius + 0.9) {
              e.attackHit = true;
              this.strike(e, def.damage * atk.mult, 6);
            }
          } else if (atk.kind === 'melee' && !e.attackHit) {
            e.attackHit = true;
            const ang = Math.abs(angleDiff(e.yaw, toPlayerYaw));
            if (dist < atk.range + 0.6 && ang < (((atk.arc ?? 90) / 2) * Math.PI) / 180 + 0.2) {
              this.strike(e, def.damage * atk.mult, 5);
            }
          }
          if (e.stateTime >= atk.active) {
            e.setState('recover');
            if (atk.kind === 'lunge') {
              e.body.vel.x *= 0.2;
              e.body.vel.z *= 0.2;
            }
          }
          break;
        }
        case 'recover': {
          const atk = e.attack!;
          if (e.stateTime >= atk.recover * (e.phase === 2 ? 0.8 : 1)) {
            e.cooldown = def.cooldown * (0.7 + Math.random() * 0.6) * (e.phase === 2 ? 0.7 : 1);
            e.setState('chase');
          }
          break;
        }
        case 'hurt': {
          const dur = e.staggerFor > 0 ? e.staggerFor : def.model === 'golem' || def.boss ? 0.25 : 0.4;
          if (e.stateTime > dur) {
            e.staggerFor = 0;
            e.setState('chase');
          }
          break;
        }
        case 'return': {
          if (e.raid) {
            e.setState('chase');
            break;
          }
          const hx = e.home.x - e.body.pos.x;
          const hz = e.home.z - e.body.pos.z;
          const hd = Math.hypot(hx, hz);
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.2 * dt);
          if (hd < 2) e.setState('idle');
          else {
            moveSpeed = def.chaseSpeed;
            targetYaw = Math.atan2(hx, hz);
          }
          if (!playerDead && dist < def.aggroRange * 0.6) {
            e.aggro = true;
            e.setState('chase');
          }
          break;
        }
        case 'dead': {
          if (e.stateTime > 1.2) {
            this.removeEnemy(e);
            continue;
          }
          break;
        }
      }

      // Obstacle avoidance (no navmesh yet): detect stalls and sidestep around trees, walls, altars...
      if (moveSpeed > 0.5 && (e.state === 'chase' || e.state === 'wander' || e.state === 'return') && dt > 0) {
        const moved = Math.hypot(e.body.pos.x - e.lastPos.x, e.body.pos.z - e.lastPos.z);
        if (moved < moveSpeed * dt * 0.25) e.stuck += dt;
        else e.stuck = Math.max(0, e.stuck - dt * 2);
        if (e.stuck > 0.4 && e.detour <= 0) {
          e.detour = 0.9 + Math.random() * 0.6;
          e.detourSign = Math.random() < 0.5 ? -1 : 1;
          e.stuck = 0;
        }
      }
      e.lastPos.copy(e.body.pos);
      if (e.detour > 0) {
        e.detour -= dt;
        if (moveSpeed > 0) targetYaw += e.detourSign * 1.25;
      }

      // Movement
      e.yaw = dampAngle(e.yaw, targetYaw, e.state === 'windup' ? 6 : 9, dt);
      if (e.state !== 'attack' && e.state !== 'hurt' && e.state !== 'dead') {
        const dir = moveSpeed >= 0 ? targetYaw : targetYaw;
        if (e.slowTime > 0) e.slowTime -= dt;
        const sp = moveSpeed * (e.slowTime > 0 ? 0.45 : 1);
        const tvx = Math.sin(dir) * sp;
        const tvz = Math.cos(dir) * sp;
        e.body.vel.x += (tvx - e.body.vel.x) * Math.min(1, dt * 8);
        e.body.vel.z += (tvz - e.body.vel.z) * Math.min(1, dt * 8);
      } else if (e.state === 'hurt' || e.state === 'dead') {
        e.body.vel.x *= 1 - Math.min(1, dt * 6);
        e.body.vel.z *= 1 - Math.min(1, dt * 6);
      }
      // separation
      for (const o of this.list) {
        if (o === e || o.removed) continue;
        const sx = e.body.pos.x - o.body.pos.x;
        const sz = e.body.pos.z - o.body.pos.z;
        const sd = Math.hypot(sx, sz);
        const min = e.def.radius + o.def.radius;
        if (sd < min && sd > 0.001) {
          e.body.pos.x += (sx / sd) * (min - sd) * 0.5;
          e.body.pos.z += (sz / sd) * (min - sd) * 0.5;
        }
      }
      // keep off the player
      if (!game.player.dead && pdist < def.radius + 0.4 && pdist > 0.01 && e.state !== 'dead') {
        e.body.pos.x -= (pdx / pdist) * (def.radius + 0.4 - pdist) * 0.5;
        e.body.pos.z -= (pdz / pdist) * (def.radius + 0.4 - pdist) * 0.5;
      }
      if (def.flying) {
        e.body.pos.x += e.body.vel.x * dt;
        e.body.pos.z += e.body.vel.z * dt;
        const ground = game.terrain.heightAt(e.body.pos.x, e.body.pos.z);
        const target = Math.max(ground, WORLD.waterLevel) + 0.8;
        e.body.pos.y += (target - e.body.pos.y) * Math.min(1, dt * 3);
      } else {
        moveBody(e.body, dt, game.terrain, game.colliders, 22);
        if (e.body.pos.y < WORLD.waterLevel - 0.6) {
          // avoid water: push back home
          e.body.pos.y = WORLD.waterLevel - 0.6;
          if (e.state !== 'dead' && !e.raid) {
            e.aggro = false;
            e.setState('return');
          }
        }
      }

      // Visuals
      e.rig.root.position.copy(e.body.pos);
      e.rig.root.rotation.y = e.yaw;
      const hs = Math.hypot(e.body.vel.x, e.body.vel.z);
      const prog = e.state === 'windup' ? e.stateTime / (e.attack!.windup * (e.phase === 2 ? 0.8 : 1)) : e.state === 'attack' ? e.stateTime / e.attack!.active : 0;
      e.rig.animate({ state: e.state, stateTime: e.stateTime, progress: prog, speed: hs, attackKind: e.attack?.kind ?? '', time: e.time, phase: e.phase }, dt);
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 5);
      for (const m of e.rig.mats) {
        if (m.userData.baseEmissive === undefined) m.userData.baseEmissive = m.emissive.getHex();
        if (e.flash > 0) m.emissive.setRGB(e.flash, e.flash * 0.9, e.flash * 0.8);
        else m.emissive.setHex(m.userData.baseEmissive as number);
      }
      // Nameplate
      if (!def.boss && e.state !== 'dead' && pdist < 26 && (e.aggro || e.hp < e.maxHp)) {
        this.tmp.copy(e.body.pos);
        this.tmp.y += def.height * def.scale + (def.flying ? 1.4 : 0.5);
        game.floatText.plate(game.camera, this.tmp, def.name, e.hp / e.maxHp, def.level, def.level > game.state.player.level + 1);
      }
    }
    game.floatText.endPlates();
  }

  /** A melee / lunge hit: raiders hit whatever they are after, others hit the player. */
  private strike(e: Enemy, amount: number, knock: number) {
    if (e.raid && e.raidTarget && e.raidTarget.kind !== 'player') this.game.defense.strike(e, amount, { knock });
    else this.game.damagePlayer(amount, e.body.pos, { knock, source: e });
  }

  private beginAttack(e: Enemy, atk: AttackDef, toPlayerYaw: number) {
    const game = this.game;
    const def = e.def;
    if (atk.kind === 'lunge') {
      e.lungeDir.set(Math.sin(toPlayerYaw), 0, Math.cos(toPlayerYaw));
      e.yaw = toPlayerYaw;
      game.audio.play('swing', 0.6);
    } else if (atk.kind === 'melee') {
      game.audio.play('heavy', 0.6);
    } else if (atk.kind === 'slam') {
      this.hideTelegraph(e);
      game.audio.play('slam');
      game.cameraRig.shake(def.boss ? 0.7 : 0.4);
      const c = e.slamCenter;
      game.particles.burst(new THREE.Vector3(c.x, game.terrain.heightAt(c.x, c.z) + 0.2, c.z), 0x8a7a66, 26, 6, 0.18);
      const pp = game.player.body.pos;
      if (Math.hypot(pp.x - c.x, pp.z - c.z) < (atk.aoe ?? 3) + 0.3 && Math.abs(pp.y - c.y) < 2.5) {
        game.damagePlayer(def.damage * atk.mult, c, { knock: 9, unblockable: true });
      }
      if (e.raid) game.defense.slam(c, atk.aoe ?? 3, def.damage * atk.mult);
    } else if (atk.kind === 'ranged') {
      const pp = game.player.body.pos;
      const from = e.body.pos.clone();
      from.y += 1.0;
      const target = new THREE.Vector3(pp.x, pp.y + 1.0, pp.z).addScaledVector(game.player.body.vel, 0.25);
      const vel = target.sub(from).normalize().multiplyScalar(atk.projSpeed ?? 10);
      const isArrow = def.model === 'archer';
      game.projectiles.spawn(from, vel, def.damage * atk.mult, atk.color ?? 0xa07aff, { homing: atk.homing ?? 0.8, slow: !isArrow && !def.fire, fire: def.fire });
      game.audio.play(isArrow ? 'swing' : 'shoot');
    } else if (atk.kind === 'burst') {
      const n = atk.projCount ?? 8;
      const from = e.body.pos.clone();
      from.y += 2.2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + e.time;
        const vel = new THREE.Vector3(Math.sin(a), -0.05, Math.cos(a)).multiplyScalar(atk.projSpeed ?? 10);
        game.projectiles.spawn(from, vel, def.damage * atk.mult, atk.color ?? 0x5fe0f0, { life: 3.5, fire: def.fire });
      }
      game.audio.play('shoot');
      game.audio.play('slam', 0.5);
    } else if (atk.kind === 'summon' && atk.summon) {
      for (let i = 0; i < (atk.count ?? 1); i++) {
        const a = Math.random() * Math.PI * 2;
        const x = e.body.pos.x + Math.cos(a) * 3;
        const z = e.body.pos.z + Math.sin(a) * 3;
        const m = this.spawn(atk.summon, x, z, e.body.pos.y);
        m.aggro = true;
        m.setState('chase');
        m.home.copy(e.home);
        game.particles.burst(m.body.pos.clone().setY(m.body.pos.y + 0.5), 0xb06aff, 16, 3, 0.1);
      }
      game.audio.play('boss', 0.6);
      game.events.emit('notify', { text: `${def.name}이(가) 부하를 불러냈다!`, kind: 'warn' });
    }
  }
}
