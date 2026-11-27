import * as THREE from 'three';
import { ringTexture } from './textures';
import type { Game } from '../Game';

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog';

export const WEATHER_INFO: Record<WeatherKind, { name: string; icon: string; desc: string }> = {
  clear: { name: '맑음', icon: '☀', desc: '' },
  cloudy: { name: '흐림', icon: '☁', desc: '' },
  rain: { name: '비', icon: '🌧', desc: '농작물이 빨리 자람 · 밖에 있으면 젖음 · 불의 생물이 약해짐' },
  storm: { name: '폭풍우', icon: '⛈', desc: '벼락 주의(실내는 안전) · 배가 느려짐 · 농작물 성장 빠름' },
  fog: { name: '안개', icon: '🌫', desc: '시야가 좁아짐 · 괴물이 늦게 알아챔' },
};

/** Markov transitions between weather kinds. */
const NEXT: Record<WeatherKind, [WeatherKind, number][]> = {
  clear: [['clear', 0.5], ['cloudy', 0.3], ['rain', 0.1], ['fog', 0.1]],
  cloudy: [['clear', 0.3], ['cloudy', 0.2], ['rain', 0.33], ['storm', 0.12], ['fog', 0.05]],
  rain: [['cloudy', 0.4], ['rain', 0.28], ['storm', 0.17], ['clear', 0.15]],
  storm: [['rain', 0.6], ['cloudy', 0.4]],
  fog: [['clear', 0.5], ['cloudy', 0.5]],
};

const TARGET: Record<WeatherKind, { overcast: number; rain: number; fog: number }> = {
  clear: { overcast: 0, rain: 0, fog: 0 },
  cloudy: { overcast: 0.55, rain: 0, fog: 0.1 },
  rain: { overcast: 0.8, rain: 0.7, fog: 0.3 },
  storm: { overcast: 1, rain: 1, fog: 0.4 },
  fog: { overcast: 0.35, rain: 0, fog: 1 },
};

const RAIN_COUNT = 1400;
const RAIN_BOX = { w: 44, h: 26 };

interface Strike {
  x: number;
  z: number;
  y: number;
  t: number;
  ring: THREE.Mesh;
}

/**
 * Weather: clear / cloudy / rain / storm / fog, changing every few in-game hours.
 * Drives the sky and fog (through Environment), rain streaks around the camera, lightning in storms,
 * and gameplay effects (crops, wet, fog stealth, lightning damage, boat speed).
 */
export class WeatherSystem {
  kind: WeatherKind = 'clear';
  /** seconds until the next change */
  timer = 150;
  overcast = 0;
  rain = 0;
  fog = 0;
  flash = 0;
  private rainLines: THREE.LineSegments;
  private rainPos: Float32Array;
  private rainMat: THREE.LineBasicMaterial;
  private strikeTimer = 8;
  private strikes: Strike[] = [];
  private thunder: { t: number; vol: number }[] = [];
  private bolt: THREE.Mesh;
  private boltT = 0;

