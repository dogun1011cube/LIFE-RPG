import * as THREE from 'three';
import { mulberry32 } from '../core/Random';
import { angleDiff, dampAngle } from '../core/math';
import { JOBS, type JobId } from '../data/village';
import type { Villager } from '../state/types';
import type { PlacedPiece } from '../systems/Building';
import type { Enemy } from './Enemies';
import { CharacterModel, type AnimState } from './CharacterModel';
import { moveBody, type Body } from './physics';
import type { Game } from '../Game';

type Activity = 'idle' | 'walk' | 'work' | 'sleep' | 'talk' | 'inside' | 'down' | 'fight' | 'patrol';
type Goal = 'work' | 'home' | 'leisure' | 'shelter' | 'guard';

const SKINS = [0xf1c8a8, 0xe8b896, 0xd49a72, 0xb9805a, 0x8a5a3c];
const HAIRS = [0x2a1a10, 0x3b2516, 0x6a4a2a, 0xb08a4a, 0x1a1a1a, 0x8a3a1a, 0xc9c0b0];
const PANTS = [0x4a3a2c, 0x3a4a5a, 0x5a4a3a, 0x2e3a2e];
/** distance in front of a house where its door is */
const HOUSE_DOOR: Record<string, number> = { house_wood: 2.7, house_stone: 2.7 };
/** beyond this distance from the player villagers are simulated without physics or visuals */
const LOD_DIST = 110;
const GUARD_SWING = 0.9;

export const VILLAGER_HP = 40;
export const GUARD_HP = 90;

class VillagerAgent {
  readonly model: CharacterModel;
  readonly body: Body;
  activity: Activity = 'idle';
  goal: Goal = 'leisure';
  target = new THREE.Vector3();
  timer = 0;
  stuck = 0;
  detour = 0;
  detourSign = 1;
  yaw = 0;
  actT = 0;
  partner: VillagerAgent | null = null;
  /** path finding */
  path: THREE.Vector3[] | null = null;
  pathI = 0;
  pathFor = new THREE.Vector3(Infinity, 0, 0);
  pathVersion = -1;
  repath = 0;
  /** guards */
  foe: Enemy | null = null;
  swingT = -1;
  swingHit = false;
  cool = 0;
  hidden = false;
  private lastPos = new THREE.Vector3();
  private look: number;

  constructor(readonly v: Villager) {
    const rng = mulberry32(v.look);
    this.look = v.look;
    this.model = new CharacterModel({
      skin: SKINS[Math.floor(rng() * SKINS.length)],
      hair: HAIRS[Math.floor(rng() * HAIRS.length)],
      pants: PANTS[Math.floor(rng() * PANTS.length)],
      shirt: v.job ? JOBS[v.job as JobId].color : 0x9a8a72,
      cape: false,
    });
    this.applyJobLook();
    this.body = { pos: new THREE.Vector3(v.x, v.y, v.z), vel: new THREE.Vector3(), radius: 0.32, height: 1.75, stepHeight: 0.5, grounded: false };
    this.model.root.position.copy(this.body.pos);
    this.lastPos.copy(this.body.pos);
    this.yaw = rng() * Math.PI * 2;
    if (v.down) this.activity = 'down';
  }

  applyJobLook() {
    const guard = this.v.job === 'guard';
    this.model.setShirt(this.v.job ? JOBS[this.v.job as JobId].color : 0x9a8a72);
    this.model.setEquipment(guard ? 'copper_sword' : null, guard ? 'copper_armor' : null);
  }

  get seed() {
    return this.look;
  }

  setHidden(h: boolean) {
    this.hidden = h;
    this.model.root.visible = !h;
  }

