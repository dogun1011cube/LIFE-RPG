import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ITEMS } from '../data/items';
import { damp } from '../core/math';

export type AnimState = 'idle' | 'move' | 'air' | 'swim' | 'attack' | 'heavy' | 'gather' | 'pick' | 'dodge' | 'hurt' | 'dead' | 'use' | 'block' | 'spin' | 'dash' | 'cast' | 'sleep';

export interface CharacterLook {
  shirt?: number;
  pants?: number;
  hair?: number;
  skin?: number;
  cape?: boolean;
}

export interface AnimInput {
  state: AnimState;
  speed: number; // horizontal speed m/s
  run: boolean;
  t: number; // 0..1 progress of timed actions
  combo: number;
  tool: 'axe' | 'pickaxe' | null;
}

function std(color: number, rough = 0.8, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
}

const ease = (t: number) => t * t * (3 - 2 * t);
const seg = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));

/** Procedurally built and animated stylized humanoid (no external model files). */
export class CharacterModel {
  readonly root = new THREE.Group();
  private body = new THREE.Group(); // roll pivot
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private handR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private socket = new THREE.Group();
  private weapon = new THREE.Group();
  private toolMesh = new THREE.Group();
  private cape: THREE.Mesh;
  private chestMat = std(0x3f6a8a, 0.85);
  private padL: THREE.Mesh;
  private padR: THREE.Mesh;
  private walkPhase = 0;
  private time = 0;
  private toolKind: 'axe' | 'pickaxe' | null = null;
  private baseShirt = 0x3f6a8a;
  private toolColor = 0x9a9a95;

