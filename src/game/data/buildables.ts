import type { Cost, StationId, UnlockRule } from './recipes';

export type SnapMode = 'cell' | 'edge' | 'corner' | 'free';
export type BuildCategory = 'structure' | 'stone' | 'marble' | 'fortress' | 'utility' | 'decor';
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
  | 'banner'
  | 'road'
  | 'bridge'
  | 'castle_wall'
  | 'tower'
  | 'bookshelf'
  | 'rug'
  | 'planter'
  | 'lantern';

export interface BuildableDef {
  id: string;
  name: string;
  desc: string;
  category: BuildCategory;
  shape: BuildShape;
  material: 'wood' | 'stone' | 'marble';
  snap: SnapMode;
  cost: Cost[];
  unlock: UnlockRule[];
  station?: StationId;
  interact?: 'door' | 'chest' | 'bed' | 'station';
  storage?: number;
  light?: { color: number; intensity: number; distance: number };
  /** Night creatures will not spawn within this radius. */
  safeRadius?: number;
  /** counts toward shelter comfort when standing nearby */
  comfort?: boolean;
}

export const BUILD_CATEGORY_NAME: Record<BuildCategory, string> = {
  structure: '목조 구조',
  stone: '석조 구조',
  marble: '대리석',
  fortress: '요새',
  utility: '시설',
  decor: '장식',
};

