import { LOCATIONS } from '../data/locations';
import { REGIONS } from '../world/Terrain';
import { WORLD } from '../config';
import type { Game } from '../Game';

export const EXPLORE_RES = 128; // fog-of-war grid resolution
const REVEAL_RADIUS = 46;

/** Location discovery, region entry and fog-of-war map exploration. */
export class DiscoverySystem {
  explored = new Uint8Array(EXPLORE_RES * EXPLORE_RES);
  private timer = 0;
  private currentRegion = '';
  private regionTimer = 0;

  constructor(private game: Game) {}

  reset() {
    this.explored.fill(0);
    this.currentRegion = '';
  }

  loadExplored(b64: string) {
    this.explored.fill(0);
    if (!b64) return;
    try {
      const bin = atob(b64);
      for (let i = 0; i < this.explored.length; i++) {
        const byte = bin.charCodeAt(i >> 3) || 0;
        this.explored[i] = (byte >> (i & 7)) & 1;
      }
    } catch {
      /* corrupt - ignore */
    }
  }

  serializeExplored(): string {
    const bytes = new Uint8Array(Math.ceil(this.explored.length / 8));
    for (let i = 0; i < this.explored.length; i++) if (this.explored[i]) bytes[i >> 3] |= 1 << (i & 7);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  isExplored(x: number, z: number): boolean {
    const ix = Math.floor(((x + WORLD.size / 2) / WORLD.size) * EXPLORE_RES);
    const iz = Math.floor(((z + WORLD.size / 2) / WORLD.size) * EXPLORE_RES);
    if (ix < 0 || iz < 0 || ix >= EXPLORE_RES || iz >= EXPLORE_RES) return false;
    return this.explored[iz * EXPLORE_RES + ix] === 1;
  }

  private reveal(x: number, z: number) {
    const cell = WORLD.size / EXPLORE_RES;
    const r = Math.ceil(REVEAL_RADIUS / cell);
    const cx = Math.floor((x + WORLD.size / 2) / cell);
    const cz = Math.floor((z + WORLD.size / 2) / cell);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r) continue;
        const ix = cx + dx;
        const iz = cz + dz;
        if (ix < 0 || iz < 0 || ix >= EXPLORE_RES || iz >= EXPLORE_RES) continue;
        this.explored[iz * EXPLORE_RES + ix] = 1;
      }
    }
  }

  regionName(): string {
    if (this.game.inDungeon) return '잊혀진 묘소';
    return REGIONS.find((r) => r.id === this.currentRegion)?.name ?? '';
  }

  update(dt: number) {
    const game = this.game;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.4;
    const p = game.player.body.pos;
    this.reveal(p.x, p.z);
    const st = game.state;
    for (const loc of LOCATIONS) {
      if (st.discovered.includes(loc.id)) continue;
      if ((p.x - loc.x) ** 2 + (p.z - loc.z) ** 2 < loc.discoverRadius ** 2) {
        st.discovered.push(loc.id);
        st.revealed = st.revealed.filter((r) => r !== loc.id);
        if (loc.xp > 0) {
          game.events.emit('banner', { title: loc.name, subtitle: loc.subtitle, kind: 'discover' });
          game.audio.play('discover');
          game.gainXp(loc.xp, '장소 발견');
        }
        game.quests.check();
        game.requestAutosave();
      }
    }
    // Region entry
    const biome = game.terrain.biomeAt(p.x, p.z);
    const region = REGIONS[biome];
    if (region && region.id !== this.currentRegion) {
      this.regionTimer += 0.4;
      if (this.regionTimer > 1.2 || this.currentRegion === '') {
        this.regionTimer = 0;
        this.currentRegion = region.id;
        if (!st.regions.includes(region.id)) {
          st.regions.push(region.id);
          if (st.regions.length > 1 && region.id !== 'ocean') {
            game.events.emit('banner', { title: region.name, subtitle: region.subtitle, kind: 'region' });
            game.gainXp(25, '새로운 지역');
          }
        } else {
          game.events.emit('region', { name: region.name });
        }
        game.bridge.bump();
      }
    } else this.regionTimer = 0;
  }
}
