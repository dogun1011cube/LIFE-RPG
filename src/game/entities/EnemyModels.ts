import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { EnemyModel } from '../data/enemies';
import { glowTexture } from '../world/textures';

export interface EnemyAnim {
  state: string;
  stateTime: number;
  progress: number; // 0..1 within windup/attack
  speed: number;
  attackKind: string;
  time: number;
  phase: number;
}

export interface EnemyRig {
  root: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
  animate(a: EnemyAnim, dt: number): void;
}

function mat(color: number, rough = 0.8, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
}

function shadow(g: THREE.Object3D) {
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
}

function slime(): EnemyRig {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const bodyMat = mat(0x5fd36a, 0.25, { transparent: true, opacity: 0.82, emissive: 0x1a5a22, emissiveIntensity: 0.4 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 14), bodyMat);
  body.scale.set(1, 0.78, 1);
  body.position.y = 0.47;
  const coreMat = mat(0x2f8a3a, 0.5);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), coreMat);
  core.position.y = 0.42;
  const eyeMat = mat(0x111111, 0.2);
  const eyes = new THREE.Group();
  for (const x of [0.17, -0.17]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMat);
    e.position.set(x, 0.62, 0.48);
    e.scale.set(1, 1.4, 0.6);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), mat(0xffffff, 0.2, { emissive: 0xffffff, emissiveIntensity: 1 }));
    hl.position.set(x + 0.02, 0.66, 0.53);
    eyes.add(e, hl);
  }
  inner.add(body, core, eyes);
  shadow(root);
  let hopPhase = 0;
  return {
    root,
    mats: [bodyMat, coreMat],
    animate(a, dt) {
      let sy = 1;
      let y = 0;
      if (a.state === 'windup') {
        sy = 1 - 0.38 * Math.min(1, a.progress * 1.4);
        inner.position.x = Math.sin(a.time * 60) * 0.03;
      } else if (a.state === 'attack') {
        sy = 1.25;
        y = Math.sin(Math.min(1, a.progress) * Math.PI) * 0.8;
      } else if (a.state === 'dead') {
        sy = Math.max(0.05, 1 - a.stateTime * 1.6);
      } else if (a.speed > 0.2) {
        hopPhase += dt * (4 + a.speed * 1.4);
        const s = Math.abs(Math.sin(hopPhase));
        y = s * 0.35;
        sy = 0.85 + s * 0.3;
      } else {
        sy = 1 + Math.sin(a.time * 3) * 0.05;
      }
      inner.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      inner.position.y = y;
      core.rotation.y += dt * 1.5;
    },
  };
}

function wolf(): EnemyRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fur = mat(0x7a756e, 0.95);
  const furDark = mat(0x55514c, 0.95);
  const eyeMat = mat(0xffd27a, 0.3, { emissive: 0xffaa33, emissiveIntensity: 0.8 });
  const torso = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.46, 1.05, 2, 0.12), fur);
  torso.position.set(0, 0.68, 0);
  const chest = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.55, 0.45, 2, 0.14), furDark);
  chest.position.set(0, 0.74, 0.32);
  body.add(torso, chest);
  const head = new THREE.Group();
  head.position.set(0, 0.88, 0.62);
  const skull = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.3, 0.34, 2, 0.08), fur);
  const snout = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.15, 0.28, 2, 0.05), furDark);
  snout.position.set(0, -0.05, 0.26);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), mat(0x111111, 0.3));
  nose.position.set(0, -0.01, 0.4);
  head.add(skull, snout, nose);
  for (const x of [0.1, -0.1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), furDark);
    ear.position.set(x, 0.2, -0.04);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), eyeMat);
    eye.position.set(x * 0.9, 0.05, 0.17);
    head.add(ear, eye);
  }
  body.add(head);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.55, 6), furDark);
  tail.geometry.translate(0, -0.27, 0);
  tail.position.set(0, 0.8, -0.52);
  tail.rotation.x = -2.2;
  body.add(tail);
  const legs: THREE.Group[] = [];
  for (const [x, z] of [
    [0.15, 0.36],
    [-0.15, 0.36],
    [0.15, -0.36],
    [-0.15, -0.36],
  ]) {
    const lg = new THREE.Group();
    lg.position.set(x, 0.55, z);
    const m = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.55, 0.13, 2, 0.04), fur);
    m.position.y = -0.27;
    lg.add(m);
    body.add(lg);
    legs.push(lg);
  }
  shadow(root);
  let phase = 0;
  return {
    root,
    mats: [fur, furDark],
    animate(a, dt) {
      const run = a.speed > 0.3;
      if (run) phase += dt * (3 + a.speed * 1.6);
      const s = Math.sin(phase);
      const amp = Math.min(1, a.speed / 5) * 0.8;
      legs[0].rotation.x = s * amp;
      legs[1].rotation.x = -s * amp * 0.8;
      legs[2].rotation.x = -s * amp;
      legs[3].rotation.x = s * amp * 0.8;
      body.position.y = run ? Math.abs(Math.cos(phase)) * 0.05 : 0;
      tail.rotation.z = Math.sin(a.time * (run ? 4 : 8)) * 0.3;
      head.rotation.x = 0;
      body.rotation.x = 0;
      eyeMat.emissiveIntensity = 0.8;
      if (a.state === 'windup') {
        body.position.y = -0.12 * Math.min(1, a.progress * 2);
        head.rotation.x = 0.25;
        body.rotation.x = 0.08;
        eyeMat.color.setHex(0xff3a2a);
        eyeMat.emissive.setHex(0xff2a1a);
        eyeMat.emissiveIntensity = 2;
      } else if (a.state === 'attack') {
        head.rotation.x = -0.35;
        body.rotation.x = -0.12;
        for (const l of legs) l.rotation.x = l.position.z > 0 ? -0.9 : 0.9;
      } else if (a.state === 'dead') {
        root.rotation.z = Math.min(Math.PI / 2, a.stateTime * 4);
      } else {
        eyeMat.color.setHex(0xffd27a);
        eyeMat.emissive.setHex(0xffaa33);
      }
    },
  };
}

