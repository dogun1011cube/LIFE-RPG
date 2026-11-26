import * as THREE from 'three';

interface FT {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  vy: number;
  life: number;
  max: number;
}

interface Plate {
  el: HTMLDivElement;
  fill: HTMLDivElement;
  name: HTMLDivElement;
  used: boolean;
}

/**
 * DOM overlay for damage numbers and enemy nameplates, positioned every frame by projecting
 * world positions. Kept out of React for performance.
 */
export class FloatingText {
  readonly root: HTMLDivElement;
  private items: FT[] = [];
  private plates: Plate[] = [];
  private tags: { el: HTMLDivElement; used: boolean }[] = [];
  private v = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'float-layer';
    container.appendChild(this.root);
  }

  spawn(pos: THREE.Vector3, text: string, cls: string) {
    if (this.items.length > 50) {
      const old = this.items.shift()!;
      old.el.remove();
    }
    const el = document.createElement('div');
    el.className = `float-text ${cls}`;
    el.textContent = text;
    this.root.appendChild(el);
    const jitter = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
    this.items.push({ el, pos: pos.clone().add(jitter), vy: 1.6, life: 1.1, max: 1.1 });
  }

  /** Begin a frame of nameplates. */
  beginPlates() {
    for (const p of this.plates) p.used = false;
  }

  plate(camera: THREE.Camera, pos: THREE.Vector3, name: string, frac: number, level: number, elite: boolean) {
    this.v.copy(pos).project(camera);
    if (this.v.z > 1 || this.v.z < -1) return;
    let p = this.plates.find((x) => !x.used);
    if (!p) {
      const el = document.createElement('div');
      el.className = 'nameplate';
      const nm = document.createElement('div');
      nm.className = 'np-name';
      const bar = document.createElement('div');
      bar.className = 'np-bar';
      const fill = document.createElement('div');
      fill.className = 'np-fill';
      bar.appendChild(fill);
      el.append(nm, bar);
      this.root.appendChild(el);
      p = { el, fill, name: nm, used: false };
      this.plates.push(p);
    }
    p.used = true;
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    const x = (this.v.x * 0.5 + 0.5) * w;
    const y = (-this.v.y * 0.5 + 0.5) * h;
    p.el.style.display = 'block';
    p.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    const label = `Lv.${level} ${name}`;
    if (p.name.textContent !== label) p.name.textContent = label;
    p.el.classList.toggle('elite', elite);
    p.fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  endPlates() {
    for (const p of this.plates) if (!p.used) p.el.style.display = 'none';
  }

  /** Simple name labels (villagers). Call beginTags/endTags around a frame. */
  beginTags() {
    for (const t of this.tags) t.used = false;
  }

  tag(camera: THREE.Camera, pos: THREE.Vector3, text: string, sub: string) {
    this.v.copy(pos).project(camera);
    if (this.v.z > 1 || this.v.z < -1) return;
    let t = this.tags.find((x) => !x.used);
    if (!t) {
      const el = document.createElement('div');
      el.className = 'vtag';
      this.root.appendChild(el);
      t = { el, used: false };
      this.tags.push(t);
    }
    t.used = true;
    const x = (this.v.x * 0.5 + 0.5) * this.root.clientWidth;
    const y = (-this.v.y * 0.5 + 0.5) * this.root.clientHeight;
    t.el.style.display = 'block';
    t.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    const html = `${text}<small>${sub}</small>`;
    if (t.el.innerHTML !== html) t.el.innerHTML = html;
  }

  endTags() {
    for (const t of this.tags) if (!t.used) t.el.style.display = 'none';
  }

  update(dt: number, camera: THREE.Camera) {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        it.el.remove();
        this.items.splice(i, 1);
        continue;
      }
      it.pos.y += it.vy * dt;
      it.vy *= 1 - dt * 2;
      this.v.copy(it.pos).project(camera);
      if (this.v.z > 1) {
        it.el.style.display = 'none';
        continue;
      }
      it.el.style.display = 'block';
      const x = (this.v.x * 0.5 + 0.5) * w;
      const y = (-this.v.y * 0.5 + 0.5) * h;
      const k = it.life / it.max;
      const scale = k > 0.85 ? 1 + (k - 0.85) * 4 : 1;
      it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(2)})`;
      it.el.style.opacity = String(Math.min(1, k * 2.5));
    }
  }

  clear() {
    for (const it of this.items) it.el.remove();
    this.items = [];
    for (const p of this.plates) p.el.style.display = 'none';
    for (const t of this.tags) t.el.style.display = 'none';
  }
}
