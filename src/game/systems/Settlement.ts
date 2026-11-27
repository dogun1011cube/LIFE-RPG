import * as THREE from 'three';
import { BUILDABLE_BY_ID } from '../data/buildables';
import { ITEMS, itemName } from '../data/items';
import { FIRST_NAMES, FOOD_VALUE, GUARD_WAGE, JOBS, JOB_ORDER, MARKET_STOCK, SELL_RATE, SETTLEMENT_RADIUS, TAX_LEVELS, TIERS, TOOL_JOBS, settlementRadius, type JobId } from '../data/village';
import type { SettlementState, Villager } from '../state/types';
import { Inv } from './Inventory';
import type { PlacedPiece } from './Building';
import type { Game } from '../Game';

export function freshSettlement(): SettlementState {
  return {
    founded: false,
    hallId: null,
    name: '새벽 마을',
    tier: 0,
    charter: false,
    villagers: [],
    nextId: 1,
    warehouse: {},
    log: [],
    arrivalTimer: 0,
    productionTimer: 0,
    lastDay: 1,
    treasury: 0,
    taxLevel: 0,
    research: { points: 0, done: [], total: 0 },
    raid: { nextDay: 0, active: false, tonight: false, repelled: 0, lost: 0, lastDay: 0, lastResult: '', stolen: 0 },
    toolWear: 0,
  };
}

/** Fill in PHASE 5 fields for saves made before them. */
export function migrateSettlement(raw: Partial<SettlementState> | undefined): SettlementState {
  const base = freshSettlement();
  const st = { ...base, ...(raw ?? {}) } as SettlementState;
  st.research = { ...base.research, ...(raw?.research ?? {}) };
  st.raid = { ...base.raid, ...(raw?.raid ?? {}) };
  st.raid.active = false; // a raid in progress does not survive a reload
  return st;
}

const PRODUCTION_INTERVAL = 20; // seconds of play time between production ticks
const ARRIVAL_INTERVAL = 40;
const DECOR_SHAPES = new Set(['well', 'planter', 'banner', 'lantern', 'rug', 'bookshelf', 'table', 'chair', 'fountain']);
/** Where in a house each resident sleeps (local offsets) - villagers inside are hidden anyway. */
export interface HomeSlot {
  piece: PlacedPiece;
  slot: number;
}

/** The player's settlement: villagers, housing, jobs, production, food, happiness, tiers and the market. */
export class SettlementSystem {
  private refreshTimer = 0;
  private growthTimer = 0;
  private warnedFull = false;

  constructor(private game: Game) {}

  get state(): SettlementState {
    return this.game.state.settlement;
  }

  // ── Geometry ────────────────────────────────────────────
  hall(): PlacedPiece | undefined {
    for (const p of this.game.building.pieces.values()) if (p.def.id === 'town_hall') return p;
    return undefined;
  }

  center(): THREE.Vector3 | null {
    const h = this.hall();
    return h ? new THREE.Vector3(h.state.x, h.state.y, h.state.z) : null;
  }

  /** Current settlement radius (grows with the town / city tiers). */
  radius(): number {
    return settlementRadius(this.state.tier);
  }

  inRadius(x: number, z: number): boolean {
    const h = this.hall();
    const R = this.radius();
    return !!h && (h.state.x - x) ** 2 + (h.state.z - z) ** 2 <= R * R;
  }

  private piecesInRadius(pred: (p: PlacedPiece) => boolean): PlacedPiece[] {
    const h = this.hall();
    if (!h) return [];
    const out: PlacedPiece[] = [];
    const R = this.radius();
    for (const p of this.game.building.pieces.values()) {
      if (!pred(p)) continue;
      if ((p.state.x - h.state.x) ** 2 + (p.state.z - h.state.z) ** 2 <= R * R) out.push(p);
    }
    return out;
  }

  beds(): PlacedPiece[] {
    return this.piecesInRadius((p) => p.def.shape === 'bed');
  }

  houses(): PlacedPiece[] {
    return this.piecesInRadius((p) => (p.def.housing ?? 0) > 1);
  }

