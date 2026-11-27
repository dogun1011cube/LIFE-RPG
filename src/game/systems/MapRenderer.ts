import * as THREE from 'three';
import { MAP_REGION, WORLD } from '../config';
import type { Terrain } from '../world/Terrain';

/** Pre-renders a shaded overview image of the terrain used by the minimap and world map. */
export function renderMapImage(terrain: Terrain, size = 512): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const col = new THREE.Color();
  const light = new THREE.Vector3(-0.6, 0.7, -0.4).normalize();
  const n = new THREE.Vector3();
  const shallow = new THREE.Color(0x3fa3b0);
  const deep = new THREE.Color(0x163f5c);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = MAP_REGION.cx + ((i + 0.5) / size - 0.5) * MAP_REGION.size;
      const z = MAP_REGION.cz + ((j + 0.5) / size - 0.5) * MAP_REGION.size;
      const h = terrain.heightAt(x, z);
      if (h < WORLD.waterLevel) {
        const d = Math.min(1, (WORLD.waterLevel - h) / 10);
        col.copy(shallow).lerp(deep, d);
      } else {
        terrain.colorAt(x, z, col);
        terrain.normalAt(x, z, n);
        const shade = 0.55 + Math.max(0, n.dot(light)) * 0.7;
        col.multiplyScalar(shade);
        // contour hint
        if (Math.abs((h % 8) - 0) < 0.25 && h > 4) col.multiplyScalar(0.9);
      }
      const k = (j * size + i) * 4;
      // linear -> sRGB
      img.data[k] = Math.min(255, Math.pow(Math.max(0, col.r), 1 / 2.2) * 255);
      img.data[k + 1] = Math.min(255, Math.pow(Math.max(0, col.g), 1 / 2.2) * 255);
      img.data[k + 2] = Math.min(255, Math.pow(Math.max(0, col.b), 1 / 2.2) * 255);
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** World (x,z) -> normalized map coordinates [0,1]. */
export function worldToMap(x: number, z: number): [number, number] {
  return [(x - MAP_REGION.cx) / MAP_REGION.size + 0.5, (z - MAP_REGION.cz) / MAP_REGION.size + 0.5];
}