  /** Walk towards `target`, following an A* path when the settlement grid covers it. Returns distance left. */
  walk(mgr: VillagerManager, dt: number, speed: number): number {
    const game = mgr.game;
    const p = this.body.pos;
    const dGoal = Math.hypot(this.target.x - p.x, this.target.z - p.z);
    // ── path upkeep
    this.repath -= dt;
    const nav = game.nav;
    if (dGoal > 2.2 && nav.ensure() && nav.inBounds(this.target.x, this.target.z) && nav.inBounds(p.x, p.z)) {
      const stale = !this.path || this.pathFor.distanceToSquared(this.target) > 1 || this.pathVersion !== nav.version || (this.stuck > 1.2 && this.repath <= 0);
      if (stale && mgr.pathBudget > 0 && this.repath <= 0) {
        mgr.pathBudget--;
        this.path = nav.findPath(p, this.target) ?? [];
        this.pathI = 0;
        this.pathFor.copy(this.target);
        this.pathVersion = nav.version;
        this.repath = 1.2;
        this.stuck = 0;
      }
    } else if (dGoal <= 2.2) this.path = null;
    let aim = this.target;
    if (this.path && this.path.length) {
      while (this.pathI < this.path.length - 1 && Math.hypot(this.path[this.pathI].x - p.x, this.path[this.pathI].z - p.z) < 0.6) this.pathI++;
      aim = this.path[this.pathI];
    }
    const dx = aim.x - p.x;
    const dz = aim.z - p.z;
    let yaw = Math.atan2(dx, dz);
    const moved = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);
    this.lastPos.copy(p);
    if (moved < speed * dt * 0.25) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt);
    if (this.stuck > 0.8 && this.detour <= 0 && !(this.path && this.path.length)) {
      this.detour = 1 + Math.random();
      this.detourSign = Math.random() < 0.5 ? -1 : 1;
    }
    if (this.detour > 0) {
      this.detour -= dt;
      yaw += this.detourSign * 1.2;
    }
    // last resort when truly wedged (path finding normally avoids this)
    if (this.stuck > 6 && dGoal < 14) {
      p.set(this.target.x, Math.max(this.target.y, game.terrain.heightAt(this.target.x, this.target.z)), this.target.z);
      this.stuck = 0;
      this.path = null;
      mgr.teleports++;
      return 0;
    }
    const sp = game.building.isRoadAt(p.x, p.z) ? speed * 1.3 : speed;
    this.body.vel.x = Math.sin(yaw) * sp;
    this.body.vel.z = Math.cos(yaw) * sp;
    this.yaw = dampAngle(this.yaw, yaw, 8, dt);
    moveBody(this.body, dt, game.terrain, game.colliders, 22);
    return dGoal;
  }

  stand(game: Game, dt: number) {
    this.body.vel.set(0, 0, 0);
    moveBody(this.body, dt, game.terrain, game.colliders, 22);
  }
}

/** Visual + behaviour layer for villagers (the data lives in SettlementState). */
export class VillagerManager {
  readonly group = new THREE.Group();
  private agents = new Map<number, VillagerAgent>();
  private tmp = new THREE.Vector3();
  /** A* searches allowed this frame (spreads the cost over frames) */
  pathBudget = 0;
  /** stuck-teleports used (tests track that path finding keeps this low) */
  teleports = 0;
  /** doors villagers opened and should close behind them */
  private openedDoors = new Set<number>();
  private doorCache: PlacedPiece[] = [];
  private doorVersion = -1;

  constructor(readonly game: Game) {
    this.group.name = 'villagers';
  }

  /** Create/remove agents to match the settlement's villager list. */
  sync() {
    const vs = this.game.state.settlement.villagers;
    const ids = new Set(vs.map((v) => v.id));
    for (const [id, a] of this.agents) {
      if (!ids.has(id)) {
        this.group.remove(a.model.root);
        this.agents.delete(id);
      }
    }
    for (const v of vs) {
      const a = this.agents.get(v.id);
      if (!a || a.v !== v) {
        if (a) this.group.remove(a.model.root);
        const agent = new VillagerAgent(v);
        this.agents.set(v.id, agent);
        this.group.add(agent.model.root);
      }
    }
  }

  clear() {
    for (const a of this.agents.values()) this.group.remove(a.model.root);
    this.agents.clear();
    this.openedDoors.clear();
  }

  refreshLook(id: number) {
    this.agents.get(id)?.applyJobLook();
  }

  maxHp(v: Villager): number {
    return v.job === 'guard' ? GUARD_HP * (this.game.civ.has('t_fortification') ? 1.5 : 1) : VILLAGER_HP;
  }

  isWorking(id: number): boolean {
    return this.agents.get(id)?.activity === 'work';
  }