  /** Every place a villager can live: one per bed, several per house. */
  homeSlots(): HomeSlot[] {
    const out: HomeSlot[] = [];
    for (const p of this.piecesInRadius((q) => (q.def.housing ?? 0) > 0)) for (let i = 0; i < (p.def.housing ?? 1); i++) out.push({ piece: p, slot: i });
    return out;
  }

  count(id: string): number {
    return this.piecesInRadius((p) => p.def.id === id).length;
  }

  workplaces(job: JobId): PlacedPiece[] {
    const ids = JOBS[job].workplaces;
    return this.piecesInRadius((p) => ids.includes(p.def.id));
  }

  warehouses(): PlacedPiece[] {
    return this.piecesInRadius((p) => p.def.id === 'warehouse');
  }

  tierName(): string {
    return TIERS.find((t) => t.level === this.state.tier)?.name ?? '정착지 없음';
  }

  capacity(): number {
    const t = TIERS.find((x) => x.level === this.state.tier);
    return Math.min(this.homeSlots().length, t?.capacity ?? 0);
  }

  // ── Warehouse ───────────────────────────────────────────
  warehouseCapacity(): number {
    return this.state.founded ? 100 + this.warehouses().length * 300 : 0;
  }

  warehouseUsed(): number {
    return Object.values(this.state.warehouse).reduce((a, n) => a + n, 0);
  }

  addToWarehouse(id: string, qty: number): number {
    const room = this.warehouseCapacity() - this.warehouseUsed();
    const n = Math.max(0, Math.min(qty, room));
    if (n > 0) this.state.warehouse[id] = (this.state.warehouse[id] ?? 0) + n;
    if (n < qty && !this.warnedFull) {
      this.warnedFull = true;
      this.log('창고가 가득 찼습니다. 창고를 더 짓거나 물건을 꺼내세요.');
      this.game.events.emit('notify', { text: '마을 창고가 가득 찼습니다', kind: 'warn' });
    }
    if (n === qty) this.warnedFull = false;
    return n;
  }

  takeFromWarehouse(id: string, qty: number): number {
    const have = this.state.warehouse[id] ?? 0;
    const n = Math.min(have, qty);
    if (n <= 0) return 0;
    this.state.warehouse[id] = have - n;
    if (this.state.warehouse[id] <= 0) delete this.state.warehouse[id];
    return n;
  }

  foodStock(): number {
    let f = 0;
    for (const [id, n] of Object.entries(this.state.warehouse)) f += (FOOD_VALUE[id] ?? 0) * n;
    return f;
  }

  /** Move every food item from the player's bag into the warehouse. */
  depositFood(): number {
    const inv = this.game.state.player.inventory;
    let moved = 0;
    for (let i = 0; i < inv.length; i++) {
      const s = inv[i];
      if (!s || FOOD_VALUE[s.id] === undefined) continue;
      const n = this.addToWarehouse(s.id, s.qty);
      s.qty -= n;
      moved += n;
      if (s.qty <= 0) inv[i] = null;
    }
    if (moved) this.game.events.emit('notify', { text: `창고에 음식 ${moved}개를 맡겼습니다`, kind: 'info' });
    this.game.bridge.bump();
    return moved;
  }

  /** Move one inventory slot into the warehouse. */
  depositSlot(index: number): number {
    const inv = this.game.state.player.inventory;
    const s = inv[index];
    if (!s || ITEMS[s.id]?.category === 'special') return 0;
    const n = this.addToWarehouse(s.id, s.qty);
    s.qty -= n;
    if (s.qty <= 0) inv[index] = null;
    this.game.bridge.bump();
    return n;
  }

  withdraw(id: string, qty = 99): number {
    const room = Inv.space(this.game.state.player.inventory, id);
    const n = this.takeFromWarehouse(id, Math.min(qty, room));
    if (n > 0) this.game.giveItem(id, n, 'transfer', false);
    else if (room <= 0) this.game.events.emit('notify', { text: '인벤토리가 가득 찼습니다', kind: 'warn' });
    this.game.bridge.bump();
    return n;
  }

  // ── Villagers ───────────────────────────────────────────
  log(text: string) {
    this.state.log.push({ day: this.game.env.day, text });
    if (this.state.log.length > 40) this.state.log.splice(0, this.state.log.length - 40);
  }

  villager(id: number): Villager | undefined {
    return this.state.villagers.find((v) => v.id === id);
  }

