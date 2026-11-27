/**
 * Serializable game state. Everything here is plain data (no THREE objects) so it can be saved locally now
 * and synced to a server later (multiplayer: each player gets its own PlayerState, the world state is shared).
 */
export type Slot = { id: string; qty: number } | null;

export type AttrId = 'str' | 'vit' | 'end' | 'agi' | 'skl' | 'int';

export interface Buff {
  id: string;
  time: number; // seconds remaining
  amount?: number; // for heal-over-time
}

export interface PlayerState {
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  stamina: number;
  mana: number;
  level: number;
  xp: number;
  attrPoints: number;
  attrs: Record<AttrId, number>;
  skillPoints: number;
  skills: Record<string, number>; // skill id -> rank
  skillBar: (string | null)[]; // active skills on R / T / G / V
  inventory: Slot[];
  equipment: { weapon: string | null; armor: string | null; trinket: string | null };
  hotbar: (string | null)[];
  spawn: { x: number; y: number; z: number } | null;
  buffs: Buff[];
}

export interface PieceState {
  id: number;
  type: string;
  x: number;
  y: number;
  z: number;
  rot: number; // radians
  open?: boolean;
  storage?: Slot[];
  /** farm plots: crop growth 0..1 */
  growth?: number;
}

export interface QuestProgress {
  id: string;
  baseline: Record<string, number>;
}

export interface QuestState {
  active: QuestProgress[];
  completed: string[];
  tracked: string[];
}

export interface Villager {
  id: number;
  name: string;
  job: string | null;
  workId: number | null;
  homeId: number | null;
  x: number;
  y: number;
  z: number;
  happiness: number;
  fed: boolean;
  look: number;
  arrivedDay: number;
  sadDays: number;
  /** which slot of a multi-resident house */
  homeSlot?: number;
  hp?: number;
  /** knocked out in a raid: lies down until morning */
  down?: boolean;
  /** day on which the villager was hurt (happiness penalty) */
  hurtDay?: number;
  /** guards not paid on this day refuse to work */
  unpaidDay?: number;
}

export interface ResearchState {
  points: number;
  done: string[];
  /** total research points ever gathered */
  total: number;
}

export interface RaidState {
  /** day on which the next raid comes (that night) */
  nextDay: number;
  active: boolean;
  /** raid announced for tonight */
  tonight: boolean;
  repelled: number;
  lost: number;
  lastDay: number;
  lastResult: string;
  stolen: number;
}

export interface SettlementState {
  founded: boolean;
  hallId: number | null;
  name: string;
  tier: number;
  charter: boolean;
  villagers: Villager[];
  nextId: number;
  warehouse: Record<string, number>;
  log: { day: number; text: string }[];
  arrivalTimer: number;
  productionTimer: number;
  lastDay: number;
  // ── PHASE 5: city & civilisation
  treasury: number;
  taxLevel: number;
  research: ResearchState;
  raid: RaidState;
  /** uses left on the tool kit currently in use */
  toolWear: number;
}

export interface WorldState {
  seed: number;
  time: number; // 0..1 time of day
  day: number;
  weather?: { kind: 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog'; timer: number };
}

export interface GameState {
  world: WorldState;
  player: PlayerState;
  pieces: PieceState[];
  nextPieceId: number;
  depletedNodes: [number, number][]; // [nodeId, respawnAtPlayTime]
  discovered: string[]; // location ids
  regions: string[]; // region ids visited
  revealed: string[]; // location ids revealed on map but not yet visited
  explored: string; // base64 bitfield of explored map cells
  quests: QuestState;
  knownRecipes: string[];
  knownBuildables: string[];
  everObtained: string[];
  loreRead: string[];
  openedChests: string[];
  counters: Record<string, number>;
  bossDefeated: number;
  playTime: number;
  settlement: SettlementState;
  /** PHASE 6: the player's boat (null = not launched), sail upgrade, merchant company reputation */
  boat?: { x: number; z: number; yaw: number } | null;
  boatSail?: number;
  faction: { rep: number; visits: number; nextVisitDay: number; traded: number };
}

export interface SaveFile {
  version: number;
  slot: number;
  savedAt: number;
  state: GameState;
}

export interface SaveMeta {
  slot: number;
  savedAt: number;
  level: number;
  day: number;
  playTime: number;
  name: string;
}