  constructor(look: CharacterLook = {}) {
    const skin = std(look.skin ?? 0xe8b896, 0.7);
    const pants = std(look.pants ?? 0x4a3a2c, 0.9);
    const boots = std(0x2e2218, 0.85);
    const hair = std(look.hair ?? 0x3b2516, 0.9);
    if (look.shirt !== undefined) {
      this.baseShirt = look.shirt;
      this.chestMat.color.setHex(look.shirt);
    }
    const belt = std(0x2a1d12, 0.7);
    const capeMat = std(0x6e2226, 0.95, { side: THREE.DoubleSide });

    this.root.add(this.body);
    this.body.position.y = 0.9;
    this.body.add(this.hips);
    this.hips.position.y = 0.02; // relative to body pivot (~hip height)

    // Legs
    for (const [leg, x] of [
      [this.legL, 0.12],
      [this.legR, -0.12],
    ] as const) {
      leg.position.set(x, 0, 0);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.6, 4, 10), pants);
      m.position.y = -0.4;
      leg.add(m);
      const b = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.16, 0.28, 2, 0.04), boots);
      b.position.set(0, -0.82, 0.04);
      leg.add(b);
      this.hips.add(leg);
    }

    // Torso
    this.hips.add(this.torso);
    const pelvis = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.2, 0.24, 2, 0.05), pants);
    pelvis.position.y = 0.04;
    this.torso.add(pelvis);
    const chest = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.52, 0.27, 3, 0.08), this.chestMat);
    chest.position.y = 0.38;
    this.torso.add(chest);
    const beltM = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.07, 0.28), belt);
    beltM.position.y = 0.14;
    this.torso.add(beltM);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.02), std(0xc9a45c, 0.4, { metalness: 0.6 }));
    buckle.position.set(0, 0.14, 0.145);
    this.torso.add(buckle);
    const padGeo = new RoundedBoxGeometry(0.17, 0.1, 0.2, 2, 0.04);
    this.padL = new THREE.Mesh(padGeo, this.chestMat);
    this.padL.position.set(0.25, 0.63, 0);
    this.padR = new THREE.Mesh(padGeo, this.chestMat);
    this.padR.position.set(-0.25, 0.63, 0);
    this.torso.add(this.padL, this.padR);
    this.padL.visible = this.padR.visible = false;

    // Head
    this.head.position.y = 0.76;
    this.torso.add(this.head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), skin);
    neck.position.y = -0.06;
    this.head.add(neck);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), skin);
    face.position.y = 0.1;
    face.scale.set(1, 1.08, 1);
    this.head.add(face);
    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.172, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    hairTop.position.set(0, 0.12, -0.01);
    hairTop.rotation.x = -0.25;
    this.head.add(hairTop);
    const hairBack = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.2, 0.1, 2, 0.04), hair);
    hairBack.position.set(0, 0.04, -0.12);
    this.head.add(hairBack);
    const eyeMat = std(0x1a1a22, 0.3);
    for (const x of [0.055, -0.055]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 0.02), eyeMat);
      e.position.set(x, 0.11, 0.155);
      this.head.add(e);
    }
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.04, 6, 14), capeMat);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = -0.03;
    this.head.add(scarf);

    // Arms
    for (const [arm, x] of [
      [this.armL, 0.28],
      [this.armR, -0.28],
    ] as const) {
      arm.position.set(x, 0.6, 0);
      arm.rotation.order = 'YXZ';
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.28, 4, 8), this.chestMat);
      sleeve.position.y = -0.16;
      arm.add(sleeve);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.24, 4, 8), skin);
      fore.position.y = -0.42;
      arm.add(fore);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), skin);
      hand.position.y = -0.6;
      arm.add(hand);
      this.torso.add(arm);
    }
    this.handR.position.y = -0.6;
    this.armR.add(this.handR);
    this.handR.add(this.socket);
    this.socket.rotation.x = Math.PI / 2;
    this.socket.add(this.weapon, this.toolMesh);

    // Cape
    const capeGeo = new THREE.PlaneGeometry(0.38, 0.72, 1, 4);
    capeGeo.translate(0, -0.36, 0);
    // taper the bottom edge a little
    const cp = capeGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < cp.count; i++) cp.setX(i, cp.getX(i) * (1 + cp.getY(i) * 0.35));
    this.cape = new THREE.Mesh(capeGeo, capeMat);
    this.cape.position.set(0, 0.62, -0.15);
    this.torso.add(this.cape);
    this.cape.visible = look.cape ?? true;

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
    });
    this.setEquipment(null, null);
  }

  setEquipment(weaponId: string | null, armorId: string | null) {
    this.weapon.clear();
    const w = weaponId ? ITEMS[weaponId]?.weapon : undefined;
    const kind = w?.kind ?? 'none';
    const grip = std(0x4a2e18, 0.8);
    if (kind === 'club') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.035, 0.85, 7), std(w!.color, 0.9));
      m.position.y = 0.38;
      this.weapon.add(m);
    } else if (kind === 'sword' || kind === 'blade') {
      const bladeMat =
        kind === 'blade'
          ? std(w!.color, 0.2, { emissive: new THREE.Color(w!.color), emissiveIntensity: 0.9, metalness: 0.3 })
          : std(w!.color, 0.35, { metalness: 0.55 });
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), grip);
      handle.position.y = 0.02;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.06), std(0x8a6a3a, 0.5, { metalness: 0.4 }));
      guard.position.y = 0.13;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.82, 0.02), bladeMat);
      blade.position.y = 0.56;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.053, 0.12, 4), bladeMat);
      tip.position.y = 1.03;
      tip.rotation.y = Math.PI / 4;
      tip.scale.z = 0.27;
      this.weapon.add(handle, guard, blade, tip);
    }
    this.weapon.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));

    const a = armorId ? ITEMS[armorId]?.armor : undefined;
    this.chestMat.color.setHex(a ? a.color : this.baseShirt);
    this.chestMat.metalness = armorId === 'copper_armor' ? 0.45 : 0;
    this.chestMat.roughness = armorId === 'copper_armor' ? 0.45 : 0.85;
    this.padL.visible = this.padR.visible = !!a;
  }

  setShirt(color: number) {
    this.baseShirt = color;
    this.chestMat.color.setHex(color);
  }

  private buildTool(kind: 'axe' | 'pickaxe', color: number) {
    this.toolMesh.clear();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), std(0x7a5230, 0.9));
    handle.position.y = 0.32;
    this.toolMesh.add(handle);
    const headMat = std(color, 0.4, { metalness: 0.4 });
    if (kind === 'axe') {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.24), headMat);
      head.position.set(0, 0.64, 0.1);
      this.toolMesh.add(head);
    } else {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.5), headMat);
      head.position.set(0, 0.68, 0.02);
      head.rotation.x = 0.15;
      this.toolMesh.add(head);
    }
    this.toolMesh.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
  }

  setTool(kind: 'axe' | 'pickaxe' | null, color = 0x9a9a95) {
    if (kind && (kind !== this.toolKind || color !== this.toolColor)) this.buildTool(kind, color);
    this.toolKind = kind;
    this.toolColor = color;
  }

  /** Brief red flash on damage. */
  flash = 0;

  update(dt: number, a: AnimInput) {
    this.time += dt;
    const k = damp(16, dt);
    const showTool = (a.state === 'gather') && !!a.tool;
    this.toolMesh.visible = showTool;
    this.weapon.visible = !showTool;

    // Targets
    let lArmX = 0,
      lArmY = 0,
      lArmZ = 0.1,
      rArmX = 0,
      rArmY = 0,
      rArmZ = -0.1,
      roll = 0,
      torsoYaw = 0,
      torsoPitch = 0,
      legL = 0,
      legR = 0,
      bodyY = 0.9,
      bodyRoll = 0,
      bodyPitch = 0,
      headPitch = 0,
      capeX = 0.15;
    let snap = false;

    const sp = Math.min(a.speed / 8, 1.2);
    if (a.state === 'move' || ((a.state === 'attack' || a.state === 'heavy' || a.state === 'use') && a.speed > 0.5)) {
      this.walkPhase += dt * (5.5 + a.speed * 1.15);
    } else {
      this.walkPhase *= 1 - damp(6, dt);
    }
    const s = Math.sin(this.walkPhase);
    const amp = Math.min(1, a.speed / 4.5) * (a.run ? 0.95 : 0.7);

    switch (a.state) {
      case 'idle': {
        const br = Math.sin(this.time * 1.8);
        bodyY = 0.9 + br * 0.008;
        lArmZ = 0.12 + br * 0.02;
        rArmZ = -0.12 - br * 0.02;
        rArmX = -0.15;
        capeX = 0.1 + br * 0.02;
        break;
      }
      case 'move': {
        legL = s * amp;
        legR = -s * amp;
        lArmX = -s * amp * 0.8;
        rArmX = s * amp * 0.8 - 0.1;
        bodyY = 0.9 + Math.abs(Math.cos(this.walkPhase)) * 0.06 * amp - 0.02 * amp;
        torsoPitch = a.run ? 0.18 : 0.05;
        capeX = 0.25 + sp * 0.7 + Math.sin(this.walkPhase * 2) * 0.05;
        break;
      }
      case 'air':
        legL = 0.6;
        legR = -0.25;
        lArmZ = 0.6;
        rArmZ = -0.6;
        lArmX = -0.4;
        rArmX = -0.4;
        capeX = 0.9;
        break;
      case 'swim': {
        const st = this.time * 4;
        bodyPitch = 1.15;
        bodyY = 0.5;
        lArmX = -2.6 + Math.sin(st) * 1.0;
        rArmX = -2.6 + Math.sin(st + Math.PI) * 1.0;
        legL = Math.sin(st * 2) * 0.4;
        legR = -Math.sin(st * 2) * 0.4;
        headPitch = -0.9;
        capeX = 1.2;
        break;
      }
      case 'attack': {
        snap = true;
        const t = a.t;
        const w = ease(seg(t, 0, 0.3));
        const st = ease(seg(t, 0.3, 0.55));
        const rc = ease(seg(t, 0.6, 1));
        if (a.combo % 3 === 0) {
          rArmX = -1.45;
          rArmY = -0.3 + (-1.3) * w + 2.5 * st - 0.6 * rc;
          roll = Math.PI / 2;
          torsoYaw = -0.5 * w + 1.1 * st - 0.6 * rc;
        } else if (a.combo % 3 === 1) {
          rArmX = -1.4;
          rArmY = 0.5 + 0.8 * w - 2.7 * st + 0.9 * rc;
          roll = -Math.PI / 2;
          torsoYaw = 0.5 * w - 1.1 * st + 0.6 * rc;
        } else {
          rArmX = -0.4 - 2.6 * w + 2.5 * st + 0.3 * rc;
          rArmY = 0;
          torsoPitch = -0.15 * w + 0.45 * st - 0.3 * rc;
          legL = 0.35 * st;
          legR = -0.3 * st;
        }
        lArmX = -0.3;
        lArmZ = 0.35;
        legL += s * amp * 0.5;
        legR -= s * amp * 0.5;
        capeX = 0.35;
        break;
      }
      case 'heavy': {
        snap = true;
        const t = a.t;
        const w = ease(seg(t, 0, 0.45));
        const st = ease(seg(t, 0.45, 0.62));
        const rc = ease(seg(t, 0.7, 1));
        rArmX = -0.4 - 2.75 * w + 2.85 * st + 0.3 * rc;
        lArmX = -0.4 - 2.4 * w + 2.5 * st + 0.3 * rc;
        lArmY = -0.5 * w;
        rArmY = 0.2;
        torsoPitch = -0.3 * w + 0.7 * st - 0.4 * rc;
        bodyY = 0.9 - 0.12 * w + 0.12 * st - 0.15 * st * (1 - rc);
        legL = 0.5 * st;
        legR = -0.4 * st;
        capeX = 0.2 + 0.6 * w;
        break;
      }
      case 'gather': {
        snap = true;
        const t = a.t;
        const w = ease(seg(t, 0, 0.5));
        const st = ease(seg(t, 0.5, 0.65));
        const rc = ease(seg(t, 0.7, 1));
        const sideways = a.tool === 'axe';
        if (sideways) {
          rArmX = -1.3;
          rArmY = -0.2 - 1.3 * w + 1.8 * st - 0.3 * rc;
          lArmX = -1.2;
          lArmY = 0.4 - 1.1 * w + 1.4 * st - 0.3 * rc;
          roll = 0;
          torsoYaw = -0.6 * w + 0.9 * st - 0.3 * rc;
        } else {
          rArmX = -0.5 - 2.4 * w + 2.6 * st + 0.3 * rc;
          lArmX = -0.5 - 2.2 * w + 2.4 * st + 0.3 * rc;
          torsoPitch = -0.15 * w + 0.5 * st - 0.35 * rc;
        }
        legL = 0.25;
        legR = -0.2;
        capeX = 0.2;
        break;
      }
      case 'pick': {
        const t = a.t;
        const down = Math.sin(Math.min(1, t) * Math.PI);
        torsoPitch = 0.7 * down;
        rArmX = -0.9 * down;
        lArmX = -0.7 * down;
        legL = 0.3 * down;
        legR = -0.5 * down;
        bodyY = 0.9 - 0.18 * down;
        break;
      }
      case 'dodge': {
        snap = true;
        const t = a.t;
        bodyRoll = ease(seg(t, 0.05, 0.85)) * Math.PI * 2;
        const tuck = Math.sin(Math.min(1, t) * Math.PI);
        legL = -1.4 * tuck;
        legR = -1.2 * tuck;
        lArmX = -1.2 * tuck;
        rArmX = -1.2 * tuck;
        bodyY = 0.9 - 0.4 * tuck;
        capeX = 0.4;
        break;
      }
      case 'hurt':
        torsoPitch = -0.3;
        lArmZ = 0.6;
        rArmZ = -0.6;
        headPitch = -0.3;
        break;
      case 'use': {
        const up = Math.sin(Math.min(1, a.t) * Math.PI);
        lArmX = -2.1 * up;
        lArmZ = 0.1 - 0.35 * up;
        headPitch = 0.1 * up;
        legL = s * amp * 0.6;
        legR = -s * amp * 0.6;
        break;
      }
      case 'block':
        rArmX = -1.25;
        rArmY = 0.75;
        roll = Math.PI / 2;
        lArmX = -1.1;
        lArmY = -0.55;
        torsoPitch = 0.12;
        bodyY = 0.86;
        legL = 0.35 + s * amp * 0.4;
        legR = -0.25 - s * amp * 0.4;
        capeX = 0.2;
        break;
      case 'spin': {
        snap = true;
        rArmX = -1.5;
        rArmY = -1.2;
        roll = Math.PI / 2;
        lArmZ = 1.3;
        legL = 0.3;
        legR = -0.3;
        bodyY = 0.84;
        capeX = 1.2;
        break;
      }
      case 'dash':
        snap = true;
        torsoPitch = 0.45;
        rArmX = -1.55;
        roll = 0;
        lArmX = 0.6;
        legL = 0.9;
        legR = -0.9;
        bodyY = 0.8;
        capeX = 1.4;
        break;
      case 'cast': {
        const up = Math.sin(Math.min(1, a.t) * Math.PI);
        rArmX = -1.2 - 0.6 * up;
        lArmX = -1.2 - 0.6 * up;
        lArmZ = -0.15;
        rArmZ = 0.15;
        torsoPitch = -0.1 * up;
        capeX = 0.4 + up * 0.4;
        break;
      }
      case 'sleep':
      case 'dead':
        bodyPitch = -Math.PI / 2;
        bodyY = 0.25;
        lArmZ = 1.2;
        rArmZ = -1.2;
        break;
    }

    const kk = snap ? 1 : k;
    const lerpTo = (cur: number, tgt: number, f = kk) => cur + (tgt - cur) * f;
    this.armL.rotation.x = lerpTo(this.armL.rotation.x, lArmX, k);
    this.armL.rotation.y = lerpTo(this.armL.rotation.y, lArmY, k);
    this.armL.rotation.z = lerpTo(this.armL.rotation.z, lArmZ, k);
    this.armR.rotation.x = lerpTo(this.armR.rotation.x, rArmX);
    this.armR.rotation.y = lerpTo(this.armR.rotation.y, rArmY);
    this.armR.rotation.z = lerpTo(this.armR.rotation.z, rArmZ, k);
    this.handR.rotation.y = lerpTo(this.handR.rotation.y, roll);
    this.torso.rotation.y = lerpTo(this.torso.rotation.y, torsoYaw);
    this.torso.rotation.x = lerpTo(this.torso.rotation.x, torsoPitch);
    this.legL.rotation.x = lerpTo(this.legL.rotation.x, legL);
    this.legR.rotation.x = lerpTo(this.legR.rotation.x, legR);
    this.body.position.y = lerpTo(this.body.position.y, bodyY, k);
    this.head.rotation.x = lerpTo(this.head.rotation.x, headPitch, k);
    this.cape.rotation.x = lerpTo(this.cape.rotation.x, capeX, damp(8, dt));
    // whirlwind spins the whole upper/lower body around Y
    this.hips.rotation.y = a.state === 'spin' ? ease(Math.min(1, a.t)) * Math.PI * 2 : 0;
    if (a.state === 'dodge') this.body.rotation.x = bodyRoll;
    else if (a.state === 'dead' || a.state === 'sleep' || a.state === 'swim') this.body.rotation.x = lerpTo(this.body.rotation.x, bodyPitch, damp(6, dt));
    else this.body.rotation.x = lerpTo(this.body.rotation.x % (Math.PI * 2), 0, damp(14, dt));

    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
    this.chestMat.emissive.setRGB(this.flash * 0.8, 0, 0);
  }
}