  employedCount(): number {
    return this.state.villagers.filter((v) => v.job && v.workId !== null).length;
  }

  averageHappiness(): number {
    const vs = this.state.villagers;
    return vs.length ? vs.reduce((a, v) => a + v.happiness, 0) / vs.length : 50;
  }

  /** Workplaces of a job not yet taken by someone. */
  freeWorkplaces(job: JobId): PlacedPiece[] {
    const taken = new Set(this.state.villagers.map((v) => v.workId));
    return this.workplaces(job).filter((p) => !taken.has(p.state.id));
  }

  assignJob(villagerId: number, job: JobId | null): boolean {
    const v = this.villager(villagerId);
    if (!v) return false;
    if (job === null) {
      v.job = null;
      v.workId = null;
      this.game.villagers.refreshLook(v.id);
      this.game.bridge.bump();
      return true;
    }
    if (v.job === job && v.workId !== null) return true;
    const free = this.freeWorkplaces(job);
    if (!free.length) {
      this.game.events.emit('notify', { text: `${JOBS[job].name}의 빈 일터(${JOBS[job].workplaces.map((w) => BUILDABLE_BY_ID[w].name).join('/')})가 없습니다`, kind: 'warn' });
      return false;
    }
    v.job = job;
    v.workId = free[0].state.id;
    this.log(`${v.name}이(가) ${JOBS[job].name} 일을 맡았습니다.`);
    this.game.villagers.refreshLook(v.id);
    this.refresh();
    this.game.bridge.bump();
    return true;
  }

  /** Give every unemployed villager a job, filling open workplaces in priority order. */
  autoAssign(): number {
    let n = 0;
    for (const v of this.state.villagers) {
      if (v.job && v.workId !== null) continue;
      for (const job of JOB_ORDER) {
        if (this.freeWorkplaces(job).length) {
          this.assignJob(v.id, job);
          n++;
          break;
        }
      }
    }
    if (n === 0) this.game.events.emit('notify', { text: '배정할 수 있는 빈 일터가 없습니다', kind: 'warn' });
    return n;
  }

  private arrive() {
    const st = this.state;
    const h = this.hall()!;
    const used = new Set(st.villagers.map((v) => v.name));
    const pool = FIRST_NAMES.filter((n) => !used.has(n));
    const name = pool.length ? pool[Math.floor(Math.random() * pool.length)] : `주민 ${st.nextId}`;
    const a = Math.random() * Math.PI * 2;
    const x = h.state.x + Math.cos(a) * 16;
    const z = h.state.z + Math.sin(a) * 16;
    const v: Villager = {
      id: st.nextId++,
      name,
      job: null,
      workId: null,
      homeId: null,
      x,
      y: this.game.terrain.heightAt(x, z),
      z,
      happiness: 60,
      fed: true,
      look: Math.floor(Math.random() * 1e6),
      arrivedDay: this.game.env.day,
      sadDays: 0,
    };
    st.villagers.push(v);
    this.assignHomes();
    this.log(`${name}이(가) 마을에 정착했습니다.`);
    this.game.events.emit('banner', { title: '새로운 주민', subtitle: `${name}이(가) ${st.name}에 도착했습니다`, kind: 'info' });
    this.game.audio.play('quest');
    this.game.villagers.sync();
    this.refresh();
  }

  /** Debug / tests: force a villager to arrive if there is room. */
  forceArrival(): boolean {
    if (!this.state.founded || this.state.villagers.length >= this.capacity()) return false;
    this.arrive();
    return true;
  }

  private assignHomes() {
    const slots = this.homeSlots();
    const key = (id: number, slot: number) => `${id}:${slot}`;
    const valid = new Set(slots.map((s) => key(s.piece.state.id, s.slot)));
    const vs = this.state.villagers;
    for (const v of vs) if (v.homeId !== null && !valid.has(key(v.homeId, v.homeSlot ?? 0))) v.homeId = null;
    const taken = new Set(vs.filter((v) => v.homeId !== null).map((v) => key(v.homeId!, v.homeSlot ?? 0)));
    for (const v of vs) {
      if (v.homeId !== null) continue;
      // prefer houses (more comfortable) over loose beds
      const free = slots.filter((s) => !taken.has(key(s.piece.state.id, s.slot))).sort((a, b) => (b.piece.def.housing ?? 1) - (a.piece.def.housing ?? 1))[0];
      if (!free) break;
      v.homeId = free.piece.state.id;
      v.homeSlot = free.slot;
      taken.add(key(free.piece.state.id, free.slot));
    }
  }

