import type { Cost } from './recipes';

/**
 * Interior dungeons, described as data. Layout is a grid of 2 m cells (x across, z forward);
 * everything else is placed in local metres from the dungeon origin. Each dungeon lives far
 * outside the islands so it never overlaps the overworld.
 */
export type LeverSymbol = 'sun' | 'moon' | 'star';
type V2 = [number, number];

export interface DungeonRoom {
  x0: number; // cell coords, inclusive
  x1: number;
  z0: number;
  z1: number;
  h?: number;
}

export interface DungeonChest {
  id: string;
  at: V2;
  rot: number;
  label: string;
  items: Cost[];
  /** stays sealed until the boss falls */
  sealed?: boolean;
}

export type DungeonPuzzle =
  | { kind: 'levers'; order: LeverSymbol[]; levers: { symbol: LeverSymbol; at: V2; rot: number }[] }
  | { kind: 'valves'; valves: { id: string; at: V2; rot: number }[] };

export interface DungeonTheme {
  floor: string;
  wall: string;
  ceil: string;
  ceilTint: number;
  torch: number;
  portal: number;
  /** crack wall tint */
  crack: string;
}

export interface DungeonDef {
  id: string;
  name: string;
  enterSubtitle: string;
  /** the location in the overworld whose entrance leads here */
  location: string;
  exitOffset: V2;
  origin: [number, number, number];
  wallH: number;
  rooms: DungeonRoom[];
  /** edges between two open cells that are walled anyway: [x, z, nx, nz] */
  walledEdges?: [number, number, number, number][];
  theme: DungeonTheme;
  entry: V2;
  /** extent used to know whether a position is inside (local metres: x0, x1, z0, z1) */
  bounds: [number, number, number, number];
  mapCenter: V2;
  gate: { at: V2; width: number; height: number; counter: string; openTitle: string; openSubtitle: string };
  puzzle: DungeonPuzzle;
  puzzleHints: { progress: string; wrong?: string };
  crack?: { at: V2; hp: number };
  torches: [number, number, number, number][];
  pillars: [number, number, number][];
  braziers: V2[];
  portals: { id: string; at: V2; rot: number; label: string }[];
  chests: DungeonChest[];
  lore: { id: string; at: V2; rot: number; label: string; title: string; text: string };
  spawns: [string, number, number][];
  boss: { enemy: string; at: V2; chamber: [number, number, number, number]; minion?: string; deadTitle: string; deadSubtitle: string; color: number };
  /** lava floor strips (local metres x0, x1, z0, z1); `cooled` ones stop burning when the puzzle is solved */
  lava?: { rect: [number, number, number, number]; cooled?: boolean }[];
  decor?: { kind: 'sarcophagus' | 'stalagmite' | 'crystal'; at: V2; size?: number }[];
}

