import type { Cost, StationId, UnlockRule } from './recipes';

export type SnapMode = 'cell' | 'edge' | 'corner' | 'free';
export type BuildCategory = 'structure' | 'stone' | 'utility' | 'decor';
export type BuildShape =
  | 'foundation'
  | 'floor'
  | 'wall'
  | 'doorway'
  | 'window'
  | 'door'
  | 'roof'
  | 'gable'
  | 'stairs'
  | 'pillar'
  | 'fence'
  | 'workbench'
  | 'campfire'
  | 'furnace'
  | 'chest'
  | 'bed'
  | 'torch'
  | 'table'
  | 'chair'
  | 'banner';

export interface BuildableDef {
  id: string;
  name: string;
  desc: string;
  category: BuildCategory;
  shape: BuildShape;
  material: 'wood' | 'stone';
  snap: SnapMode;
  cost: Cost[];
  unlock: UnlockRule[];
  station?: StationId;
  interact?: 'door' | 'chest' | 'bed' | 'station';
  storage?: number;
  light?: { color: number; intensity: number; distance: number };
  /** Night creatures will not spawn within this radius. */
  safeRadius?: number;
}

export const BUILD_CATEGORY_NAME: Record<BuildCategory, string> = {
  structure: '목조 구조',
  stone: '석조 구조',
  utility: '시설',
  decor: '장식',
};

const START: UnlockRule[] = [{ type: 'start' }];
const STONE: UnlockRule[] = [{ type: 'level', level: 3 }];

