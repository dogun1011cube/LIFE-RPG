import * as THREE from 'three';
import { WORLD } from '../config';
import { ITEMS, itemName } from '../data/items';
import { boxGeo, clothTexture, woodTexture } from '../world/textures';
import { Inv } from './Inventory';
import type { PlacedPiece } from './Building';
import type { Game } from '../Game';

/** 해풍 상단 (the Seawind Company): a merchant ship that visits your dock. */
export const FACTION_NAME = '해풍 상단';

export const REP_LEVELS: { min: number; name: string }[] = [
  { min: 0, name: '낯선 이' },
  { min: 20, name: '거래처' },
  { min: 50, name: '단골' },
  { min: 80, name: '동맹' },
];

/** Goods on the ship; `rep` = reputation needed. */
export const SHIP_STOCK: { item: string; price: number; rep: number }[] = [
  { item: 'iron_ingot', price: 24, rep: 0 },
  { item: 'charcoal', price: 4, rep: 0 },
  { item: 'ember_fruit', price: 9, rep: 0 },
  { item: 'health_potion', price: 26, rep: 0 },
  { item: 'spice', price: 15, rep: 0 },
  { item: 'boat', price: 90, rep: 20 },
  { item: 'leather', price: 12, rep: 20 },
  { item: 'sail_upgrade', price: 120, rep: 50 },
  { item: 'obsidian', price: 45, rep: 50 },
  { item: 'seawind_charm', price: 260, rep: 80 },
];

/** Things the company pays extra for (multiplier on the item's base value). */
export const SHIP_DEMAND: Record<string, number> = { tool_kit: 1.2, plank: 1.1, bread: 1.2, stone_brick: 1.1, crystal: 1.0, copper_ingot: 1.0, wolf_pelt: 1.1, leather: 1.0 };

type ShipPhase = 'away' | 'arriving' | 'docked' | 'leaving';

export interface FactionState {
  rep: number;
  visits: number;
  nextVisitDay: number;
  traded: number;
}

export function freshFaction(): FactionState {
  return { rep: 0, visits: 0, nextVisitDay: 0, traded: 0 };
}

const ARRIVE_HOUR = 8;
const LEAVE_HOUR = 19;
const SAIL_TIME = 22;

export class TradeShipSystem {
  readonly group = new THREE.Group();
  phase: ShipPhase = 'away';
  private t = 0;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private yaw = 0;
  private dockId: number | null = null;
  private lastHour = -1;
  private bob = 0;