  constructor(private game: Game) {
    this.rainPos = new Float32Array(RAIN_COUNT * 6);
    for (let i = 0; i < RAIN_COUNT; i++) this.seedDrop(i, Math.random() * RAIN_BOX.h);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0xaab8cc, transparent: true, opacity: 0, depthWrite: false });
    this.rainLines = new THREE.LineSegments(geo, this.rainMat);
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    game.scene.add(this.rainLines);
    this.bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 60, 5, 6, true), new THREE.MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.9, toneMapped: false }));
    this.bolt.visible = false;
    game.scene.add(this.bolt);
  }

  get raining(): boolean {
    return this.kind === 'rain' || this.kind === 'storm';
  }

  /** Crop growth multiplier (rain waters the fields). */
  get growthMult(): number {
    return this.raining ? 1.5 : 1;
  }

  /** Enemy aggro range multiplier (fog hides you). */
  get aggroMult(): number {
    return 1 - this.fog * 0.4;
  }

  /** Boat speed multiplier. */
  get sailMult(): number {
    return this.kind === 'storm' ? 0.75 : 1;
  }

  serialize() {
    return { kind: this.kind, timer: Math.round(this.timer) };
  }

  load(w: { kind?: WeatherKind; timer?: number } | undefined) {
    this.kind = w?.kind && TARGET[w.kind] ? w.kind : 'clear';
    this.timer = w?.timer ?? 150;
    const t = TARGET[this.kind];
    this.overcast = t.overcast;
    this.rain = t.rain;
    this.fog = t.fog;
    for (const s of this.strikes) this.game.scene.remove(s.ring);
    this.strikes = [];
  }

  /** Force a weather (debug / tests). */
  set(kind: WeatherKind, duration = 240) {
    if (kind !== this.kind) this.announce(kind);
    this.kind = kind;
    this.timer = duration;
  }

  private announce(kind: WeatherKind) {
    const info = WEATHER_INFO[kind];
    if (kind === 'clear' || kind === 'cloudy') this.game.events.emit('notify', { text: `날씨: ${info.icon} ${info.name}`, kind: 'info' });
    else this.game.events.emit('notify', { text: `날씨: ${info.icon} ${info.name} — ${info.desc}`, kind: 'info' });
  }

  private pickNext(): WeatherKind {
    const h = this.game.env.hours;
    const opts = NEXT[this.kind].map(([k, w]) => [k, k === 'fog' && h > 4 && h < 9 ? w * 3 : w] as [WeatherKind, number]);
    const total = opts.reduce((a, o) => a + o[1], 0);
    let r = Math.random() * total;
    for (const [k, w] of opts) {
      r -= w;
      if (r <= 0) return k;
    }
    return opts[0][0];
  }

  private seedDrop(i: number, y: number) {
    const k = i * 6;
    const x = (Math.random() - 0.5) * RAIN_BOX.w;
    const z = (Math.random() - 0.5) * RAIN_BOX.w;
    this.rainPos[k] = x;
    this.rainPos[k + 1] = y;
    this.rainPos[k + 2] = z;
    this.rainPos[k + 3] = x + 0.05;
    this.rainPos[k + 4] = y - 0.7;
    this.rainPos[k + 5] = z + 0.05;
  }

  update(dt: number) {
    const game = this.game;
    const indoorsWorld = game.inDungeon;
    this.timer -= dt;
    if (this.timer <= 0) {
      const next = this.pickNext();
      if (next !== this.kind) this.announce(next);
      this.kind = next;
      this.timer = 110 + Math.random() * 140;
    }
    // ease towards the target look
    const t = TARGET[this.kind];
    const k = Math.min(1, dt * 0.25);
    this.overcast += (t.overcast - this.overcast) * k;
    this.rain += (t.rain - this.rain) * k;
    this.fog += (t.fog - this.fog) * k;
    this.flash = Math.max(0, this.flash - dt * 3);
    const env = game.env;
    env.overcast = indoorsWorld ? 0 : this.overcast;
    env.weatherFog = indoorsWorld ? 0 : Math.max(this.fog, this.rain * 0.35);
    env.flash = this.flash;

    // rain streaks follow the camera
    const cam = game.camera.position;
    const show = this.rain > 0.05 && !indoorsWorld;
    this.rainLines.visible = show;
    if (show) {
      this.rainMat.opacity = 0.18 + this.rain * 0.32;
      this.rainLines.position.set(cam.x, cam.y - RAIN_BOX.h * 0.45, cam.z);
      const fall = (18 + this.rain * 8) * dt;
      const wind = (this.kind === 'storm' ? 4 : 1.2) * dt;
      const n = Math.floor(RAIN_COUNT * Math.min(1, this.rain * 1.2));
      const p = this.rainPos;
      for (let i = 0; i < RAIN_COUNT; i++) {
        const j = i * 6;
        if (i >= n) {
          p[j + 1] = p[j + 4] = -999;
          continue;
        }
        p[j + 1] -= fall;
        p[j + 4] -= fall;
        p[j] += wind;
        p[j + 3] += wind;
        if (p[j + 4] < 0 || p[j + 1] < -900) this.seedDrop(i, RAIN_BOX.h);
      }
      (this.rainLines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    game.audio.setRain(indoorsWorld ? 0 : this.rain);

    // lightning
    if (this.kind === 'storm' && !indoorsWorld) {
      this.strikeTimer -= dt;
      if (this.strikeTimer <= 0) {
        this.strikeTimer = 6 + Math.random() * 9;
        this.lightning();
      }
    }
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t -= dt;
      (s.ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.4 * Math.sin(s.t * 20);
      if (s.t <= 0) {
        this.hit(s);
        game.scene.remove(s.ring);
        this.strikes.splice(i, 1);
      }
    }
    for (let i = this.thunder.length - 1; i >= 0; i--) {
      this.thunder[i].t -= dt;
      if (this.thunder[i].t <= 0) {
        game.audio.play('thunder', this.thunder[i].vol);
        this.thunder.splice(i, 1);
      }
    }
    if (this.boltT > 0) {
      this.boltT -= dt;
      this.bolt.visible = this.boltT > 0;
    }
  }

  /** A flash in the sky; sometimes a telegraphed strike near the player. */
  private lightning() {
    const game = this.game;
    this.flash = 1;
    const pp = game.player.body.pos;
    const near = Math.random() < 0.45;
    const a = Math.random() * Math.PI * 2;
    const d = near ? 4 + Math.random() * 14 : 40 + Math.random() * 80;
    const x = pp.x + Math.cos(a) * d;
    const z = pp.z + Math.sin(a) * d;
    if (near && game.terrain.heightAt(x, z) > 0) {
      const y = game.terrain.heightAt(x, z) + 0.08;
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: ringTexture(), color: 0xcfe0ff, transparent: true, depthWrite: false, opacity: 0.8, toneMapped: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, y, z);
      ring.renderOrder = 2;
      game.scene.add(ring);
      this.strikes.push({ x, z, y, t: 1.3, ring });
    } else this.thunder.push({ t: 0.6 + Math.random() * 1.6, vol: 0.5 });
  }

  private hit(s: Strike) {
    const game = this.game;
    this.flash = 1.2;
    this.bolt.position.set(s.x, s.y + 30, s.z);
    this.bolt.visible = true;
    this.boltT = 0.18;
    game.audio.play('thunder', 1);
    game.particles.burst(new THREE.Vector3(s.x, s.y + 0.5, s.z), 0xcfe0ff, 30, 7, 0.12);
    game.cameraRig.shake(0.35);
    const pp = game.player.body.pos;
    const sheltered = game.shelter.indoors;
    if (!sheltered && Math.hypot(pp.x - s.x, pp.z - s.z) < 2.6 && Math.abs(pp.y - s.y) < 3) {
      game.damagePlayer(32, new THREE.Vector3(s.x, s.y, s.z), { knock: 6, unblockable: true });
      game.events.emit('notify', { text: '벼락에 맞았다! 폭풍우 속에서는 지붕 아래로 피하자', kind: 'warn' });
    }
    for (const e of game.enemies.list) {
      if (e.removed || e.state === 'dead') continue;
      if (Math.hypot(e.body.pos.x - s.x, e.body.pos.z - s.z) < 2.6) game.damageEnemyBy(e, 45, new THREE.Vector3(e.body.pos.x - s.x, 0, e.body.pos.z - s.z).normalize());
    }
  }
}