  private validateJobs() {
    for (const v of this.state.villagers) {
      if (v.workId !== null && !this.game.building.pieces.has(v.workId)) v.workId = null;
      if (v.job && v.workId === null) {
        const free = this.freeWorkplaces(v.job as JobId);
        if (free.length) v.workId = free[0].state.id;
      }
    }
  }

  private happinessTarget(v: Villager): number {
    const b = this.game.building;
    let h = 45;
    const bed = v.homeId !== null ? b.pieces.get(v.homeId) : undefined;
    if (bed && (bed.def.housing ?? 1) > 1) {
      // a proper house: roofed and furnished
      h += 18 + (bed.def.material === 'stone' ? 8 : 4);
    } else if (bed) {
      h += 10;
      // roofed home and comfortable surroundings
      const ray = new THREE.Raycaster(new THREE.Vector3(bed.state.x, bed.state.y + 1, bed.state.z), new THREE.Vector3(0, 1, 0), 0, 8);
      ray.camera = this.game.camera;
      if (ray.intersectObject(b.group, true).some((x) => (x.object as THREE.Mesh).isMesh)) h += 8;
      const kinds = new Set<string>();
      for (const p of b.pieces.values()) {
        if (p.def.comfort && (p.state.x - bed.state.x) ** 2 + (p.state.z - bed.state.z) ** 2 < 64) kinds.add(p.def.shape);
      }
      h += Math.min(8, kinds.size * 2);
    } else h -= 20;
    h += v.fed ? 8 : -25;
    if (v.job && v.workId !== null) h += 5;
    const decor = new Set(this.piecesInRadius((p) => DECOR_SHAPES.has(p.def.shape)).map((p) => p.def.shape));
    const civ = this.game.civ;
    h += Math.min(civ.has('t_architecture') ? 18 : 12, decor.size * 3);
    if (this.count('fountain') > 0) h += 6;
    if (this.piecesInRadius((p) => p.def.shape === 'road').length >= 8) h += 5;
    // PHASE 5: taxes, safety, injuries, wages
    h += TAX_LEVELS[this.state.taxLevel]?.happiness ?? 0;
    if (this.workplaces('guard').length > 0) h += 3;
    const day = this.game.env.day;
    if (v.hurtDay !== undefined && day - v.hurtDay <= 1) h -= 10;
    const raid = this.state.raid;
    if (raid.lastResult === 'lost' && day - raid.lastDay <= 1) h -= 8;
    if (v.job === 'guard' && v.unpaidDay !== undefined && day - v.unpaidDay <= 0) h -= 15;
    return Math.max(0, Math.min(100, h));
  }

  private checkTier() {
    const st = this.state;
    if (!st.founded) return;
    const pop = st.villagers.length;
    const jobKinds = JOB_ORDER.filter((j) => this.workplaces(j).length > 0).length;
    let tier = 1;
    if (pop >= 4 && this.warehouses().length > 0 && jobKinds >= 2) tier = 2;
    if (tier >= 2 && pop >= 8 && this.averageHappiness() >= 60 && this.workplaces('merchant').length > 0 && st.charter) tier = 3;
    const civ = this.game.civ;
    if (tier >= 3 && pop >= 14 && civ.era() >= 2 && this.workplaces('guard').length > 0 && this.averageHappiness() >= 55) tier = 4;
    if (tier >= 4 && pop >= 22 && civ.era() >= 3 && civ.has('t_administration') && this.count('fountain') > 0 && this.averageHappiness() >= 60) tier = 5;
    // tiers are never lost, but each one needs the previous
    tier = Math.min(tier, st.tier + 1);
    if (tier > st.tier) {
      const oldR = this.radius();
      st.tier = tier;
      const name = this.tierName();
      this.log(`정착지가 "${name}" 단계로 성장했습니다.`);
      const grow = this.radius() > oldR ? ` · 정착지 반경 ${this.radius()}m` : '';
      this.game.events.emit('banner', { title: name, subtitle: `${st.name}이(가) 성장했습니다 · 수용 인원 ${TIERS[tier - 1].capacity}명${grow}`, kind: 'level' });
      if (tier === 2 && st.raid.nextDay === 0) st.raid.nextDay = this.game.env.day + 2;
      this.game.audio.play('levelup');
      this.game.refreshUnlocks();
    }
  }

