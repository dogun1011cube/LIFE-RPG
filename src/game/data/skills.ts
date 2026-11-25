export type SkillTree = 'combat' | 'survival' | 'arcane';
export type ActiveSkillId = 'c_whirl' | 'c_dash' | 'a_bolt' | 'a_heal' | 'a_nova';

export interface SkillDef {
  id: string;
  name: string;
  tree: SkillTree;
  icon: string; // small glyph shown on the skill card / skill bar
  kind: 'active' | 'passive';
  maxRank: number;
  levelReq: number;
  requires?: { skill: string; rank: number }[];
  /** Description for a given rank (1-based). */
  describe: (rank: number) => string;
  active?: { stamina?: number; mana?: number; cooldown: number };
}

export const TREE_INFO: Record<SkillTree, { name: string; desc: string; color: string }> = {
  combat: { name: '전투', desc: '검술과 체력. 근접전의 달인이 된다.', color: '#e0704a' },
  survival: { name: '생존', desc: '채집, 이동, 음식. 세계를 누비는 개척자.', color: '#7fcf5a' },
  arcane: { name: '비전', desc: '공명 수정의 힘을 다루는 마법.', color: '#6aa8ff' },
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const SKILLS: SkillDef[] = [
  // ── Combat ──────────────────────────────────────────
  {
    id: 'c_whirl', name: '회전베기', tree: 'combat', icon: '🌀', kind: 'active', maxRank: 3, levelReq: 2,
    active: { stamina: 25, cooldown: 7 },
    describe: (r) => `주변 360°의 모든 적에게 공격력의 ${pct([1.4, 1.75, 2.1][r - 1])} 피해를 준다.`,
  },
  {
    id: 'c_vigor', name: '강인한 육체', tree: 'combat', icon: '❤', kind: 'passive', maxRank: 3, levelReq: 2,
    describe: (r) => `최대 체력 +${8 * r}%`,
  },
  {
    id: 'c_parry', name: '반격의 달인', tree: 'combat', icon: '🛡', kind: 'passive', maxRank: 2, levelReq: 3,
    describe: (r) => `패링 판정 시간 +${(0.08 * r).toFixed(2)}초, 패링 후 반격 피해 +${25 * r}%`,
  },
  {
    id: 'c_dash', name: '돌진 베기', tree: 'combat', icon: '⚡', kind: 'active', maxRank: 3, levelReq: 5,
    requires: [{ skill: 'c_whirl', rank: 1 }],
    active: { stamina: 30, cooldown: 9 },
    describe: (r) => `앞으로 7m 돌진하며 지나가는 적에게 공격력의 ${pct([1.5, 1.9, 2.3][r - 1])} 피해. 돌진 중에는 무적.`,
  },
  {
    id: 'c_fury', name: '전투의 열기', tree: 'combat', icon: '🔥', kind: 'passive', maxRank: 3, levelReq: 6,
    requires: [{ skill: 'c_vigor', rank: 1 }],
    describe: (r) => `공격력 +${6 * r}%`,
  },
  // ── Survival ────────────────────────────────────────
  {
    id: 's_gather', name: '숙련된 채집꾼', tree: 'survival', icon: '🪓', kind: 'passive', maxRank: 3, levelReq: 2,
    describe: (r) => `채집 속도 +${15 * r}%, 추가 수확 확률 +${8 * r}%`,
  },
  {
    id: 's_runner', name: '바람의 발걸음', tree: 'survival', icon: '👣', kind: 'passive', maxRank: 2, levelReq: 2,
    describe: (r) => `달리기 스태미나 소모 -${20 * r}%, 이동 속도 +${4 * r}%`,
  },
  {
    id: 's_cook', name: '야생의 미식가', tree: 'survival', icon: '🍖', kind: 'passive', maxRank: 2, levelReq: 3,
    describe: (r) => `음식과 물약의 회복량 +${25 * r}%`,
  },
  {
    id: 's_second', name: '불굴', tree: 'survival', icon: '✦', kind: 'passive', maxRank: 1, levelReq: 6,
    requires: [{ skill: 's_cook', rank: 1 }],
    describe: () => '치명적인 피해를 받으면 체력 1로 버티고 2초간 무적이 된다. (재사용 대기 5분)',
  },
  // ── Arcane ──────────────────────────────────────────
  {
    id: 'a_bolt', name: '비전 화살', tree: 'arcane', icon: '✧', kind: 'active', maxRank: 3, levelReq: 2,
    active: { mana: 12, cooldown: 1.4 },
    describe: (r) => `가장 가까운 적을 추적하는 비전 화살을 쏜다. 마력의 ${pct([1.2, 1.5, 1.8][r - 1])} 피해.`,
  },
  {
    id: 'a_mana', name: '마나 친화', tree: 'arcane', icon: '💧', kind: 'passive', maxRank: 3, levelReq: 2,
    describe: (r) => `최대 마나 +${15 * r}, 마나 회복 +${(0.6 * r).toFixed(1)}/초`,
  },
  {
    id: 'a_heal', name: '치유의 빛', tree: 'arcane', icon: '✚', kind: 'active', maxRank: 3, levelReq: 3,
    active: { mana: 30, cooldown: 14 },
    describe: (r) => `최대 체력의 ${[25, 35, 45][r - 1]}%를 즉시 회복한다.`,
  },
  {
    id: 'a_nova', name: '서리 파동', tree: 'arcane', icon: '❄', kind: 'active', maxRank: 3, levelReq: 5,
    requires: [{ skill: 'a_bolt', rank: 1 }],
    active: { mana: 25, cooldown: 10 },
    describe: (r) => `주변 5m에 냉기를 터뜨려 마력의 ${pct([1.0, 1.3, 1.6][r - 1])} 피해를 주고 3초간 둔화시킨다.`,
  },
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export const SKILL_KEYS = ['KeyR', 'KeyT', 'KeyG', 'KeyV'] as const;
export const SKILL_KEY_LABELS = ['R', 'T', 'G', 'V'];
