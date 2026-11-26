export type ItemCategory = 'material' | 'weapon' | 'tool' | 'armor' | 'accessory' | 'consumable' | 'special';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface IconSpec {
  shape: string;
  c1: string;
  c2?: string;
}

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  category: ItemCategory;
  rarity: Rarity;
  stack: number;
  icon: IconSpec;
  value: number; // base trade value, used by the future economy
  weapon?: { damage: number; reach: number; speed: number; color: number; kind: 'club' | 'sword' | 'blade' };
  tool?: { kind: 'axe' | 'pickaxe'; tier: number; power: number; speed: number; color: number };
  armor?: { defense: number; color: number };
  trinket?: { hp?: number; mana?: number; manaRegen?: number; crit?: number; defense?: number; attackPct?: number };
  use?: { heal?: number; mana?: number; hot?: { amount: number; duration: number }; stamina?: number; buff?: string; resetSkills?: boolean };
}

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#b8b2a3',
  uncommon: '#6fcf5b',
  rare: '#4aa8ff',
  epic: '#b46cff',
  legendary: '#ffb547',
};

export const RARITY_NAME: Record<Rarity, string> = {
  common: '일반',
  uncommon: '고급',
  rare: '희귀',
  epic: '영웅',
  legendary: '전설',
};

export const CATEGORY_NAME: Record<ItemCategory, string> = {
  material: '재료',
  weapon: '무기',
  tool: '도구',
  armor: '방어구',
  accessory: '장신구',
  consumable: '소모품',
  special: '특수',
};