  constructor(private game: Game) {
    this.group.name = 'tradeShip';
    this.group.visible = false;
    const wood = new THREE.MeshStandardMaterial({ color: 0xffffff, map: woodTexture('#6a4426'), roughness: 0.85 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x2c4a8a, roughness: 0.7 });
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: clothTexture('#efe6cc'), roughness: 0.95, side: THREE.DoubleSide });
    const emblem = new THREE.MeshStandardMaterial({ color: 0x2c6a9a, roughness: 0.8, side: THREE.DoubleSide });
    const hull = new THREE.Mesh(boxGeo(4.2, 2.2, 14, 2), wood);
    const hp = hull.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < hp.count; i++) {
      const z = hp.getZ(i);
      const y = hp.getY(i);
      const taper = z > 3 ? 1 - (z - 3) / 5 : z < -5 ? 1 - (-5 - z) / 6 : 1;
      hp.setX(i, hp.getX(i) * Math.max(0.12, taper) * (y < 0 ? 0.7 : 1));
    }
    hull.geometry.computeVertexNormals();
    hull.position.y = 0.4;
    const deck = new THREE.Mesh(boxGeo(3.6, 0.2, 10, 2), wood);
    deck.position.set(0, 1.45, -0.6);
    const stripe = new THREE.Mesh(boxGeo(4.25, 0.3, 9.5, 1), trim);
    stripe.position.set(0, 1.1, -0.6);
    const cabin = new THREE.Mesh(boxGeo(3, 1.6, 2.6, 2), wood);
    cabin.position.set(0, 2.3, -4.6);
    this.group.add(hull, deck, stripe, cabin);
    for (const [z, h] of [
      [1.8, 9],
      [-2.2, 7.5],
    ] as const) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, h, 7), wood);
      mast.position.set(0, 1.5 + h / 2, z);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(3.6, h * 0.55, 1, 3), sailMat);
      sail.position.set(0, 1.5 + h * 0.58, z + 0.2);
      sail.rotation.y = Math.PI / 2;
      const crest = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), emblem);
      crest.position.set(0.02, 1.5 + h * 0.6, z + 0.2);
      crest.rotation.y = Math.PI / 2;
      this.group.add(mast, sail, crest);
    }
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffb050, emissiveIntensity: 1.6 }));
    lantern.position.set(0, 3.4, -6);
    this.group.add(lantern);
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    game.scene.add(this.group);
  }

  get faction(): FactionState {
    return this.game.state.faction;
  }

  repLevel(): { min: number; name: string } {
    let l = REP_LEVELS[0];
    for (const r of REP_LEVELS) if (this.faction.rep >= r.min) l = r;
    return l;
  }

  /** A dock inside the settlement (or any dock at all). */
  findDock(): PlacedPiece | null {
    const docks = [...this.game.building.pieces.values()].filter((p) => p.def.id === 'dock');
    if (!docks.length) return null;
    const inTown = docks.find((d) => this.game.settlement.inRadius(d.state.x, d.state.z));
    return inTown ?? docks[0];
  }

  private mooring(d: PlacedPiece): { pos: THREE.Vector3; yaw: number } {
    const s = Math.sin(d.state.rot);
    const c = Math.cos(d.state.rot);
    // alongside the sea end of the pier, pointing along it
    const side = 3.4;
    const along = 4.5;
    return { pos: new THREE.Vector3(d.state.x + s * along + c * side, WORLD.waterLevel, d.state.z + c * along - s * side), yaw: d.state.rot };
  }

  isDocked(): boolean {
    return this.phase === 'docked';
  }

  /** Is the player close enough to trade? */
  canTrade(pos: THREE.Vector3): boolean {
    return this.phase === 'docked' && Math.hypot(pos.x - this.group.position.x, pos.z - this.group.position.z) < 9;
  }

  /** Schedule: the first visit two days after a dock exists, then every three days. */
  private onNewHour(hour: number) {
    const f = this.faction;
    const day = this.game.env.day;
    const dock = this.findDock();
    if (!dock) return;
    if (f.nextVisitDay === 0) {
      f.nextVisitDay = day + 1;
      this.game.events.emit('notify', { text: `선착장 소식이 퍼졌다. ${FACTION_NAME}의 배가 곧 들를 것이다`, kind: 'info' });
    }
    if (hour === ARRIVE_HOUR && day >= f.nextVisitDay && this.phase === 'away') this.arrive(dock);
    if (hour === LEAVE_HOUR && this.phase === 'docked') this.leave();
  }

  arrive(dock = this.findDock()) {
    if (!dock) return false;
    const m = this.mooring(dock);
    this.dockId = dock.state.id;
    this.to.copy(m.pos);
    const s = Math.sin(m.yaw);
    const c = Math.cos(m.yaw);
    this.from.set(m.pos.x + s * 140, WORLD.waterLevel, m.pos.z + c * 140);
    this.yaw = m.yaw + Math.PI;
    this.phase = 'arriving';
    this.t = 0;
    this.group.visible = true;
    this.group.position.copy(this.from);
    this.faction.visits++;
    this.faction.nextVisitDay = this.game.env.day + 3;
    this.game.events.emit('banner', { title: `${FACTION_NAME}의 배`, subtitle: '교역선이 선착장으로 들어온다 · 저녁 7시까지 머문다', kind: 'discover' });
    this.game.audio.play('bell', 0.5);
    return true;
  }

  leave() {
    if (this.phase !== 'docked') return;
    this.phase = 'leaving';
    this.t = 0;
    this.from.copy(this.group.position);
    const s = Math.sin(this.yaw + Math.PI);
    const c = Math.cos(this.yaw + Math.PI);
    this.to.set(this.from.x + s * 160, WORLD.waterLevel, this.from.z + c * 160);
    this.yaw += Math.PI;
    this.game.events.emit('notify', { text: `${FACTION_NAME}의 배가 떠난다. 다음 방문: ${this.faction.nextVisitDay}일차`, kind: 'info' });
    if (this.game.ui.panel === 'ship') this.game.closePanel();
  }

  update(dt: number) {
    const game = this.game;
    this.bob += dt;
    const hour = Math.floor(game.env.hours);
    if (this.lastHour !== -1 && hour !== this.lastHour) this.onNewHour(hour);
    this.lastHour = hour;
    if (this.phase === 'away') {
      this.group.visible = false;
      return;
    }
    if (this.dockId !== null && !game.building.pieces.has(this.dockId) && this.phase !== 'leaving') this.leave();
    if (this.phase === 'arriving' || this.phase === 'leaving') {
      this.t += dt / SAIL_TIME;
      const k = this.phase === 'arriving' ? 1 - Math.pow(1 - Math.min(1, this.t), 2) : Math.min(1, this.t) ** 2;
      this.group.position.lerpVectors(this.from, this.to, k);
      if (this.t >= 1) {
        if (this.phase === 'arriving') this.phase = 'docked';
        else {
          this.phase = 'away';
          this.group.visible = false;
        }
      }
    }
    this.group.position.y = WORLD.waterLevel - 0.6 + Math.sin(this.bob * 0.9) * 0.08;
    this.group.rotation.set(Math.sin(this.bob * 0.7) * 0.015, this.yaw, Math.sin(this.bob * 0.8) * 0.02);
  }

  // ── Trading ─────────────────────────────────────────────
  buyPrice(item: string): number {
    const s = SHIP_STOCK.find((x) => x.item === item);
    if (!s) return 0;
    return Math.max(1, Math.round(s.price * (1 - Math.min(0.25, this.faction.rep * 0.003))));
  }

  sellPrice(item: string): number {
    const d = ITEMS[item];
    if (!d || d.category === 'special') return 0;
    return Math.max(1, Math.floor(d.value * (SHIP_DEMAND[item] ?? 0.5) * (1 + Math.min(0.2, this.faction.rep * 0.002))));
  }

  private gainRep(value: number) {
    const f = this.faction;
    f.traded += value;
    const before = this.repLevel().name;
    f.rep = Math.min(100, Math.floor(f.traded / 12));
    const after = this.repLevel().name;
    const c = this.game.state.counters;
    c['ship:trade'] = (c['ship:trade'] ?? 0) + 1;
    c['faction:rep'] = Math.max(c['faction:rep'] ?? 0, f.rep);
    if (after !== before) this.game.events.emit('banner', { title: `${FACTION_NAME}: ${after}`, subtitle: '새로운 물건을 살 수 있게 되었다', kind: 'level' });
    this.game.quests.check();
  }

  buy(item: string): boolean {
    const s = SHIP_STOCK.find((x) => x.item === item);
    const inv = this.game.state.player.inventory;
    if (!s || !this.isDocked()) return false;
    if (this.faction.rep < s.rep) {
      this.game.events.emit('notify', { text: `평판 ${s.rep} 이상이어야 살 수 있습니다`, kind: 'warn' });
      return false;
    }
    const price = this.buyPrice(item);
    if (Inv.count(inv, 'coin') < price) {
      this.game.events.emit('notify', { text: '은화가 부족합니다', kind: 'warn' });
      this.game.audio.play('deny');
      return false;
    }
    if (Inv.space(inv, item) <= 0) {
      this.game.events.emit('notify', { text: '인벤토리가 가득 찼습니다', kind: 'warn' });
      return false;
    }
    Inv.remove(inv, 'coin', price);
    this.game.giveItem(item, 1, 'transfer', false);
    this.game.audio.play('pickup');
    this.game.events.emit('notify', { text: `${itemName(item)} 구매 (-${price} 은화)`, kind: 'item', icon: item });
    this.gainRep(price);
    this.game.bridge.bump();
    return true;
  }

  sell(index: number, all = false): boolean {
    const inv = this.game.state.player.inventory;
    const s = inv[index];
    if (!s || !this.isDocked()) return false;
    const price = this.sellPrice(s.id);
    if (!price) {
      this.game.events.emit('notify', { text: '이 물건은 팔 수 없습니다', kind: 'warn' });
      return false;
    }
    const qty = all ? s.qty : 1;
    const id = s.id;
    Inv.remove(inv, id, qty);
    Inv.add(inv, 'coin', price * qty);
    this.game.audio.play('pickup');
    this.game.events.emit('notify', { text: `${itemName(id)} ${qty}개 판매 (+${price * qty} 은화)`, kind: 'item', icon: 'coin' });
    this.gainRep(price * qty);
    this.game.bridge.bump();
    return true;
  }

  serialize() {
    return { phase: this.phase };
  }

  reset() {
    this.phase = 'away';
    this.group.visible = false;
    this.lastHour = -1;
    this.dockId = null;
  }
}
