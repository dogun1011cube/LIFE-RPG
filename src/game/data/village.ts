/** Settlement / villager data. */
export type JobId = 'farmer' | 'woodcutter' | 'miner' | 'artisan' | 'cook' | 'merchant' | 'scholar' | 'sawyer' | 'smelter' | 'smith' | 'guard';

export interface JobDef {
  id: JobId;
  name: string;
  /** buildable ids that act as a workplace for this job (one worker each) */
  workplaces: string[];
  desc: string;
  color: number; // shirt colour
}

export const JOBS: Record<JobId, JobDef> = {
  farmer: { id: 'farmer', name: '농부', workplaces: ['farm_plot'], desc: '밭을 돌보고 밀을 수확한다.', color: 0x8aa64a },
  woodcutter: { id: 'woodcutter', name: '나무꾼', workplaces: ['lumber_camp'], desc: '벌목장에서 목재를 만든다.', color: 0x8a5a32 },
  miner: { id: 'miner', name: '광부', workplaces: ['mine_shaft'], desc: '갱도에서 돌과 가끔 구리 광석을 캔다.', color: 0x6a6a72 },
  artisan: { id: 'artisan', name: '장인', workplaces: ['workbench'], desc: '창고의 돌로 석재 벽돌을 만든다.', color: 0x4a6a9a },
  cook: { id: 'cook', name: '요리사', workplaces: ['campfire'], desc: '창고의 밀로 빵을, 날고기로 구운 고기를 만든다.', color: 0xc9a45c },
  merchant: { id: 'merchant', name: '상인', workplaces: ['market_stall'], desc: '시장을 열어 거래를 가능하게 하고 마을 금고에 은화를 번다.', color: 0x8a3a6a },
  scholar: { id: 'scholar', name: '학자', workplaces: ['research_desk'], desc: '연구소에서 연구 점수를 모은다. 연구소 근처 책장이 많을수록 빠르다.', color: 0x5a4a9a },
  sawyer: { id: 'sawyer', name: '목수', workplaces: ['sawmill'], desc: '제재소에서 창고의 목재 3개로 판자 2개를 켠다.', color: 0xb07a3a },
  smelter: { id: 'smelter', name: '제련공', workplaces: ['smelter'], desc: '용광로에서 구리 광석 2개와 목재 1개로 구리 주괴를 만든다.', color: 0xa0522d },
  smith: { id: 'smith', name: '대장장이', workplaces: ['smithy'], desc: '대장간에서 구리 주괴와 판자로 도구 꾸러미를 만든다. 도구 꾸러미는 농부·나무꾼·광부의 생산량을 늘린다.', color: 0x3a3a42 },
  guard: { id: 'guard', name: '경비병', workplaces: ['guard_post'], desc: '초소 주변을 지키며 마을에 들어온 괴물과 싸운다. 하루 2 은화의 급료를 마을 금고에서 받는다.', color: 0x8a2a2a },
};

export const JOB_ORDER: JobId[] = ['farmer', 'woodcutter', 'miner', 'artisan', 'cook', 'merchant', 'scholar', 'sawyer', 'smelter', 'smith', 'guard'];

/** Jobs whose output grows when the warehouse holds tool kits. */
export const TOOL_JOBS: JobId[] = ['farmer', 'woodcutter', 'miner'];

export interface TierDef {
  level: number;
  name: string;
  capacity: number;
  requirement: string;
}

export const TIERS: TierDef[] = [
  { level: 1, name: '작은 정착지', capacity: 4, requirement: '마을 회관을 짓는다' },
  { level: 2, name: '마을', capacity: 8, requirement: '주민 4명 · 창고 · 서로 다른 일터 2종 이상' },
  { level: 3, name: '발전된 마을', capacity: 14, requirement: '주민 8명 · 행복도 60 이상 · 시장 · 정착 헌장 사용' },
  { level: 4, name: '소도시', capacity: 22, requirement: '주민 14명 · 청동 시대 · 경비 초소 · 행복도 55 이상 (정착지 반경 60m)' },
  { level: 5, name: '도시', capacity: 32, requirement: '주민 22명 · 왕국 시대 · "행정" 연구 · 분수 광장 · 행복도 60 이상 (반경 75m)' },
];

export const SETTLEMENT_RADIUS = 45;

/** The settlement grows outward as it becomes a town and a city. */
export function settlementRadius(tier: number): number {
  return tier >= 5 ? 75 : tier >= 4 ? 60 : SETTLEMENT_RADIUS;
}

/** Daily tax per villager and its happiness cost. */
export const TAX_LEVELS: { name: string; perVillager: number; happiness: number }[] = [
  { name: '없음', perVillager: 0, happiness: 0 },
  { name: '낮음', perVillager: 1, happiness: -3 },
  { name: '보통', perVillager: 2, happiness: -7 },
  { name: '높음', perVillager: 4, happiness: -15 },
];
export const GUARD_WAGE = 2;

/** Items the player can donate to research (research points per item). */
export const RESEARCH_DONATIONS: Record<string, number> = { crystal: 6, ancient_fragment: 10, gloom_essence: 3, skill_tome: 25 };

/** Food value of items villagers can eat (per unit). */
export const FOOD_VALUE: Record<string, number> = { bread: 2, cooked_meat: 2, berry: 0.5, wheat: 0.5, raw_meat: 0.5 };

export const FIRST_NAMES = [
  '하린', '도윤', '서아', '지호', '민준', '예린', '건우', '소율', '태오', '나은', '시우', '하윤', '이준', '아린', '로하', '유나',
  '세진', '다온', '한결', '보람', '채원', '은호', '가람', '새봄',
  '라온', '미르', '누리', '하람', '단비', '솔이', '바다', '이안', '서준', '지안', '윤슬', '해솔', '도하', '연우', '초아', '시온',
  '강비', '나래', '별하', '온유', '루다', '여름', '겨울', '아토',
];

/** Market: what the merchant sells (price in coins) and the sell multiplier for player goods. */
export const MARKET_STOCK: { item: string; price: number }[] = [
  { item: 'bread', price: 6 },
  { item: 'health_potion', price: 28 },
  { item: 'mana_potion', price: 30 },
  { item: 'stone_brick', price: 5 },
  { item: 'copper_ingot', price: 18 },
  { item: 'leather', price: 14 },
  { item: 'crystal', price: 60 },
];
export const SELL_RATE = 0.6;

export const VILLAGER_LINES: Record<'happy' | 'ok' | 'sad' | 'hungry' | 'homeless' | 'jobless', string[]> = {
  happy: ['이 마을에 오길 정말 잘했어요!', '오늘도 일할 맛이 나네요.', '모닥불 곁에서 듣는 이야기가 제일 좋아요.'],
  ok: ['그럭저럭 지낼 만해요.', '장식이 조금 더 있으면 좋겠어요.', '길이 깔리면 다니기 편할 텐데요.'],
  sad: ['요즘 기운이 없어요…', '이대로라면 떠나야 할지도 몰라요.'],
  hungry: ['배가 너무 고파요. 창고에 음식이 있을까요?', '빵 한 조각이라도…'],
  homeless: ['잘 곳이 없어요. 침대가 하나 더 있으면 좋겠어요.'],
  jobless: ['할 일을 주세요! 뭐든 할게요.', '일터만 있으면 저도 도울 수 있어요.'],
};
