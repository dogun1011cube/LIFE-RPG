import * as THREE from 'three';
import { glowTexture, woodTexture, stoneTexture, boxGeo } from './textures';

/** Shared decorative props used both by world landmarks and player buildables. */

const flameMats = {
  outer: new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  inner: new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
};

export interface Flame {
  group: THREE.Group;
  update(t: number): void;
}

export function createFlame(scale = 1): Flame {
  const group = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.75, 7, 1, true), flameMats.outer);
  outer.position.y = 0.36;
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 6, 1, true), flameMats.inner);
  inner.position.y = 0.24;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff8a3a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(1.8, 1.8, 1);
  glow.position.y = 0.35;
  group.add(outer, inner, glow);
  group.scale.setScalar(scale);
  const seed = Math.random() * 100;
  return {
    group,
    update(t: number) {
      const f = 1 + Math.sin(t * 13 + seed) * 0.08 + Math.sin(t * 23 + seed * 2) * 0.06;
      outer.scale.set(1 / f, f * (1 + Math.sin(t * 9 + seed) * 0.1), 1 / f);
      inner.scale.set(1, f * 1.1, 1);
      outer.rotation.y = t * 2;
      inner.rotation.y = -t * 3;
      glow.material.opacity = 0.45 + Math.sin(t * 17 + seed) * 0.08;
    },
  };
}

export function stdMat(color: number, rough = 0.85, map?: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial(map ? { color, roughness: rough, map } : { color, roughness: rough });
}

/** Ring of stones + crossed logs. Flame returned separately so callers can animate it. */
export function createCampfire(): { group: THREE.Group; flame: Flame } {
  const group = new THREE.Group();
  const stoneMat = stdMat(0x8a857c, 0.95);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), stoneMat);
    s.position.set(Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55);
    s.scale.set(1.2, 0.8, 1);
    s.castShadow = true;
    group.add(s);
  }
  const logMat = stdMat(0x5a3a22, 0.9);
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 6), logMat);
    l.rotation.z = Math.PI / 2 - 0.35;
    l.rotation.y = (i / 4) * Math.PI * 2;
    l.position.y = 0.15;
    l.castShadow = true;
    group.add(l);
  }
  const ember = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), new THREE.MeshBasicMaterial({ color: 0x3a1a0a }));
  ember.rotation.x = -Math.PI / 2;
  ember.position.y = 0.02;
  group.add(ember);
  const flame = createFlame(1);
  flame.group.position.y = 0.05;
  group.add(flame.group);
  return { group, flame };
}

export function createChest(woodColor = 0x8a5a32): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: woodColor, map: woodTexture('#a0703f'), roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x5a5048, roughness: 0.5, metalness: 0.6 });
  const base = new THREE.Mesh(boxGeo(1.0, 0.5, 0.62, 1), wood);
  base.position.y = 0.25;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 1.0, 10, 1, false, 0, Math.PI), wood);
  lid.rotation.z = Math.PI / 2;
  lid.rotation.y = Math.PI / 2;
  lid.position.y = 0.5;
  for (const x of [-0.42, 0.42]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 0.64), metal);
    band.position.set(x, 0.25, 0);
    g.add(band);
  }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.04), new THREE.MeshStandardMaterial({ color: 0xc9a45c, metalness: 0.8, roughness: 0.3 }));
  lock.position.set(0, 0.45, 0.32);
  g.add(base, lid, lock);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

export function ruinStoneMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xb8b2a4, map: stoneTexture('#a49d8e', true), roughness: 0.95 });
}