  activityOf(id: number): string {
    const a = this.agents.get(id);
    if (!a) return '';
    if (a.v.down) return '쓰러짐 (아침에 회복)';
    if (this.game.settlement.onStrike(a.v)) return '급료를 못 받아 쉬는 중';
    switch (a.activity) {
      case 'work':
        return '일하는 중';
      case 'sleep':
        return a.goal === 'shelter' ? '대피함 (침대)' : '자는 중';
      case 'inside':
        return a.goal === 'shelter' ? '집 안에 대피함' : '집 안에서 쉬는 중';
      case 'talk':
        return '이야기 중';
      case 'fight':
        return '전투 중';
      case 'patrol':
        return '순찰 중';
      case 'walk':
        return a.goal === 'work' ? '일터로 가는 중' : a.goal === 'home' ? '집으로 가는 중' : a.goal === 'shelter' ? '대피하는 중' : a.goal === 'guard' ? '초소로 가는 중' : '산책 중';
    }
    return a.goal === 'shelter' ? '숨어 있음' : '쉬는 중';
  }

  /** Nearest visible villager to a point (for talking / helping up). */
  nearest(pos: THREE.Vector3, r: number): Villager | null {
    let best: Villager | null = null;
    let bd = r;
    for (const a of this.agents.values()) {
      if (a.hidden) continue;
      const d = a.body.pos.distanceTo(pos);
      if (d < bd) {
        bd = d;
        best = a.v;
      }
    }
    return best;
  }

  positionOf(id: number): THREE.Vector3 | null {
    return this.agents.get(id)?.body.pos ?? null;
  }

  // ── Combat hooks (raids) ────────────────────────────────
  /** Villagers raiders can attack: outside, standing, not hidden in a house. */
  raidTargets(): { id: number; pos: THREE.Vector3; guard: boolean }[] {
    const out: { id: number; pos: THREE.Vector3; guard: boolean }[] = [];
    for (const a of this.agents.values()) if (this.isTargetable(a.v.id)) out.push({ id: a.v.id, pos: a.body.pos, guard: a.v.job === 'guard' });
    return out;
  }

  isTargetable(id: number): boolean {
    const a = this.agents.get(id);
    return !!a && !a.hidden && !a.v.down;
  }

  damage(id: number, amount: number, from: THREE.Vector3) {
    const a = this.agents.get(id);
    if (!a || a.v.down) return;
    const v = a.v;
    const max = this.maxHp(v);
    const armour = v.job === 'guard' ? 6 : 0;
    const dmg = Math.max(1, Math.round(amount * (1 - armour / (armour + 20))));
    v.hp = Math.min(max, v.hp ?? max) - dmg;
    a.model.flash = 1;
    const near = a.body.pos.distanceTo(this.game.player.body.pos) < 30;
    if (near) {
      this.tmp.copy(a.body.pos);
      this.tmp.y += 2;
      this.game.floatText.spawn(this.tmp, String(dmg), 'hurt');
    }
    // knock back
    const kx = a.body.pos.x - from.x;
    const kz = a.body.pos.z - from.z;
    const kl = Math.hypot(kx, kz) || 1;
    a.body.vel.x = (kx / kl) * 3;
    a.body.vel.z = (kz / kl) * 3;
    if (v.hp <= 0) {
      v.hp = 0;
      v.down = true;
      v.hurtDay = this.game.env.day;
      a.activity = 'down';
      a.foe = null;
      a.path = null;
      this.game.settlement.log(`${v.name}이(가) 습격에 쓰러졌습니다.`);
      this.game.events.emit('notify', { text: `${v.name}이(가) 쓰러졌습니다! 다가가서 [E]로 일으켜 세울 수 있습니다`, kind: 'warn' });
      if (near) this.game.audio.play('hurt', 0.6);
    }
  }

  /** Player helps a knocked-out villager up. */
  revive(id: number): boolean {
    const a = this.agents.get(id);
    if (!a || !a.v.down) return false;
    a.v.down = false;
    a.v.hp = Math.round(this.maxHp(a.v) * 0.5);
    a.activity = 'idle';
    a.timer = 0.5;
    this.game.particles.burst(a.body.pos.clone().setY(a.body.pos.y + 1), 0x7fff8a, 14, 2.5, 0.08);
    this.game.audio.play('heal');
    this.game.gainXp(10, '주민 구조');
    this.game.settlement.log(`${a.v.name}을(를) 일으켜 세웠습니다.`);
    return true;
  }

