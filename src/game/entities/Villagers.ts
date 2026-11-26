import * as THREE from 'three';
import { mulberry32 } from '../core/Random';
import { angleDiff, dampAngle } from '../core/math';
import { JOBS, type JobId } from '../data/village';
import type { Villager } from '../state/types';
import { CharacterModel, type AnimState } from './CharacterModel';
import { moveBody, type Body } from './physics';
import type { Game } from '../Game';

type Activity = 'idle' | 'walk' | 'work' | 'sleep' | 'talk';
type Goal = 'work' | 'home' | 'leisure';

const SKINS = [0xf1c8a8, 0xe8b896, 0xd49a72, 0xb9805a, 0x8a5a3c];
const HAIRS = [0x2a1a10, 0x3b2516, 0x6a4a2a, 0xb08a4a, 0x1a1a1a, 0x8a3a1a, 0xc9c0b0];
const PANTS = [0x4a3a2c, 0x3a4a5a, 0x5a4a3a, 0x2e3a2e];

class VillagerAgent {
  readonly model: CharacterModel;
  readonly body: Body;
  activity: Activity = 'idle';
  goal: Goal = 'leisure';
  target = new THREE.Vector3();
  hasTarget = false;
  timer = 0;
  stuck = 0;
  detour = 0;
  detourSign = 1;
  yaw = 0;
  actT = 0;
  partner: VillagerAgent | null = null;
  private lastPos = new THREE.Vector3();

  constructor(readonly v: Villager) {
    const rng = mulberry32(v.look);
    this.model = new CharacterModel({
      skin: SKINS[Math.floor(rng() * SKINS.length)],
      hair: HAIRS[Math.floor(rng() * HAIRS.length)],
      pants: PANTS[Math.floor(rng() * PANTS.length)],
      shirt: v.job ? JOBS[v.job as JobId].color : 0x9a8a72,
      cape: false,
    });
    this.model.setEquipment(null, null);
    this.body = { pos: new THREE.Vector3(v.x, v.y, v.z), vel: new THREE.Vector3(), radius: 0.32, height: 1.75, stepHeight: 0.5, grounded: false };
    this.model.root.position.copy(this.body.pos);
    this.lastPos.copy(this.body.pos);
    this.yaw = rng() * Math.PI * 2;
  }

  /** Steer towards the target with simple stall detection; returns distance left. */
  walk(game: Game, dt: number, speed: number): number {
    const p = this.body.pos;
    const dx = this.target.x - p.x;
    const dz = this.target.z - p.z;
    const d = Math.hypot(dx, dz);
    let yaw = Math.atan2(dx, dz);
    const moved = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);
    this.lastPos.copy(p);
    if (moved < speed * dt * 0.25) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt);
    if (this.stuck > 0.6 && this.detour <= 0) {
      this.detour = 1 + Math.random();
      this.detourSign = Math.random() < 0.5 ? -1 : 1;
    }
    if (this.detour > 0) {
      this.detour -= dt;
      yaw += this.detourSign * 1.2;
    }
    // stuck for long near the goal (closed doors, tight rooms): step through
    if (this.stuck > 3 && d < 12) {
      p.set(this.target.x, Math.max(this.target.y, game.terrain.heightAt(this.target.x, this.target.z)), this.target.z);
      this.stuck = 0;
      return 0;
    }
    const sp = game.building.isRoadAt(p.x, p.z) ? speed * 1.3 : speed;
    this.body.vel.x = Math.sin(yaw) * sp;
    this.body.vel.z = Math.cos(yaw) * sp;
    this.yaw = dampAngle(this.yaw, yaw, 8, dt);
    moveBody(this.body, dt, game.terrain, game.colliders, 22);
    return d;
  }
}

/** Visual + behaviour layer for villagers (the data lives in SettlementState). */
export class VillagerManager {
  readonly group = new THREE.Group();
  private agents = new Map<number, VillagerAgent>();
  private tmp = new THREE.Vector3();

