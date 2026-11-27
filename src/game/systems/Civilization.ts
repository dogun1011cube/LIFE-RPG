import { ERAS, TECHS, TECH_BY_ID, type EraLevel, type TechDef } from '../data/techs';
import { RESEARCH_DONATIONS } from '../data/village';
import { itemName } from '../data/items';
import { Inv } from './Inventory';
import type { Game } from '../Game';

export type TechStatus = 'done' | 'available' | 'locked';

/** Research and eras. The data lives in SettlementState.research so it saves with the town. */
export class CivSystem {
  constructor(private game: Game) {}

  private get research() {
    return this.game.state.settlement.research;
  }

  has(id: string): boolean {
    return this.research.done.includes(id);
  }

  era(): EraLevel {
    let e: EraLevel = 1;
    for (const t of TECHS) if (t.advancesTo && this.has(t.id) && t.advancesTo > e) e = t.advancesTo;
    return e;
  }

  eraName(): string {
    return ERAS[this.era() - 1].name;
  }

  points(): number {
    return Math.floor(this.research.points);
  }

  addPoints(n: number) {
    if (n <= 0) return;
    this.research.points += n;
    this.research.total += n;
  }

  /** Has this tech's prerequisites (ignoring cost)? */
  status(t: TechDef): TechStatus {
    if (this.has(t.id)) return 'done';
    if (t.era > this.era()) return 'locked';
    if (!t.requires.every((r) => this.has(r))) return 'locked';
    if (t.needFromEra) {
      const n = TECHS.filter((x) => x.era === t.needFromEra!.era && !x.advancesTo && this.has(x.id)).length;
      if (n < t.needFromEra.count) return 'locked';
    }
    return 'available';
  }

  /** Why a tech cannot be researched right now ('' = it can). */
  blocker(t: TechDef): string {
    const st = this.game.state.settlement;
    if (!st.founded) return '정착지가 없습니다';
    const s = this.status(t);
    if (s === 'done') return '이미 연구했습니다';
    if (s === 'locked') {
      if (t.era > this.era()) return `${ERAS[t.era - 1].name}에 연구할 수 있습니다`;
      const miss = t.requires.filter((r) => !this.has(r)).map((r) => TECH_BY_ID[r]?.name ?? r);
      if (miss.length) return `선행 연구: ${miss.join(', ')}`;
      if (t.needFromEra) return `${ERAS[t.needFromEra.era - 1].name} 연구 ${t.needFromEra.count}개 필요`;
      return '잠김';
    }
    if (this.research.points < t.cost) return `연구 점수 부족 (${this.points()}/${t.cost})`;
    if (st.treasury < t.coins) return `금고 은화 부족 (${st.treasury}/${t.coins})`;
    return '';
  }

  researchTech(id: string): boolean {
    const t = TECH_BY_ID[id];
    if (!t) return false;
    const why = this.blocker(t);
    if (why) {
      this.game.events.emit('notify', { text: why, kind: 'warn' });
      this.game.audio.play('deny');
      return false;
    }
    const st = this.game.state.settlement;
    this.research.points -= t.cost;
    st.treasury -= t.coins;
    this.research.done.push(t.id);
    this.game.settlement.log(`"${t.name}" 연구를 마쳤습니다.`);
    if (t.advancesTo) {
      const era = ERAS[t.advancesTo - 1];
      this.game.events.emit('banner', { title: era.name, subtitle: `${st.name}이(가) 새 시대에 들어섰습니다 · ${era.desc}`, kind: 'level' });
      this.game.audio.play('levelup');
    } else {
      this.game.events.emit('banner', { title: `연구 완료: ${t.name}`, subtitle: t.effects.join(' · '), kind: 'discover' });
      this.game.audio.play('quest');
    }
    this.game.gainXp(20 + t.cost, t.name);
    this.game.refreshUnlocks();
    this.game.settlement.refresh();
    this.game.bridge.bump();
    return true;
  }

  /** Donate relics from the player's bag for research points. */
  donate(itemId: string, all = false): number {
    const per = RESEARCH_DONATIONS[itemId];
    if (!per) return 0;
    const inv = this.game.state.player.inventory;
    const have = Inv.count(inv, itemId);
    const n = all ? have : Math.min(1, have);
    if (n <= 0) return 0;
    Inv.remove(inv, itemId, n);
    this.addPoints(per * n);
    this.game.events.emit('notify', { text: `${itemName(itemId)} ${n}개 기증 · 연구 점수 +${per * n}`, kind: 'info' });
    this.game.audio.play('pickup');
    this.game.settlement.refresh();
    this.game.bridge.bump();
    return n;
  }

  /** Research points per production tick from all working scholars (estimate for the UI). */
  scholars(): number {
    return this.game.state.settlement.villagers.filter((v) => v.job === 'scholar' && v.workId !== null).length;
  }
}
