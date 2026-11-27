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
  // ── Village chain (Phase 4) ─────────────────────────────
  {
    id: 'v_found', title: '새로운 시작', chain: 'main', requires: ['q_shelter'],
    summary: '마을 회관을 짓고 정착지를 세우자.',
    description: '집을 지었으니 이제 이웃을 맞이할 차례다. [B] 건축 모드의 "마을" 분류에서 마을 회관을 지으면 그 주변이 정착지가 된다.',
    objectives: [{ type: 'build', piece: 'town_hall', count: 1 }],
    rewards: { xp: 150 },
  },
  {
    id: 'v_first', title: '첫 주민', chain: 'main', requires: ['v_found'],
    summary: '침대를 놓아 주민을 맞이하자.',
    description: '회관 반경 45m 안의 침대 하나마다 주민 한 명이 살 수 있다. 빈 침대가 있고 창고에 음식이 조금이라도 있으면 여행자가 찾아온다. 창고를 짓고 산딸기나 고기를 맡겨 두자.',
    objectives: [{ type: 'counter', key: 'village:pop', count: 1, label: '주민' }],
    rewards: { xp: 100, items: [{ item: 'bread', qty: 3 }] },
  },
  {
    id: 'v_jobs', title: '일하는 마을', chain: 'main', requires: ['v_first'],
    summary: '주민 세 명에게 일을 맡기자.',
    description: '밭, 벌목장, 광산 갱도를 짓고 [H] 마을 관리 창에서 주민에게 직업을 맡기자. 낮에 일한 결과물은 창고에 쌓인다.',
    objectives: [{ type: 'counter', key: 'village:employed', count: 3, label: '일하는 주민' }],
    rewards: { xp: 150 },
  },
  {
    id: 'v_village', title: '마을로 성장', chain: 'main', requires: ['v_jobs'],
    summary: '정착지를 "마을" 단계로 키우자.',
    description: '주민 4명, 창고, 서로 다른 일터 2종 이상이 있으면 정착지는 마을이 된다. 마을이 되면 수용 인원이 늘고 시장 가판대를 지을 수 있다.',
    objectives: [{ type: 'counter', key: 'village:tier', count: 2, label: '마을 단계' }],
    rewards: { xp: 300, items: [{ item: 'coin', qty: 50 }] },
  },
  {
    id: 'v_trade', title: '첫 거래', chain: 'side', requires: ['v_village'],
    summary: '시장에서 거래하자.',
    description: '시장 가판대를 짓고 상인을 배정하면 은화로 물건을 사고팔 수 있다.',
    objectives: [{ type: 'counter', key: 'trade', count: 1, label: '거래' }],
    rewards: { xp: 80 },
  },
  {
    id: 'v_town', title: '발전된 마을', chain: 'main', requires: ['v_village', 'q_warden'],
    summary: '정착 헌장으로 마을을 발전시키자.',
    description: '주민 8명, 행복도 60 이상, 시장이 있는 마을의 회관에서 정착 헌장을 사용하면 "발전된 마을"이 된다. 이제 도시를 꿈꿀 차례다.',
    objectives: [{ type: 'counter', key: 'village:tier', count: 3, label: '발전된 마을 단계' }],
    rewards: { xp: 600 },
  },
  // ── PHASE 5: city & civilisation ─────────────────────────
  {
    id: 'c_research', title: '지식의 등불', chain: 'main', requires: ['v_village'],
    summary: '연구소를 짓고 첫 기술을 연구하자.',
    description: '"도시" 분류의 연구소를 짓고 학자를 배정하면 연구 점수가 쌓인다. 연구소 근처에 책장을 두면 더 빨라진다. [L] 문명 창에서 첫 기술을 연구하자. 공명 수정이나 고대 파편을 기증해도 연구 점수를 얻는다.',
    objectives: [{ type: 'counter', key: 'tech:count', count: 1, label: '연구한 기술' }],
    rewards: { xp: 300, items: [{ item: 'coin', qty: 30 }] },
  },
  {
    id: 'c_bronze', title: '청동 시대', chain: 'main', requires: ['c_research'],
    summary: '개척 시대 기술 3개를 익히고 청동 시대로 나아가자.',
    description: '개척 시대 기술 세 가지를 연구하면 "청동기 시대" 연구가 열린다. 연구 점수와 금고의 은화가 필요하다.',
    objectives: [{ type: 'counter', key: 'civ:era', count: 2, label: '청동 시대' }],
    rewards: { xp: 500 },
  },
  {
    id: 'c_tax', title: '마을 금고', chain: 'side', requires: ['c_research'],
    summary: '세금을 걷어 금고를 채우자.',
    description: '"화폐"를 연구하면 [L] 문명 창에서 세율을 정할 수 있다. 세금은 매일 아침 주민 수만큼 걷히지만, 세율이 높을수록 주민 행복도가 떨어진다.',
    objectives: [{ type: 'counter', key: 'tax:collected', count: 20, label: '걷은 세금' }],
    rewards: { xp: 200 },
  },
  {
    id: 'c_chain', title: '장인의 사슬', chain: 'side', requires: ['c_bronze'],
    summary: '광부 → 제련공 → 대장장이로 도구 꾸러미를 만들자.',
    description: '제재소의 목수가 판자를, 용광로의 제련공이 구리 주괴를 만들면 대장간의 대장장이가 도구 꾸러미를 만든다. 창고에 도구 꾸러미가 있으면 농부·나무꾼·광부가 더 많이 생산한다.',
    objectives: [{ type: 'counter', key: 'village:tool_kit', count: 1, label: '마을에서 만든 도구 꾸러미' }],
    rewards: { xp: 400, items: [{ item: 'tool_kit', qty: 2 }] },
  },
  {
    id: 'c_defend', title: '마을 수비대', chain: 'main', requires: ['v_village'],
    summary: '밤의 습격을 막아내자.',
    description: '"마을" 단계가 되면 이따금 괴물 무리가 밤 22시에 마을을 습격한다(아침에 예고됨). 괴물들은 주민과 창고를 노린다. 직접 싸우거나, "민병대"를 연구해 경비병을 두고, 궁수탑을 세워 마을을 지키자.',
    objectives: [{ type: 'counter', key: 'raid:repelled', count: 1, label: '막아낸 습격' }],
    rewards: { xp: 400, items: [{ item: 'health_potion', qty: 2 }] },
  },
  {
    id: 'c_town', title: '소도시', chain: 'main', requires: ['c_bronze', 'v_town'],
    summary: '마을을 소도시로 키우자.',
    description: '주민 14명, 청동 시대, 경비 초소, 행복도 55 이상이면 "소도시"가 되고 정착지 반경이 60m로 넓어진다. 목조·석조 주택으로 많은 주민을 들이자.',
    objectives: [{ type: 'counter', key: 'village:tier', count: 4, label: '소도시 단계' }],
    rewards: { xp: 900 },
  },
  {
    id: 'c_kingdom', title: '왕국의 기틀', chain: 'main', requires: ['c_bronze'],
    summary: '청동 시대 기술 3개를 익히고 왕국 시대로 나아가자.',
    description: '청동 시대 기술 세 가지를 연구하면 "왕국의 기틀"이 열린다. 왕국 시대에는 축성술, 도시 건축, 행정을 연구할 수 있다.',
    objectives: [{ type: 'counter', key: 'civ:era', count: 3, label: '왕국 시대' }],
    rewards: { xp: 900 },
  },
  {
    id: 'c_city', title: '빛나는 도시', chain: 'main', requires: ['c_town', 'c_kingdom'],
    summary: '소도시를 도시로 발전시키자.',
    description: '주민 22명, 왕국 시대, "행정" 연구, 분수 광장, 행복도 60 이상이면 "도시"가 된다. 섬의 문명이 꽃핀다.',
    objectives: [{ type: 'counter', key: 'village:tier', count: 5, label: '도시 단계' }],
    rewards: { xp: 1500 },
  },
  // ── PHASE 6: the world beyond ────────────────────────────
  {
    id: 'w_sea', title: '수평선 너머', chain: 'main', requires: ['q_copper'],
    summary: '배를 만들어 바다로 나가자.',
    description: '맑은 날이면 남쪽 수평선 너머로 연기가 피어오른다. 헤엄쳐서는 먼 바다를 건널 수 없다. 작업대에서 작은 배를 만들고, 바닷가 얕은 물에서 사용해 배를 띄우자. [W/S] 속도, [A/D] 방향.',
    objectives: [{ type: 'counter', key: 'boat:boarded', count: 1, label: '배에 타기' }],
    rewards: { xp: 200, items: [{ item: 'cooked_meat', qty: 3 }] },
  },
  {
    id: 'w_landing', title: '잿불 섬', chain: 'main', requires: ['w_sea'],
    summary: '남쪽의 화산섬에 상륙하자.',
    description: '배를 타고 남쪽으로 400m쯤 가면 검은 모래 해변이 나온다. 섬에는 그을린 나무와 철광맥, 그리고 불의 생물들이 있다. 육지 가까이에서 [E]로 내릴 수 있다.',
    objectives: [{ type: 'discover', location: 'ember_landing' }],
    rewards: { xp: 300 },
  },
  {
    id: 'w_iron', title: '철의 시대', chain: 'main', requires: ['w_landing'],
    summary: '철광석을 캐고 숯불로 녹이자.',
    description: '잿불 섬 산비탈의 철광맥은 구리 곡괭이로 캘 수 있다. 그을린 나무에서 숯을 얻어, 화로에서 철광석 2개와 숯 1개로 철 주괴를 만들자. 철로 더 강한 무기·도구·갑옷을 만들 수 있다.',
    objectives: [{ type: 'craft', item: 'iron_ingot', count: 3 }],
    rewards: { xp: 400, items: [{ item: 'ember_fruit', qty: 3 }] },
  },
  {
    id: 'w_titan', title: '산의 심장', chain: 'main', requires: ['w_iron'],
    summary: '흑요석 화로 셋에 불을 붙이고 용암 거신을 쓰러뜨리자.',
    description: '불의 산 비탈에 흑요석 화로 셋이 있다(숯 2개씩). 셋 모두 타오르면 분화구의 봉인이 깨어난다. 분화구의 용암 웅덩이를 조심하고, 불씨 열매로 화염 저항을 얻자. 용암 거신의 핵으로 전설의 무기를 만들 수 있다.',
    objectives: [{ type: 'counter', key: 'boss:titan', count: 1, label: '용암 거신 처치' }],
    rewards: { xp: 1200 },
  },
  {
    id: 'w_dock', title: '항구', chain: 'side', requires: ['v_found'],
    summary: '선착장을 짓자.',
    description: '"길·다리" 분류의 선착장은 한쪽 끝을 땅에, 다른 끝을 물 위에 놓아야 한다. 마을 반경 안의 선착장에는 해풍 상단의 교역선이 사흘마다 들른다.',
    objectives: [{ type: 'build', piece: 'dock', count: 1 }],
    rewards: { xp: 150 },
  },
  {
    id: 'w_trade', title: '해풍 상단', chain: 'side', requires: ['w_dock'],
    summary: '교역선과 거래하자.',
    description: '교역선은 아침 8시에 선착장에 들어와 저녁 7시까지 머문다. 배 가까이에서 [E]로 거래할 수 있다. 거래할수록 상단의 평판이 오른다.',
    objectives: [{ type: 'counter', key: 'ship:trade', count: 3, label: '교역' }],
    rewards: { xp: 200, items: [{ item: 'spice', qty: 3 }] },
  },
  {
    id: 'w_ally', title: '상단의 단골', chain: 'side', requires: ['w_trade'],
    summary: '해풍 상단의 평판을 50까지 올리자.',
    description: '평판이 오르면 값이 싸지고 고급 돛, 흑요석, 그리고 동맹에게만 주는 부적을 살 수 있다.',
    objectives: [{ type: 'counter', key: 'faction:rep', count: 50, label: '상단 평판' }],
    rewards: { xp: 500 },
  },
  {
    id: 'w_cave', title: '용암 동굴', chain: 'side', requires: ['w_landing'],
    summary: '용암 동굴의 흑요석 파수꾼을 쓰러뜨리자.',
    description: '불의 산 동쪽 비탈에 용암 동굴이 있다. 안쪽의 용암 강은 냉각 밸브 셋을 모두 돌리면 식고, 현무암 문이 열린다. 밸브 하나는 강 건너편에 있으니 불씨 열매를 챙기자. 무너진 바위벽 너머에는 탐험대의 상자가 숨겨져 있다.',
    objectives: [{ type: 'kill', enemy: 'obsidian_sentinel', count: 1 }],
    rewards: { xp: 900, items: [{ item: 'ember_fruit', qty: 4 }] },
  },
];

export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
