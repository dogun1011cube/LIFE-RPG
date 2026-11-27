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

function slime(pal = { body: 0x5fd36a, glow: 0x1a5a22, core: 0x2f8a3a, gi: 0.4 }): EnemyRig {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const bodyMat = mat(pal.body, 0.25, { transparent: true, opacity: 0.82, emissive: pal.glow, emissiveIntensity: pal.gi });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 14), bodyMat);
  body.scale.set(1, 0.78, 1);
  body.position.y = 0.47;
  const coreMat = mat(pal.core, 0.5, pal.gi > 0.6 ? { emissive: pal.core, emissiveIntensity: 1.4 } : {});
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

function wolf(pal = { fur: 0x7a756e, dark: 0x55514c, eye: 0xffaa33 }): EnemyRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fur = mat(pal.fur, 0.95);
  const furDark = mat(pal.dark, 0.95);
  const eyeMat = mat(0xffd27a, 0.3, { emissive: pal.eye, emissiveIntensity: 1.0 });
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

function golem(opts: { color: number; eye: number; horns?: boolean; rune?: number; glow?: number }): EnemyRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // lava creatures glow faintly from within so they read at night
  const rock = mat(opts.color, 0.95, opts.glow ? { flatShading: true, emissive: opts.glow, emissiveIntensity: 0.32 } : { flatShading: true });
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

function wisp(pal = { core: 0xb48aff, emissive: 0x8a4aff, shell: 0x3a2266, shellE: 0x4a2a8a, glow: 0x9a6aff }): EnemyRig {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const coreMat = mat(pal.core, 0.3, { emissive: pal.emissive, emissiveIntensity: 2.2 });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), coreMat);
  const shellMat = mat(pal.shell, 0.4, { transparent: true, opacity: 0.55, emissive: pal.shellE, emissiveIntensity: 0.6 });
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), shellMat);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: pal.glow, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
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

