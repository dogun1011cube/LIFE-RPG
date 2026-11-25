import type { BoxCollider } from '../world/Colliders';

/**
 * Structural stability (0..1). Pieces touching the ground are fully stable; support travels through
 * touching pieces and decays - slowly when a piece rests on top of another, quickly when it hangs sideways.
 * Pieces below MIN_STABILITY cannot be placed, and collapse when their support is removed.
 */
export const MIN_STABILITY = 0.15;

export type BuildMaterial = 'wood' | 'stone' | 'marble';

const VERTICAL: Record<BuildMaterial, number> = { wood: 0.88, stone: 0.93, marble: 0.95 };
const HORIZONTAL: Record<BuildMaterial, number> = { wood: 0.62, stone: 0.72, marble: 0.78 };

export interface StabNode {
  id: number;
  boxes: BoxCollider[];
  grounded: boolean;
  material: BuildMaterial;
}

function bounds(boxes: BoxCollider[]) {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    minZ = Math.min(minZ, b.minZ);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
    maxZ = Math.max(maxZ, b.maxZ);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** Do two pieces touch (boxes overlap after expanding by eps)? */
export function touches(a: BoxCollider[], b: BoxCollider[], eps = 0.12): boolean {
  for (const x of a) {
    for (const y of b) {
      if (x.minX - eps < y.maxX && x.maxX + eps > y.minX && x.minY - eps < y.maxY && x.maxY + eps > y.minY && x.minZ - eps < y.maxZ && x.maxZ + eps > y.minZ) return true;
    }
  }
  return false;
}

/** Support factor when `support` holds up `piece`. */
export function supportFactor(support: BoxCollider[], piece: BoxCollider[], material: BuildMaterial): number {
  const s = bounds(support);
  const p = bounds(piece);
  // resting on top: the supporter's top is at (or just below) the piece's bottom AND the supporter
  // reaches lower than the piece (two slabs side by side at the same height only support each other sideways)
  const fromBelow = s.maxY <= p.minY + 0.35 && s.minY < p.minY - 0.1;
  return fromBelow ? VERTICAL[material] : HORIZONTAL[material];
}

/** Max-product propagation from grounded pieces (a Dijkstra variant). */
export function computeStability(nodes: StabNode[], neighbors: Map<number, number[]>): Map<number, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const stab = new Map<number, number>();
  for (const n of nodes) stab.set(n.id, n.grounded ? 1 : 0);
  // simple priority queue via sorted array (piece counts stay in the hundreds)
  const queue = nodes.filter((n) => n.grounded).map((n) => n.id);
  const done = new Set<number>();
  while (queue.length) {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (stab.get(queue[i])! > stab.get(queue[bi])!) bi = i;
    const u = queue.splice(bi, 1)[0];
    if (done.has(u)) continue;
    done.add(u);
    const un = byId.get(u)!;
    const su = stab.get(u)!;
    for (const v of neighbors.get(u) ?? []) {
      if (done.has(v)) continue;
      const vn = byId.get(v);
      if (!vn) continue;
      const cand = su * supportFactor(un.boxes, vn.boxes, vn.material);
      if (cand > stab.get(v)!) {
        stab.set(v, cand);
        queue.push(v);
      }
    }
  }
  return stab;
}

/** Stability a not-yet-placed piece would get from its neighbours. */
export function predictStability(candidate: StabNode, others: { node: StabNode; stability: number }[]): number {
  if (candidate.grounded) return 1;
  let best = 0;
  for (const o of others) {
    if (!touches(o.node.boxes, candidate.boxes)) continue;
    best = Math.max(best, o.stability * supportFactor(o.node.boxes, candidate.boxes, candidate.material));
  }
  return best;
}
