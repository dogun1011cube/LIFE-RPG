import * as THREE from 'three';
import type { Enemy } from '../entities/Enemies';
import type { Game } from '../Game';

export interface RaidTarget {
  kind: 'player' | 'villager' | 'hall';
  pos: THREE.Vector3;
  id: number;
}

const RAID_HOUR = 22;
const DAWN = 6;
const TOWER_RANGE = 24;
const TOWER_COOLDOWN = 1.6;

/**
 * Town defence: night raids on the settlement, villager injuries, guards' targets and archer towers.
 * Raids are announced in the morning, arrive at 22:00 and end when every raider falls (or at dawn).
 */
export class DefenseSystem {
  readonly raiders = new Set<Enemy>();
  private towerTimers = new Map<number, number>();
  private lastHour = -1;

  constructor(private game: Game) {}

  get state() {
    return this.game.state.settlement.raid;
  }

  get active(): boolean {
    return this.state.active;
  }

  remaining(): number {
    let n = 0;
    for (const e of this.raiders) if (!e.removed && e.state !== 'dead') n++;
    return n;
  }

  clear() {
    this.raiders.clear();
    this.towerTimers.clear();
    this.lastHour = -1;
  }

  /** Called by the settlement at the start of each day. */
  onNewDay() {
    const st = this.game.state.settlement;
    const raid = this.state;
    if (!st.founded || st.tier < 2) return;
    const day = this.game.env.day;
    if (raid.nextDay === 0) raid.nextDay = day + 2;
    if (day >= raid.nextDay && !raid.tonight) {
      raid.tonight = true;
      raid.nextDay = day + 2 + Math.floor(Math.random() * 3);
      this.game.settlement.log('정찰병의 보고: 오늘 밤 괴물 무리가 마을로 다가옵니다.');
      this.game.events.emit('banner', { title: '습격 경보', subtitle: '오늘 밤 22시, 괴물 무리가 마을을 노린다 · 경비병과 방어 시설을 준비하자', kind: 'boss' });
      this.game.audio.play('bell', 0.7);
    }
  }