function skeleton(archer: boolean): EnemyRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const bone = mat(0xe6dfcc, 0.7);
  const boneDark = mat(0xb8ae94, 0.8);
  const eye = archer ? 0x5fe0f0 : 0xff4a2a;
  const eyeMat = mat(eye, 0.3, { emissive: eye, emissiveIntensity: 2 });
  const rust = mat(0x7a6a5a, 0.5, { metalness: 0.5 });
  const cyl = (r: number, h: number, m: THREE.Material) => new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, h, 6), m);
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.18), boneDark);
  pelvis.position.y = 0.95;
  const spine = cyl(0.035, 0.5, boneDark);
  spine.position.y = 1.2;
  body.add(pelvis, spine);
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.15 - i * 0.015, 0.022, 5, 12), bone);
    rib.rotation.x = Math.PI / 2;
    rib.scale.set(1, 0.75, 1);
    rib.position.set(0, 1.27 + i * 0.1, 0.02);
    body.add(rib);
  }
  const head = new THREE.Group();
  head.position.y = 1.66;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), bone);
  skull.scale.set(1, 1.08, 1.05);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.1), boneDark);
  jaw.position.set(0, -0.11, 0.04);
  head.add(skull, jaw);
  for (const x of [0.05, -0.05]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), eyeMat);
    e.position.set(x, 0.01, 0.125);
    head.add(e);
  }
  body.add(head);
  const arms: THREE.Group[] = [];
  for (const x of [0.22, -0.22]) {
    const arm = new THREE.Group();
    arm.position.set(x, 1.5, 0);
    arm.rotation.order = 'YXZ';
    const up = cyl(0.028, 0.3, bone);
    up.position.y = -0.15;
    const fore = cyl(0.024, 0.28, bone);
    fore.position.y = -0.45;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), boneDark);
    hand.position.y = -0.61;
    arm.add(up, fore, hand);
    body.add(arm);
    arms.push(arm);
  }
  const legs: THREE.Group[] = [];
  for (const x of [0.1, -0.1]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.92, 0);
    const th = cyl(0.032, 0.42, bone);
    th.position.y = -0.22;
    const sh = cyl(0.028, 0.42, bone);
    sh.position.y = -0.64;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.18), boneDark);
    foot.position.set(0, -0.88, 0.04);
    leg.add(th, sh, foot);
    body.add(leg);
    legs.push(leg);
  }
  if (archer) {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.022, 5, 16, Math.PI), mat(0x6a4a2a, 0.8));
    bow.position.set(0, -0.62, 0.05);
    bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
    arms[0].add(bow);
  } else {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 0.015), rust);
    blade.position.set(0, -0.62, 0.42);
    blade.rotation.x = Math.PI / 2;
    arms[1].add(blade);
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 12), mat(0x5a4632, 0.8));
    shield.rotation.z = Math.PI / 2;
    shield.position.set(0.06, -0.45, 0.05);
    arms[0].add(shield);
  }
  shadow(root);
  let phase = 0;
  return {
    root,
    mats: [bone, boneDark],
    animate(a, dt) {
      if (a.speed > 0.2) phase += dt * (3 + a.speed * 1.5);
      const s = Math.sin(phase);
      const amp = Math.min(1, a.speed / 3.5) * 0.7;
      let lx = -s * amp * 0.6;
      let rx = s * amp * 0.6;
      let ly = 0;
      let ry = 0;
      legs[0].rotation.x = s * amp;
      legs[1].rotation.x = -s * amp;
      body.rotation.x = 0;
      body.position.y = 0;
      head.rotation.z = Math.sin(a.time * 2) * 0.05;
      if (a.state === 'windup') {
        const p = Math.min(1, a.progress * 1.3);
        if (archer) {
          lx = -1.55;
          rx = -1.5;
          ry = 0.6 * p;
        } else {
          rx = -2.5 * p;
          lx = -0.9;
        }
      } else if (a.state === 'attack') {
        if (archer) {
          lx = -1.55;
          rx = -1.2;
        } else {
          rx = 0.5;
          body.rotation.x = 0.15;
        }
      } else if (a.state === 'dead') {
        const k = Math.min(1, a.stateTime * 2);
        body.position.y = -0.6 * k;
        body.rotation.x = -1.2 * k;
        body.scale.y = 1 - 0.4 * k;
      }
      const f = Math.min(1, dt * 14);
      arms[0].rotation.x += (lx - arms[0].rotation.x) * f;
      arms[1].rotation.x += (rx - arms[1].rotation.x) * f;
      arms[0].rotation.y += (ly - arms[0].rotation.y) * f;
      arms[1].rotation.y += (ry - arms[1].rotation.y) * f;
      eyeMat.emissiveIntensity = a.state === 'windup' ? 4 : 2;
    },
  };
}

