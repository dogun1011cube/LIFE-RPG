import * as THREE from 'three';
import { WORLD } from '../config';
import type { Terrain } from './Terrain';
import type { Environment } from './Environment';

const VERT = /* glsl */ `
varying vec3 vWorld;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D uDepth;
uniform float uWorldSize;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform float uDaylight;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 uv = vWorld.xz / uWorldSize + 0.5;
  float depth = 1.0;
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) depth = texture2D(uDepth, uv).r;
  vec2 p = vWorld.xz;
  float t = uTime;
  vec3 n = normalize(vec3(
    sin(p.x * 0.33 + t * 1.2) * 0.07 + sin(p.x * 0.9 + p.y * 0.6 + t * 2.0) * 0.045 + sin((p.x + p.y) * 1.9 + t * 2.9) * 0.025,
    1.0,
    cos(p.y * 0.29 + t * 1.0) * 0.07 + cos(p.y * 0.8 - p.x * 0.5 + t * 1.6) * 0.045 + cos((p.y - p.x) * 2.1 + t * 3.3) * 0.025));
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
  vec3 base = mix(uShallow, uDeep, smoothstep(0.0, 0.45, depth));
  vec3 col = mix(base, uSkyColor, clamp(fres * 0.7 + 0.08, 0.0, 1.0)) * (0.22 + 0.78 * uDaylight);
  vec3 H = normalize(uSunDir + V);
  col += uSunColor * pow(max(dot(n, H), 0.0), 220.0) * 3.0 * uDaylight;
  float foam = smoothstep(0.07, 0.0, depth) * (0.55 + 0.45 * sin(t * 1.7 + p.x * 0.45 + p.y * 0.35));
  col = mix(col, vec3(0.92, 0.96, 1.0) * (0.35 + 0.65 * uDaylight), foam * 0.6);
  float alpha = mix(0.5, 0.93, smoothstep(0.0, 0.3, depth));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Water {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private t = 0;

  constructor(terrain: Terrain) {
    const N = 256;
    const data = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = ((i + 0.5) / N - 0.5) * WORLD.size;
        const z = ((j + 0.5) / N - 0.5) * WORLD.size;
        const depth = Math.min(1, Math.max(0, (WORLD.waterLevel - terrain.heightAt(x, z)) / 10));
        const k = (j * N + i) * 4;
        data[k] = data[k + 1] = data[k + 2] = Math.round(depth * 255);
        data[k + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uDepth: { value: null },
          uWorldSize: { value: WORLD.size },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uSunColor: { value: new THREE.Color(1, 1, 1) },
          uSkyColor: { value: new THREE.Color(0.6, 0.8, 1) },
          uDeep: { value: new THREE.Color(0x0f3d5a) },
          uShallow: { value: new THREE.Color(0x2f9aa8) },
          uDaylight: { value: 1 },
        },
      ]),
      transparent: true,
      fog: true,
      depthWrite: false,
    });
    this.mat.uniforms.uDepth.value = tex;
    const geo = new THREE.PlaneGeometry(2600, 2600, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = WORLD.waterLevel;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'water';
  }

  update(dt: number, env: Environment) {
    this.t += dt;
    const u = this.mat.uniforms;
    u.uTime.value = this.t;
    (u.uSunDir.value as THREE.Vector3).copy(env.sunDir.y > 0 ? env.sunDir : env.moonDir);
    (u.uSunColor.value as THREE.Color).copy(env.sunDir.y > 0 ? env.sunColor : new THREE.Color(0.5, 0.55, 0.8));
    (u.uSkyColor.value as THREE.Color).copy(env.horizon);
    u.uDaylight.value = Math.max(0.12, env.daylight);
  }
}