  /** Morning: everyone heals. */
  recoverAll() {
    for (const a of this.agents.values()) {
      const v = a.v;
      v.hp = this.maxHp(v);
      if (v.down) {
        v.down = false;
        if (a.activity === 'down') a.activity = 'idle';
      }
    }
  }

  // ── Places ──────────────────────────────────────────────
  private workSpot(a: VillagerAgent): THREE.Vector3 | null {
    const p = a.v.workId !== null ? this.game.building.pieces.get(a.v.workId) : undefined;
    if (!p) return null;
    const off: Record<string, [number, number]> = {
      farm_plot: [0, -1.4],
      lumber_camp: [1.1, 1.6],
      mine_shaft: [0, 1.6],
      workbench: [0, 1.0],
      campfire: [0, 1.3],
      market_stall: [0, -0.4],
      research_desk: [0, 1.1],
      sawmill: [0, 1.5],
      smelter: [0, 2.0],
      smithy: [0.2, 1.8],
      guard_post: [0, 2.0],
    };
    const [ox, oz] = off[p.def.id] ?? [0, 1.2];
    return this.local(p, ox, oz);
  }

  private local(p: PlacedPiece, ox: number, oz: number): THREE.Vector3 {
    const c = Math.cos(p.state.rot);
    const s = Math.sin(p.state.rot);
    return new THREE.Vector3(p.state.x + ox * c + oz * s, p.state.y, p.state.z - ox * s + oz * c);
  }

  private home(a: VillagerAgent): PlacedPiece | null {
    return (a.v.homeId !== null ? this.game.building.pieces.get(a.v.homeId) : undefined) ?? null;
  }

  private hallDoor(): THREE.Vector3 | null {
    const h = this.game.settlement.hall();
    return h ? this.local(h, 1.6, 3.6) : null;
  }

  // ── Doors ───────────────────────────────────────────────
  private doors(): PlacedPiece[] {
    const b = this.game.building;
    if (this.doorVersion !== b.version) {
      this.doorCache = [...b.pieces.values()].filter((p) => p.def.interact === 'door');
      this.doorVersion = b.version;
    }
    return this.doorCache;
  }

  private updateDoors() {
    const doors = this.doors();
    if (!doors.length) return;
    const pp = this.game.player.body.pos;
    const walkers = [...this.agents.values()].filter((a) => !a.hidden && a.activity === 'walk');
    for (const d of doors) {
      const near = walkers.some((a) => (a.body.pos.x - d.state.x) ** 2 + (a.body.pos.z - d.state.z) ** 2 < 1.5 * 1.5);
      const silent = (pp.x - d.state.x) ** 2 + (pp.z - d.state.z) ** 2 > 20 * 20;
      if (near && !d.state.open) {
        this.game.building.toggleDoor(d, silent);
        this.openedDoors.add(d.state.id);
      } else if (!near && d.state.open && this.openedDoors.has(d.state.id)) {
        const anyone = [...this.agents.values()].some((a) => !a.hidden && (a.body.pos.x - d.state.x) ** 2 + (a.body.pos.z - d.state.z) ** 2 < 2.4 * 2.4);
        const playerIn = (pp.x - d.state.x) ** 2 + (pp.z - d.state.z) ** 2 < 1.6 * 1.6;
        if (!anyone && !playerIn) {
          this.game.building.toggleDoor(d, silent);
          this.openedDoors.delete(d.state.id);
        }
      }
    }
  }

  // ── Guards ──────────────────────────────────────────────
  private findFoe(a: VillagerAgent, post: THREE.Vector3 | null): Enemy | null {
    const raid = this.game.defense.active;
    const hall = this.game.settlement.center();
    const R = this.game.settlement.radius() + 15;
    let best: Enemy | null = null;
    let bd = raid ? 32 : 18;
    for (const e of this.game.enemies.list) {
      if (e.removed || e.state === 'dead' || e.def.dungeon || e.def.flying) continue;
      const d = e.body.pos.distanceTo(a.body.pos);
      if (d >= bd) continue;
      // stay near the post normally; during a raid defend the whole town
      if (!raid && post && e.body.pos.distanceTo(post) > 18) continue;
      if (raid && hall && e.body.pos.distanceTo(hall) > R) continue;
      bd = d;
      best = e;
    }
    return best;
  }