  constructor(private game: Game) {
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
      if (!a) {
        const agent = new VillagerAgent(v);
        this.agents.set(v.id, agent);
        this.group.add(agent.model.root);
      } else if (a.v !== v) {
        // state object replaced (load) - rebuild
        this.group.remove(a.model.root);
        const agent = new VillagerAgent(v);
        this.agents.set(v.id, agent);
        this.group.add(agent.model.root);
      }
    }
  }

  clear() {
    for (const a of this.agents.values()) this.group.remove(a.model.root);
    this.agents.clear();
  }

  refreshLook(id: number) {
    const a = this.agents.get(id);
    if (a) a.model.setShirt(a.v.job ? JOBS[a.v.job as JobId].color : 0x9a8a72);
  }

  isWorking(id: number): boolean {
    return this.agents.get(id)?.activity === 'work';
  }

  activityOf(id: number): string {
    const a = this.agents.get(id);
    if (!a) return '';
    if (a.activity === 'work') return '일하는 중';
    if (a.activity === 'sleep') return '자는 중';
    if (a.activity === 'talk') return '이야기 중';
    if (a.activity === 'walk') return a.goal === 'work' ? '일터로 가는 중' : a.goal === 'home' ? '집으로 가는 중' : '산책 중';
    return '쉬는 중';
  }

  /** Nearest villager to a point (for talking). */
  nearest(pos: THREE.Vector3, r: number): Villager | null {
    let best: Villager | null = null;
    let bd = r;
    for (const a of this.agents.values()) {
      const d = a.body.pos.distanceTo(pos);
      if (d < bd) {
        bd = d;
        best = a.v;
      }
    }
    return best;
  }

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
    };
    const [ox, oz] = off[p.def.id] ?? [0, 1.2];
    const c = Math.cos(p.state.rot);
    const s = Math.sin(p.state.rot);
    return new THREE.Vector3(p.state.x + ox * c + oz * s, p.state.y, p.state.z - ox * s + oz * c);
  }

  private bedSpot(a: VillagerAgent) {
    const p = a.v.homeId !== null ? this.game.building.pieces.get(a.v.homeId) : undefined;
    return p ?? null;
  }

  update(dt: number) {
    const game = this.game;
    const h = game.env.hours;
    const settled = game.state.settlement.founded;
    const hall = game.settlement.center();
    const pp = game.player.body.pos;
    game.floatText.beginTags();
    for (const a of this.agents.values()) {
      const v = a.v;
      a.timer -= dt;
      a.actT += dt;
      // ── decide the goal from the daily schedule
      const night = h >= 21.5 || h < 6;
      const workHours = h >= 6 && h < 18.5;
      let goal: Goal = 'leisure';
      if (settled && night && v.homeId !== null) goal = 'home';
      else if (settled && workHours && v.job && v.workId !== null) goal = 'work';
      if (goal !== a.goal) {
        a.goal = goal;
        a.hasTarget = false;
        a.partner = null;
        if (a.activity === 'sleep') a.body.pos.y += 0.6;
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
            const d = a.walk(game, dt, 2.3);
            a.activity = d < 0.9 ? 'work' : 'walk';
            anim = 'move';
          }
          if (a.activity === 'work') {
            const wp = game.building.pieces.get(v.workId!);
            if (wp) a.yaw = dampAngle(a.yaw, Math.atan2(wp.state.x - a.body.pos.x, wp.state.z - a.body.pos.z), 6, dt);
            a.body.vel.set(0, 0, 0);
            moveBody(a.body, dt, game.terrain, game.colliders, 22);
            switch (v.job as JobId) {
              case 'farmer':
                anim = 'pick';
                break;
              case 'woodcutter':
                anim = 'gather';
                tool = 'axe';
                break;
              case 'miner':
                anim = 'gather';
                tool = 'pickaxe';
                break;
              case 'artisan':
                anim = 'gather';
                break;
              case 'cook':
                anim = 'use';
                break;
              default:
                anim = 'idle';
            }
          }
        }
      } else if (a.goal === 'home') {
        const bed = this.bedSpot(a);
        if (bed) {
          if (a.activity !== 'sleep') {
            const c = Math.cos(bed.state.rot);
            const s = Math.sin(bed.state.rot);
            a.target.set(bed.state.x + 0.9 * c, bed.state.y, bed.state.z - 0.9 * s);
            const d = a.walk(game, dt, 2.3);
            anim = 'move';
            if (d < 1.0) a.activity = 'sleep';
            else a.activity = 'walk';
          }
          if (a.activity === 'sleep') {
            a.body.vel.set(0, 0, 0);
            a.body.pos.set(bed.state.x, bed.state.y + 0.5, bed.state.z);
            a.yaw = bed.state.rot + Math.PI;
            anim = 'sleep';
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
          a.body.vel.set(0, 0, 0);
          moveBody(a.body, dt, game.terrain, game.colliders, 22);
        } else if (a.activity === 'walk') {
          const d = a.walk(game, dt, 1.6);
          anim = 'move';
          if (d < 0.8 || a.timer < -10) {
            a.activity = 'idle';
            a.timer = 2 + Math.random() * 4;
          }
        } else {
          a.body.vel.set(0, 0, 0);
          moveBody(a.body, dt, game.terrain, game.colliders, 22);
          if (a.timer <= 0) {
            // chat with someone close by who is also idle
            const friend = [...this.agents.values()].find((o) => o !== a && o.goal === 'leisure' && o.activity === 'idle' && o.body.pos.distanceTo(a.body.pos) < 5);
            if (friend && Math.random() < 0.5) {
              a.activity = friend.activity = 'talk';
              a.partner = friend;
              friend.partner = a;
              a.timer = friend.timer = 4 + Math.random() * 3;
            } else {
              const c = hall ?? a.body.pos;
              const ang = Math.random() * Math.PI * 2;
              const r = 4 + Math.random() * 10;
              a.target.set(c.x + Math.cos(ang) * r, c.y, c.z + Math.sin(ang) * r);
              a.activity = 'walk';
              a.timer = 0;
            }
          }
        }
      }
      // ── visuals
      a.model.setTool(tool, 0x9a9a95);
      const hs = Math.hypot(a.body.vel.x, a.body.vel.z);
      const t = anim === 'pick' || anim === 'gather' || anim === 'use' ? (a.actT % 1.1) / 1.1 : 0;
      a.model.update(dt, { state: anim, speed: anim === 'move' ? hs : 0, run: false, t, combo: 0, tool });
      a.model.root.position.copy(a.body.pos);
      const cur = a.model.root.rotation.y;
      a.model.root.rotation.y = cur + angleDiff(cur, a.yaw) * Math.min(1, dt * 10);
      v.x = a.body.pos.x;
      v.y = a.body.pos.y;
      v.z = a.body.pos.z;
      // name tag when the player is near
      if (a.activity !== 'sleep' && a.body.pos.distanceToSquared(pp) < 18 * 18) {
        this.tmp.set(a.body.pos.x, a.body.pos.y + 2.15, a.body.pos.z);
        game.floatText.tag(game.camera, this.tmp, v.name, v.job ? JOBS[v.job as JobId].name : '무직');
      }
    }
    game.floatText.endTags();
  }
}
