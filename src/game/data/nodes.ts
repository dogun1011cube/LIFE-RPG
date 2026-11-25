/** Harvestable resource node definitions. */
export type NodeTypeId = 'oak' | 'pine' | 'birch' | 'rock' | 'copper' | 'crystal' | 'bush' | 'fiber';

export interface NodeDrop {
  item: string;
  perHit: [number, number]; // min/max per successful hit
  final?: [number, number]; // bonus on depletion
  chance?: number;
}

export interface NodeDef {
  id: NodeTypeId;
  name: string;
  verb: string; // interaction prompt verb
  tool: 'axe' | 'pickaxe' | 'hand';
  minTier: number; // 0 = bare hands allowed
  hp: number;
  drops: NodeDrop[];
  respawn: number; // seconds of play time
  collider: number; // collision radius (scaled)
  xp: number;
}

export const NODES: Record<NodeTypeId, NodeDef> = {
  oak: { id: 'oak', name: '참나무', verb: '베기', tool: 'axe', minTier: 0, hp: 6, drops: [{ item: 'wood', perHit: [1, 1], final: [2, 3] }], respawn: 300, collider: 0.45, xp: 3 },
  pine: { id: 'pine', name: '소나무', verb: '베기', tool: 'axe', minTier: 0, hp: 7, drops: [{ item: 'wood', perHit: [1, 1], final: [2, 4] }], respawn: 300, collider: 0.4, xp: 3 },
  birch: { id: 'birch', name: '자작나무', verb: '베기', tool: 'axe', minTier: 0, hp: 5, drops: [{ item: 'wood', perHit: [1, 1], final: [1, 2] }, { item: 'fiber', perHit: [0, 0], final: [1, 2] }], respawn: 300, collider: 0.35, xp: 3 },
  rock: { id: 'rock', name: '바위', verb: '캐기', tool: 'pickaxe', minTier: 0, hp: 6, drops: [{ item: 'stone', perHit: [1, 1], final: [2, 3] }], respawn: 360, collider: 0.95, xp: 3 },
  copper: { id: 'copper', name: '구리 광맥', verb: '채광', tool: 'pickaxe', minTier: 1, hp: 8, drops: [{ item: 'copper_ore', perHit: [1, 1], final: [1, 2] }, { item: 'stone', perHit: [0, 1] }], respawn: 480, collider: 0.95, xp: 6 },
  crystal: { id: 'crystal', name: '공명 수정 광맥', verb: '채광', tool: 'pickaxe', minTier: 2, hp: 10, drops: [{ item: 'crystal', perHit: [0, 1], final: [1, 1] }], respawn: 900, collider: 0.7, xp: 12 },
  bush: { id: 'bush', name: '산딸기 덤불', verb: '따기', tool: 'hand', minTier: 0, hp: 1, drops: [{ item: 'berry', perHit: [2, 4] }], respawn: 180, collider: 0, xp: 1 },
  fiber: { id: 'fiber', name: '억센 풀', verb: '뜯기', tool: 'hand', minTier: 0, hp: 1, drops: [{ item: 'fiber', perHit: [2, 3] }], respawn: 150, collider: 0, xp: 1 },
};
