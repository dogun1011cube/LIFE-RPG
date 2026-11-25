/**
 * Simple collision world: axis-aligned boxes, vertical cylinders (circles) and ramps,
 * stored in a uniform spatial hash. Good enough for characters vs buildings / trees / ruins.
 */
export interface BoxCollider {
  kind: 'box';
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  owner?: unknown;
  stamp?: number;
}
export interface CircleCollider {
  kind: 'circle';
  x: number;
  z: number;
  r: number;
  minY: number;
  maxY: number;
  owner?: unknown;
  stamp?: number;
}
/** Walkable slope: height rises linearly from y0 to y1 along axis in direction dir. */
export interface RampCollider {
  kind: 'ramp';
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y0: number;
  y1: number;
  axis: 'x' | 'z';
  dir: 1 | -1;
  owner?: unknown;
  stamp?: number;
}
export type Collider = BoxCollider | CircleCollider | RampCollider;

export function rampHeight(r: RampCollider, x: number, z: number): number {
  let t: number;
  if (r.axis === 'x') t = (x - r.minX) / (r.maxX - r.minX);
  else t = (z - r.minZ) / (r.maxZ - r.minZ);
  if (r.dir < 0) t = 1 - t;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return r.y0 + (r.y1 - r.y0) * t;
}

function bounds(c: Collider): [number, number, number, number] {
  if (c.kind === 'circle') return [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
  return [c.minX, c.minZ, c.maxX, c.maxZ];
}

export class CollisionWorld {
  private cellSize = 4;
  private map = new Map<number, Collider[]>();
  private stamp = 1;

  private key(ix: number, iz: number) {
    return (ix + 4096) * 8192 + (iz + 4096);
  }

  add(c: Collider) {
    const [x0, z0, x1, z1] = bounds(c);
    const s = this.cellSize;
    for (let ix = Math.floor(x0 / s); ix <= Math.floor(x1 / s); ix++) {
      for (let iz = Math.floor(z0 / s); iz <= Math.floor(z1 / s); iz++) {
        const k = this.key(ix, iz);
        let arr = this.map.get(k);
        if (!arr) {
          arr = [];
          this.map.set(k, arr);
        }
        arr.push(c);
      }
    }
  }

  remove(c: Collider) {
    const [x0, z0, x1, z1] = bounds(c);
    const s = this.cellSize;
    for (let ix = Math.floor(x0 / s); ix <= Math.floor(x1 / s); ix++) {
      for (let iz = Math.floor(z0 / s); iz <= Math.floor(z1 / s); iz++) {
        const arr = this.map.get(this.key(ix, iz));
        if (!arr) continue;
        const i = arr.indexOf(c);
        if (i >= 0) arr.splice(i, 1);
      }
    }
  }

  clearOwnerType(pred: (c: Collider) => boolean) {
    for (const arr of this.map.values()) {
      for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) arr.splice(i, 1);
    }
  }

  query(minX: number, minZ: number, maxX: number, maxZ: number, out: Collider[] = []): Collider[] {
    out.length = 0;
    const st = ++this.stamp;
    const s = this.cellSize;
    for (let ix = Math.floor(minX / s); ix <= Math.floor(maxX / s); ix++) {
      for (let iz = Math.floor(minZ / s); iz <= Math.floor(maxZ / s); iz++) {
        const arr = this.map.get(this.key(ix, iz));
        if (!arr) continue;
        for (const c of arr) {
          if (c.stamp === st) continue;
          c.stamp = st;
          out.push(c);
        }
      }
    }
    return out;
  }
}
