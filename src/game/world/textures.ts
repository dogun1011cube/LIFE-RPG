import * as THREE from 'three';
import { mulberry32 } from '../core/Random';

/** Procedurally painted canvas textures (no external assets). */

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
}

export function groundDetailTexture(): THREE.Texture {
  return cached('ground', () => {
    const size = 256;
    const [c, g] = makeCanvas(size);
    const rng = mulberry32(7);
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = 222 + rng() * 33;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // soft blotches
    for (let i = 0; i < 160; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 4 + rng() * 18;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      const a = rng() * 0.12;
      grd.addColorStop(0, rng() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return finish(c, false);
  });
}

export function woodTexture(base = '#9a6a3f'): THREE.Texture {
  return cached('wood' + base, () => {
    const size = 256;
    const [c, g] = makeCanvas(size);
    const rng = mulberry32(11);
    const planks = 4;
    const pw = size / planks;
    for (let p = 0; p < planks; p++) {
      const f = 0.85 + rng() * 0.3;
      g.fillStyle = shade(base, f);
      g.fillRect(p * pw, 0, pw, size);
      // grain
      for (let k = 0; k < 26; k++) {
        const x = p * pw + rng() * pw;
        g.strokeStyle = `rgba(${rng() > 0.5 ? '40,24,10' : '255,230,190'},${0.08 + rng() * 0.12})`;
        g.lineWidth = 0.6 + rng() * 1.4;
        g.beginPath();
        g.moveTo(x, 0);
        let xx = x;
        for (let y = 0; y <= size; y += 16) {
          xx += (rng() - 0.5) * 2.2;
          g.lineTo(xx, y);
        }
        g.stroke();
      }
      // knots
      if (rng() > 0.4) {
        const kx = p * pw + pw * (0.3 + rng() * 0.4);
        const ky = rng() * size;
        g.fillStyle = 'rgba(50,28,12,0.45)';
        g.beginPath();
        g.ellipse(kx, ky, 3 + rng() * 3, 5 + rng() * 5, 0, 0, Math.PI * 2);
        g.fill();
      }
      // plank cuts
      const cut = rng() * size;
      g.fillStyle = 'rgba(30,18,8,0.7)';
      g.fillRect(p * pw, cut, pw, 2);
      // gaps
      g.fillStyle = 'rgba(25,14,6,0.85)';
      g.fillRect(p * pw, 0, 2, size);
      // nails
      g.fillStyle = 'rgba(40,40,45,0.9)';
      for (const ny of [10, size - 12]) {
        g.fillRect(p * pw + 6, ny, 3, 3);
        g.fillRect(p * pw + pw - 10, ny, 3, 3);
      }
    }
    return finish(c);
  });
}

export function stoneTexture(base = '#9b968c', moss = false): THREE.Texture {
  return cached('stone' + base + moss, () => {
    const size = 256;
    const [c, g] = makeCanvas(size);
    const rng = mulberry32(23);
    g.fillStyle = shade(base, 0.55);
    g.fillRect(0, 0, size, size);
    const rows = 6;
    const rh = size / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 0.5;
      const cols = 3;
      const bw = size / cols;
      for (let k = -1; k <= cols; k++) {
        const x0 = (k + off) * bw + 2;
        const y0 = r * rh + 2;
        const f = 0.8 + rng() * 0.35;
        g.fillStyle = shade(base, f);
        g.beginPath();
        const w = bw - 4;
        const h = rh - 4;
        const rr = 5;
        g.moveTo(x0 + rr, y0);
        g.lineTo(x0 + w - rr, y0);
        g.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rr);
        g.lineTo(x0 + w, y0 + h - rr);
        g.quadraticCurveTo(x0 + w, y0 + h, x0 + w - rr, y0 + h);
        g.lineTo(x0 + rr, y0 + h);
        g.quadraticCurveTo(x0, y0 + h, x0, y0 + h - rr);
        g.lineTo(x0, y0 + rr);
        g.quadraticCurveTo(x0, y0, x0 + rr, y0);
        g.fill();
        // speckle
        for (let s = 0; s < 40; s++) {
          g.fillStyle = `rgba(${rng() > 0.5 ? '255,255,255' : '0,0,0'},${rng() * 0.1})`;
          g.fillRect(x0 + rng() * w, y0 + rng() * h, 2, 2);
        }
        // highlight top edge
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(x0 + 2, y0 + 1, w - 4, 3);
        if (moss && rng() > 0.6) {
          g.fillStyle = `rgba(70,110,40,${0.25 + rng() * 0.3})`;
          g.beginPath();
          g.ellipse(x0 + rng() * w, y0 + h * 0.2, 10 + rng() * 14, 4 + rng() * 6, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    return finish(c);
  });
}

export function roofTexture(base = '#7a3e2a'): THREE.Texture {
  return cached('roof' + base, () => {
    const size = 256;
    const [c, g] = makeCanvas(size);
    const rng = mulberry32(31);
    g.fillStyle = shade(base, 0.5);
    g.fillRect(0, 0, size, size);
    const rows = 8;
    const rh = size / rows;
    for (let r = 0; r < rows; r++) {
      const cols = 6;
      const bw = size / cols;
      const off = (r % 2) * 0.5;
      for (let k = -1; k <= cols; k++) {
        const x0 = (k + off) * bw + 1;
        const y0 = r * rh;
        const f = 0.75 + rng() * 0.4;
        const grd = g.createLinearGradient(0, y0, 0, y0 + rh);
        grd.addColorStop(0, shade(base, f * 0.8));
        grd.addColorStop(1, shade(base, f * 1.15));
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x0 + bw - 2, y0);
        g.lineTo(x0 + bw - 2, y0 + rh - 4);
        g.quadraticCurveTo(x0 + bw / 2, y0 + rh + 2, x0, y0 + rh - 4);
        g.closePath();
        g.fill();
      }
    }
    return finish(c);
  });
}

export function clothTexture(base = '#c9b48a'): THREE.Texture {
  return cached('cloth' + base, () => {
    const size = 128;
    const [c, g] = makeCanvas(size);
    const rng = mulberry32(41);
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < size; i += 2) {
      g.fillStyle = `rgba(0,0,0,${0.03 + rng() * 0.04})`;
      g.fillRect(i, 0, 1, size);
      g.fillRect(0, i, size, 1);
    }
    return finish(c);
  });
}

/** Radial soft glow sprite texture (flames, wisps, pickups). */
export function glowTexture(): THREE.Texture {
  return cached('glow', () => {
    const size = 64;
    const [c, g] = makeCanvas(size);
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Ring texture used for AoE telegraphs on the ground. */
export function ringTexture(): THREE.Texture {
  return cached('ring', () => {
    const size = 128;
    const [c, g] = makeCanvas(size);
    const grd = g.createRadialGradient(64, 64, 20, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,60,40,0.10)');
    grd.addColorStop(0.85, 'rgba(255,60,40,0.35)');
    grd.addColorStop(0.95, 'rgba(255,120,80,0.95)');
    grd.addColorStop(1, 'rgba(255,60,40,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/**
 * Scale BoxGeometry UVs by face size so textures keep a constant world-space density
 * (otherwise narrow pieces would get stretched planks).
 */
export function boxGeo(w: number, h: number, d: number, unit = 2): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // face order: px, nx, py, ny, pz, nz ; 4 verts each
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = dims[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * (su / unit), uv.getY(i) * (sv / unit));
    }
  }
  uv.needsUpdate = true;
  return g;
}
