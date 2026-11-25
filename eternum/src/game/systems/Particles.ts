import * as THREE from 'three';

interface P {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  gravity: number;
  spin: number;
}

/** Pooled instanced cube particles (hit sparks, wood chips, dust, magic). */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private pool: P[] = [];
  private next = 0;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private e = new THREE.Euler();
  private color = new THREE.Color();
  private readonly count = 700;

  constructor() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.count);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.count; i++) {
      this.pool.push({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, size: 0.1, gravity: 9, spin: 0 });
      this.mesh.setMatrixAt(i, this.m4.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, this.color.set(0xffffff));
    }
    this.mesh.name = 'particles';
  }

  emit(pos: THREE.Vector3, vel: THREE.Vector3, color: number, life = 0.8, size = 0.1, gravity = 9) {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    const p = this.pool[i];
    p.active = true;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.life = life;
    p.max = life;
    p.size = size;
    p.gravity = gravity;
    p.spin = Math.random() * 10;
    this.mesh.setColorAt(i, this.color.set(color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  burst(pos: THREE.Vector3, color: number, n = 10, speed = 3, size = 0.1, gravity = 9, life = 0.8) {
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set((Math.random() - 0.5) * 2, Math.random() * 1.2 + 0.2, (Math.random() - 0.5) * 2).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.emit(pos, v, color, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), gravity);
    }
  }

  /** Rising sparkles (level up, magic). */
  rise(pos: THREE.Vector3, color: number, n = 20, radius = 1) {
    const v = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      p.set(pos.x + Math.cos(a) * radius * Math.random(), pos.y + Math.random() * 0.5, pos.z + Math.sin(a) * radius * Math.random());
      v.set(0, 1.5 + Math.random() * 2.5, 0);
      this.emit(p, v, color, 1 + Math.random() * 0.8, 0.08 + Math.random() * 0.06, -0.5);
    }
  }

  update(dt: number) {
    let any = false;
    for (let i = 0; i < this.count; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      any = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.mesh.setMatrixAt(i, this.m4.makeScale(0, 0, 0));
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(1 - dt * 1.2);
      p.pos.addScaledVector(p.vel, dt);
      const k = p.life / p.max;
      const sz = p.size * Math.min(1, k * 2);
      p.spin += dt * 8;
      this.q.setFromEuler(this.e.set(p.spin, p.spin * 0.7, 0));
      this.mesh.setMatrixAt(i, this.m4.compose(p.pos, this.q, this.s.set(sz, sz, sz)));
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
