export type EnemyModel = 'slime' | 'wolf' | 'golem' | 'wisp' | 'warden';

export interface AttackDef {
  kind: 'melee' | 'lunge' | 'slam' | 'ranged' | 'burst';
  range: number;
  windup: number;
  active: number;
  recover: number;
  mult: number;
  arc?: number; // degrees, melee hit arc
  aoe?: number; // slam radius
  lungeSpeed?: number;
  projSpeed?: number;
  projCount?: number;
  weight?: number;
  phase?: 1 | 2;
  minRange?: number;
}

export interface DropDef {
  item: string;
  chance: number;
  min: number;
  max: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  level: number;
  model: EnemyModel;
  hp: number;
  damage: number;
  defense: number;
  speed: number; // wander speed
  chaseSpeed: number;
  radius: number;
  height: number;
  scale: number;
  aggroRange: number;
  leash: number;
  attacks: AttackDef[];
  cooldown: number;
  poise: number; // single-hit damage needed to stagger (0 = always staggers)
  xp: number;
  drops: DropDef[];
  nightOnly?: boolean;
  boss?: boolean;
  flying?: boolean;
  keepDistance?: number;
}

const list: EnemyDef[] = [
  {
    id: 'slime', name: '초원 슬라임', level: 1, model: 'slime', hp: 32, damage: 6, defense: 0, speed: 1.4, chaseSpeed: 2.8,
    radius: 0.6, height: 0.9, scale: 1, aggroRange: 9, leash: 30, cooldown: 1.2, poise: 0, xp: 12,
    attacks: [{ kind: 'lunge', range: 2.6, windup: 0.6, active: 0.35, recover: 0.7, mult: 1, lungeSpeed: 7 }],
    drops: [{ item: 'slime_gel', chance: 0.75, min: 1, max: 2 }, { item: 'berry', chance: 0.2, min: 1, max: 2 }],
  },
  {
    id: 'wolf', name: '회색 늑대', level: 3, model: 'wolf', hp: 58, damage: 10, defense: 2, speed: 2.2, chaseSpeed: 6.4,
    radius: 0.6, height: 1.0, scale: 1, aggroRange: 15, leash: 40, cooldown: 1.0, poise: 0, xp: 26,
    attacks: [
      { kind: 'melee', range: 2.0, windup: 0.4, active: 0.15, recover: 0.5, mult: 1, arc: 80, weight: 1 },
      { kind: 'lunge', range: 7, minRange: 3.5, windup: 0.7, active: 0.4, recover: 0.8, mult: 1.3, lungeSpeed: 14, weight: 0.6 },
    ],
    drops: [{ item: 'wolf_pelt', chance: 0.85, min: 1, max: 1 }, { item: 'raw_meat', chance: 0.8, min: 1, max: 2 }],
  },
  {
    id: 'golem', name: '바위 골렘', level: 5, model: 'golem', hp: 170, damage: 20, defense: 8, speed: 1.1, chaseSpeed: 2.5,
    radius: 1.1, height: 2.4, scale: 1, aggroRange: 11, leash: 35, cooldown: 1.6, poise: 22, xp: 65,
    attacks: [
      { kind: 'slam', range: 3.0, windup: 1.0, active: 0.2, recover: 1.1, mult: 1.1, aoe: 3.3, weight: 1 },
      { kind: 'melee', range: 2.7, windup: 0.75, active: 0.2, recover: 0.8, mult: 0.8, arc: 100, weight: 1 },
    ],
    drops: [
      { item: 'stone', chance: 1, min: 3, max: 6 },
      { item: 'copper_ore', chance: 0.6, min: 1, max: 3 },
      { item: 'crystal', chance: 0.15, min: 1, max: 1 },
      { item: 'ancient_fragment', chance: 0.08, min: 1, max: 1 },
    ],
  },
  {
    id: 'wisp', name: '그림자 도깨비불', level: 4, model: 'wisp', hp: 42, damage: 12, defense: 0, speed: 2.0, chaseSpeed: 3.6,
    radius: 0.5, height: 1.0, scale: 1, aggroRange: 22, leash: 50, cooldown: 1.4, poise: 0, xp: 32, nightOnly: true, flying: true, keepDistance: 8,
    attacks: [{ kind: 'ranged', range: 15, windup: 0.85, active: 0.1, recover: 1.0, mult: 1, projSpeed: 11 }],
    drops: [{ item: 'gloom_essence', chance: 0.7, min: 1, max: 1 }],
  },
  {
    id: 'warden', name: '폐허의 수호자', level: 8, model: 'warden', hp: 950, damage: 28, defense: 10, speed: 1.6, chaseSpeed: 3.4,
    radius: 1.8, height: 4.6, scale: 1, aggroRange: 28, leash: 45, cooldown: 1.2, poise: 60, xp: 600, boss: true,
    attacks: [
      { kind: 'slam', range: 4.5, windup: 1.1, active: 0.2, recover: 1.0, mult: 1.2, aoe: 4.6, weight: 1 },
      { kind: 'melee', range: 4.4, windup: 0.85, active: 0.2, recover: 0.8, mult: 1.0, arc: 150, weight: 1.2 },
      { kind: 'burst', range: 30, minRange: 5, windup: 1.0, active: 0.1, recover: 1.2, mult: 0.7, projCount: 10, projSpeed: 10, weight: 1, phase: 2 },
      { kind: 'lunge', range: 14, minRange: 6, windup: 0.9, active: 0.5, recover: 1.0, mult: 1.1, lungeSpeed: 16, weight: 0.8, phase: 2 },
    ],
    drops: [
      { item: 'warden_core', chance: 1, min: 1, max: 1 },
      { item: 'crystal', chance: 1, min: 3, max: 5 },
      { item: 'copper_ingot', chance: 1, min: 4, max: 6 },
      { item: 'health_potion', chance: 1, min: 2, max: 2 },
    ],
  },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(list.map((e) => [e.id, e]));