const list: ItemDef[] = [
  // ── Materials ──────────────────────────────────────────────
  { id: 'wood', name: '목재', desc: '나무를 베어 얻은 튼튼한 목재. 건축과 제작의 기본 재료.', category: 'material', rarity: 'common', stack: 99, icon: { shape: 'log', c1: '#8a5a32', c2: '#c99a62' }, value: 1 },
  { id: 'stone', name: '돌', desc: '단단한 돌덩이. 도구, 석조 건축에 쓰인다.', category: 'material', rarity: 'common', stack: 99, icon: { shape: 'stone', c1: '#8d8d8a', c2: '#bdbdb8' }, value: 1 },
  { id: 'fiber', name: '식물 섬유', desc: '질긴 풀에서 얻은 섬유. 끈과 천의 재료가 된다.', category: 'material', rarity: 'common', stack: 99, icon: { shape: 'fiber', c1: '#8fae4a', c2: '#c9dc7a' }, value: 1 },
  { id: 'copper_ore', name: '구리 광석', desc: '고원의 바위에서 캐낸 구리 광석. 화로에서 제련할 수 있다.', category: 'material', rarity: 'common', stack: 99, icon: { shape: 'ore', c1: '#7c6f66', c2: '#e08a4a' }, value: 4 },
  { id: 'copper_ingot', name: '구리 주괴', desc: '제련된 구리. 더 강력한 도구와 무기의 재료.', category: 'material', rarity: 'uncommon', stack: 50, icon: { shape: 'ingot', c1: '#d9793a', c2: '#ffb27a' }, value: 12 },
  { id: 'slime_gel', name: '슬라임 젤', desc: '말랑하고 끈적한 젤. 약초와 섞으면 치유 효과가 있다.', category: 'material', rarity: 'common', stack: 99, icon: { shape: 'gel', c1: '#5fd36a', c2: '#bdf7b0' }, value: 2 },
  { id: 'wolf_pelt', name: '늑대 가죽', desc: '거친 털가죽. 작업대에서 무두질할 수 있다.', category: 'material', rarity: 'common', stack: 50, icon: { shape: 'pelt', c1: '#6f6a64', c2: '#a7a097' }, value: 5 },
  { id: 'leather', name: '무두질한 가죽', desc: '부드럽게 손질된 가죽. 방어구와 손잡이에 쓰인다.', category: 'material', rarity: 'uncommon', stack: 50, icon: { shape: 'leather', c1: '#9b6236', c2: '#d29a62' }, value: 10 },
  { id: 'crystal', name: '공명 수정', desc: '은은하게 진동하는 푸른 수정. 고대 문명의 힘이 깃들어 있다.', category: 'material', rarity: 'rare', stack: 50, icon: { shape: 'crystal', c1: '#3fc6e8', c2: '#c9f6ff' }, value: 30 },
  { id: 'gloom_essence', name: '어둠의 정수', desc: '밤의 도깨비불이 남긴 차가운 정수.', category: 'material', rarity: 'rare', stack: 50, icon: { shape: 'essence', c1: '#7b4ad9', c2: '#d2b8ff' }, value: 25 },
  { id: 'wheat', name: '밀', desc: '밭에서 거둔 밀. 요리사가 빵으로 만든다. 주민의 비상식량이 되기도 한다.', category: 'material', rarity: 'common', stack: 99, icon: { shape: 'wheat', c1: '#e3c25a', c2: '#a8862a' }, value: 1 },
  { id: 'coin', name: '은화', desc: '마을 시장에서 쓰이는 화폐.', category: 'special', rarity: 'uncommon', stack: 999, icon: { shape: 'coin', c1: '#d8dde4', c2: '#8a929c' }, value: 1 },
  { id: 'stone_brick', name: '석재 벽돌', desc: '반듯하게 다듬은 돌 벽돌. 대리석 건축물과 성벽의 재료.', category: 'material', rarity: 'uncommon', stack: 99, icon: { shape: 'brick', c1: '#d8d0c0', c2: '#9a9284' }, value: 4 },
  { id: 'bone', name: '뼈', desc: '묘소의 해골들이 남긴 오래된 뼈. 부적의 재료가 된다.', category: 'material', rarity: 'common', stack: 99, icon: { shape: 'bone', c1: '#e8e2d0', c2: '#b8ae94' }, value: 3 },
  { id: 'ancient_fragment', name: '고대 파편', desc: '알 수 없는 문양이 새겨진 석판 조각. 에테르눔 문명의 흔적.', category: 'material', rarity: 'rare', stack: 20, icon: { shape: 'fragment', c1: '#b9a77a', c2: '#5fe0d8' }, value: 40 },

  // ── Consumables ────────────────────────────────────────────
  { id: 'berry', name: '산딸기', desc: '새콤달콤한 산딸기. 먹으면 체력을 조금 회복한다.', category: 'consumable', rarity: 'common', stack: 50, icon: { shape: 'berry', c1: '#d23a4a', c2: '#4f8f3a' }, value: 1, use: { heal: 8 } },
  { id: 'raw_meat', name: '날고기', desc: '모닥불에 구우면 훌륭한 음식이 된다. 날로 먹으면 회복량이 적다.', category: 'consumable', rarity: 'common', stack: 30, icon: { shape: 'meat', c1: '#d96a6a', c2: '#f3e0d0' }, value: 2, use: { heal: 4 } },
  { id: 'cooked_meat', name: '구운 고기', desc: '든든한 한 끼. 체력을 회복하고 잠시 배부름 효과를 얻는다.', category: 'consumable', rarity: 'uncommon', stack: 30, icon: { shape: 'meat', c1: '#9a5a2a', c2: '#f3e0d0' }, value: 6, use: { heal: 30, buff: 'well_fed' } },
  { id: 'healing_salve', name: '치유 연고', desc: '산딸기와 섬유로 만든 연고. 8초에 걸쳐 체력을 회복한다.', category: 'consumable', rarity: 'common', stack: 20, icon: { shape: 'salve', c1: '#7fbf5a', c2: '#e9e2c9' }, value: 5, use: { hot: { amount: 45, duration: 8 } } },
  { id: 'bread', name: '빵', desc: '갓 구운 빵. 체력을 회복하고 배부름 효과를 준다. 주민들의 주식.', category: 'consumable', rarity: 'common', stack: 30, icon: { shape: 'bread', c1: '#c98a3a', c2: '#f3d79a' }, value: 4, use: { heal: 25, buff: 'well_fed' } },
  { id: 'mana_potion', name: '마나 물약', desc: '어둠의 정수를 정화해 만든 푸른 물약. 마나를 즉시 회복한다.', category: 'consumable', rarity: 'uncommon', stack: 20, icon: { shape: 'potion', c1: '#3a7cff', c2: '#cfe0ff' }, value: 15, use: { mana: 60 } },
  { id: 'health_potion', name: '회복 물약', desc: '슬라임 젤로 만든 붉은 물약. 즉시 체력을 크게 회복한다.', category: 'consumable', rarity: 'uncommon', stack: 20, icon: { shape: 'potion', c1: '#e0354b', c2: '#ffd1d8' }, value: 15, use: { heal: 70 } },

  // ── Weapons ────────────────────────────────────────────────
  { id: 'wooden_club', name: '나무 몽둥이', desc: '투박한 나무 몽둥이. 없는 것보단 낫다.', category: 'weapon', rarity: 'common', stack: 1, icon: { shape: 'club', c1: '#8a5a32', c2: '#5a3a1e' }, value: 2, weapon: { damage: 4, reach: 2.1, speed: 1.0, color: 0x8a5a32, kind: 'club' } },
  { id: 'stone_sword', name: '돌검', desc: '날카롭게 갈아낸 돌날을 묶은 검.', category: 'weapon', rarity: 'common', stack: 1, icon: { shape: 'sword', c1: '#a3a39e', c2: '#6b4a2a' }, value: 8, weapon: { damage: 9, reach: 2.3, speed: 1.0, color: 0x9a9a95, kind: 'sword' } },
  { id: 'copper_sword', name: '구리검', desc: '제련된 구리로 벼려낸 검. 균형이 좋다.', category: 'weapon', rarity: 'uncommon', stack: 1, icon: { shape: 'sword', c1: '#e08a4a', c2: '#5a3a1e' }, value: 40, weapon: { damage: 16, reach: 2.4, speed: 1.05, color: 0xd9793a, kind: 'sword' } },
  { id: 'crystal_blade', name: '공명의 검', desc: '공명 수정을 품은 검. 휘두를 때마다 맑은 소리가 울린다.', category: 'weapon', rarity: 'epic', stack: 1, icon: { shape: 'sword', c1: '#5fe0f0', c2: '#3a2a5a' }, value: 150, weapon: { damage: 27, reach: 2.6, speed: 1.1, color: 0x5fe0f0, kind: 'blade' } },

  { id: 'ancient_blade', name: '고대 왕의 검', desc: '묘지기가 지키던 에테르눔 왕의 검. 세월이 흘러도 날이 무뎌지지 않았다.', category: 'weapon', rarity: 'epic', stack: 1, icon: { shape: 'sword', c1: '#e8d27a', c2: '#2a2440' }, value: 180, weapon: { damage: 23, reach: 2.6, speed: 1.15, color: 0xe8d27a, kind: 'sword' } },

  // ── Tools ──────────────────────────────────────────────────
  { id: 'stone_axe', name: '돌도끼', desc: '나무를 훨씬 빠르게 벨 수 있다. 소지만 하면 자동으로 사용된다.', category: 'tool', rarity: 'common', stack: 1, icon: { shape: 'axe', c1: '#a3a39e', c2: '#8a5a32' }, value: 6, tool: { kind: 'axe', tier: 1, power: 2, speed: 0.72, color: 0x9a9a95 } },
  { id: 'stone_pickaxe', name: '돌곡괭이', desc: '바위와 광석을 캘 수 있다. 소지만 하면 자동으로 사용된다.', category: 'tool', rarity: 'common', stack: 1, icon: { shape: 'pickaxe', c1: '#a3a39e', c2: '#8a5a32' }, value: 6, tool: { kind: 'pickaxe', tier: 1, power: 2, speed: 0.75, color: 0x9a9a95 } },
  { id: 'copper_axe', name: '구리 도끼', desc: '구리 날의 도끼. 벌목 속도와 수확량이 늘어난다.', category: 'tool', rarity: 'uncommon', stack: 1, icon: { shape: 'axe', c1: '#e08a4a', c2: '#8a5a32' }, value: 30, tool: { kind: 'axe', tier: 2, power: 3.5, speed: 0.58, color: 0xd9793a } },
  { id: 'copper_pickaxe', name: '구리 곡괭이', desc: '구리 날의 곡괭이. 채광 속도와 수확량이 늘어나고 수정을 캘 수 있다.', category: 'tool', rarity: 'uncommon', stack: 1, icon: { shape: 'pickaxe', c1: '#e08a4a', c2: '#8a5a32' }, value: 30, tool: { kind: 'pickaxe', tier: 2, power: 3.5, speed: 0.6, color: 0xd9793a } },

  // ── Armor ──────────────────────────────────────────────────
  { id: 'leather_armor', name: '가죽 갑옷', desc: '가볍고 질긴 가죽 갑옷.', category: 'armor', rarity: 'uncommon', stack: 1, icon: { shape: 'armor', c1: '#9b6236', c2: '#5a3a1e' }, value: 35, armor: { defense: 8, color: 0x8a5530 } },
  { id: 'copper_armor', name: '구리 갑옷', desc: '구리 판으로 보강한 갑옷. 묵직한 안정감.', category: 'armor', rarity: 'rare', stack: 1, icon: { shape: 'armor', c1: '#d9793a', c2: '#6b3a1e' }, value: 90, armor: { defense: 18, color: 0xc8703a } },

  // ── Accessories ────────────────────────────────────────
  { id: 'bone_charm', name: '뼈 부적', desc: '해골의 뼈를 엮어 만든 부적. 급소를 노리는 감각이 날카로워진다.', category: 'accessory', rarity: 'uncommon', stack: 1, icon: { shape: 'charm', c1: '#e8e2d0', c2: '#8a2a2a' }, value: 30, trinket: { crit: 0.06, attackPct: 0.04 } },
  { id: 'arcane_ring', name: '비전 반지', desc: '공명 수정이 박힌 은반지. 마나가 샘솟는다.', category: 'accessory', rarity: 'rare', stack: 1, icon: { shape: 'ring', c1: '#c9d2e0', c2: '#5fe0f0' }, value: 90, trinket: { mana: 35, manaRegen: 1.2 } },
  { id: 'warden_amulet', name: '수호자의 목걸이', desc: '수호자의 핵을 깎아 만든 목걸이. 착용자를 단단하게 지켜준다.', category: 'accessory', rarity: 'legendary', stack: 1, icon: { shape: 'amulet', c1: '#ffb547', c2: '#5fe0d8' }, value: 400, trinket: { hp: 45, defense: 6, mana: 15 } },

  // ── Special ────────────────────────────────────────────────
  { id: 'ancient_sigil', name: '고대 인장', desc: '가라앉은 신전의 제단에 바치면 무언가가 깨어난다.', category: 'special', rarity: 'epic', stack: 5, icon: { shape: 'sigil', c1: '#5fe0d8', c2: '#b9a77a' }, value: 200 },
  { id: 'warden_core', name: '수호자의 핵', desc: '폐허의 수호자의 심장. 아직도 미약하게 맥동한다. 언젠가 문명의 동력이 될 것이다.', category: 'special', rarity: 'legendary', stack: 10, icon: { shape: 'core', c1: '#ffb547', c2: '#5fe0d8' }, value: 500 },
  { id: 'skill_tome', name: '망각의 서', desc: '읽는 순간 익힌 기술들이 머릿속에서 흩어진다. 사용하면 모든 스킬 포인트를 돌려받는다.', category: 'consumable', rarity: 'rare', stack: 5, icon: { shape: 'tome', c1: '#5a3a8a', c2: '#e9c46a' }, value: 120, use: { resetSkills: true } },
  { id: 'settlement_charter', name: '정착 헌장', desc: '새로운 정착지를 세울 권리를 증명하는 문서. 이 땅에 사람들이 모여들 날이 머지않았다. (PHASE 4: 주민 시스템에서 사용)', category: 'special', rarity: 'legendary', stack: 1, icon: { shape: 'scroll', c1: '#e9dcb5', c2: '#c0392b' }, value: 1000 },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(list.map((i) => [i.id, i]));

export function item(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`Unknown item: ${id}`);
  return d;
}

export function itemName(id: string): string {
  return ITEMS[id]?.name ?? id;
}