  private fight(a: VillagerAgent, dt: number): AnimState {
    const game = this.game;
    const e = a.foe!;
    const d = Math.hypot(e.body.pos.x - a.body.pos.x, e.body.pos.z - a.body.pos.z);
    a.cool -= dt;
    if (a.swingT >= 0) {
      // mid swing
      a.swingT += dt;
      a.stand(game, dt);
      a.yaw = dampAngle(a.yaw, Math.atan2(e.body.pos.x - a.body.pos.x, e.body.pos.z - a.body.pos.z), 10, dt);
      if (!a.swingHit && a.swingT >= GUARD_SWING * 0.45) {
        a.swingHit = true;
        if (d < 2.4 + e.def.radius && !e.removed && e.state !== 'dead') {
          const knock = new THREE.Vector3(e.body.pos.x - a.body.pos.x, 0, e.body.pos.z - a.body.pos.z).normalize();
          game.damageEnemyBy(e, 14 * (game.civ.has('t_fortification') ? 1.5 : 1), knock);
        }
      }
      if (a.swingT >= GUARD_SWING) {
        a.swingT = -1;
        a.cool = 0.35;
      }
      return 'attack';
    }
    if (d < 1.7 + e.def.radius) {
      a.stand(game, dt);
      a.yaw = dampAngle(a.yaw, Math.atan2(e.body.pos.x - a.body.pos.x, e.body.pos.z - a.body.pos.z), 10, dt);
      if (a.cool <= 0) {
        a.swingT = 0;
        a.swingHit = false;
        if (a.body.pos.distanceTo(game.player.body.pos) < 25) game.audio.play('swing', 0.4);
      }
      return 'idle';
    }
    a.target.copy(e.body.pos);
    a.walk(this, dt, 4.2);
    a.activity = 'fight';
    return 'move';
  }

