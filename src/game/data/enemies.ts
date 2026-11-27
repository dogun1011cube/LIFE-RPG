export type EnemyModel = 'slime' | 'wolf' | 'golem' | 'wisp' | 'warden' | 'skeleton' | 'archer' | 'keeper' | 'magma_slime' | 'ash_wolf' | 'lava_golem' | 'fire_wisp' | 'titan';

export interface AttackDef {
  kind: 'melee' | 'lunge' | 'slam' | 'ranged' | 'burst' | 'summon';
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
  /** summon: enemy id and how many; skipped while that many minions are alive */
  summon?: string;
  count?: number;
  /** projectile homing strength and colour */
  homing?: number;
  color?: number;
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
  /** Lives in a dungeon: never spawned naturally, never despawned by distance. */
  dungeon?: boolean;
  /** Shown under the boss bar / banner */
  bossTitle?: string;
  /** fire creature: its hits are halved by fire resistance, rain weakens it */
  fire?: boolean;
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
    id: 'warden', name: '폐허의 수호자', level: 8, model: 'warden', bossTitle: '고대의 수호자가 깨어났다', hp: 950, damage: 28, defense: 10, speed: 1.6, chaseSpeed: 3.4,
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
  {
    id: 'skeleton', name: '해골 전사', level: 6, model: 'skeleton', hp: 95, damage: 15, defense: 6, speed: 1.6, chaseSpeed: 4.2,
    radius: 0.5, height: 1.8, scale: 1, aggroRange: 13, leash: 28, cooldown: 1.1, poise: 14, xp: 45, dungeon: true,
    attacks: [
      { kind: 'melee', range: 2.2, windup: 0.55, active: 0.15, recover: 0.5, mult: 1, arc: 90, weight: 1 },
      { kind: 'lunge', range: 5, minRange: 2.8, windup: 0.75, active: 0.35, recover: 0.8, mult: 1.2, lungeSpeed: 11, weight: 0.5 },
    ],
    drops: [{ item: 'bone', chance: 0.85, min: 1, max: 3 }, { item: 'copper_ingot', chance: 0.15, min: 1, max: 1 }],
  },
  // ── 잿불 섬 ─────────────────────────────────────────────
  {
    id: 'magma_slime', name: '마그마 슬라임', level: 7, model: 'magma_slime', hp: 70, damage: 13, defense: 3, speed: 1.4, chaseSpeed: 3.2,
    radius: 0.6, height: 0.9, scale: 1, aggroRange: 11, leash: 30, cooldown: 1.1, poise: 0, xp: 32, fire: true,
    attacks: [{ kind: 'lunge', range: 3, windup: 0.55, active: 0.35, recover: 0.7, mult: 1, lungeSpeed: 8 }],
    drops: [{ item: 'charcoal', chance: 0.7, min: 1, max: 2 }, { item: 'ember_fruit', chance: 0.25, min: 1, max: 1 }],
  },
  {
    id: 'ash_wolf', name: '잿빛 늑대', level: 9, model: 'ash_wolf', hp: 120, damage: 18, defense: 5, speed: 2.3, chaseSpeed: 6.8,
    radius: 0.6, height: 1.0, scale: 1.1, aggroRange: 16, leash: 40, cooldown: 0.95, poise: 0, xp: 58,
    attacks: [
      { kind: 'melee', range: 2.1, windup: 0.38, active: 0.15, recover: 0.45, mult: 1, arc: 80, weight: 1 },
      { kind: 'lunge', range: 7.5, minRange: 3.5, windup: 0.65, active: 0.4, recover: 0.8, mult: 1.3, lungeSpeed: 15, weight: 0.6 },
    ],
    drops: [{ item: 'wolf_pelt', chance: 0.9, min: 1, max: 2 }, { item: 'raw_meat', chance: 0.8, min: 1, max: 2 }],
  },
  {
    id: 'lava_golem', name: '용암 골렘', level: 11, model: 'lava_golem', hp: 320, damage: 30, defense: 12, speed: 1.1, chaseSpeed: 2.6,
    radius: 1.1, height: 2.4, scale: 1.05, aggroRange: 12, leash: 35, cooldown: 1.5, poise: 30, xp: 130, fire: true,
    attacks: [
      { kind: 'slam', range: 3.0, windup: 1.0, active: 0.2, recover: 1.1, mult: 1.1, aoe: 3.6, weight: 1 },
      { kind: 'melee', range: 2.7, windup: 0.7, active: 0.2, recover: 0.8, mult: 0.85, arc: 100, weight: 1 },
    ],
    drops: [{ item: 'iron_ore', chance: 1, min: 2, max: 4 }, { item: 'obsidian', chance: 0.3, min: 1, max: 1 }, { item: 'charcoal', chance: 0.6, min: 1, max: 3 }],
  },
  {
    id: 'fire_wisp', name: '불꽃 정령', level: 9, model: 'fire_wisp', hp: 75, damage: 17, defense: 0, speed: 2.0, chaseSpeed: 3.8,
    radius: 0.5, height: 1.0, scale: 1, aggroRange: 22, leash: 50, cooldown: 1.3, poise: 0, xp: 52, nightOnly: true, flying: true, keepDistance: 8, fire: true,
    attacks: [{ kind: 'ranged', range: 16, windup: 0.8, active: 0.1, recover: 0.9, mult: 1, projSpeed: 12, color: 0xff7a2a }],
    drops: [{ item: 'ember_fruit', chance: 0.5, min: 1, max: 2 }, { item: 'gloom_essence', chance: 0.3, min: 1, max: 1 }],
  },
  {
    id: 'lava_titan', name: '용암 거신', level: 13, model: 'titan', bossTitle: '불의 산 깊은 곳에서 깨어난 자', hp: 1600, damage: 32, defense: 12, speed: 1.5, chaseSpeed: 3.2,
    radius: 1.9, height: 4.6, scale: 1, aggroRange: 30, leash: 30, cooldown: 1.15, poise: 70, xp: 1000, boss: true, fire: true,
    attacks: [
      { kind: 'slam', range: 4.8, windup: 1.05, active: 0.2, recover: 1.0, mult: 1.2, aoe: 5.0, weight: 1.2 },
      { kind: 'melee', range: 4.6, windup: 0.8, active: 0.2, recover: 0.8, mult: 1.0, arc: 150, weight: 1.2 },
      { kind: 'ranged', range: 26, minRange: 6, windup: 0.9, active: 0.1, recover: 1.0, mult: 0.8, projSpeed: 13, homing: 0.6, color: 0xff5a1a, weight: 0.9 },
      { kind: 'summon', range: 30, windup: 1.2, active: 0.1, recover: 1.0, mult: 0, summon: 'magma_slime', count: 2, weight: 0.5, phase: 2 },
      { kind: 'burst', range: 30, minRange: 4, windup: 1.0, active: 0.1, recover: 1.2, mult: 0.75, projCount: 12, projSpeed: 10, weight: 1, phase: 2, color: 0xff6a1a },
    ],
    drops: [
      { item: 'ember_core', chance: 1, min: 1, max: 1 },
      { item: 'obsidian', chance: 1, min: 4, max: 6 },
      { item: 'iron_ingot', chance: 1, min: 6, max: 8 },
      { item: 'health_potion', chance: 1, min: 2, max: 3 },
    ],
  },
  {
    id: 'raider_skeleton', name: '떠도는 해골', level: 5, model: 'skeleton', hp: 78, damage: 12, defense: 4, speed: 1.6, chaseSpeed: 4.0,
    radius: 0.5, height: 1.8, scale: 1, aggroRange: 14, leash: 30, cooldown: 1.2, poise: 12, xp: 36,
    attacks: [
      { kind: 'melee', range: 2.2, windup: 0.6, active: 0.15, recover: 0.55, mult: 1, arc: 90, weight: 1 },
      { kind: 'lunge', range: 5, minRange: 2.8, windup: 0.8, active: 0.35, recover: 0.8, mult: 1.15, lungeSpeed: 10, weight: 0.4 },
    ],
    drops: [{ item: 'bone', chance: 0.8, min: 1, max: 2 }, { item: 'coin', chance: 0.5, min: 1, max: 4 }],
  },
  {
    id: 'skeleton_archer', name: '해골 궁수', level: 6, model: 'archer', hp: 62, damage: 13, defense: 3, speed: 1.6, chaseSpeed: 3.4,
    radius: 0.5, height: 1.8, scale: 1, aggroRange: 20, leash: 30, cooldown: 1.6, poise: 0, xp: 45, dungeon: true, keepDistance: 9,
    attacks: [{ kind: 'ranged', range: 18, windup: 0.95, active: 0.1, recover: 0.8, mult: 1, projSpeed: 19, homing: 0.15, color: 0xe8dcb8 }],
    drops: [{ item: 'bone', chance: 0.85, min: 1, max: 2 }, { item: 'fiber', chance: 0.4, min: 2, max: 4 }],
  },
  {
    id: 'crypt_keeper', name: '묘지기', level: 9, model: 'keeper', hp: 720, damage: 22, defense: 6, speed: 1.5, chaseSpeed: 2.6,
    radius: 0.8, height: 2.6, scale: 1, aggroRange: 24, leash: 40, cooldown: 1.3, poise: 40, xp: 450, boss: true, dungeon: true, keepDistance: 6,
    bossTitle: '잊혀진 왕의 무덤을 지키는 자',
    attacks: [
      { kind: 'ranged', range: 18, windup: 0.8, active: 0.1, recover: 0.9, mult: 1, projSpeed: 12, homing: 1.0, color: 0xb06aff, weight: 1.2 },
      { kind: 'slam', range: 3.2, windup: 1.0, active: 0.2, recover: 1.0, mult: 1.2, aoe: 4.4, weight: 1.5 },
      { kind: 'summon', range: 30, windup: 1.3, active: 0.1, recover: 1.0, mult: 0, summon: 'skeleton', count: 2, weight: 0.7 },
      { kind: 'burst', range: 30, minRange: 4, windup: 1.0, active: 0.1, recover: 1.2, mult: 0.7, projCount: 12, projSpeed: 9, weight: 1, phase: 2, color: 0xb06aff },
    ],
    drops: [
      { item: 'ancient_blade', chance: 1, min: 1, max: 1 },
      { item: 'bone', chance: 1, min: 4, max: 6 },
      { item: 'mana_potion', chance: 1, min: 2, max: 2 },
      { item: 'ancient_fragment', chance: 1, min: 1, max: 1 },
    ],
  },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(list.map((e) => [e.id, e]));