export const DUNGEONS: Record<string, DungeonDef> = {
  crypt: {
    id: 'crypt',
    name: '잊혀진 묘소',
    enterSubtitle: '차가운 공기가 뼛속까지 스며든다',
    location: 'crypt_entrance',
    exitOffset: [0, 6.5],
    origin: [1400, 30, 0],
    wallH: 6,
    rooms: [
      { x0: -3, x1: 2, z0: 0, z1: 5 }, // entry hall
      { x0: -1, x1: 0, z0: 6, z1: 10 }, // corridor 1
      { x0: -4, x1: 3, z0: 11, z1: 18 }, // lever chamber
      { x0: -1, x1: 0, z0: 19, z1: 23 }, // corridor 2
      { x0: 1, x1: 3, z0: 20, z1: 22 }, // hidden treasure room
      { x0: -5, x1: 4, z0: 24, z1: 33, h: 8 }, // boss chamber
    ],
    // the hidden room shares a boundary with corridor 2; only the cracked cell is open
    walledEdges: [
      [0, 20, 1, 20],
      [0, 22, 1, 22],
    ],
    theme: { floor: '#5c5850', wall: '#77716a', ceil: '#4a4640', ceilTint: 0x8a847a, torch: 0xff9a4a, portal: 0x5fe0f0, crack: '#8a7a70' },
    entry: [0, 6.5],
    bounds: [-40, 40, -5, 75],
    mapCenter: [0, 34],
    gate: { at: [0, 38], width: 4, height: 4.2, counter: 'crypt:gate', openTitle: '철문이 열렸다', openSubtitle: '묘소 깊은 곳으로 가는 길이 드러났다' },
    puzzle: {
      kind: 'levers',
      order: ['sun', 'moon', 'star'],
      levers: [
        { symbol: 'star', at: [-7.4, 28], rot: Math.PI / 2 },
        { symbol: 'sun', at: [4.5, 37.4], rot: Math.PI },
        { symbol: 'moon', at: [7.4, 26], rot: -Math.PI / 2 },
      ],
    },
    puzzleHints: { progress: '철컥… 어딘가에서 톱니가 맞물리는 소리가 난다', wrong: '레버들이 덜컹거리며 제자리로 돌아간다. 순서가 틀린 것 같다' },
    crack: { at: [2, 43], hp: 3 },
    torches: [
      [-5.7, 6, 1, 0],
      [5.7, 6, -1, 0],
      [-1.7, 16, 1, 0],
      [-7.7, 33, 1, 0],
      [7.7, 33, -1, 0],
      [-3, 22.3, 0, 1],
      [-1.7, 44, 1, 0],
      [-9.7, 56, 1, 0],
      [9.7, 56, -1, 0],
      [-9.7, 64, 1, 0],
      [9.7, 64, -1, 0],
    ],
    pillars: [
      [-3.5, 30, 6],
      [3.5, 30, 6],
      [-6, 52, 8],
      [6, 52, 8],
      [-6, 62, 8],
      [6, 62, 8],
    ],
    braziers: [
      [-4, 57],
      [4, 57],
    ],
    portals: [
      { id: 'dportal_entry', at: [-5.2, 3], rot: Math.PI / 2, label: '묘소에서 나가기' },
      { id: 'dportal_exit', at: [-7, 66], rot: 0, label: '묘소에서 나가기' },
    ],
    chests: [
      { id: 'dchest_hidden', at: [5, 43], rot: -Math.PI / 2, label: '열기: 먼지 쌓인 보물함', items: [{ item: 'arcane_ring', qty: 1 }, { item: 'mana_potion', qty: 2 }, { item: 'skill_tome', qty: 1 }] },
      { id: 'dchest_boss', at: [0, 66], rot: Math.PI, label: '열기: 왕의 보물함', items: [{ item: 'copper_ingot', qty: 6 }, { item: 'crystal', qty: 2 }, { item: 'health_potion', qty: 2 }], sealed: true },
    ],
    lore: {
      id: 'crypt_hall',
      at: [-4, 10],
      rot: 0.7,
      label: '읽기: 묘지기의 기록',
      title: '묘지기의 기록',
      text: '"왕께서 잠드신 지 천 년. 나는 아직 이곳을 지킨다.\n\n세 개의 문양은 하루의 흐름을 따라야만 길을 연다. 순서를 어긴 자에게 철문은 응답하지 않는다.\n\n벽 너머에 왕의 보물 일부를 숨겨 두었다. 금이 간 돌은 오래 버티지 못하리라."',
    },
    spawns: [
      ['skeleton', 0, 18],
      ['skeleton', -2, 33],
      ['skeleton', 2, 26],
      ['skeleton_archer', 0, 35.5],
      ['skeleton_archer', 0, 46],
    ],
    boss: { enemy: 'crypt_keeper', at: [0, 58], chamber: [-11, 11, 49, 80], minion: 'skeleton', deadTitle: '묘지기를 쓰러뜨렸다!', deadSubtitle: '왕의 보물함의 봉인이 풀렸다', color: 0xb06aff },
    decor: [{ kind: 'sarcophagus', at: [0, 64] }],
  },

  lava_cave: {
    id: 'lava_cave',
    name: '용암 동굴',
    enterSubtitle: '숨이 막히는 열기 · 바닥 아래에서 용암이 흐른다',
    location: 'ember_cave',
    exitOffset: [0, 7],
    origin: [1600, 30, 0],
    wallH: 7,
    rooms: [
      { x0: -3, x1: 2, z0: 0, z1: 5 }, // entry cave
      { x0: -1, x1: 0, z0: 6, z1: 9 }, // tunnel
      { x0: -6, x1: 5, z0: 10, z1: 21, h: 9 }, // magma hall (lava river across it)
      { x0: -9, x1: -7, z0: 11, z1: 13 }, // west valve alcove
      { x0: 6, x1: 8, z0: 11, z1: 13 }, // east valve alcove
      { x0: -1, x1: 0, z0: 22, z1: 25 }, // tunnel behind the gate
      { x0: 1, x1: 3, z0: 23, z1: 25 }, // hidden pocket behind collapsed rock
      { x0: -7, x1: 6, z0: 26, z1: 37, h: 10 }, // sentinel's arena
    ],
    walledEdges: [
      [0, 23, 1, 23],
      [0, 25, 1, 25],
    ],
    theme: { floor: '#3a302a', wall: '#4a3e36', ceil: '#2a221e', ceilTint: 0x6a5048, torch: 0xff6a2a, portal: 0xff8a3a, crack: '#5a4238' },
    entry: [0, 6.5],
    bounds: [-40, 40, -5, 80],
    mapCenter: [0, 38],
    gate: { at: [0, 44], width: 4, height: 4.6, counter: 'cave:gate', openTitle: '현무암 문이 열렸다', openSubtitle: '용암이 식어 길이 생겼다' },
    puzzle: {
      kind: 'valves',
      valves: [
        { id: 'valve_w', at: [-16, 24], rot: Math.PI / 2 },
        { id: 'valve_e', at: [15, 24], rot: -Math.PI / 2 },
        { id: 'valve_n', at: [-8, 41], rot: Math.PI },
      ],
    },
    puzzleHints: { progress: '쉬익— 차가운 물이 관을 타고 흐른다. 용암 강이 조금 식었다' },
    crack: { at: [2, 49], hp: 4 },
    torches: [
      [-5.7, 6, 1, 0],
      [5.7, 6, -1, 0],
      [-11.7, 22, 1, 0],
      [11.7, 22, -1, 0],
      [-11.7, 40, 1, 0],
      [11.7, 40, -1, 0],
      [-13.7, 58, 1, 0],
      [13.7, 58, -1, 0],
      [-13.7, 70, 1, 0],
      [13.7, 70, -1, 0],
    ],
    pillars: [
      [-8, 58, 10],
      [8, 58, 10],
      [-8, 70, 10],
      [8, 70, 10],
    ],
    braziers: [
      [-5, 60],
      [5, 60],
    ],
    portals: [
      { id: 'lportal_entry', at: [-5.2, 3], rot: Math.PI / 2, label: '동굴에서 나가기' },
      { id: 'lportal_exit', at: [-12, 74], rot: 0, label: '동굴에서 나가기' },
    ],
    chests: [
      { id: 'lchest_hidden', at: [6, 49], rot: -Math.PI / 2, label: '열기: 그을린 상자', items: [{ item: 'iron_ingot', qty: 6 }, { item: 'ember_fruit', qty: 3 }, { item: 'skill_tome', qty: 1 }] },
      { id: 'lchest_boss', at: [0, 74], rot: Math.PI, label: '열기: 흑요석 보물함', items: [{ item: 'sentinel_ring', qty: 1 }, { item: 'obsidian', qty: 6 }, { item: 'iron_ingot', qty: 8 }, { item: 'health_potion', qty: 2 }], sealed: true },
    ],
    lore: {
      id: 'cave_note',
      at: [-4, 10],
      rot: 0.7,
      label: '읽기: 탐험대의 마지막 쪽지',
      title: '탐험대의 마지막 쪽지',
      text: '"용암 강 너머에 현무암 문이 있다. 옛사람들은 물길을 끌어 강을 식혔던 것 같다.\n\n밸브는 셋. 양쪽 벽감에 하나씩, 그리고 하나는 강 건너편에. 불씨 열매 없이는 건너지 마라.\n\n문 너머에서 검은 거인이 깨어났다. 무너진 바위 틈에 우리가 숨겨 둔 물건이 있다."',
    },
    spawns: [
      ['cinder_skeleton', 0, 18],
      ['magma_slime', -6, 24],
      ['magma_slime', 7, 26],
      ['cinder_skeleton', -4, 38],
      ['skeleton_archer', 4, 40],
      ['cinder_skeleton', 0, 47],
    ],
    boss: { enemy: 'obsidian_sentinel', at: [0, 62], chamber: [-15, 15, 51, 80], minion: 'cinder_skeleton', deadTitle: '흑요석 파수꾼을 쓰러뜨렸다!', deadSubtitle: '흑요석 보물함의 봉인이 풀렸다', color: 0x8a4aff },
    lava: [
      { rect: [-12, 12, 28, 34], cooled: true },
      { rect: [-14, -10, 52, 55] },
      { rect: [10, 14, 72, 75] },
    ],
    decor: [
      { kind: 'stalagmite', at: [-10, 21.5], size: 1.4 },
      { kind: 'stalagmite', at: [10, 21], size: 1.1 },
      { kind: 'stalagmite', at: [-9, 38], size: 1.2 },
      { kind: 'stalagmite', at: [9, 36], size: 1.5 },
      { kind: 'crystal', at: [-12, 64], size: 1.2 },
      { kind: 'crystal', at: [12, 64], size: 1.0 },
      { kind: 'stalagmite', at: [-4, 2], size: 0.9 },
    ],
  },
};