  // ── Per frame ───────────────────────────────────────────
  update(dt: number) {
    const game = this.game;
    const h = game.env.hours;
    const st = game.state.settlement;
    const settled = st.founded;
    const hall = game.settlement.center();
    const pp = game.player.body.pos;
    const raid = game.defense.active;
    this.pathBudget = 3;
    game.floatText.beginTags();
    for (const a of this.agents.values()) {
      const v = a.v;
      a.timer -= dt;
      a.actT += dt;
      if (a.model.flash > 0) a.model.flash = Math.max(0, a.model.flash - dt * 4);
      const far = a.body.pos.distanceToSquared(pp) > LOD_DIST * LOD_DIST;
      // ── knocked out: lie still until morning (or until the player helps)
      if (v.down) {
        if (a.hidden) a.setHidden(false);
        a.activity = 'down';
        a.stand(game, dt);
        this.pose(a, dt, 'sleep', null, far);
        continue;
      }
      // ── decide the goal from the daily schedule
      const night = h >= 21.5 || h < 6;
      const workHours = h >= 6 && h < 18.5;
      const guard = v.job === 'guard' && v.workId !== null && !game.settlement.onStrike(v);
      const guardDuty = h >= 12 || h < 7;
      let goal: Goal = 'leisure';
      if (settled && guard && (raid || guardDuty)) goal = 'guard';
      else if (settled && raid) goal = 'shelter';
      else if (settled && night && v.homeId !== null) goal = 'home';
      else if (settled && guard && v.homeId !== null) goal = 'home'; // off-duty guards sleep by day
      else if (settled && workHours && v.job && v.job !== 'guard' && v.workId !== null) goal = 'work';
      if (goal !== a.goal) {
        a.goal = goal;
        a.partner = null;
        a.path = null;
        a.foe = null;
        a.swingT = -1;
        if (a.activity === 'sleep') a.body.pos.y += 0.6;
        if (a.hidden) {
          // step out of the front door
          const home = this.home(a);
          if (home && HOUSE_DOOR[home.def.id]) a.body.pos.copy(this.local(home, 0, HOUSE_DOOR[home.def.id]));
          a.setHidden(false);
        }
        a.activity = 'idle';
        a.timer = Math.random() * 1.5;
      }
      // ── act
      let anim: AnimState = 'idle';
      let tool: 'axe' | 'pickaxe' | null = null;
      if (a.goal === 'work') {
        const spot = this.workSpot(a);
        if (spot) {
          a.target.copy(spot);
          if (a.activity !== 'work') {
            const d = far ? this.farMove(a, dt, 2.3) : a.walk(this, dt, 2.3);
            a.activity = d < 0.9 ? 'work' : 'walk';
            anim = 'move';
          }
          if (a.activity === 'work') {
            const wp = game.building.pieces.get(v.workId!);
            if (wp) a.yaw = dampAngle(a.yaw, Math.atan2(wp.state.x - a.body.pos.x, wp.state.z - a.body.pos.z), 6, dt);
            if (!far) a.stand(game, dt);
            [anim, tool] = this.workAnim(v.job as JobId);
          }
        }
      } else if (a.goal === 'home' || a.goal === 'shelter') {
        const home = this.home(a);
        const door = home ? HOUSE_DOOR[home.def.id] : undefined;
        if (home && door !== undefined) {
          // houses: walk to the door and go inside
          if (a.activity !== 'inside') {
            a.target.copy(this.local(home, 0, door));
            const d = far ? this.farMove(a, dt, a.goal === 'shelter' ? 4 : 2.3) : a.walk(this, dt, a.goal === 'shelter' ? 4 : 2.3);
            anim = 'move';
            a.activity = 'walk';
            if (d < 1.0) {
              a.activity = 'inside';
              a.setHidden(true);
            }
          }
        } else if (home) {
          if (a.activity !== 'sleep') {
            const c = Math.cos(home.state.rot);
            const s = Math.sin(home.state.rot);
            a.target.set(home.state.x + 0.9 * c, home.state.y, home.state.z - 0.9 * s);
            const d = far ? this.farMove(a, dt, 2.3) : a.walk(this, dt, a.goal === 'shelter' ? 4 : 2.3);
            anim = 'move';
            a.activity = d < 1.0 ? 'sleep' : 'walk';
          }
          if (a.activity === 'sleep') {
            a.body.vel.set(0, 0, 0);
            a.body.pos.set(home.state.x, home.state.y + 0.5, home.state.z);
            a.yaw = home.state.rot + Math.PI;
            anim = 'sleep';
          }
        } else {
          // homeless during a raid: hide by the town hall
          const hd = this.hallDoor();
          if (hd) {
            a.target.copy(hd);
            const d = far ? this.farMove(a, dt, 4) : a.walk(this, dt, 4);
            a.activity = d < 1.2 ? 'idle' : 'walk';
            anim = d < 1.2 ? 'idle' : 'move';
            if (d < 1.2) a.stand(game, dt);
          }
        }
      } else if (a.goal === 'guard') {
        const post = v.workId !== null ? game.building.pieces.get(v.workId) : undefined;
        const postPos = post ? this.workSpot(a) : null;
        if (a.foe && (a.foe.removed || a.foe.state === 'dead')) a.foe = null;
        if (!a.foe || a.timer <= 0) {
          a.foe = far ? null : this.findFoe(a, postPos);
          if (a.foe) a.timer = 0.6;
        }
        if (a.foe) anim = this.fight(a, dt);
        else if (postPos) {
          // patrol around the post
          if (a.activity === 'walk' || a.activity === 'fight') {
            const d = far ? this.farMove(a, dt, 1.8) : a.walk(this, dt, 1.8);
            anim = 'move';
            if (d < 0.8) {
              a.activity = 'patrol';
              a.timer = 2 + Math.random() * 3;
            }
          } else {
            a.activity = 'patrol';
            if (!far) a.stand(game, dt);
            if (a.timer <= 0) {
              const ang = Math.random() * Math.PI * 2;
              const r = 2 + Math.random() * 6;
              a.target.set(postPos.x + Math.cos(ang) * r, postPos.y, postPos.z + Math.sin(ang) * r);
              a.activity = 'walk';
            }
          }
        }
      } else {
        // leisure: wander around the town hall, sometimes chat with a neighbour
        if (a.activity === 'talk') {
          anim = 'idle';
          if (a.partner) a.yaw = dampAngle(a.yaw, Math.atan2(a.partner.body.pos.x - a.body.pos.x, a.partner.body.pos.z - a.body.pos.z), 6, dt);
          if (a.timer <= 0) {
            a.activity = 'idle';
            a.partner = null;
            a.timer = 2 + Math.random() * 3;
          }
          if (!far) a.stand(game, dt);
        } else if (a.activity === 'walk') {
          const d = far ? this.farMove(a, dt, 1.6) : a.walk(this, dt, 1.6);
          anim = 'move';
          if (d < 0.8 || a.timer < -12) {
            a.activity = 'idle';
            a.timer = 2 + Math.random() * 4;
          }
        } else {
          a.activity = 'idle';
          if (!far) a.stand(game, dt);
          if (a.timer <= 0) {
            const friend = [...this.agents.values()].find((o) => o !== a && o.goal === 'leisure' && o.activity === 'idle' && !o.hidden && o.body.pos.distanceTo(a.body.pos) < 5);
            if (friend && Math.random() < 0.5) {
              a.activity = friend.activity = 'talk';
              a.partner = friend;
              friend.partner = a;
              a.timer = friend.timer = 4 + Math.random() * 3;
            } else {
              const c = hall ?? a.body.pos;
              const ang = Math.random() * Math.PI * 2;
              const r = 4 + Math.random() * Math.min(14, game.settlement.radius() * 0.35);
              a.target.set(c.x + Math.cos(ang) * r, c.y, c.z + Math.sin(ang) * r);
              a.activity = 'walk';
              a.timer = 0;
            }
          }
        }
      }
      this.pose(a, dt, anim, tool, far);
    }
    this.updateDoors();
    game.floatText.endTags();
  }