  /** Re-evaluate homes, jobs, happiness, tier and quest counters. */
  refresh() {
    const st = this.state;
    const hall = this.hall();
    if (hall && !st.founded) {
      st.founded = true;
      st.hallId = hall.state.id;
      if (st.tier < 1) st.tier = 1;
      st.lastDay = this.game.env.day;
      this.log(`${st.name}이(가) 세워졌습니다.`);
      this.game.events.emit('banner', { title: st.name, subtitle: '정착지를 세웠다 · 침대를 놓으면 주민이 찾아온다', kind: 'discover' });
      this.game.refreshUnlocks();
    } else if (!hall && st.founded) {
      st.founded = false;
      st.hallId = null;
      this.log('마을 회관이 사라져 정착지가 멈췄습니다.');
      this.game.events.emit('notify', { text: '마을 회관이 없어 정착지가 멈췄습니다', kind: 'warn' });
    } else if (hall) st.hallId = hall.state.id;
    if (!st.founded) return;
    // coins used to be stored in the warehouse; they now live in the treasury
    if ((st.warehouse.coin ?? 0) > 0) {
      st.treasury += st.warehouse.coin;
      delete st.warehouse.coin;
    }
    this.assignHomes();
    this.validateJobs();
    for (const v of st.villagers) {
      const target = this.happinessTarget(v);
      v.happiness += (target - v.happiness) * 0.35;
    }
    this.checkTier();
    const c = this.game.state.counters;
    c['village:pop'] = Math.max(c['village:pop'] ?? 0, st.villagers.length);
    c['village:employed'] = Math.max(c['village:employed'] ?? 0, this.employedCount());
    c['village:tier'] = Math.max(c['village:tier'] ?? 0, st.tier);
    c['civ:era'] = Math.max(c['civ:era'] ?? 0, this.game.civ.era());
    c['tech:count'] = Math.max(c['tech:count'] ?? 0, st.research.done.length);
    this.game.quests.check();
  }

  useCharter(): boolean {
    const st = this.state;
    if (!st.founded || st.charter) return false;
    if (!Inv.remove(this.game.state.player.inventory, 'settlement_charter', 1)) {
      this.game.events.emit('notify', { text: '정착 헌장이 없습니다 (폐허의 수호자 처치 보상)', kind: 'warn' });
      return false;
    }
    st.charter = true;
    this.log('정착 헌장을 회관에 걸었습니다. 이제 발전된 마을로 성장할 수 있습니다.');
    this.game.events.emit('notify', { text: '정착 헌장을 사용했습니다', kind: 'unlock' });
    this.refresh();
    this.game.bridge.bump();
    return true;
  }

  // ── Production & upkeep ─────────────────────────────────
  /** A worker uses tool kits from the warehouse for extra output (one kit lasts 5 uses). */
  private useTools(): number {
    const st = this.state;
    if (st.toolWear <= 0) {
      if (this.takeFromWarehouse('tool_kit', 1) <= 0) return 0;
      st.toolWear = 5;
    }
    st.toolWear--;
    return 2;
  }

