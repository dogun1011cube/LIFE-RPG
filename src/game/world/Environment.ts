import * as THREE from 'three';
import { DAY } from '../config';
import { clamp, smoothstep } from '../core/math';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform float uStars;
uniform float uTime;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(smoothstep(-0.02, 0.65, h), 0.65));
  col = mix(col, uBottom, smoothstep(0.0, -0.3, h));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 5.0) * 0.22 + pow(sd, 48.0) * 0.5);
  col += uSunColor * smoothstep(0.9994, 0.99975, sd) * 4.0;
  float md = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9991, 0.9995, md) * uStars * 1.4;
  col += vec3(0.35, 0.45, 0.8) * pow(md, 24.0) * 0.18 * uStars;
  if (uStars > 0.01 && h > 0.0) {
    vec3 p = floor(d * 300.0);
    float s = hash(p);
    float star = step(0.9972, s) * (0.55 + 0.45 * sin(uTime * 2.0 + s * 140.0));
    col += vec3(star) * uStars * smoothstep(0.02, 0.35, h);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const DAY_TOP = new THREE.Color(0x3474d0);
const DAY_HOR = new THREE.Color(0xa9d1f2);
const DUSK_TOP = new THREE.Color(0x2b3a70);
const DUSK_HOR = new THREE.Color(0xf09358);
const NIGHT_TOP = new THREE.Color(0x02040c);
const NIGHT_HOR = new THREE.Color(0x0c1530);
const SUN_LOW = new THREE.Color(0xffa060);
const SUN_HIGH = new THREE.Color(0xfff2dc);
const MOON = new THREE.Color(0x8ea8ff);
const NIGHT_AMBIENT = new THREE.Color(0x4a5a8c);
const WHITE = new THREE.Color(0xffffff);
const STORM_TOP = new THREE.Color(0x4a5058);
const STORM_HOR = new THREE.Color(0x868c94);
const FLASH = new THREE.Color(0xdde6ff);

/** Day/night cycle, sky dome, sun/moon light, hemisphere light and fog. */
export class Environment {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sky: THREE.Mesh;
  readonly fog: THREE.Fog;
  readonly sunDir = new THREE.Vector3();
  readonly moonDir = new THREE.Vector3();
  readonly horizon = new THREE.Color();
  readonly sunColor = new THREE.Color();
  time = DAY.startTime;
  day = 1;
  daylight = 1; // 0 night .. 1 day
  private skyMat: THREE.ShaderMaterial;
  private elapsed = 0;
  private shadowExtent = 45;
  private viewNear = 80;
  private viewFar = 360;
  /** Underground: no sky, no sun, dark fog, dim ambient. */
  interior = false;
  /** Weather inputs (0..1): cloud cover, extra fog, lightning flash. */
  overcast = 0;
  weatherFog = 0;
  flash = 0;
  private black = new THREE.Color(0x040406);

  constructor(private scene: THREE.Scene) {
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const cam = this.sun.shadow.camera;
    cam.left = -this.shadowExtent;
    cam.right = this.shadowExtent;
    cam.top = this.shadowExtent;
    cam.bottom = -this.shadowExtent;
    cam.near = 1;
    cam.far = 260;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a5a32, 0.9);
    scene.add(this.hemi);

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uBottom: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3() },
        uSunColor: { value: new THREE.Color() },
        uMoonDir: { value: new THREE.Vector3() },
        uStars: { value: 0 },
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    this.fog = new THREE.Fog(0xa9d1f2, 90, 360);
    scene.fog = this.fog;
    this.update(0, new THREE.Vector3(), false);
  }

  setShadows(enabled: boolean, size: number) {
    this.sun.castShadow = enabled;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  setViewDistance(d: number) {
    this.viewFar = d;
    this.viewNear = d * 0.22;
    this.fog.far = this.viewFar;
    this.fog.near = this.viewNear;
  }

  get hours(): number {
    return this.time * 24;
  }

  get isNight(): boolean {
    const h = this.hours;
    return h < 5 || h >= 20;
  }

  /** Skip to the next morning (sleeping). */
  skipToMorning() {
    if (this.time > 0.25) this.day++;
    this.time = 0.26;
  }

  update(dt: number, focus: THREE.Vector3, running: boolean) {
    this.elapsed += dt;
    if (running) {
      const speed = (this.isNight ? 1.9 : 1) / DAY.lengthSec;
      this.time += dt * speed;
      if (this.time >= 1) {
        this.time -= 1;
        this.day++;
      }
    }
    const ang = (this.time - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(ang) * 0.82, Math.sin(ang), 0.42).normalize();
    this.moonDir.copy(this.sunDir).multiplyScalar(-1);
    const e = this.sunDir.y;
    const dayW = smoothstep(-0.02, 0.32, e);
    const nightW = smoothstep(0.02, -0.22, e);
    const duskW = clamp(1 - dayW - nightW, 0, 1);
    this.daylight = clamp(dayW + duskW * 0.5, 0, 1);

    const top = new THREE.Color().setRGB(0, 0, 0);
    top.r = DAY_TOP.r * dayW + DUSK_TOP.r * duskW + NIGHT_TOP.r * nightW;
    top.g = DAY_TOP.g * dayW + DUSK_TOP.g * duskW + NIGHT_TOP.g * nightW;
    top.b = DAY_TOP.b * dayW + DUSK_TOP.b * duskW + NIGHT_TOP.b * nightW;
    const hor = this.horizon;
    hor.r = DAY_HOR.r * dayW + DUSK_HOR.r * duskW + NIGHT_HOR.r * nightW;
    hor.g = DAY_HOR.g * dayW + DUSK_HOR.g * duskW + NIGHT_HOR.g * nightW;
    hor.b = DAY_HOR.b * dayW + DUSK_HOR.b * duskW + NIGHT_HOR.b * nightW;
    // clouds: grey the sky (darker at night)
    const oc = this.overcast;
    if (oc > 0.001) {
      const lum = 0.12 + 0.88 * this.daylight;
      top.lerp(STORM_TOP.clone().multiplyScalar(lum), oc * 0.85);
      hor.lerp(STORM_HOR.clone().multiplyScalar(lum), oc * 0.8);
    }
    if (this.flash > 0) {
      top.lerp(FLASH, this.flash * 0.6);
      hor.lerp(FLASH, this.flash * 0.5);
    }
    this.sunColor.copy(SUN_LOW).lerp(SUN_HIGH, smoothstep(0.0, 0.45, e));

    const u = this.skyMat.uniforms;
    (u.uTop.value as THREE.Color).copy(top);
    (u.uHorizon.value as THREE.Color).copy(hor);
    (u.uBottom.value as THREE.Color).copy(hor).multiplyScalar(0.55);
    (u.uSunDir.value as THREE.Vector3).copy(this.sunDir);
    (u.uMoonDir.value as THREE.Vector3).copy(this.moonDir);
    (u.uSunColor.value as THREE.Color).copy(this.sunColor).multiplyScalar(smoothstep(-0.1, 0.05, e));
    u.uStars.value = nightW * (1 - oc);
    (u.uSunColor.value as THREE.Color).multiplyScalar(1 - oc * 0.9);
    u.uTime.value = this.elapsed;

    // Main directional light: sun by day, moon by night
    const lightDir = e > -0.04 ? this.sunDir : this.moonDir;
    if (e > -0.04) {
      this.sun.color.copy(this.sunColor);
      this.sun.intensity = 2.7 * smoothstep(-0.04, 0.18, e);
    } else {
      this.sun.color.copy(MOON);
      this.sun.intensity = 0.8 * nightW;
    }
    // Snap shadow camera to texel grid to reduce shimmering
    const texel = (this.shadowExtent * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + lightDir.x * 120, focus.y + Math.max(0.15, lightDir.y) * 120, fz + lightDir.z * 120);

    // daytime sky light vs. a readable moonlit blue at night
    this.hemi.color.copy(top).lerp(WHITE, 0.35).lerp(NIGHT_AMBIENT, nightW);
    this.hemi.groundColor.setRGB(0.28, 0.3, 0.2).multiplyScalar(0.55 + 0.45 * dayW);
    this.hemi.intensity = (0.62 + 0.4 * dayW + 0.1 * duskW) * (1 - 0.18 * oc) + this.flash * 1.6;
    this.sun.intensity *= 1 - 0.7 * oc;

    this.fog.color.copy(hor);
    this.scene.background = hor;
    this.sky.visible = !this.interior;
    if (this.interior) {
      this.sun.intensity = 0;
      this.hemi.color.setHex(0x6b7394);
      this.hemi.groundColor.setHex(0x3a332c);
      this.hemi.intensity = 0.95;
      this.fog.color.copy(this.black);
      this.fog.near = 6;
      this.fog.far = 48;
      this.scene.background = this.black;
    } else {
      const wf = this.weatherFog;
      this.fog.far = this.viewFar * (1 - 0.68 * wf);
      this.fog.near = Math.min(this.viewNear, this.fog.far * 0.2) * (1 - 0.7 * wf);
    }
  }
}