function golem(opts: { color: number; eye: number; horns?: boolean; rune?: number }): EnemyRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const rock = mat(opts.color, 0.95, { flatShading: true });
  const rockDark = mat(new THREE.Color(opts.color).multiplyScalar(0.7).getHex(), 0.95, { flatShading: true });
  const eyeMat = mat(opts.eye, 0.3, { emissive: opts.eye, emissiveIntensity: 1.6 });
  const torso = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), rock);
  torso.scale.set(1.15, 1.2, 0.9);
  torso.position.y = 1.65;
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), eyeMat);
  core.position.set(0, 1.7, 0.72);
  body.add(torso, core);
  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), rockDark);
  head.position.set(0, 2.65, 0.12);
  body.add(head);
  for (const x of [0.15, -0.15]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.05), eyeMat);
    e.position.set(x, 2.68, 0.5);
    body.add(e);
  }
  if (opts.horns) {
    for (const x of [0.32, -0.32]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 5), rockDark);
      h.position.set(x, 3.0, 0.05);
      h.rotation.z = x > 0 ? -0.5 : 0.5;
      body.add(h);
    }
  }
  if (opts.rune) {
    const runeMat = mat(opts.rune, 0.3, { emissive: opts.rune, emissiveIntensity: 1.4 });
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.04), runeMat);
      r.position.set(-0.45 + i * 0.3, 1.5 + (i % 2) * 0.2, 0.82);
      body.add(r);
    }
  }
  // back crystals
  const crys = mat(0x5fe0f0, 0.2, { emissive: 0x2ab8d8, emissiveIntensity: 0.7, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), crys);
    c.scale.y = 2.2;
    c.position.set(-0.3 + i * 0.3, 2.2, -0.65);
    c.rotation.x = -0.5;
    body.add(c);
  }
  const arms: THREE.Group[] = [];
  for (const x of [1.05, -1.05]) {
    const arm = new THREE.Group();
    arm.position.set(x, 2.1, 0);
    arm.rotation.order = 'YXZ';
    const upper = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38, 0), rockDark);
    upper.position.y = -0.35;
    const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), rock);
    fist.position.y = -1.05;
    arm.add(upper, fist);
    body.add(arm);
    arms.push(arm);
  }
  const legs: THREE.Group[] = [];
  for (const x of [0.45, -0.45]) {
    const lg = new THREE.Group();
    lg.position.set(x, 0.95, 0);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.95, 7), rockDark);
    m.position.y = -0.47;
    lg.add(m);
    body.add(lg);
    legs.push(lg);
  }
  shadow(root);
  let phase = 0;
  return {
    root,
    mats: [rock, rockDark],
    animate(a, dt) {
      if (a.speed > 0.2) phase += dt * (2 + a.speed);
      const s = Math.sin(phase);
      legs[0].rotation.x = s * 0.45;
      legs[1].rotation.x = -s * 0.45;
      body.rotation.z = s * 0.05;
      let lx = s * 0.3;
      let rx = -s * 0.3;
      let lz = 0.15;
      let rz = -0.15;
      let ly = 0;
      let ry = 0;
      body.position.y = 0;
      if (a.state === 'windup' && a.attackKind === 'slam') {
        const p = Math.min(1, a.progress * 1.3);
        lx = rx = -2.9 * p;
        body.rotation.x = -0.2 * p;
        body.position.y = 0.1 * p;
      } else if (a.state === 'attack' && a.attackKind === 'slam') {
        lx = rx = -0.6;
        body.rotation.x = 0.35;
      } else if (a.state === 'windup' && (a.attackKind === 'melee' || a.attackKind === 'lunge')) {
        const p = Math.min(1, a.progress * 1.3);
        rx = -1.4 * p;
        ry = -1.2 * p;
        body.rotation.y = -0.4 * p;
      } else if (a.state === 'attack' && (a.attackKind === 'melee' || a.attackKind === 'lunge')) {
        rx = -1.4;
        ry = 1.3;
        body.rotation.y = 0.5;
      } else if (a.state === 'windup' && a.attackKind === 'burst') {
        const p = Math.min(1, a.progress);
        lz = 1.6 * p;
        rz = -1.6 * p;
        lx = rx = -0.5 * p;
      } else if (a.state === 'recover') {
        body.rotation.x *= 0.9;
        body.rotation.y *= 0.9;
      } else if (a.state === 'dead') {
        body.rotation.x = Math.min(1.4, a.stateTime * 1.5);
        body.position.y = -Math.min(1, a.stateTime) * 0.8;
      } else {
        body.rotation.x *= 0.9;
        body.rotation.y *= 0.9;
      }
      const k = Math.min(1, dt * 14);
      arms[0].rotation.x += (lx - arms[0].rotation.x) * k;
      arms[1].rotation.x += (rx - arms[1].rotation.x) * k;
      arms[0].rotation.z += (lz - arms[0].rotation.z) * k;
      arms[1].rotation.z += (rz - arms[1].rotation.z) * k;
      arms[0].rotation.y += (ly - arms[0].rotation.y) * k;
      arms[1].rotation.y += (ry - arms[1].rotation.y) * k;
      core.rotation.y += dt * 2;
      eyeMat.emissiveIntensity = (a.phase >= 2 ? 2.6 : 1.6) + Math.sin(a.time * 4) * 0.3;
      if (a.phase >= 2) {
        eyeMat.color.setHex(0xff5a3a);
        eyeMat.emissive.setHex(0xff3a1a);
      }
    },
  };
}