  private produce() {
    const st = this.state;
    const b = this.game.building;
    const civ = this.game.civ;
    const c = this.game.state.counters;
    for (const v of st.villagers) {
      if (!v.job || v.workId === null || !this.game.villagers.isWorking(v.id)) continue;
      if (v.happiness < 30 && Math.random() < 0.5) continue;
      const bonus = (v.happiness > 70 && Math.random() < 0.25 ? 1 : 0) + (TOOL_JOBS.includes(v.job as JobId) ? this.useTools() : 0);
      switch (v.job as JobId) {
        case 'farmer': {
          const plot = b.pieces.get(v.workId);
          if (!plot) break;
          plot.state.growth = Math.min(1, (plot.state.growth ?? 0) + 0.34);
          if (plot.state.growth >= 1) {
            plot.state.growth = 0;
            this.addToWarehouse('wheat', 4 + bonus + (civ.has('t_agriculture') ? 2 : 0));
          }
          break;
        }
        case 'woodcutter':
          this.addToWarehouse('wood', 2 + bonus);
          break;
        case 'miner':
          this.addToWarehouse('stone', 2 + bonus);
          if (Math.random() < 0.25 + (bonus >= 2 ? 0.15 : 0)) this.addToWarehouse('copper_ore', 1);
          break;
        case 'scholar': {
          const desk = b.pieces.get(v.workId);
          let shelves = 0;
          if (desk) for (const p of b.pieces.values()) if (p.def.shape === 'bookshelf' && (p.state.x - desk.state.x) ** 2 + (p.state.z - desk.state.z) ** 2 < 36) shelves++;
          civ.addPoints(2 + Math.min(2, shelves) + (civ.has('t_writing') ? 1 : 0) + bonus);
          break;
        }
        case 'sawyer':
          if ((st.warehouse.wood ?? 0) >= 3) {
            this.takeFromWarehouse('wood', 3);
            this.addToWarehouse('plank', 2 + bonus);
          }
          break;
        case 'smelter':
          if ((st.warehouse.copper_ore ?? 0) >= 2 && (st.warehouse.wood ?? 0) >= 1) {
            this.takeFromWarehouse('copper_ore', 2);
            this.takeFromWarehouse('wood', 1);
            this.addToWarehouse('copper_ingot', 1 + bonus);
          }
          break;
        case 'smith':
          if ((st.warehouse.copper_ingot ?? 0) >= 1 && (st.warehouse.plank ?? 0) >= 1) {
            this.takeFromWarehouse('copper_ingot', 1);
            this.takeFromWarehouse('plank', 1);
            this.addToWarehouse('tool_kit', 1);
            c['village:tool_kit'] = (c['village:tool_kit'] ?? 0) + 1;
          }
          break;
        case 'guard':
          break;
        case 'artisan':
          if ((st.warehouse.stone ?? 0) >= 3) {
            this.takeFromWarehouse('stone', 3);
            this.addToWarehouse('stone_brick', 2 + bonus);
          }
          break;
        case 'cook':
          if ((st.warehouse.wheat ?? 0) >= 3) {
            this.takeFromWarehouse('wheat', 3);
            this.addToWarehouse('bread', 2 + bonus);
          } else if ((st.warehouse.raw_meat ?? 0) >= 1) {
            this.takeFromWarehouse('raw_meat', 1);
            this.addToWarehouse('cooked_meat', 1);
          }
          break;
        case 'merchant':
          st.treasury += 1 + bonus + (civ.has('t_currency') ? 1 : 0) + (civ.has('t_trade') ? 1 : 0);
          break;
      }
    }
    this.game.quests.check();
    this.game.bridge.bump();
  }

  /** Once per in-game day: villagers eat; hungry or miserable villagers may leave. */
  private dailyUpkeep() {
    const st = this.state;
    const order = ['bread', 'cooked_meat', 'berry', 'wheat', 'raw_meat'];
    let hungry = 0;
    for (const v of st.villagers) {
      let need = 1;
      for (const id of order) {
        while (need > 0 && (st.warehouse[id] ?? 0) > 0) {
          this.takeFromWarehouse(id, 1);
          need -= FOOD_VALUE[id];
        }
        if (need <= 0) break;
      }
      v.fed = need <= 0;
      if (!v.fed) hungry++;
      v.sadDays = v.happiness < 15 ? v.sadDays + 1 : 0;
    }
    if (hungry) {
      this.log(`음식이 부족해 주민 ${hungry}명이 굶었습니다.`);
      this.game.events.emit('notify', { text: `마을 주민 ${hungry}명이 굶주리고 있습니다`, kind: 'warn' });
    }
    const leaving = st.villagers.filter((v) => v.sadDays >= 2);
    for (const v of leaving) {
      st.villagers = st.villagers.filter((x) => x !== v);
      this.log(`${v.name}이(가) 불행해서 마을을 떠났습니다.`);
      this.game.events.emit('notify', { text: `${v.name}이(가) 마을을 떠났습니다`, kind: 'warn' });
    }
    if (leaving.length) this.game.villagers.sync();
    this.collectTaxes();
    this.payWages();
    this.game.defense.onNewDay();
    this.refresh();
  }

