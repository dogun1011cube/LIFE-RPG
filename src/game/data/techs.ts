/** Technology tree. Research points come from scholars (and donated relics); techs are bought with them. */
export type EraLevel = 1 | 2 | 3;

export interface EraDef {
  level: EraLevel;
  name: string;
  desc: string;
}

export const ERAS: EraDef[] = [
  { level: 1, name: '개척 시대', desc: '나무와 돌, 그리고 첫 번째 지식.' },
  { level: 2, name: '청동 시대', desc: '불과 금속이 마을을 바꾼다. 제련·도구·민병대.' },
  { level: 3, name: '왕국 시대', desc: '성벽과 광장, 행정이 도시를 만든다.' },
];

export interface TechDef {
  id: string;
  name: string;
  era: EraLevel;
  /** research points */
  cost: number;
  /** coins paid from the town treasury */
  coins: number;
  requires: string[];
  /** need this many researched techs of the previous era (era-advancing techs) */
  needFromEra?: { era: EraLevel; count: number };
  /** completing this tech moves the civilisation into a new era */
  advancesTo?: EraLevel;
  desc: string;
  /** short effect lines shown on the card */
  effects: string[];
}

export const TECHS: TechDef[] = [
  // ── 개척 시대 ─────────────────────────────────────────
  {
    id: 't_agriculture', name: '윤작법', era: 1, cost: 30, coins: 0, requires: [],
    desc: '밭을 쉬게 하고 돌려 짓는 법.',
    effects: ['농부 수확량 +2', '밭이 혼자서도 두 배 빨리 자람'],
  },
  {
    id: 't_writing', name: '기록 문자', era: 1, cost: 30, coins: 0, requires: [],
    desc: '지식을 적어 남기는 법.',
    effects: ['학자 연구 점수 +1'],
  },
  {
    id: 't_carpentry', name: '목공', era: 1, cost: 35, coins: 0, requires: [],
    desc: '통나무를 켜서 판자를 만드는 기술.',
    effects: ['제재소 · 목수 직업', '작업대 판자 제작법'],
  },
  {
    id: 't_housing', name: '주거 계획', era: 1, cost: 35, coins: 0, requires: [],
    desc: '여러 가족이 사는 집을 설계한다.',
    effects: ['목조 주택 (주민 2명)'],
  },
  {
    id: 't_currency', name: '화폐', era: 1, cost: 40, coins: 0, requires: [],
    desc: '은화의 가치를 정하고 세금을 걷는다.',
    effects: ['세금 징수 가능', '상인 수입 +1'],
  },
  {
    id: 't_bronze_age', name: '청동기 시대', era: 1, cost: 80, coins: 30, requires: [], needFromEra: { era: 1, count: 3 }, advancesTo: 2,
    desc: '불과 금속의 시대를 연다.',
    effects: ['청동 시대로 발전', '청동 시대 연구 해금'],
  },
  // ── 청동 시대 ─────────────────────────────────────────
  {
    id: 't_smelting', name: '제련술', era: 2, cost: 60, coins: 10, requires: ['t_bronze_age'],
    desc: '광석을 녹여 금속을 얻는다.',
    effects: ['용광로 · 제련공 직업'],
  },
  {
    id: 't_toolmaking', name: '도구 제작', era: 2, cost: 70, coins: 15, requires: ['t_smelting', 't_carpentry'],
    desc: '좋은 도구가 좋은 일꾼을 만든다.',
    effects: ['대장간 · 대장장이 직업', '도구 꾸러미 (농부·나무꾼·광부 생산 +2)'],
  },
  {
    id: 't_militia', name: '민병대', era: 2, cost: 60, coins: 15, requires: ['t_bronze_age'],
    desc: '주민 중 일부가 창과 방패를 든다.',
    effects: ['경비 초소 · 경비병 직업'],
  },
  {
    id: 't_masonry', name: '석조 건축', era: 2, cost: 70, coins: 15, requires: ['t_bronze_age', 't_housing'],
    desc: '돌로 크고 튼튼한 집을 짓는다.',
    effects: ['석조 주택 (주민 4명)'],
  },
  {
    id: 't_trade', name: '교역로', era: 2, cost: 65, coins: 20, requires: ['t_bronze_age', 't_currency'],
    desc: '이웃 섬의 상인들이 들르기 시작한다.',
    effects: ['시장 구매가 -15%', '판매가 60% → 75%', '상인 수입 +1'],
  },
  {
    id: 't_kingdom', name: '왕국의 기틀', era: 2, cost: 160, coins: 80, requires: ['t_bronze_age'], needFromEra: { era: 2, count: 3 }, advancesTo: 3,
    desc: '흩어진 마을을 하나의 이름 아래 모은다.',
    effects: ['왕국 시대로 발전', '왕국 시대 연구 해금'],
  },
  // ── 왕국 시대 ─────────────────────────────────────────
  {
    id: 't_fortification', name: '축성술', era: 3, cost: 120, coins: 40, requires: ['t_kingdom', 't_militia'],
    desc: '방어 시설과 훈련된 수비대.',
    effects: ['궁수탑 (자동 사격)', '경비병 공격력·체력 +50%'],
  },
  {
    id: 't_architecture', name: '도시 건축', era: 3, cost: 120, coins: 40, requires: ['t_kingdom', 't_masonry'],
    desc: '광장과 분수가 있는 아름다운 도시.',
    effects: ['분수 광장', '장식 행복도 상한 +6'],
  },
  {
    id: 't_administration', name: '행정', era: 3, cost: 140, coins: 60, requires: ['t_kingdom', 't_currency'],
    desc: '관리와 장부가 도시를 움직인다.',
    effects: ['세금 수입 +50%', '"도시" 단계의 조건'],
  },
];

export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));