function wisp(): EnemyRig {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const coreMat = mat(0xb48aff, 0.3, { emissive: 0x8a4aff, emissiveIntensity: 2.2 });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), coreMat);
  const shellMat = mat(0x3a2266, 0.4, { transparent: true, opacity: 0.55, emissive: 0x4a2a8a, emissiveIntensity: 0.6 });
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), shellMat);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x9a6aff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(2.4, 2.4, 1);
  inner.add(core, shell, glow);
  const orbs: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), coreMat);
    inner.add(o);
    orbs.push(o);
  }
  inner.position.y = 1.0;
  return {
    root,
    mats: [shellMat],
    animate(a, dt) {
      inner.position.y = 1.0 + Math.sin(a.time * 2.2) * 0.2;
      shell.rotation.x += dt * 1.2;
      shell.rotation.y += dt * 0.8;
      let s = 1;
      if (a.state === 'windup') s = 1 + a.progress * 0.5;
      if (a.state === 'dead') s = Math.max(0.01, 1 - a.stateTime * 2);
      inner.scale.setScalar(s);
      coreMat.emissiveIntensity = a.state === 'windup' ? 2.2 + a.progress * 3 : 2.2;
      orbs.forEach((o, i) => {
        const ang = a.time * 3 + (i * Math.PI * 2) / 3;
        o.position.set(Math.cos(ang) * 0.7, Math.sin(ang * 1.3) * 0.2, Math.sin(ang) * 0.7);
      });
      glow.material.opacity = 0.6 + Math.sin(a.time * 5) * 0.15;
    },
  };
}

export function buildEnemyRig(model: EnemyModel, scale: number): EnemyRig {
  let rig: EnemyRig;
  switch (model) {
    case 'slime':
      rig = slime();
      break;
    case 'wolf':
      rig = wolf();
      break;
    case 'golem':
      rig = golem({ color: 0x8a837a, eye: 0xff9a3a });
      break;
    case 'wisp':
      rig = wisp();
      break;
    case 'warden':
      rig = golem({ color: 0x5a5868, eye: 0x5fe0f0, horns: true, rune: 0x5fe0d8 });
      rig.root.scale.setScalar(1.75);
      break;
  }
  if (scale !== 1) rig.root.scale.multiplyScalar(scale);
  return rig;
}