  // ── Treasury ────────────────────────────────────────────
  taxIncome(): number {
    const lvl = TAX_LEVELS[this.state.taxLevel] ?? TAX_LEVELS[0];
    return Math.floor(lvl.perVillager * this.state.villagers.length * (this.game.civ.has('t_administration') ? 1.5 : 1));
  }

  wageCost(): number {
    return this.state.villagers.filter((v) => v.job === 'guard' && v.workId !== null).length * GUARD_WAGE;
  }

  setTaxLevel(level: number): boolean {
    if (level > 0 && !this.game.civ.has('t_currency')) {
      this.game.events.emit('notify', { text: '세금을 걷으려면 "화폐"를 연구해야 합니다', kind: 'warn' });
      return false;
    }
    this.state.taxLevel = Math.max(0, Math.min(TAX_LEVELS.length - 1, level));
    this.log(`세율을 "${TAX_LEVELS[this.state.taxLevel].name}"(으)로 정했습니다.`);
    this.refresh();
    this.game.bridge.bump();
    return true;
  }

  private collectTaxes() {
    const n = this.taxIncome();
    if (n <= 0) return;
    this.state.treasury += n;
    const c = this.game.state.counters;
    c['tax:collected'] = (c['tax:collected'] ?? 0) + n;
    this.log(`세금 ${n} 은화를 걷었습니다.`);
  }

  private payWages() {
    const st = this.state;
    const day = this.game.env.day;
    const guards = st.villagers.filter((v) => v.job === 'guard' && v.workId !== null);
    let unpaid = 0;
    for (const g of guards) {
      if (st.treasury >= GUARD_WAGE) {
        st.treasury -= GUARD_WAGE;
        g.unpaidDay = undefined;
      } else {
        g.unpaidDay = day;
        unpaid++;
      }
    }
    if (unpaid) {
      this.log(`금고가 비어 경비병 ${unpaid}명이 급료를 받지 못해 일을 쉽니다.`);
      this.game.events.emit('notify', { text: `급료를 받지 못한 경비병 ${unpaid}명이 일을 쉽니다`, kind: 'warn' });
    }
  }

  /** Guards without pay stay home. */
  onStrike(v: Villager): boolean {
    return v.job === 'guard' && v.unpaidDay !== undefined && v.unpaidDay === this.game.env.day;
  }

  depositCoins(qty: number): number {
    const inv = this.game.state.player.inventory;
    const n = Math.min(qty, Inv.count(inv, 'coin'));
    if (n <= 0) {
      this.game.events.emit('notify', { text: '맡길 은화가 없습니다', kind: 'warn' });
      return 0;
    }
    Inv.remove(inv, 'coin', n);
    this.state.treasury += n;
    this.game.audio.play('pickup');
    this.game.bridge.bump();
    return n;
  }

  withdrawCoins(qty: number): number {
    const n = Math.min(qty, this.state.treasury);
    if (n <= 0) return 0;
    this.state.treasury -= n;
    this.game.giveItem('coin', n, 'transfer', false);
    this.game.bridge.bump();
    return n;
  }

  private tryArrival() {
    const st = this.state;
    if (!st.founded || st.villagers.length >= this.capacity()) return;
    if (st.villagers.length > 0 && (this.foodStock() < 1 || this.averageHappiness() < 35)) return;
    if (st.villagers.length === 0 && this.foodStock() < 1 && this.warehouses().length === 0) return;
    this.arrive();
  }

  private updateCrops(dt: number) {
    for (const p of this.game.building.pieces.values()) {
      if (p.def.shape !== 'farm_plot') continue;
      // plots grow slowly on their own; a working farmer speeds them up (see produce)
      p.state.growth = Math.min(1, (p.state.growth ?? 0) + dt / (this.game.civ.has('t_agriculture') ? 150 : 300));
      const crops = p.obj.object.getObjectByName('crops');
      if (crops) {
        const g = p.state.growth ?? 0;
        crops.scale.set(1, 0.15 + 0.85 * g, 1);
        const head = crops.userData.head as THREE.MeshStandardMaterial | undefined;
        if (head) head.color.setHex(g >= 1 ? 0xe3c25a : 0x9ab84a);
      }
    }
  }