const START: UnlockRule[] = [{ type: 'start' }];
const STONE: UnlockRule[] = [{ type: 'level', level: 3 }];
const MARBLE: UnlockRule[] = [{ type: 'item', item: 'stone_brick' }, { type: 'level', level: 5 }];
const FORT: UnlockRule[] = [{ type: 'item', item: 'stone_brick' }];

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
  { id: 'wood_bridge', name: '나무 다리', desc: '폭 2m, 길이 6m의 판자 다리. 양쪽 끝 중 한쪽만 땅에 닿아도 설치할 수 있다.', category: 'structure', shape: 'bridge', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 16 }, { item: 'fiber', qty: 6 }], unlock: STONE },
  { id: 'road_dirt', name: '흙길', desc: '지형을 따라 깔리는 길. 길 위에서는 이동 속도가 빨라진다.', category: 'structure', shape: 'road', material: 'wood', snap: 'cell', cost: [{ item: 'stone', qty: 1 }], unlock: START },
  { id: 'road_stone', name: '돌길', desc: '단단한 돌을 깐 길. 길 위에서는 이동 속도가 빨라진다.', category: 'stone', shape: 'road', material: 'stone', snap: 'cell', cost: [{ item: 'stone', qty: 3 }], unlock: STONE },
  // Marble (dressed stone bricks)
  { id: 'marble_foundation', name: '대리석 토대', desc: '정교하게 다듬은 흰 돌의 기초. 매우 튼튼하다.', category: 'marble', shape: 'foundation', material: 'marble', snap: 'cell', cost: [{ item: 'stone_brick', qty: 8 }], unlock: MARBLE },
  { id: 'marble_floor', name: '대리석 바닥', desc: '광택이 나는 바닥.', category: 'marble', shape: 'floor', material: 'marble', snap: 'cell', cost: [{ item: 'stone_brick', qty: 5 }], unlock: MARBLE },
  { id: 'marble_wall', name: '대리석 벽', desc: '금빛 띠를 두른 흰 돌벽.', category: 'marble', shape: 'wall', material: 'marble', snap: 'edge', cost: [{ item: 'stone_brick', qty: 6 }], unlock: MARBLE },
  { id: 'marble_doorway', name: '대리석 문틀 벽', desc: '출입구가 있는 대리석 벽.', category: 'marble', shape: 'doorway', material: 'marble', snap: 'edge', cost: [{ item: 'stone_brick', qty: 5 }], unlock: MARBLE },
  { id: 'marble_window', name: '대리석 창문 벽', desc: '창이 있는 대리석 벽.', category: 'marble', shape: 'window', material: 'marble', snap: 'edge', cost: [{ item: 'stone_brick', qty: 5 }], unlock: MARBLE },
  { id: 'marble_stairs', name: '대리석 계단', desc: '우아한 대리석 계단.', category: 'marble', shape: 'stairs', material: 'marble', snap: 'cell', cost: [{ item: 'stone_brick', qty: 7 }], unlock: MARBLE },
  { id: 'marble_pillar', name: '대리석 기둥', desc: '신전처럼 웅장한 기둥.', category: 'marble', shape: 'pillar', material: 'marble', snap: 'corner', cost: [{ item: 'stone_brick', qty: 3 }], unlock: MARBLE },
  // Fortress
  { id: 'castle_wall', name: '성벽', desc: '두께 1m, 높이 5m의 성벽. 위에 올라서서 걸을 수 있다. 계단 두 개를 쌓으면 오를 수 있다.', category: 'fortress', shape: 'castle_wall', material: 'stone', snap: 'edge', cost: [{ item: 'stone', qty: 10 }, { item: 'stone_brick', qty: 4 }], unlock: FORT },
  { id: 'castle_tower', name: '성탑', desc: '높이 7.5m의 감시탑. 꼭대기의 화로가 넓은 지역을 밝혀 밤의 괴물을 막는다.', category: 'fortress', shape: 'tower', material: 'stone', snap: 'corner', cost: [{ item: 'stone', qty: 30 }, { item: 'stone_brick', qty: 12 }, { item: 'copper_ingot', qty: 2 }], unlock: FORT, light: { color: 0xffa050, intensity: 34, distance: 30 }, safeRadius: 34 },
  // Utility
  { id: 'workbench', name: '작업대', desc: '도구, 무기, 방어구를 제작하는 작업대. 근처에서 [E] 또는 제작 메뉴를 사용한다.', category: 'utility', shape: 'workbench', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 10 }, { item: 'stone', qty: 4 }], unlock: START, station: 'workbench', interact: 'station' },
  { id: 'campfire', name: '모닥불', desc: '고기를 굽고 어둠을 밝힌다. 불빛 근처에는 밤의 괴물이 나타나지 않는다.', category: 'utility', shape: 'campfire', material: 'stone', snap: 'free', cost: [{ item: 'wood', qty: 5 }, { item: 'stone', qty: 6 }], unlock: START, station: 'campfire', interact: 'station', light: { color: 0xff8a3a, intensity: 18, distance: 16 }, safeRadius: 22 },
  { id: 'furnace', name: '화로', desc: '광석을 제련하는 화로.', category: 'utility', shape: 'furnace', material: 'stone', snap: 'free', cost: [{ item: 'stone', qty: 15 }, { item: 'wood', qty: 4 }], unlock: [{ type: 'item', item: 'copper_ore' }], station: 'furnace', interact: 'station', light: { color: 0xff6a2a, intensity: 10, distance: 10 }, safeRadius: 16 },
  { id: 'chest', comfort: true, name: '보관함', desc: '아이템 24칸을 보관한다.', category: 'utility', shape: 'chest', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 12 }, { item: 'fiber', qty: 2 }], unlock: START, interact: 'chest', storage: 24 },
  { id: 'bed', comfort: true, name: '침대', desc: '부활 지점을 설정한다. 밤에는 잠을 자서 아침까지 시간을 보낼 수 있다.', category: 'utility', shape: 'bed', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 10 }, { item: 'fiber', qty: 12 }], unlock: START, interact: 'bed', safeRadius: 14 },
  { id: 'torch', name: '횃불', desc: '주변을 밝히는 횃불. 불빛 근처에는 밤의 괴물이 나타나지 않는다.', category: 'utility', shape: 'torch', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 2 }, { item: 'fiber', qty: 1 }], unlock: START, light: { color: 0xffa04a, intensity: 10, distance: 13 }, safeRadius: 18 },
  // Decor
  { id: 'table', name: '나무 탁자', desc: '소박한 탁자. 집의 안락도를 높인다.', category: 'decor', shape: 'table', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 6 }], unlock: START, comfort: true },
  { id: 'chair', name: '나무 의자', desc: '소박한 의자. 집의 안락도를 높인다.', category: 'decor', shape: 'chair', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 4 }], unlock: START, comfort: true },
  { id: 'banner', name: '깃발', desc: '당신의 거점을 알리는 깃발. 집의 안락도를 높인다.', category: 'decor', shape: 'banner', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 3 }, { item: 'fiber', qty: 6 }], unlock: START, comfort: true },
  { id: 'bookshelf', name: '책장', desc: '빼곡한 책장. 집의 안락도를 높인다.', category: 'decor', shape: 'bookshelf', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 10 }, { item: 'fiber', qty: 4 }], unlock: START, comfort: true },
  { id: 'rug', name: '카펫', desc: '바닥에 까는 붉은 카펫. 집의 안락도를 높인다.', category: 'decor', shape: 'rug', material: 'wood', snap: 'free', cost: [{ item: 'fiber', qty: 12 }], unlock: START, comfort: true },
  { id: 'planter', name: '화분', desc: '꽃이 핀 화분. 집의 안락도를 높인다.', category: 'decor', shape: 'planter', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 3 }, { item: 'stone', qty: 2 }, { item: 'berry', qty: 2 }], unlock: START, comfort: true },
  { id: 'lantern_post', name: '가로등', desc: '구리 등불을 단 기둥. 길을 밝히고 밤의 괴물을 막는다.', category: 'decor', shape: 'lantern', material: 'wood', snap: 'free', cost: [{ item: 'wood', qty: 4 }, { item: 'stone', qty: 2 }, { item: 'copper_ingot', qty: 1 }], unlock: [{ type: 'item', item: 'copper_ingot' }], light: { color: 0xffc070, intensity: 12, distance: 15 }, safeRadius: 18, comfort: true },
];

export const BUILDABLE_BY_ID: Record<string, BuildableDef> = Object.fromEntries(BUILDABLES.map((b) => [b.id, b]));
