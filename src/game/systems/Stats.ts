import type { AttrId, PlayerState } from '../state/types';
import { ITEMS } from '../data/items';

export const ATTR_INFO: Record<AttrId, { name: string; desc: string }> = {
  str: { name: '힘', desc: '공격력 +2' },
  vit: { name: '활력', desc: '최대 체력 +12, 방어력 +0.5' },
  end: { name: '지구력', desc: '최대 스태미나 +8, 스태미나 회복 +4%' },
  agi: { name: '민첩', desc: '치명타 확률 +1.2%, 이동 속도 +1%' },
  skl: { name: '숙련', desc: '채집 속도 +4%, 추가 수확 확률 +4%' },
  int: { name: '지능', desc: '최대 마나 +10, 마력 +3, 마나 회복 +0.2' },
};

export const ATTR_ORDER: AttrId[] = ['str', 'vit', 'end', 'agi', 'skl', 'int'];
export const SKILL_POINTS_PER_LEVEL = 1;
export const POINTS_PER_LEVEL = 2;

export function xpToNext(level: number): number {
  return Math.floor(40 * Math.pow(level, 1.55) + 30);
}

export interface DerivedStats {
  maxHp: number;
  maxStamina: number;
  attack: number;
  defense: number;
  critChance: number;
  critMult: number;
  moveMult: number;
  staminaRegen: number;
  hpRegen: number;
  gatherSpeed: number;
  bonusYield: number;
  weaponReach: number;
  maxMana: number;
  manaRegen: number;
  magicPower: number;
  parryWindow: number;
  riposteMult: number;
  healMult: number;
  sprintCost: number;
}

/** Rank of a learned skill (0 if not learned). */
export function rank(p: PlayerState, id: string): number {
  return p.skills?.[id] ?? 0;
}

export function derivePlayerStats(p: PlayerState): DerivedStats {
  const w = p.equipment.weapon ? ITEMS[p.equipment.weapon]?.weapon : undefined;
  const a = p.equipment.armor ? ITEMS[p.equipment.armor]?.armor : undefined;
  const t = p.equipment.trinket ? ITEMS[p.equipment.trinket]?.trinket : undefined;
  const at = p.attrs;
  const int = at.int ?? 0;
  const wellFed = p.buffs.some((b) => b.id === 'well_fed');
  const slowed = p.buffs.some((b) => b.id === 'slow');
  const rested = p.buffs.some((b) => b.id === 'rested');
  const wet = p.buffs.some((b) => b.id === 'wet');
  const baseHp = 100 + (p.level - 1) * 10 + at.vit * 12 + (t?.hp ?? 0);
  const attackPct = 1 + rank(p, 'c_fury') * 0.06 + (t?.attackPct ?? 0);
  return {
    maxHp: Math.round(baseHp * (1 + rank(p, 'c_vigor') * 0.08)),
    maxStamina: Math.round(100 + at.end * 8),
    attack: (3 + p.level + at.str * 2 + (w?.damage ?? 1)) * attackPct,
    defense: (a?.defense ?? 0) + at.vit * 0.5 + (t?.defense ?? 0),
    critChance: 0.05 + at.agi * 0.012 + (t?.crit ?? 0),
    critMult: 1.75,
    moveMult: (1 + at.agi * 0.01 + rank(p, 's_runner') * 0.04) * (slowed ? 0.6 : 1),
    staminaRegen: 28 * (1 + at.end * 0.04) * (wellFed ? 1.25 : 1) * (rested ? 1.3 : 1) * (wet ? 0.75 : 1),
    hpRegen: (wellFed ? 2.5 : 0.8) + (rested ? 1.5 : 0),
    gatherSpeed: 1 + at.skl * 0.04 + rank(p, 's_gather') * 0.15,
    bonusYield: at.skl * 0.04 + rank(p, 's_gather') * 0.08,
    weaponReach: w?.reach ?? 2.0,
    maxMana: Math.round(40 + int * 10 + rank(p, 'a_mana') * 15 + (t?.mana ?? 0)),
    manaRegen: 1.2 + int * 0.2 + rank(p, 'a_mana') * 0.6 + (t?.manaRegen ?? 0),
    magicPower: 6 + p.level * 2 + int * 3,
    parryWindow: 0.2 + rank(p, 'c_parry') * 0.08,
    riposteMult: 1.6 + rank(p, 'c_parry') * 0.25,
    healMult: 1 + rank(p, 's_cook') * 0.25,
    sprintCost: 1 - rank(p, 's_runner') * 0.2,
  };
}

/** Damage after defense mitigation. */
export function mitigate(raw: number, defense: number): number {
  return Math.max(1, raw * (1 - defense / (defense + 45)));
}
