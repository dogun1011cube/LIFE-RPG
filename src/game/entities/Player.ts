import * as THREE from 'three';
import { PLAYER, WORLD } from '../config';
import { ITEMS } from '../data/items';
import { NODES } from '../data/nodes';
import { angleDiff, dampAngle } from '../core/math';
import { derivePlayerStats, type DerivedStats } from '../systems/Stats';
import { CharacterModel, type AnimState } from './CharacterModel';
import { moveBody, type Body } from './physics';
import type { ResourceNode } from '../world/Resources';
import type { Game } from '../Game';

export type PlayerAction = 'none' | 'attack' | 'heavy' | 'dodge' | 'gather' | 'pick' | 'use' | 'hurt';

const COST = { light: 9, heavy: 22, dodge: 20, jump: 7, sprintPerSec: 13 };

export class Player {
  readonly model = new CharacterModel();
  readonly body: Body = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), radius: PLAYER.radius, height: PLAYER.height, stepHeight: PLAYER.stepHeight, grounded: false };
  yaw = 0;
  action: PlayerAction = 'none';
  actionTime = 0;
  actionDur = 0;
  combo = 0;
  comboQueued = false;
  comboResetTimer = 0;
  hitDone = false;
  iframes = 0;
  staminaDelay = 0;
  dead = false;
  deadTime = 0;
  swimming = false;
  running = false;
  gatherNode: ResourceNode | null = null;
  useItemId: string | null = null;
  lastHurtAt = -100;
  stats: DerivedStats;
  private dodgeDir = new THREE.Vector3();
  private moveDir = new THREE.Vector3();
  private hpRegenAcc = 0;

  constructor(private game: Game) {
    this.stats = derivePlayerStats(game.state.player);
    this.model.root.name = 'player';
  }

  /** Sync position/equipment from state (new game / load / respawn). */
  reset() {
    const s = this.game.state.player;
    this.body.pos.set(s.x, s.y, s.z);
    this.body.vel.set(0, 0, 0);
    this.yaw = s.yaw;
    this.action = 'none';
    this.dead = false;
    this.gatherNode = null;
    this.refreshEquipment();
    this.model.root.position.copy(this.body.pos);
  }

  refreshEquipment() {
    const s = this.game.state.player;
    this.model.setEquipment(s.equipment.weapon, s.equipment.armor);
    this.stats = derivePlayerStats(s);
  }

  get busy() {
    return this.action !== 'none' && this.action !== 'hurt';
  }

  /** Best owned tool of a kind. */
  bestTool(kind: 'axe' | 'pickaxe'): { tier: number; power: number; speed: number; color: number } | null {
    let best: { tier: number; power: number; speed: number; color: number } | null = null;
    for (const s of this.game.state.player.inventory) {
      if (!s) continue;
      const t = ITEMS[s.id]?.tool;
      if (t && t.kind === kind && (!best || t.tier > best.tier)) best = t;
    }
    return best;
  }

  private spendStamina(n: number): boolean {
    const s = this.game.state.player;
    if (s.stamina < n * 0.5) {
      this.game.events.emit('notify', { text: '스태미나가 부족합니다', kind: 'warn' });
      return false;
    }
    s.stamina = Math.max(0, s.stamina - n);
    this.staminaDelay = 0.7;
    return true;
  }

  private faceTarget() {
    const game = this.game;
    const camF = game.cameraRig.forward();
    let best: { yaw: number; d: number } | null = null;
    for (const e of game.enemies.list) {
      if (e.state === 'dead') continue;
      const dx = e.body.pos.x - this.body.pos.x;
      const dz = e.body.pos.z - this.body.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 5 + e.def.radius) continue;
      const dot = (dx * camF.x + dz * camF.z) / (d || 1);
      if (dot < -0.1) continue;
      if (!best || d < best.d) best = { yaw: Math.atan2(dx, dz), d };
    }
    if (best) this.yaw = best.yaw;
    else if (this.moveDir.lengthSq() > 0.01) this.yaw = Math.atan2(this.moveDir.x, this.moveDir.z);
    else this.yaw = game.cameraRig.yaw;
  }

  startAttack(heavy: boolean) {
    if (this.dead || this.swimming) return;
    if (this.action === 'attack' && !heavy) {
      if (this.actionTime / this.actionDur > 0.35) this.comboQueued = true;
      return;
    }
    if (this.busy) return;
    if (!this.spendStamina(heavy ? COST.heavy : COST.light)) return;
    this.faceTarget();
    this.action = heavy ? 'heavy' : 'attack';
    this.actionTime = 0;
    const spd = ITEMS[this.game.state.player.equipment.weapon ?? '']?.weapon?.speed ?? 1;
    this.actionDur = (heavy ? 0.9 : 0.5) / spd;
    this.hitDone = false;
    if (!heavy && this.comboResetTimer <= 0) this.combo = 0;
    this.game.audio.play(heavy ? 'heavy' : 'swing');
  }

  startDodge() {
    if (this.dead || this.swimming || this.action === 'dodge' || !this.body.grounded) return;
    if (this.action === 'heavy' && this.actionTime / this.actionDur > 0.4) return;
    if (!this.spendStamina(COST.dodge * (1 - this.game.state.player.attrs.agi * 0.015))) return;
    this.gatherNode = null;
    this.action = 'dodge';
    this.actionTime = 0;
    this.actionDur = 0.55;
    this.iframes = 0.38;
    if (this.moveDir.lengthSq() > 0.01) this.dodgeDir.copy(this.moveDir).normalize();
    else this.dodgeDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.yaw = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
    this.game.audio.play('dodge');
  }

  startGather(node: ResourceNode): boolean {
    if (this.dead || this.busy || this.swimming) return false;
    const def = NODES[node.type];
    if (def.tool === 'hand') {
      this.action = 'pick';
      this.actionDur = 0.6 / this.stats.gatherSpeed;
    } else {
      const tool = this.bestTool(def.tool);
      if ((tool?.tier ?? 0) < def.minTier) {
        this.game.events.emit('notify', { text: def.minTier >= 2 ? '구리 곡괭이 이상이 필요합니다' : `${def.tool === 'axe' ? '도끼' : '곡괭이'}가 필요합니다`, kind: 'warn' });
        this.game.audio.play('deny');
        return false;
      }
      this.action = 'gather';
      this.actionDur = (tool ? tool.speed : 0.95) / this.stats.gatherSpeed;
      this.model.setTool(def.tool, tool?.color ?? 0x8a6a4a);
      if (!tool) this.model.setTool(null);
    }
    this.gatherNode = node;
    this.actionTime = 0;
    this.hitDone = false;
    this.yaw = Math.atan2(node.x - this.body.pos.x, node.z - this.body.pos.z);
    return true;
  }

  useItem(id: string) {
    if (this.dead || this.busy) return;
    this.action = 'use';
    this.actionTime = 0;
    this.actionDur = 0.55;
    this.useItemId = id;
    this.hitDone = false;
  }

  hurt() {
    this.lastHurtAt = this.game.state.playTime;
    this.model.flash = 1;
    if (this.action === 'gather' || this.action === 'pick' || this.action === 'use' || this.action === 'none') {
      this.action = 'hurt';
      this.actionTime = 0;
      this.actionDur = 0.3;
      this.gatherNode = null;
    }
  }

  die() {
    this.dead = true;
    this.deadTime = 0;
    this.action = 'none';
    this.gatherNode = null;
    this.body.vel.set(0, 0, 0);
  }

  update(dt: number, inputEnabled: boolean) {
    const game = this.game;
    const s = game.state.player;
    const input = game.input;
    this.stats = derivePlayerStats(s);
    const st = this.stats;

    // Buffs
    for (let i = s.buffs.length - 1; i >= 0; i--) {
      const b = s.buffs[i];
      b.time -= dt;
      if (b.id === 'hot' && b.amount) {
        s.hp = Math.min(st.maxHp, s.hp + b.amount * dt);
      }
      if (b.time <= 0) s.buffs.splice(i, 1);
    }
    // Regen
    if (!this.dead) {
      this.staminaDelay -= dt;
      if (this.staminaDelay <= 0 && !this.running) s.stamina = Math.min(st.maxStamina, s.stamina + st.staminaRegen * dt);
      const outOfCombat = game.state.playTime - this.lastHurtAt > 6;
      if (outOfCombat) {
        this.hpRegenAcc += st.hpRegen * dt;
        if (this.hpRegenAcc >= 0.05) {
          s.hp = Math.min(st.maxHp, s.hp + this.hpRegenAcc);
          this.hpRegenAcc = 0;
        }
      }
      s.hp = Math.min(s.hp, st.maxHp);
      s.stamina = Math.min(s.stamina, st.maxStamina);
    }
    this.iframes -= dt;
    this.comboResetTimer -= dt;

    // Movement input
    this.moveDir.set(0, 0, 0);
    if (inputEnabled && !this.dead) {
      const f = game.cameraRig.forward();
      const r = new THREE.Vector3(-f.z, 0, f.x);
      if (input.isDown('KeyW')) this.moveDir.add(f);
      if (input.isDown('KeyS')) this.moveDir.sub(f);
      if (input.isDown('KeyD')) this.moveDir.sub(r);
      if (input.isDown('KeyA')) this.moveDir.add(r);
      if (this.moveDir.lengthSq() > 0) this.moveDir.normalize();
    }
    const terrainH = game.terrain.heightAt(this.body.pos.x, this.body.pos.z);
    this.swimming = !this.dead && terrainH < WORLD.waterLevel - 1.15 && this.body.pos.y < WORLD.waterLevel - 0.6;

    const moving = this.moveDir.lengthSq() > 0.01;
    this.running = false;
    let speed = 0;
    if (this.action === 'dodge') {
      const t = this.actionTime / this.actionDur;
      const sp = 9.5 * (1 - t * 0.6);
      this.body.vel.x = this.dodgeDir.x * sp;
      this.body.vel.z = this.dodgeDir.z * sp;
    } else if (!this.dead) {
      const wantRun = inputEnabled && input.isDown('ShiftLeft') && moving && s.stamina > 1 && !this.swimming;
      if (wantRun && (this.action === 'none' || this.action === 'hurt')) {
        this.running = true;
        s.stamina = Math.max(0, s.stamina - COST.sprintPerSec * dt);
        this.staminaDelay = 0.5;
      }
      speed = (this.swimming ? PLAYER.swimSpeed : this.running ? PLAYER.runSpeed : PLAYER.walkSpeed) * st.moveMult;
      if (game.building.active) speed *= 0.85;
      if (this.action === 'attack') speed *= 0.3;
      else if (this.action === 'heavy') speed *= 0.12;
      else if (this.action === 'gather' || this.action === 'pick') speed = 0;
      else if (this.action === 'use') speed *= 0.5;
      const tvx = this.moveDir.x * speed;
      const tvz = this.moveDir.z * speed;
      const accel = this.body.grounded || this.swimming ? 14 : 4;
      this.body.vel.x += (tvx - this.body.vel.x) * Math.min(1, dt * accel);
      this.body.vel.z += (tvz - this.body.vel.z) * Math.min(1, dt * accel);
      if (moving && this.action === 'none') this.yaw = dampAngle(this.yaw, Math.atan2(this.moveDir.x, this.moveDir.z), 14, dt);
      // Jump
      if (inputEnabled && input.wasPressed('Space') && this.body.grounded && !this.busy && !this.swimming) {
        if (this.spendStamina(COST.jump)) {
          this.body.vel.y = PLAYER.jumpVel;
          this.body.grounded = false;
          game.audio.play('jump');
        }
      }
    } else {
      this.body.vel.x *= 0.9;
      this.body.vel.z *= 0.9;
    }

    // Physics
    if (this.swimming) {
      this.body.pos.x += this.body.vel.x * dt;
      this.body.pos.z += this.body.vel.z * dt;
      const target = WORLD.waterLevel - 1.15 + Math.sin(performance.now() * 0.002) * 0.05;
      this.body.pos.y += (target - this.body.pos.y) * Math.min(1, dt * 5);
      this.body.vel.y = 0;
      this.body.grounded = false;
      const g = game.terrain.heightAt(this.body.pos.x, this.body.pos.z);
      if (g > this.body.pos.y) {
        this.body.pos.y = g;
        this.body.grounded = true;
      }
    } else {
      moveBody(this.body, dt, game.terrain, game.colliders, PLAYER.gravity);
    }
    const lim = WORLD.size / 2 - 12;
    this.body.pos.x = Math.max(-lim, Math.min(lim, this.body.pos.x));
    this.body.pos.z = Math.max(-lim, Math.min(lim, this.body.pos.z));

    // Actions
    if (this.action !== 'none') {
      this.actionTime += dt;
      const t = this.actionTime / this.actionDur;
      if (this.action === 'attack' || this.action === 'heavy') {
        const heavy = this.action === 'heavy';
        const hitAt = heavy ? 0.5 : 0.33;
        if (!this.hitDone && t >= hitAt) {
          this.hitDone = true;
          const mult = heavy ? 2.3 : [1, 1.1, 1.55][this.combo % 3];
          game.playerAttack(st.weaponReach + (heavy ? 0.4 : 0), heavy ? 200 : this.combo % 3 === 2 ? 110 : 150, mult, heavy);
        }
        if (t >= 1) {
          if (!heavy && this.comboQueued && game.state.player.stamina >= COST.light * 0.5) {
            this.comboQueued = false;
            this.combo = (this.combo + 1) % 3;
            this.action = 'none';
            this.comboResetTimer = 0.5;
            this.startAttack(false);
          } else {
            this.action = 'none';
            this.comboQueued = false;
            if (!heavy) {
              this.combo = (this.combo + 1) % 3;
              this.comboResetTimer = 0.45;
            }
          }
        }
      } else if (this.action === 'gather' || this.action === 'pick') {
        const node = this.gatherNode;
        const impact = this.action === 'pick' ? 0.5 : 0.58;
        if (!this.hitDone && t >= impact && node) {
          this.hitDone = true;
          game.onGatherHit(node);
        }
        if (t >= 1) {
          this.action = 'none';
          // keep swinging while the interact key is held
          if (node && node.alive && inputEnabled && input.isDown('KeyE') && NODES[node.type].tool !== 'hand') {
            const d = Math.hypot(node.x - this.body.pos.x, node.z - this.body.pos.z);
            if (d < 3.2 + NODES[node.type].collider * node.scale) this.startGather(node);
            else this.gatherNode = null;
          } else this.gatherNode = null;
        }
      } else if (this.action === 'use') {
        if (!this.hitDone && t >= 0.5 && this.useItemId) {
          this.hitDone = true;
          game.consumeItem(this.useItemId);
        }
        if (t >= 1) this.action = 'none';
      } else if (t >= 1) this.action = 'none';
    }
    if (this.dead) this.deadTime += dt;

    // Animation
    const hs = Math.hypot(this.body.vel.x, this.body.vel.z);
    let anim: AnimState;
    if (this.dead) anim = 'dead';
    else if (this.action === 'attack') anim = 'attack';
    else if (this.action === 'heavy') anim = 'heavy';
    else if (this.action === 'dodge') anim = 'dodge';
    else if (this.action === 'gather') anim = 'gather';
    else if (this.action === 'pick') anim = 'pick';
    else if (this.action === 'use') anim = 'use';
    else if (this.action === 'hurt') anim = 'hurt';
    else if (this.swimming) anim = 'swim';
    else if (!this.body.grounded && Math.abs(this.body.vel.y) > 1.5) anim = 'air';
    else if (hs > 0.3) anim = 'move';
    else anim = 'idle';
    const tool = this.action === 'gather' && this.gatherNode ? (NODES[this.gatherNode.type].tool as 'axe' | 'pickaxe') : null;
    this.model.update(dt, { state: anim, speed: hs, run: this.running, t: this.actionDur > 0 ? Math.min(1, this.actionTime / this.actionDur) : 0, combo: this.combo, tool: tool && this.bestTool(tool) ? tool : null });
    this.model.root.position.copy(this.body.pos);
    const cur = this.model.root.rotation.y;
    this.model.root.rotation.y = cur + angleDiff(cur, this.yaw) * Math.min(1, dt * 20);

    // Sync to state
    s.x = this.body.pos.x;
    s.y = this.body.pos.y;
    s.z = this.body.pos.z;
    s.yaw = this.yaw;
  }
}
