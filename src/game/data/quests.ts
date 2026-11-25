import type { Cost } from './recipes';

export type Objective =
  | { type: 'obtain'; item: string; count: number } // items obtained from gathering / loot (cumulative after quest start)
  | { type: 'craft'; item: string; count: number }
  | { type: 'kill'; enemy: string; count: number }
  | { type: 'build'; piece: string; count: number } // pieces of this type placed (cumulative)
  | { type: 'have_built'; shapes: string[]; count: number; label: string } // pieces currently standing in the world
  | { type: 'discover'; location: string }
  | { type: 'discover_count'; count: number }
  | { type: 'level'; level: number }
  | { type: 'eat'; count: number }
  | { type: 'counter'; key: string; count: number; label: string } // generic event counter (e.g. parries, dungeon gate)
  | { type: 'skills_learned'; count: number };

export interface QuestDef {
  id: string;
  title: string;
  chain: 'main' | 'side';
  summary: string;
  description: string;
  objectives: Objective[];
  rewards: { xp: number; items?: Cost[] };
  /** Quest auto-starts once all of these are complete. Empty = available from the start. */
  requires: string[];
}

export const QUESTS: QuestDef[] = [
  // ── Main chain: The First Ember ──────────────────────────
  {
    id: 'q_survive', title: '생존의 시작', chain: 'main', requires: [],
    summary: '나무를 베고 돌을 모으자.',
    description: '바다에 떠밀려 온 섬. 살아남으려면 먼저 재료가 필요하다. 나무 앞에서 [E]를 눌러 목재를, 바위 앞에서 [E]를 눌러 돌을 모으고, 풀숲에서 섬유를 얻자.',
    objectives: [{ type: 'obtain', item: 'wood', count: 8 }, { type: 'obtain', item: 'stone', count: 5 }, { type: 'obtain', item: 'fiber', count: 4 }],
    rewards: { xp: 40 },
  },
  {
    id: 'q_tools', title: '도구 제작', chain: 'main', requires: ['q_survive'],
    summary: '돌도끼와 돌곡괭이를 만들자.',
    description: '[C]로 제작 메뉴를 열어 도구를 만들자. 도구는 가지고 있기만 하면 채집할 때 자동으로 사용된다. 곡괭이가 있어야 광석을 캘 수 있다.',
    objectives: [{ type: 'craft', item: 'stone_axe', count: 1 }, { type: 'craft', item: 'stone_pickaxe', count: 1 }],
    rewards: { xp: 60, items: [{ item: 'berry', qty: 5 }] },
  },
  {
    id: 'q_hunt', title: '초원의 위협', chain: 'main', requires: ['q_tools'],
    summary: '초원 슬라임을 처치하자.',
    description: '초원에 슬라임이 들끓는다. [좌클릭]으로 공격, [우클릭]으로 강공격, [Q]로 구르기 회피. 슬라임이 몸을 웅크리면 곧 덮쳐온다!',
    objectives: [{ type: 'kill', enemy: 'slime', count: 4 }],
    rewards: { xp: 80, items: [{ item: 'healing_salve', qty: 2 }] },
  },
  {
    id: 'q_workbench', title: '장인의 첫걸음', chain: 'main', requires: ['q_hunt'],
    summary: '작업대를 짓고 돌검을 만들자.',
    description: '[B]로 건축 모드를 열고 작업대를 설치하자. 작업대 근처에서는 더 좋은 장비를 만들 수 있다.',
    objectives: [{ type: 'build', piece: 'workbench', count: 1 }, { type: 'craft', item: 'stone_sword', count: 1 }],
    rewards: { xp: 80 },
  },
  {
    id: 'q_shelter', title: '나만의 보금자리', chain: 'main', requires: ['q_workbench'],
    summary: '토대, 벽, 문, 지붕, 침대로 집을 짓자.',
    description: '밤은 위험하다. 토대를 깔고, 벽을 세우고, 문을 달고, 지붕을 올리자. 침대를 놓으면 그곳이 부활 지점이 되고, 밤에는 잠을 잘 수 있다.',
    objectives: [
      { type: 'have_built', shapes: ['foundation', 'floor'], count: 4, label: '토대/바닥' },
      { type: 'have_built', shapes: ['wall', 'doorway', 'window'], count: 6, label: '벽' },
      { type: 'have_built', shapes: ['door'], count: 1, label: '문' },
      { type: 'have_built', shapes: ['roof', 'floor'], count: 2, label: '지붕' },
      { type: 'have_built', shapes: ['bed'], count: 1, label: '침대' },
    ],
    rewards: { xp: 200, items: [{ item: 'cooked_meat', qty: 3 }] },
  },
  {
    id: 'q_copper', title: '고원의 광맥', chain: 'main', requires: ['q_shelter'],
    summary: '구리 광석을 캐고 제련하자.',
    description: '북쪽 잿빛 고원의 바위에는 주황빛 구리 광맥이 있다. 광석을 캐면 화로 제작법을 깨닫게 된다. 화로를 지어 구리 주괴를 만들자. 바위 골렘을 조심하라.',
    objectives: [{ type: 'obtain', item: 'copper_ore', count: 6 }, { type: 'build', piece: 'furnace', count: 1 }, { type: 'craft', item: 'copper_ingot', count: 3 }],
    rewards: { xp: 150 },
  },
  {
    id: 'q_ancients', title: '고대의 메아리', chain: 'main', requires: ['q_copper'],
    summary: '고대 유적을 찾아 비밀을 밝히자.',
    description: '섬 곳곳에 에테르눔 문명의 흔적이 남아 있다. 속삭이는 선돌의 비문이 신전으로 가는 길을 알려줄 것이다. 가라앉은 신전의 석판을 읽자.',
    objectives: [{ type: 'discover', location: 'standing_stones' }, { type: 'discover', location: 'sunken_shrine' }],
    rewards: { xp: 150 },
  },
  {
    id: 'q_sigil', title: '고대 인장', chain: 'main', requires: ['q_ancients'],
    summary: '고대 인장을 만들자.',
    description: '공명 수정(공명의 골짜기, 바위 골렘), 어둠의 정수(밤의 도깨비불), 고대 파편(무너진 감시탑)을 모아 작업대에서 고대 인장을 만들자.',
    objectives: [{ type: 'craft', item: 'ancient_sigil', count: 1 }],
    rewards: { xp: 120 },
  },
  {
    id: 'q_warden', title: '폐허의 수호자', chain: 'main', requires: ['q_sigil'],
    summary: '신전의 제단에 인장을 바치고 수호자를 쓰러뜨리자.',
    description: '가라앉은 신전의 제단에서 [E]로 인장을 바치면 폐허의 수호자가 깨어난다. 체력이 절반 이하가 되면 더욱 난폭해진다. 회복 물약과 좋은 장비를 준비하라.',
    objectives: [{ type: 'kill', enemy: 'warden', count: 1 }],
    rewards: { xp: 500, items: [{ item: 'settlement_charter', qty: 1 }] },
  },
  // ── Side quests ──────────────────────────────────────────
  {
    id: 's_explorer', title: '섬의 탐험가', chain: 'side', requires: [],
    summary: '섬의 장소들을 발견하자.',
    description: '섬에는 일곱 곳의 특별한 장소가 있다. 모두 찾아내 지도를 완성하자.',
    objectives: [{ type: 'discover_count', count: 7 }],
    rewards: { xp: 250, items: [{ item: 'health_potion', qty: 2 }] },
  },
  {
    id: 's_wolves', title: '늑대 사냥꾼', chain: 'side', requires: ['q_hunt'],
    summary: '속삭이는 숲의 늑대를 사냥하자.',
    description: '숲의 늑대들은 무리 지어 다닌다. 웅크린 뒤 달려드는 돌진을 조심하라. 늑대 가죽은 좋은 갑옷이 된다.',
    objectives: [{ type: 'kill', enemy: 'wolf', count: 5 }],
    rewards: { xp: 140, items: [{ item: 'leather', qty: 2 }] },
  },
  {
    id: 's_night', title: '밤의 그림자', chain: 'side', requires: ['q_hunt'],
    summary: '밤에 나타나는 도깨비불을 처치하자.',
    description: '밤이 되면 그림자 도깨비불이 떠다닌다. 날아오는 구체는 구르기로 피할 수 있다. 불빛 근처에는 나타나지 않는다.',
    objectives: [{ type: 'kill', enemy: 'wisp', count: 3 }],
    rewards: { xp: 160 },
  },
  {
    id: 's_cook', title: '따뜻한 한 끼', chain: 'side', requires: ['q_survive'],
    summary: '모닥불에서 고기를 굽자.',
    description: '늑대에게서 얻은 날고기를 모닥불에서 구우면 체력 회복과 배부름 효과를 얻는다. 잿불 야영지에도 모닥불이 있다.',
    objectives: [{ type: 'craft', item: 'cooked_meat', count: 3 }],
    rewards: { xp: 70 },
  },
  {
    id: 's_golem', title: '움직이는 바위', chain: 'side', requires: ['q_copper'],
    summary: '바위 골렘을 쓰러뜨리자.',
    description: '고원의 바위 골렘은 느리지만 강력하다. 붉은 원이 나타나면 그 밖으로 피하라.',
    objectives: [{ type: 'kill', enemy: 'golem', count: 2 }],
    rewards: { xp: 180, items: [{ item: 'crystal', qty: 1 }] },
  },
  {
    id: 's_skill', title: '첫 번째 기술', chain: 'side', requires: ['q_hunt'],
    summary: '스킬을 하나 배우자.',
    description: '레벨이 오르면 스킬 포인트를 얻는다. [K]로 스킬 창을 열어 전투, 생존, 비전 중 원하는 기술을 배우자. 액티브 스킬은 R, T, G, V 키에 등록된다.',
    objectives: [{ type: 'skills_learned', count: 1 }],
    rewards: { xp: 60 },
  },
  {
    id: 's_parry', title: '완벽한 방어', chain: 'side', requires: ['q_hunt'],
    summary: '적의 공격을 패링하자.',
    description: '[F]를 누르고 있으면 막기 자세를 취한다. 적의 공격이 닿기 직전에 막기 시작하면 패링이 되어 적이 크게 비틀거리고, 다음 공격이 치명타가 된다.',
    objectives: [{ type: 'counter', key: 'parry', count: 3, label: '패링 성공' }],
    rewards: { xp: 90, items: [{ item: 'health_potion', qty: 1 }] },
  },
  {
    id: 's_crypt', title: '잊혀진 묘소', chain: 'side', requires: ['q_hunt'],
    summary: '서쪽 숲의 지하 묘소를 탐험하자.',
    description: '섬 서쪽 언덕에 오래된 묘소가 있다고 한다. 입구의 경고문이 철문을 여는 방법을 알려줄 것이다. 묘지기는 해골을 불러내니 서두르지 말고 싸워라.',
    objectives: [
      { type: 'discover', location: 'crypt_entrance' },
      { type: 'counter', key: 'crypt:gate', count: 1, label: '묘소의 철문 열기' },
      { type: 'kill', enemy: 'crypt_keeper', count: 1 },
    ],
    rewards: { xp: 400, items: [{ item: 'mana_potion', qty: 2 }] },
  },
  {
    id: 's_rested', title: '따뜻한 보금자리', chain: 'side', requires: ['q_shelter'],
    summary: '지붕 아래 불 곁에서 쉬자.',
    description: '지붕이 있는 실내에서 횃불이나 모닥불 근처에 잠시 머물면 "휴식" 상태가 된다. 침대, 탁자, 의자, 책장, 카펫 같은 가구가 다양할수록 안락도가 올라 휴식이 오래 지속된다.',
    objectives: [{ type: 'counter', key: 'rested', count: 1, label: '휴식 상태 얻기' }],
    rewards: { xp: 80 },
  },
  {
    id: 's_roads', title: '길을 내다', chain: 'side', requires: ['q_shelter'],
    summary: '거점까지 길을 깔자.',
    description: '흙길이나 돌길은 지형을 따라 깔리고, 길 위에서는 더 빨리 달릴 수 있다. 자주 다니는 곳에 길을 놓아 보자.',
    objectives: [{ type: 'have_built', shapes: ['road'], count: 10, label: '길' }],
    rewards: { xp: 120 },
  },
  {
    id: 's_architect', title: '설계자', chain: 'side', requires: ['q_shelter'],
    summary: '지은 건물을 설계도로 저장하자.',
    description: '건축 모드에서 건물을 바라보고 [P]를 누르면 연결된 건물 전체를 설계도로 저장한다. 설계도 분류에서 골라 다른 곳에 한 번에 지을 수 있다.',
    objectives: [{ type: 'counter', key: 'blueprint:save', count: 1, label: '설계도 저장' }],
    rewards: { xp: 100 },
  },
  {
    id: 's_fortress', title: '요새 건설', chain: 'side', requires: ['q_copper'],
    summary: '성벽과 성탑을 세우자.',
    description: '작업대에서 석재 벽돌을 만들면 성벽과 성탑을 지을 수 있다. 성탑 꼭대기의 화로는 넓은 범위를 밝혀 밤의 괴물이 다가오지 못하게 한다.',
    objectives: [
      { type: 'build', piece: 'castle_wall', count: 6 },
      { type: 'build', piece: 'castle_tower', count: 1 },
    ],
    rewards: { xp: 250, items: [{ item: 'stone_brick', qty: 10 }] },
  },
];

export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