  /** Far from the player: glide straight to the target without physics (keeps the town's schedule running). */
  private farMove(a: VillagerAgent, dt: number, speed: number): number {
    const p = a.body.pos;
    const dx = a.target.x - p.x;
    const dz = a.target.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01) {
      const step = Math.min(d, speed * dt);
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      p.y = Math.max(this.game.terrain.heightAt(p.x, p.z), a.target.y - 0.01);
      a.yaw = Math.atan2(dx, dz);
    }
    return d;
  }

  private workAnim(job: JobId): [AnimState, 'axe' | 'pickaxe' | null] {
    switch (job) {
      case 'farmer':
        return ['pick', null];
      case 'woodcutter':
        return ['gather', 'axe'];
      case 'miner':
        return ['gather', 'pickaxe'];
      case 'artisan':
      case 'smith':
        return ['gather', 'pickaxe'];
      case 'sawyer':
        return ['gather', 'axe'];
      case 'cook':
      case 'smelter':
        return ['use', null];
      case 'scholar':
        return ['use', null];
      default:
        return ['idle', null];
    }
  }

  private pose(a: VillagerAgent, dt: number, anim: AnimState, tool: 'axe' | 'pickaxe' | null, far: boolean) {
    const game = this.game;
    const v = a.v;
    v.x = a.body.pos.x;
    v.y = a.body.pos.y;
    v.z = a.body.pos.z;
    if (far) {
      a.model.root.visible = false;
      return;
    }
    a.model.root.visible = !a.hidden;
    if (a.hidden) return;
    a.model.setTool(tool, 0x9a9a95);
    const hs = Math.hypot(a.body.vel.x, a.body.vel.z);
    let t = 0;
    if (anim === 'pick' || anim === 'gather' || anim === 'use') t = (a.actT % 1.1) / 1.1;
    else if (anim === 'attack') t = Math.max(0, a.swingT) / GUARD_SWING;
    a.model.update(dt, { state: anim, speed: anim === 'move' ? hs : 0, run: a.goal === 'shelter' || a.activity === 'fight', t, combo: 0, tool });
    a.model.root.position.copy(a.body.pos);
    const cur = a.model.root.rotation.y;
    a.model.root.rotation.y = cur + angleDiff(cur, a.yaw) * Math.min(1, dt * 10);
    // name tag when the player is near
    if (a.activity !== 'sleep' && a.body.pos.distanceToSquared(game.player.body.pos) < 18 * 18) {
      this.tmp.set(a.body.pos.x, a.body.pos.y + (v.down ? 0.9 : 2.15), a.body.pos.z);
      const sub = v.down ? '쓰러짐' : v.job ? JOBS[v.job as JobId].name : '무직';
      game.floatText.tag(game.camera, this.tmp, v.name, sub);
    }
  }
}
