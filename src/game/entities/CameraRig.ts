import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import { WORLD } from '../config';
import type { Terrain } from '../world/Terrain';

/** Third-person orbit camera with terrain/building collision, shoulder offset and screen shake. */
export class CameraRig {
  yaw = Math.PI;
  pitch = 0.32;
  distance = 6.5;
  targetDistance = 6.5;
  private shakeAmt = 0;
  private smoothTarget = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private tmp = new THREE.Vector3();
  private first = true;
  /** Build mode pulls the camera back so placement previews are visible. */
  buildMode = false;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private terrain: Terrain,
  ) {
    this.raycaster.camera = camera;
  }

  shake(amount: number) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  snap() {
    this.first = true;
  }

  /** Forward direction on the ground plane. */
  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  rotate(dx: number, dy: number, sensitivity: number, invertY: boolean) {
    this.yaw -= dx * 0.0025 * sensitivity;
    this.pitch += dy * 0.0022 * sensitivity * (invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -0.55, 1.25);
  }

  zoom(delta: number) {
    this.targetDistance = clamp(this.targetDistance + delta * 0.8, 2.2, 13);
  }

  update(dt: number, focus: THREE.Vector3, obstacles: THREE.Object3D[], shoulder = 0.55) {
    const want = this.buildMode ? Math.max(this.targetDistance, 9) : this.targetDistance;
    this.distance += (want - this.distance) * damp(6, dt);
    const target = this.tmp.set(focus.x, focus.y + 1.55, focus.z);
    // shoulder offset to the right of the view
    const rx = -Math.cos(this.yaw);
    const rz = Math.sin(this.yaw);
    target.x += rx * shoulder;
    target.z += rz * shoulder;
    if (this.first) {
      this.smoothTarget.copy(target);
      this.first = false;
    } else {
      this.smoothTarget.lerp(target, damp(18, dt));
    }
    const t = this.smoothTarget;
    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    let dist = this.distance;
    // building collision
    if (obstacles.length) {
      this.raycaster.set(t, dir);
      this.raycaster.far = dist;
      const hits = this.raycaster.intersectObjects(obstacles, true);
      for (const h of hits) {
        if ((h.object as THREE.Mesh).isMesh && !(h.object as THREE.Mesh).userData.noCamCollide) {
          dist = Math.max(0.8, h.distance - 0.25);
          break;
        }
      }
    }
    // terrain collision (sampled along the ray)
    for (let s = 0.5; s <= dist; s += 0.5) {
      const x = t.x + dir.x * s;
      const z = t.z + dir.z * s;
      const y = t.y + dir.y * s;
      if (y < this.terrain.heightAt(x, z) + 0.35) {
        dist = Math.max(0.8, s - 0.4);
        break;
      }
    }
    const pos = this.camera.position.copy(t).addScaledVector(dir, dist);
    const ground = Math.max(this.terrain.heightAt(pos.x, pos.z), WORLD.waterLevel) + 0.4;
    if (pos.y < ground) pos.y = ground;
    if (this.shakeAmt > 0) {
      const s = this.shakeAmt * 0.25;
      pos.x += (Math.random() - 0.5) * s;
      pos.y += (Math.random() - 0.5) * s;
      pos.z += (Math.random() - 0.5) * s;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    }
    this.camera.lookAt(t);
  }

  /** Slow cinematic orbit used behind the main menu. */
  cinematic(t: number, center: THREE.Vector3) {
    const a = t * 0.05;
    const r = 46;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    const y = Math.max(this.terrain.heightAt(x, z) + 10, center.y + 16);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(center.x, center.y + 4, center.z);
  }
}