export const BUILDABLES: BuildableDef[] = [
  // Wood structure
  { id: 'wood_foundation', name: '나무 토대', desc: '건물의 기초. 울퉁불퉁한 지형 위에서도 평평한 바닥을 만든다.', category: 'structure', shape: 'foundation', material: 'wood', snap: 'cell', cost: [{ item: 'wood', qty: 6 }], unlock: START },
  { id: 'wood_floor', name: '나무 바닥', desc: '얇은 바닥판. 2층 바닥이나 평평한 지붕으로 쓸 수 있다.', category: 'structure', shape: 'floor', material: 'wood', snap: 'cell', cost: [{ item: 'wood', qty: 4 }], unlock: START },
  { id: 'wood_wall', name: '나무 벽', desc: '기본 벽. 격자의 가장자리에 붙는다.', category: 'structure', shape: 'wall', material: 'wood', snap: 'edge', cost: [{ item: 'wood', qty: 5 }], unlock: START },
  { id: 'wood_doorway', name: '나무 문틀 벽', desc: '문을 달 수 있는 출입구가 있는 벽.', category: 'structure', shape: 'doorway', material: 'wood', snap: 'edge', cost: [{ item: 'wood', qty: 4 }], unlock: START },
  { id: 'wood_window', name: '나무 창문 벽', desc: '빛이 드는 창이 있는 벽.', category: 'structure', shape: 'window', material: 'wood', snap: 'edge', cost: [{ item: 'wood', qty: 4 }], unlock: START },
  { id: 'wood_door', name: '나무 문', desc: '문틀 벽에 설치한다. [E]로 열고 닫을 수 있다.', category: 'structure', shape: 'door', material: 'wood', snap: 'edge', cost: [{ item: 'wood', qty: 4 }, { item: 'fiber', qty: 2 }], unlock: START, interact: 'door' },
  { id: 'wood_roof', name: '경사 지붕', desc: '한쪽으로 기울어진 지붕. 두 개를 마주 보게 놓으면 박공지붕이 된다.', category: 'structure', shape: 'roof', material: 'wood', snap: 'cell', cost: [{ item: 'wood', qty: 4 }, { item: 'fiber', qty: 2 }], unlock: START },
  { id: 'wood_gable', name: '박공 벽', desc: '지붕 아래 삼각형 공간을 막는 벽.', category: 'structure', shape: 'gable', material: 'wood', snap: 'edge', cost: [{ item: 'wood', qty: 3 }], unlock: START },
  { id: 'wood_stairs', name: '나무 계단', desc: '한 층 높이를 오르는 계단.', category: 'structure', shape: 'stairs', material: 'wood', snap: 'cell', cost: [{ item: 'wood', qty: 6 }], unlock: START },
  { id: 'wood_pillar', name: '나무 기둥', desc: '격자의 모서리에 세우는 기둥.', category: 'structure', shape: 'pillar', material: 'wood', snap: 'corner', cost: [{ item: 'wood', qty: 2 }], unlock: START },
  { id: 'wood_fence', name: '나무 울타리', desc: '낮은 울타리. 영역을 구분한다.', category: 'structure', shape: 'fence', material: 'wood', snap: 'edge', cost: [{ item: 'wood', qty: 2 }], unlock: START },
  // Stone structure
  { id: 'stone_foundation', name: '석조 토대', desc: '돌로 쌓은 튼튼한 기초.', category: 'stone', shape: 'foundation', material: 'stone', snap: 'cell', cost: [{ item: 'stone', qty: 8 }], unlock: STONE },
  { id: 'stone_floor', name: '석조 바닥', desc: '돌판으로 깐 바닥.', category: 'stone', shape: 'floor', material: 'stone', snap: 'cell', cost: [{ item: 'stone', qty: 5 }], unlock: STONE },
  { id: 'stone_wall', name: '석조 벽', desc: '돌을 쌓아 만든 단단한 벽.', category: 'stone', shape: 'wall', material: 'stone', snap: 'edge', cost: [{ item: 'stone', qty: 6 }], unlock: STONE },
  { id: 'stone_doorway', name: '석조 문틀 벽', desc: '출입구가 있는 석조 벽.', category: 'stone', shape: 'doorway', material: 'stone', snap: 'edge', cost: [{ item: 'stone', qty: 5 }], unlock: STONE },
  { id: 'stone_window', name: '석조 창문 벽', desc: '창이 있는 석조 벽.', category: 'stone', shape: 'window', material: 'stone', snap: 'edge', cost: [{ item: 'stone', qty: 5 }], unlock: STONE },
  { id: 'stone_stairs', name: '석조 계단', desc: '돌로 만든 계단.', category: 'stone', shape: 'stairs', material: 'stone', snap: 'cell', cost: [{ item: 'stone', qty: 7 }], unlock: STONE },
  { id: 'stone_pillar', name: '석조 기둥', desc: '돌기둥.', category: 'stone', shape: 'pillar', material: 'stone', snap: 'corner', cost: [{ item: 'stone', qty: 3 }], unlock: STONE },
  // Utility
  { id: 'workbench', name: '작업대', desc: '도구, 무기, 방어구를 제작하는 작업대. 근처에서 [E] 또는 제작 메뉴를 사용한다.', category: 'utility', shape: 'workbench', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 10 }, { item: 'stone', qty: 4 }], unlock: START, station: 'workbench', interact: 'station' },
  { id: 'campfire', name: '모닥불', desc: '고기를 굽고 어둠을 밝힌다. 불빛 근처에는 밤의 괴물이 나타나지 않는다.', category: 'utility', shape: 'campfire', material: 'stone', snap: 'free', cost: [{ item: 'wood', qty: 5 }, { item: 'stone', qty: 6 }], unlock: START, station: 'campfire', interact: 'station', light: { color: 0xff8a3a, intensity: 18, distance: 16 }, safeRadius: 22 },
  { id: 'furnace', name: '화로', desc: '광석을 제련하는 화로.', category: 'utility', shape: 'furnace', material: 'stone', snap: 'free', cost: [{ item: 'stone', qty: 15 }, { item: 'wood', qty: 4 }], unlock: [{ type: 'item', item: 'copper_ore' }], station: 'furnace', interact: 'station', light: { color: 0xff6a2a, intensity: 10, distance: 10 }, safeRadius: 16 },
  { id: 'chest', name: '보관함', desc: '아이템 24칸을 보관한다.', category: 'utility', shape: 'chest', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 12 }, { item: 'fiber', qty: 2 }], unlock: START, interact: 'chest', storage: 24 },
  { id: 'bed', name: '침대', desc: '부활 지점을 설정한다. 밤에는 잠을 자서 아침까지 시간을 보낼 수 있다.', category: 'utility', shape: 'bed', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 10 }, { item: 'fiber', qty: 12 }], unlock: START, interact: 'bed', safeRadius: 14 },
  { id: 'torch', name: '횃불', desc: '주변을 밝히는 횃불. 불빛 근처에는 밤의 괴물이 나타나지 않는다.', category: 'utility', shape: 'torch', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 2 }, { item: 'fiber', qty: 1 }], unlock: START, light: { color: 0xffa04a, intensity: 10, distance: 13 }, safeRadius: 18 },
  // Decor
  { id: 'table', name: '나무 탁자', desc: '소박한 탁자.', category: 'decor', shape: 'table', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 6 }], unlock: START },
  { id: 'chair', name: '나무 의자', desc: '소박한 의자.', category: 'decor', shape: 'chair', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 4 }], unlock: START },
  { id: 'banner', name: '깃발', desc: '당신의 거점을 알리는 깃발.', category: 'decor', shape: 'banner', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 3 }, { item: 'fiber', qty: 6 }], unlock: START },
];

export const BUILDABLE_BY_ID: Record<string, BuildableDef> = Object.fromEntries(BUILDABLES.map((b) => [b.id, b]));
