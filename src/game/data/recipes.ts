export type StationId = 'workbench' | 'campfire' | 'furnace';

export interface Cost {
  item: string;
  qty: number;
}

/** All conditions must be satisfied for a recipe / buildable to be known. */
export type UnlockRule =
  | { type: 'start' }
  | { type: 'item'; item: string } // having ever obtained this item
  | { type: 'level'; level: number }
  | { type: 'quest'; quest: string } // quest completed
  | { type: 'lore'; id: string } // lore tablet read
  | { type: 'settlement'; level: number }; // settlement tier reached

export interface RecipeDef {
  id: string;
  output: string;
  qty: number;
  inputs: Cost[];
  station: StationId | null;
  category: 'tools' | 'weapons' | 'armor' | 'consumables' | 'materials' | 'special';
  unlock: UnlockRule[];
  xp: number;
}

export const STATION_NAME: Record<StationId, string> = {
  workbench: '작업대',
  campfire: '모닥불',
  furnace: '화로',
};

export const RECIPE_CATEGORY_NAME: Record<RecipeDef['category'], string> = {
  tools: '도구',
  weapons: '무기',
  armor: '방어구',
  consumables: '소모품',
  materials: '재료',
  special: '특수',
};

export const RECIPES: RecipeDef[] = [
  { id: 'r_stone_axe', output: 'stone_axe', qty: 1, inputs: [{ item: 'wood', qty: 3 }, { item: 'stone', qty: 2 }, { item: 'fiber', qty: 2 }], station: null, category: 'tools', unlock: [{ type: 'start' }], xp: 10 },
  { id: 'r_stone_pickaxe', output: 'stone_pickaxe', qty: 1, inputs: [{ item: 'wood', qty: 3 }, { item: 'stone', qty: 3 }, { item: 'fiber', qty: 2 }], station: null, category: 'tools', unlock: [{ type: 'start' }], xp: 10 },
  { id: 'r_healing_salve', output: 'healing_salve', qty: 1, inputs: [{ item: 'berry', qty: 3 }, { item: 'fiber', qty: 2 }], station: null, category: 'consumables', unlock: [{ type: 'item', item: 'berry' }], xp: 4 },
  { id: 'r_stone_sword', output: 'stone_sword', qty: 1, inputs: [{ item: 'wood', qty: 2 }, { item: 'stone', qty: 6 }, { item: 'fiber', qty: 3 }], station: 'workbench', category: 'weapons', unlock: [{ type: 'start' }], xp: 15 },
  { id: 'r_cooked_meat', output: 'cooked_meat', qty: 1, inputs: [{ item: 'raw_meat', qty: 1 }], station: 'campfire', category: 'consumables', unlock: [{ type: 'item', item: 'raw_meat' }], xp: 3 },
  { id: 'r_leather', output: 'leather', qty: 1, inputs: [{ item: 'wolf_pelt', qty: 1 }, { item: 'fiber', qty: 1 }], station: 'workbench', category: 'materials', unlock: [{ type: 'item', item: 'wolf_pelt' }], xp: 4 },
  { id: 'r_leather_armor', output: 'leather_armor', qty: 1, inputs: [{ item: 'leather', qty: 4 }, { item: 'fiber', qty: 6 }], station: 'workbench', category: 'armor', unlock: [{ type: 'item', item: 'leather' }], xp: 25 },
  { id: 'r_copper_ingot', output: 'copper_ingot', qty: 1, inputs: [{ item: 'copper_ore', qty: 2 }, { item: 'wood', qty: 1 }], station: 'furnace', category: 'materials', unlock: [{ type: 'item', item: 'copper_ore' }], xp: 5 },
  { id: 'r_copper_axe', output: 'copper_axe', qty: 1, inputs: [{ item: 'copper_ingot', qty: 3 }, { item: 'wood', qty: 3 }], station: 'workbench', category: 'tools', unlock: [{ type: 'item', item: 'copper_ingot' }], xp: 25 },
  { id: 'r_copper_pickaxe', output: 'copper_pickaxe', qty: 1, inputs: [{ item: 'copper_ingot', qty: 3 }, { item: 'wood', qty: 3 }], station: 'workbench', category: 'tools', unlock: [{ type: 'item', item: 'copper_ingot' }], xp: 25 },
  { id: 'r_copper_sword', output: 'copper_sword', qty: 1, inputs: [{ item: 'copper_ingot', qty: 5 }, { item: 'wood', qty: 2 }, { item: 'leather', qty: 1 }], station: 'workbench', category: 'weapons', unlock: [{ type: 'item', item: 'copper_ingot' }], xp: 35 },
  { id: 'r_copper_armor', output: 'copper_armor', qty: 1, inputs: [{ item: 'copper_ingot', qty: 8 }, { item: 'leather', qty: 3 }], station: 'workbench', category: 'armor', unlock: [{ type: 'item', item: 'copper_ingot' }, { type: 'level', level: 5 }], xp: 50 },
  { id: 'r_health_potion', output: 'health_potion', qty: 1, inputs: [{ item: 'slime_gel', qty: 2 }, { item: 'berry', qty: 3 }], station: 'workbench', category: 'consumables', unlock: [{ type: 'item', item: 'slime_gel' }], xp: 8 },
  { id: 'r_crystal_blade', output: 'crystal_blade', qty: 1, inputs: [{ item: 'crystal', qty: 4 }, { item: 'copper_ingot', qty: 4 }, { item: 'leather', qty: 2 }], station: 'workbench', category: 'weapons', unlock: [{ type: 'item', item: 'crystal' }, { type: 'level', level: 6 }], xp: 80 },
  { id: 'r_bread', output: 'bread', qty: 1, inputs: [{ item: 'wheat', qty: 3 }], station: 'campfire', category: 'consumables', unlock: [{ type: 'item', item: 'wheat' }], xp: 3 },
  { id: 'r_stone_brick', output: 'stone_brick', qty: 2, inputs: [{ item: 'stone', qty: 3 }], station: 'workbench', category: 'materials', unlock: [{ type: 'level', level: 4 }], xp: 2 },
  { id: 'r_bone_charm', output: 'bone_charm', qty: 1, inputs: [{ item: 'bone', qty: 6 }, { item: 'fiber', qty: 4 }, { item: 'slime_gel', qty: 2 }], station: 'workbench', category: 'armor', unlock: [{ type: 'item', item: 'bone' }], xp: 30 },
  { id: 'r_mana_potion', output: 'mana_potion', qty: 1, inputs: [{ item: 'gloom_essence', qty: 1 }, { item: 'slime_gel', qty: 2 }, { item: 'berry', qty: 2 }], station: 'workbench', category: 'consumables', unlock: [{ type: 'item', item: 'gloom_essence' }], xp: 10 },
  { id: 'r_warden_amulet', output: 'warden_amulet', qty: 1, inputs: [{ item: 'warden_core', qty: 1 }, { item: 'copper_ingot', qty: 4 }, { item: 'crystal', qty: 2 }], station: 'workbench', category: 'armor', unlock: [{ type: 'item', item: 'warden_core' }], xp: 120 },
  { id: 'r_skill_tome', output: 'skill_tome', qty: 1, inputs: [{ item: 'ancient_fragment', qty: 1 }, { item: 'gloom_essence', qty: 2 }, { item: 'bone', qty: 4 }], station: 'workbench', category: 'special', unlock: [{ type: 'lore', id: 'crypt_entrance' }], xp: 40 },
  { id: 'r_ancient_sigil', output: 'ancient_sigil', qty: 1, inputs: [{ item: 'crystal', qty: 2 }, { item: 'gloom_essence', qty: 3 }, { item: 'ancient_fragment', qty: 1 }, { item: 'stone', qty: 10 }], station: 'workbench', category: 'special', unlock: [{ type: 'lore', id: 'sunken_shrine' }], xp: 60 },
];

export const RECIPE_BY_ID: Record<string, RecipeDef> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