  /** Player harvests a ripe plot by hand. */
  harvestPlot(p: PlacedPiece) {
    const g = p.state.growth ?? 0;
    if (g < 1) {
      this.game.events.emit('notify', { text: `아직 자라는 중입니다 (${Math.floor(g * 100)}%)`, kind: 'info' });
      return;
    }
    p.state.growth = 0;
    this.game.giveItem('wheat', 3, 'gather');
    this.game.audio.play('pick');
    this.game.particles.burst(new THREE.Vector3(p.state.x, p.state.y + 0.6, p.state.z), 0xe3c25a, 12, 2.5, 0.08);
  }

  update(dt: number) {
    const st = this.state;
    this.growthTimer += dt;
    if (this.growthTimer >= 1) {
      this.updateCrops(this.growthTimer);
      this.growthTimer = 0;
    }
    this.refreshTimer -= dt;
    if (this.refreshTimer <= 0) {
      this.refreshTimer = 3;
      this.refresh();
    }
    if (!st.founded) return;
    st.productionTimer += dt;
    if (st.productionTimer >= PRODUCTION_INTERVAL) {
      st.productionTimer = 0;
      this.produce();
    }
    st.arrivalTimer += dt;
    if (st.arrivalTimer >= ARRIVAL_INTERVAL) {
      st.arrivalTimer = 0;
      this.tryArrival();
    }
    if (this.game.env.day !== st.lastDay) {
      st.lastDay = this.game.env.day;
      this.dailyUpkeep();
    }
  }

  // ── Market ──────────────────────────────────────────────
  marketOpen(): boolean {
    return this.state.villagers.some((v) => v.job === 'merchant' && v.workId !== null);
  }

  coins(): number {
    return Inv.count(this.game.state.player.inventory, 'coin');
  }

  sellPrice(id: string): number {
    const d = ITEMS[id];
    if (!d || d.category === 'special') return 0;
    return Math.max(1, Math.floor(d.value * (this.game.civ.has('t_trade') ? 0.75 : SELL_RATE)));
  }

  buyPrice(id: string): number {
    const s = MARKET_STOCK.find((x) => x.item === id);
    if (!s) return 0;
    // happy towns give better prices
    return Math.max(1, Math.round(s.price * (this.averageHappiness() >= 70 ? 0.9 : 1) * (this.game.civ.has('t_trade') ? 0.85 : 1)));
  }

  buy(id: string): boolean {
    if (!this.marketOpen()) return false;
    const price = this.buyPrice(id);
    const inv = this.game.state.player.inventory;
    if (!price || Inv.count(inv, 'coin') < price) {
      this.game.events.emit('notify', { text: '은화가 부족합니다', kind: 'warn' });
      this.game.audio.play('deny');
      return false;
    }
    if (Inv.space(inv, id) <= 0) {
      this.game.events.emit('notify', { text: '인벤토리가 가득 찼습니다', kind: 'warn' });
      return false;
    }
    Inv.remove(inv, 'coin', price);
    this.game.giveItem(id, 1, 'transfer', false);
    this.afterTrade(`${itemName(id)} 구매 (-${price} 은화)`);
    return true;
  }

  sell(index: number, all = false): boolean {
    if (!this.marketOpen()) return false;
    const inv = this.game.state.player.inventory;
    const s = inv[index];
    if (!s) return false;
    const price = this.sellPrice(s.id);
    if (!price) {
      this.game.events.emit('notify', { text: '이 물건은 팔 수 없습니다', kind: 'warn' });
      return false;
    }
    const qty = all ? s.qty : 1;
    const id = s.id;
    Inv.remove(inv, id, qty);
    Inv.add(inv, 'coin', price * qty);
    this.afterTrade(`${itemName(id)} ${qty}개 판매 (+${price * qty} 은화)`);
    return true;
  }

  private afterTrade(text: string) {
    const c = this.game.state.counters;
    c.trade = (c.trade ?? 0) + 1;
    this.game.audio.play('pickup');
    this.game.events.emit('notify', { text, kind: 'item', icon: 'coin' });
    this.game.quests.check();
    this.game.bridge.bump();
  }
}

export { SETTLEMENT_RADIUS };