  /** Enemies in a raid, scaled with the town. */
  composition(): string[] {
    const st = this.game.state.settlement;
    const n = 2 + st.tier + Math.floor(st.villagers.length / 6);
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      if (st.tier >= 3 && i % 2 === 1) out.push('raider_skeleton');
      else out.push('wolf');
    }
    if (st.tier >= 4) out.push('golem');
    return out;
  }

  /** Strength numbers used when the player is away and the raid is resolved off-screen. */
  defensePower(): number {
    const civ = this.game.civ;
    const guards = this.game.state.settlement.villagers.filter((v) => v.job === 'guard' && v.workId !== null && !v.down && !this.game.settlement.onStrike(v)).length;
    const towers = this.game.settlement.count('archer_tower');
    return guards * (civ.has('t_fortification') ? 3 : 2) + towers * 3;
  }

  startRaid(force = false) {
    const game = this.game;
    const st = game.state.settlement;
    const raid = this.state;
    const c = game.settlement.center();
    if (!st.founded || !c || raid.active) return false;
    raid.tonight = false;
    raid.active = true;
    raid.stolen = 0;
    const list = this.composition();
    const far = game.inDungeon || game.player.body.pos.distanceTo(c) > 130;
    if (far && !force) {
      this.resolveOffline(list.length);
      return true;
    }
    const R = game.settlement.radius() + 14;
    const a = Math.random() * Math.PI * 2;
    let spawned = 0;
    for (let i = 0; i < list.length; i++) {
      // find dry land near the chosen direction
      for (let attempt = 0; attempt < 8; attempt++) {
        const aa = a + (Math.random() - 0.5) * 0.6 + attempt * 0.4;
        const x = c.x + Math.cos(aa) * (R + Math.random() * 6);
        const z = c.z + Math.sin(aa) * (R + Math.random() * 6);
        if (game.terrain.heightAt(x, z) < 1.2) continue;
        const e = game.enemies.spawn(list[i], x, z);
        e.raid = true;
        e.aggro = true;
        e.home.copy(c);
        e.setState('chase');
        this.raiders.add(e);
        spawned++;
        break;
      }
    }
    game.settlement.log(`괴물 ${spawned}마리가 마을을 습격했습니다!`);
    game.events.emit('banner', { title: '습격!', subtitle: `괴물 ${spawned}마리가 ${st.name}으로 몰려온다`, kind: 'boss' });
    game.audio.play('bell');
    game.audio.play('boss', 0.6);
    game.cameraRig.shake(0.3);
    return true;
  }

  private resolveOffline(count: number) {
    const game = this.game;
    const raid = this.state;
    const def = this.defensePower();
    const won = def >= count;
    if (won) this.finish(true);
    else {
      const lossRatio = Math.min(0.5, (count - def) * 0.06);
      const stolen = this.stealPortion(lossRatio);
      raid.stolen = stolen;
      this.finish(false);
    }
    game.settlement.log(won ? '자리를 비운 사이 습격이 있었지만 수비대가 막아냈습니다.' : `자리를 비운 사이 습격으로 창고의 물건 ${raid.stolen}개를 빼앗겼습니다.`);
  }

  /** Remove a fraction of every warehouse stack (and treasury); returns item count lost. */
  private stealPortion(ratio: number): number {
    const st = this.game.state.settlement;
    let n = 0;
    for (const id of Object.keys(st.warehouse)) n += this.game.settlement.takeFromWarehouse(id, Math.floor(st.warehouse[id] * ratio));
    const coins = Math.floor(st.treasury * ratio);
    st.treasury -= coins;
    return n + coins;
  }

  private finish(repelled: boolean) {
    const game = this.game;
    const raid = this.state;
    raid.active = false;
    raid.lastDay = game.env.day;
    raid.lastResult = repelled ? 'repelled' : 'lost';
    const c = game.state.counters;
    if (repelled) {
      raid.repelled++;
      c['raid:repelled'] = (c['raid:repelled'] ?? 0) + 1;
      game.settlement.log('습격을 막아냈습니다! 주민들이 안도합니다.');
      game.events.emit('banner', { title: '습격을 막아냈다!', subtitle: '마을이 무사하다', kind: 'level' });
      game.gainXp(80 + 20 * game.state.settlement.tier, '마을 방어');
      for (const v of game.state.settlement.villagers) v.happiness = Math.min(100, v.happiness + 5);
    } else {
      raid.lost++;
      game.settlement.log(`습격으로 피해를 입었습니다 (빼앗긴 물건 ${raid.stolen}개).`);
      game.events.emit('notify', { text: '습격이 끝났습니다. 마을이 피해를 입었습니다', kind: 'warn' });
    }
    this.raiders.clear();
    game.settlement.refresh();
    game.bridge.bump();
  }

  /** Who a raider goes after: the player or a guard who comes close, villagers caught outside, else the town hall. */
  targetFor(e: Enemy, dt: number): RaidTarget {
    e.retarget -= dt;
    if (e.raidTarget && e.retarget > 0 && this.targetValid(e.raidTarget)) {
      this.refreshPos(e.raidTarget);
      return e.raidTarget;
    }
    e.retarget = 0.5;
    const game = this.game;
    const p = e.body.pos;
    let best: RaidTarget | null = null;
    let bd = Infinity;
    const pp = game.player.body.pos;
    if (!game.player.dead) {
      const d = pp.distanceTo(p);
      if (d < 18) {
        best = { kind: 'player', pos: pp, id: 0 };
        bd = d - 4; // the player draws attention
      }
    }
    for (const a of game.villagers.raidTargets()) {
      const d = a.pos.distanceTo(p);
      const range = a.guard ? 20 : 12;
      if (d < range && d < bd) {
        best = { kind: 'villager', pos: a.pos, id: a.id };
        bd = d;
      }
    }
    if (!best) {
      const c = game.settlement.center() ?? p;
      const hall = game.settlement.hall();
      // stand at the hall's front door
      const fx = hall ? Math.sin(hall.state.rot) * 3.4 : 0;
      const fz = hall ? Math.cos(hall.state.rot) * 3.4 : 0;
      best = { kind: 'hall', pos: new THREE.Vector3(c.x + fx, c.y, c.z + fz), id: 0 };
    }
    e.raidTarget = best;
    return best;
  }

  private targetValid(t: RaidTarget): boolean {
    if (t.kind === 'player') return !this.game.player.dead;
    if (t.kind === 'villager') return this.game.villagers.isTargetable(t.id);
    return true;
  }

  private refreshPos(t: RaidTarget) {
    if (t.kind === 'villager') {
      const pos = this.game.villagers.positionOf(t.id);
      if (pos) t.pos = pos;
    }
  }

  /** A raider's attack lands on its current target. */
  strike(e: Enemy, amount: number, opts: { knock?: number }) {
    const t = e.raidTarget;
    if (!t || t.kind === 'player') {
      this.game.damagePlayer(amount, e.body.pos, { knock: opts.knock, source: e });
      return;
    }
    if (t.kind === 'villager') {
      this.game.villagers.damage(t.id, amount, e.body.pos);
      return;
    }
    this.stealAtHall(e);
  }

  /** Ground slams also hurt villagers standing in the circle. */
  slam(center: THREE.Vector3, radius: number, amount: number) {
    for (const a of this.game.villagers.raidTargets()) {
      if (Math.hypot(a.pos.x - center.x, a.pos.z - center.z) < radius + 0.3) this.game.villagers.damage(a.id, amount, center);
    }
  }

  private stealAtHall(e: Enemy) {
    const st = this.game.state.settlement;
    const ids = Object.keys(st.warehouse);
    let took = 0;
    if (ids.length) {
      const id = ids[Math.floor(Math.random() * ids.length)];
      took = this.game.settlement.takeFromWarehouse(id, 3);
    }
    if (st.treasury > 0) {
      const c = Math.min(st.treasury, 2);
      st.treasury -= c;
      took += c;
    }
    if (took > 0) {
      this.state.stolen += took;
      const at = e.body.pos.clone();
      at.y += 2;
      this.game.floatText.spawn(at, `약탈 -${took}`, 'hurt');
      if (this.state.stolen <= took) this.game.events.emit('notify', { text: '괴물이 마을 창고를 약탈하고 있습니다!', kind: 'warn' });
    }
  }

  update(dt: number) {
    const game = this.game;
    const st = game.state.settlement;
    const h = game.env.hours;
    const hour = Math.floor(h);
    if (this.lastHour !== -1 && hour !== this.lastHour) {
      if (hour === RAID_HOUR && this.state.tonight && st.founded) this.startRaid();
      if (hour === DAWN) {
        game.villagers.recoverAll();
        if (this.state.active) this.retreat();
      }
    }
    this.lastHour = hour;
    if (this.state.active && this.raiders.size > 0) {
      for (const e of [...this.raiders]) if (e.removed) this.raiders.delete(e);
      if (this.remaining() === 0) this.finish(true);
    } else if (this.state.active && this.raiders.size === 0 && !game.state.settlement.founded) this.state.active = false;
    this.updateTowers(dt);
  }

  /** Dawn: the surviving raiders flee. */
  private retreat() {
    for (const e of [...this.raiders]) {
      if (e.removed) continue;
      this.game.particles.burst(e.body.pos.clone().setY(e.body.pos.y + 1), 0x8a7a66, 10, 2);
      this.game.enemies.despawn(e);
    }
    this.game.settlement.log('새벽이 되자 남은 괴물들이 달아났습니다.');
    this.finish(this.state.stolen === 0);
  }

  private updateTowers(dt: number) {
    const game = this.game;
    if (!game.state.settlement.founded || game.inDungeon) return;
    for (const p of game.building.pieces.values()) {
      if (p.def.id !== 'archer_tower') continue;
      const t = (this.towerTimers.get(p.state.id) ?? 0) - dt;
      if (t > 0) {
        this.towerTimers.set(p.state.id, t);
        continue;
      }
      const from = new THREE.Vector3(p.state.x, p.state.y + 6.7, p.state.z);
      let best: Enemy | null = null;
      let bd = TOWER_RANGE;
      for (const e of game.enemies.list) {
        if (e.removed || e.state === 'dead' || e.def.dungeon) continue;
        const d = Math.hypot(e.body.pos.x - from.x, e.body.pos.z - from.z);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (!best) {
        this.towerTimers.set(p.state.id, 0.4);
        continue;
      }
      const target = best.body.pos.clone();
      target.y += best.def.height * 0.6 + (best.def.flying ? 1 : 0);
      const vel = target.sub(from).normalize().multiplyScalar(26);
      game.projectiles.spawn(from, vel, game.civ.has('t_fortification') ? 18 : 14, 0xe8dcb8, { owner: 'player', target: best, homing: 3, life: 2.2, source: 'tower' });
      if (from.distanceTo(game.player.body.pos) < 30) game.audio.play('swing', 0.35);
      this.towerTimers.set(p.state.id, TOWER_COOLDOWN);
    }
  }
}