function keeper(): EnemyRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const robe = mat(0x2a1a3a, 0.9, { side: THREE.DoubleSide });
  const robeDark = mat(0x1a1024, 0.9);
  const bone = mat(0xe6dfcc, 0.7);
  const glowMat = mat(0xb06aff, 0.3, { emissive: 0x8a4aff, emissiveIntensity: 2 });
  const robeMesh = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.0, 10, 1, true), robe);
  robeMesh.position.y = 1.2;
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), robeDark);
  chest.position.y = 1.95;
  chest.scale.set(1.1, 1, 0.8);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), robeDark);
  hood.position.set(0, 2.38, -0.02);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), bone);
  skull.position.set(0, 2.32, 0.07);
  body.add(robeMesh, chest, hood, skull);
  for (const x of [0.055, -0.055]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), glowMat);
    e.position.set(x, 2.34, 0.21);
    body.add(e);
  }
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.05, 6, 20), glowMat);
  hem.rotation.x = Math.PI / 2;
  hem.position.y = 0.25;
  body.add(hem);
  const arms: THREE.Group[] = [];
  for (const x of [0.38, -0.38]) {
    const arm = new THREE.Group();
    arm.position.set(x, 2.05, 0);
    arm.rotation.order = 'YXZ';
    const sleeve = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.75, 8, 1, true), robe);
    sleeve.position.y = -0.35;
    sleeve.rotation.x = Math.PI;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), bone);
    hand.position.y = -0.72;
    arm.add(sleeve, hand);
    body.add(arm);
    arms.push(arm);
  }
  const staff = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 2.2, 6), mat(0x3a2a1a, 0.8));
  pole.position.y = 0.3;
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), glowMat);
  orb.position.y = 1.45;
  staff.add(pole, orb);
  staff.position.set(0, -0.72, 0.08);
  arms[1].add(staff);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xb06aff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(1.4, 1.4, 1);
  orb.add(glow);
  shadow(root);
  return {
    root,
    mats: [robe, robeDark],
    animate(a, dt) {
      body.position.y = 0.25 + Math.sin(a.time * 1.6) * 0.12;
      body.rotation.z = Math.sin(a.time * 1.1) * 0.03;
      let lx = -0.2;
      let rx = -0.4;
      let lz = 0.15;
      let rz = -0.15;
      if (a.state === 'windup') {
        const p = Math.min(1, a.progress * 1.2);
        if (a.attackKind === 'summon' || a.attackKind === 'burst') {
          lx = rx = -2.6 * p;
          lz = 0.5 * p;
          rz = -0.5 * p;
        } else if (a.attackKind === 'slam') {
          rx = -2.8 * p;
          lx = -1.5 * p;
        } else {
          rx = -1.6 * p;
        }
      } else if (a.state === 'attack') {
        rx = a.attackKind === 'slam' ? -0.3 : -1.6;
      } else if (a.state === 'dead') {
        const k = Math.min(1, a.stateTime);
        body.scale.setScalar(Math.max(0.05, 1 - k));
        body.rotation.y += dt * 8;
      }
      const f = Math.min(1, dt * 10);
      arms[0].rotation.x += (lx - arms[0].rotation.x) * f;
      arms[1].rotation.x += (rx - arms[1].rotation.x) * f;
      arms[0].rotation.z += (lz - arms[0].rotation.z) * f;
      arms[1].rotation.z += (rz - arms[1].rotation.z) * f;
      orb.rotation.y += dt * 2;
      glowMat.emissiveIntensity = (a.state === 'windup' ? 3.5 : 2) + Math.sin(a.time * 5) * 0.3;
      if (a.phase >= 2) {
        glowMat.color.setHex(0xff5a6a);
        glowMat.emissive.setHex(0xff2a4a);
      }
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
    case 'skeleton':
      rig = skeleton(false);
      break;
    case 'archer':
      rig = skeleton(true);
      break;
    case 'keeper':
      rig = keeper();
      break;
    case 'magma_slime':
      rig = slime({ body: 0xff7a2a, glow: 0xff3a0a, core: 0xffd27a, gi: 0.9 });
      break;
    case 'ash_wolf':
      rig = wolf({ fur: 0x3e3a38, dark: 0x262423, eye: 0xff4a1a });
      break;
    case 'lava_golem':
      rig = golem({ color: 0x5a463c, eye: 0xff7a2a, rune: 0xff4a1a, glow: 0x7a2a0a });
      break;
    case 'fire_wisp':
      rig = wisp({ core: 0xffc27a, emissive: 0xff6a1a, shell: 0x6a2a0a, shellE: 0xaa3a0a, glow: 0xff8a3a });
      break;
    case 'titan':
      rig = golem({ color: 0x5a4238, eye: 0xffaa3a, horns: true, rune: 0xff4a0a, glow: 0x8a2a08 });
      rig.root.scale.setScalar(1.9);
      break;
  }
  if (scale !== 1) rig.root.scale.multiplyScalar(scale);
  return rig;
}
