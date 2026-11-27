import * as THREE from 'three';
import { DAY, SPAWN, WORLD } from './config';
import { Input } from './core/Input';
import { Emitter, type GameEvents } from './core/Events';
import { UIBridge } from './core/Bridge';
import { AudioSys } from './core/Audio';
import { loadSettings, qualityProfile, saveSettings, type QualityProfile, type Settings } from './core/Settings';
import { ITEMS, itemName } from './data/items';
import { RECIPES, RECIPE_BY_ID, type RecipeDef, type StationId, type UnlockRule } from './data/recipes';
import { BUILDABLES, type BuildableDef } from './data/buildables';
import { NODES } from './data/nodes';
import { LOCATIONS, LOCATION_BY_ID } from './data/locations';
import type { AttrId, GameState, PlayerState, Slot } from './state/types';
import { Terrain } from './world/Terrain';
import { Environment } from './world/Environment';
import { Water } from './world/Water';
import { ResourceSystem, type ResourceNode } from './world/Resources';
import { GrassSystem } from './world/Grass';
import { Landmarks, type LandmarkInteractable, type LightSource } from './world/Landmarks';
import { CollisionWorld } from './world/Colliders';
import { Player } from './entities/Player';
import { CameraRig } from './entities/CameraRig';
import { EnemyManager, type Enemy } from './entities/Enemies';
import { ProjectileSystem } from './entities/Projectiles';
import { PickupSystem } from './entities/Pickups';
import { Particles } from './systems/Particles';
import { FloatingText } from './systems/FloatingText';
import { BuildSystem, type PlacedPiece } from './systems/Building';
import { QuestSystem } from './systems/Quests';
import { DiscoverySystem } from './systems/Discovery';
import { Inv } from './systems/Inventory';
import { derivePlayerStats, mitigate, xpToNext, POINTS_PER_LEVEL } from './systems/Stats';
import { readSave, writeSave, listSaves, deleteSave, latestSlot } from './systems/Save';
import { renderMapImage } from './systems/MapRenderer';
import { angleDiff } from './core/math';
import { groundAt } from './entities/physics';
import { SKILLS, SKILL_BY_ID, SKILL_KEYS } from './data/skills';
import { Dungeon, DUNGEON_ORIGIN, type DungeonInteractable } from './world/Dungeon';
import { rank, SKILL_POINTS_PER_LEVEL } from './systems/Stats';
import type { Projectile } from './entities/Projectiles';
import { SettlementSystem, freshSettlement, migrateSettlement } from './systems/Settlement';
import { VillagerManager } from './entities/Villagers';
import { CivSystem } from './systems/Civilization';
import { BRAZIERS, BRAZIER_COST, LAVA_POOLS } from './data/ember';
import { WeatherSystem } from './world/Weather';
import { BoatSystem } from './entities/Boat';
import { TradeShipSystem, freshFaction } from './systems/TradeShip';
import { DefenseSystem } from './systems/Defense';
import { NavGrid } from './systems/NavGrid';
import { setWindowGlow } from './systems/BuildMeshes';

export type Screen = 'loading' | 'menu' | 'playing';
export type PanelId = 'menu' | 'pause' | 'settings' | 'controls' | 'chest' | 'lore' | 'death' | 'saveload' | 'blueprint' | 'villager' | 'ship';
export type MenuTab = 'inventory' | 'skills' | 'crafting' | 'quests' | 'map' | 'village' | 'civ';

export interface Interaction {
  label: string;
  key: string;
  run: () => void;
  kind: 'node' | 'piece' | 'landmark';
}

export interface UIState {
  screen: Screen;
  panel: PanelId | null;
  menuTab: MenuTab;
  chestId: number | null;
  lore: { title: string; text: string } | null;
  prompt: Interaction | null;
  loadingText: string;
  loadingProgress: number;
  fade: number;
  fps: number;
  saveSlot: number;
  villagerId: number | null;
}

const INVENTORY_SIZE = 30;
const LIGHT_POOL = 4;

function freshState(seed: number): GameState {
  const player: PlayerState = {
    name: '방랑자',
    x: SPAWN.x + 2.5,
    y: 10,
    z: SPAWN.z + 6.5,
    yaw: Math.PI,
    hp: 100,
    stamina: 100,
    mana: 40,
    level: 1,
    xp: 0,
    attrPoints: 0,
    attrs: { str: 0, vit: 0, end: 0, agi: 0, skl: 0, int: 0 },
    skillPoints: 0,
    skills: {},
    skillBar: [null, null, null, null],
    inventory: Array.from({ length: INVENTORY_SIZE }, () => null),
    equipment: { weapon: 'wooden_club', armor: null, trinket: null },
    hotbar: ['berry', null, null, null],
    spawn: null,
    buffs: [],
  };
  Inv.add(player.inventory, 'berry', 4);
  return {
    world: { seed, time: DAY.startTime, day: 1 },
    player,
    pieces: [],
    nextPieceId: 1,
    depletedNodes: [],
    discovered: ['spawn_camp'],
    regions: [],
    revealed: [],
    explored: '',
    quests: { active: [], completed: [], tracked: [] },
    knownRecipes: [],
    knownBuildables: [],
    everObtained: ['wooden_club', 'berry'],
    loreRead: [],
    openedChests: [],
    counters: {},
    bossDefeated: 0,
    playTime: 0,
    settlement: freshSettlement(),
    boat: null,
    boatSail: 0,
    faction: freshFaction(),
  };
}

/**
 * The game root: owns the renderer, world, entities and systems, runs the loop and exposes
 * actions for the React UI. All persistent progress lives in `state` (plain JSON).
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly events = new Emitter<GameEvents>();
  readonly bridge = new UIBridge();
  readonly audio = new AudioSys();
  readonly colliders = new CollisionWorld();
  readonly particles = new Particles();
  readonly floatText: FloatingText;
  settings: Settings;
  quality: QualityProfile;
  state: GameState;
  ui: UIState = {
    screen: 'loading',
    panel: null,
    menuTab: 'inventory',
    chestId: null,
    lore: null,
    prompt: null,
    loadingText: '세계를 준비하는 중...',
    loadingProgress: 0,
    fade: 0,
    fps: 0,
    saveSlot: 0,
    villagerId: null,
  };

  terrain!: Terrain;
  env!: Environment;
  water!: Water;
  resources!: ResourceSystem;
  grass!: GrassSystem;
  landmarks!: Landmarks;
  player!: Player;
  cameraRig!: CameraRig;
  enemies!: EnemyManager;
  projectiles!: ProjectileSystem;
  pickups!: PickupSystem;
  building!: BuildSystem;
  quests!: QuestSystem;
  discovery!: DiscoverySystem;
  mapImage: HTMLCanvasElement | null = null;
  dungeon!: Dungeon;
  settlement!: SettlementSystem;
  villagers!: VillagerManager;
  civ!: CivSystem;
  defense!: DefenseSystem;
  nav!: NavGrid;
  weather!: WeatherSystem;
  boats!: BoatSystem;
  ship!: TradeShipSystem;
  private seaWarned = 0;
  private lavaWarned = 0;
  /** Shelter state, updated once per second: under a roof, near a fire, comfort from furniture. */
  shelter = { indoors: false, heat: false, comfort: 0 };
  private shelterTimer = 0;
  private restProgress = 0;
  private upRay = new THREE.Raycaster();
  /** True while the player is inside the crypt interior. */
  inDungeon = false;

  private timer = new THREE.Timer();
  private lights: THREE.PointLight[] = [];
  private running = false;
  private menuTime = 0;
  private hitStop = 0;
  private autosaveTimer = 60;
  private autosaveRequested = -1;
  private bumpTimer = 0;
  private questCheckTimer = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private disposed = false;
  private resizeObs: ResizeObserver;

  constructor(private container: HTMLElement) {
    this.settings = loadSettings();
    this.quality = qualityProfile(this.settings.quality);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1200);
    this.input = new Input(this.renderer.domElement);
    this.input.onUnexpectedUnlock = () => {
      if (this.ui.screen === 'playing' && this.ui.panel === null && !this.player?.dead) this.openPanel('pause');
    };
    this.floatText = new FloatingText(container);
    this.state = freshState(WORLD.defaultSeed);
    this.audio.setVolume(this.settings.volume);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    window.addEventListener('beforeunload', this.onUnload);
    document.addEventListener('visibilitychange', this.onVisibility);
    setTimeout(() => void this.initWorld(WORLD.defaultSeed), 30);
  }

  // ── Setup ───────────────────────────────────────────────
  private async step(text: string, progress: number) {
    this.ui.loadingText = text;
    this.ui.loadingProgress = progress;
    this.bridge.bump();
    await new Promise((r) => setTimeout(r, 16));
  }

  private async initWorld(seed: number) {
    const zones = [...LOCATIONS.map((l) => ({ x: l.x, z: l.z, r: l.flatRadius, h: l.flatHeight })), ...BRAZIERS.map((b) => ({ x: b.x, z: b.z, r: 4 }))];
    await this.step('지형을 생성하는 중...', 0.1);
    this.terrain = new Terrain(seed, zones);
    this.scene.add(this.terrain.mesh);
    await this.step('하늘과 바다를 그리는 중...', 0.35);
    this.env = new Environment(this.scene);
    this.water = new Water(this.terrain);
    this.scene.add(this.water.mesh);
    await this.step('고대 유적을 세우는 중...', 0.45);
    this.landmarks = new Landmarks(this.terrain, this.colliders);
    this.scene.add(this.landmarks.group);
    await this.step('숲을 가꾸는 중...', 0.55);
    const avoid = LOCATIONS.map((l) => ({ x: l.x, z: l.z, r: l.kind === 'camp' ? 10 : l.flatRadius * 0.9 }));
    this.resources = new ResourceSystem(this.terrain, this.colliders, seed, avoid);
    this.scene.add(this.resources.group);
    await this.step('풀을 심는 중...', 0.7);
    this.grass = new GrassSystem(this.terrain);
    this.grass.setQuality(this.quality.grassRadius, this.quality.grassDensity);
    this.scene.add(this.grass.group);
    await this.step('생명을 불어넣는 중...', 0.8);
    this.cameraRig = new CameraRig(this.camera, this.terrain);
    this.cameraRig.targetDistance = this.cameraRig.distance = this.settings.cameraDistance;
    this.player = new Player(this);
    this.scene.add(this.player.model.root);
    this.enemies = new EnemyManager(this);
    this.scene.add(this.enemies.group);
    this.projectiles = new ProjectileSystem(this.terrain, this.colliders);
    this.scene.add(this.projectiles.group);
    this.pickups = new PickupSystem(this.terrain);
    this.scene.add(this.pickups.group);
    this.scene.add(this.particles.mesh);
    this.building = new BuildSystem(this);
    this.scene.add(this.building.group);
    this.grass.blocked = (x, z) => this.building.isFloorAt(x, z);
    this.quests = new QuestSystem(this);
    this.discovery = new DiscoverySystem(this);
    for (let i = 0; i < LIGHT_POOL; i++) {
      const l = new THREE.PointLight(0xff8a3a, 0, 14, 2);
      this.lights.push(l);
      this.scene.add(l);
    }
    this.dungeon = new Dungeon(this.colliders);
    this.scene.add(this.dungeon.group);
    this.settlement = new SettlementSystem(this);
    this.civ = new CivSystem(this);
    this.defense = new DefenseSystem(this);
    this.nav = new NavGrid(this);
    this.villagers = new VillagerManager(this);
    this.weather = new WeatherSystem(this);
    this.boats = new BoatSystem(this);
    this.ship = new TradeShipSystem(this);
    this.scene.add(this.villagers.group);
    await this.step('지도를 그리는 중...', 0.9);
    this.mapImage = renderMapImage(this.terrain, 1024);
    this.applySettings();
    // place the player at the camp for the menu backdrop
    this.state.player.y = this.terrain.heightAt(this.state.player.x, this.state.player.z);
    this.player.reset();
    this.player.model.root.visible = false;
    await this.step('준비 완료', 1);
    // warm up shaders
    this.renderer.compile(this.scene, this.camera);
    this.ui.screen = 'menu';
    this.bridge.bump();
    if (!this.running) {
      this.running = true;
      this.timer.connect(document);
      this.renderer.setAnimationLoop(this.frame);
    }
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  applySettings() {
    this.quality = qualityProfile(this.settings.quality);
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.resize();
    if (this.env) {
      this.env.setShadows(this.quality.shadows, this.quality.shadowSize);
      this.env.setViewDistance(this.quality.viewDistance);
    }
    this.camera.far = this.quality.viewDistance + 300;
    this.camera.updateProjectionMatrix();
    this.grass?.setQuality(this.quality.grassRadius, this.quality.grassDensity);
    this.audio.setVolume(this.settings.volume);
    saveSettings(this.settings);
    this.bridge.bump();
  }

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    this.settings[key] = value;
    this.applySettings();
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.input.dispose();
    this.resizeObs.disconnect();
    window.removeEventListener('beforeunload', this.onUnload);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.floatText.root.remove();
  }

  private onUnload = () => {
    if (this.ui.screen === 'playing' && !this.player.dead) this.saveGame(true);
  };

  private onVisibility = () => {
    if (document.hidden && this.ui.screen === 'playing' && !this.player.dead) this.saveGame(true);
  };

  // ── Game start / save / load ────────────────────────────
  get saves() {
    return listSaves();
  }

  get latestSave() {
    return latestSlot();
  }

  newGame(slot: number) {
    this.audio.init();
    this.state = freshState(WORLD.defaultSeed);
    this.ui.saveSlot = slot;
    this.applyState();
    this.refreshUnlocks(true);
    this.quests.refreshAvailable(true);
    this.startPlaying();
    this.events.emit('banner', { title: '잿불 야영지', subtitle: '바다가 당신을 이 섬에 데려왔다', kind: 'discover' });
    setTimeout(() => this.events.emit('notify', { text: '[WASD] 이동 · [마우스] 시점 · [E] 상호작용', kind: 'info' }), 1500);
    setTimeout(() => this.events.emit('notify', { text: '[Tab] 인벤토리 · [C] 제작 · [B] 건축 · [J] 퀘스트', kind: 'info' }), 4000);
    this.saveGame(true);
  }

  loadGame(slot: number): boolean {
    this.audio.init();
    const file = readSave(slot);
    if (!file) {
      this.events.emit('notify', { text: '저장 파일을 불러올 수 없습니다', kind: 'warn' });
      return false;
    }
    const fresh = freshState(file.state.world.seed);
    // merge onto defaults so older saves missing fields still work
    const sp = file.state.player;
    this.state = {
      ...fresh,
      ...file.state,
      player: {
        ...fresh.player,
        ...sp,
        attrs: { ...fresh.player.attrs, ...sp.attrs },
        equipment: { ...fresh.player.equipment, ...sp.equipment },
        skills: { ...(sp.skills ?? {}) },
        skillBar: sp.skillBar ?? [null, null, null, null],
        // saves from before the skill system get the points they would have earned
        skillPoints: sp.skillPoints ?? Math.max(0, (sp.level ?? 1) - 1) * SKILL_POINTS_PER_LEVEL,
        mana: sp.mana ?? 40,
      },
      quests: { ...fresh.quests, ...file.state.quests },
      settlement: migrateSettlement(file.state.settlement),
      faction: { ...freshFaction(), ...(file.state.faction ?? {}) },
      boat: file.state.boat ?? null,
    };
    if (this.state.player.inventory.length < INVENTORY_SIZE) {
      while (this.state.player.inventory.length < INVENTORY_SIZE) this.state.player.inventory.push(null);
    }
    this.ui.saveSlot = slot;
    this.applyState();
    this.refreshUnlocks(true);
    this.quests.refreshAvailable(true);
    this.startPlaying();
    this.events.emit('notify', { text: `슬롯 ${slot + 1}의 여정을 이어갑니다`, kind: 'info' });
    return true;
  }

  deleteSave(slot: number) {
    deleteSave(slot);
    this.bridge.bump();
  }

  private applyState() {
    const st = this.state;
    if (this.inDungeon) this.setDungeonVisuals(false);
    this.inDungeon = false;
    this.dungeon.reset();
    if (st.world.seed !== this.terrain.seed) console.warn('Save uses a different world seed; loading on the current world.');
    this.env.time = st.world.time;
    this.env.day = st.world.day;
    this.enemies.clear();
    this.pickups.clear();
    this.projectiles.clear();
    this.floatText.clear();
    this.resources.resetAll();
    this.resources.applyDepleted(st.depletedNodes);
    this.building.setActive(false);
    this.building.load(st.pieces);
    this.defense.clear();
    this.weather.load(st.world.weather);
    this.boats.load();
    this.ship.reset();
    this.villagers.sync();
    this.discovery.reset();
    this.discovery.loadExplored(st.explored);
    for (const id of st.openedChests) this.landmarks.markChestOpened(id);
    for (const b of BRAZIERS) this.landmarks.setBrazierLit(b.id, (st.counters[`brazier:${b.id}`] ?? 0) > 0 && !(st.counters['boss:titan'] > 0));
    const p = st.player;
    if (!Number.isFinite(p.y) || p.y < this.terrain.heightAt(p.x, p.z) - 2) p.y = this.terrain.heightAt(p.x, p.z);
    this.player.reset();
    this.player.model.root.visible = true;
    this.cameraRig.yaw = p.yaw;
    this.cameraRig.pitch = 0.3;
    this.cameraRig.snap();
    this.autosaveTimer = 60;
  }

  private startPlaying() {
    this.ui.screen = 'playing';
    this.ui.panel = null;
    this.ui.fade = 1;
    this.input.requestLock();
    this.bridge.bump();
  }

  /** Build the serializable snapshot. */
  snapshot(): GameState {
    const st = this.state;
    st.world.time = this.env.time;
    st.world.day = this.env.day;
    st.world.weather = this.weather.serialize();
    st.pieces = this.building.serialize();
    st.depletedNodes = this.resources.getDepleted();
    st.explored = this.discovery.serializeExplored();
    const snap = JSON.parse(JSON.stringify(st)) as GameState;
    if (this.inDungeon) {
      // never persist an interior position: reloading puts you at the crypt entrance
      const e = this.cryptExterior();
      snap.player.x = e.x;
      snap.player.y = e.y;
      snap.player.z = e.z;
    }
    return snap;
  }

  saveGame(silent = false): boolean {
    if (this.ui.screen !== 'playing') return false;
    const ok = writeSave(this.ui.saveSlot, this.snapshot());
    if (!silent) this.events.emit('notify', { text: ok ? '게임이 저장되었습니다' : '저장에 실패했습니다', kind: ok ? 'info' : 'warn' });
    this.autosaveTimer = 60;
    this.bridge.bump();
    return ok;
  }

  requestAutosave() {
    this.autosaveRequested = 3;
  }

  quitToMenu() {
    if (!this.player.dead) this.saveGame(true);
    this.villagers.clear();
    this.defense.clear();
    this.building.setActive(false);
    this.enemies.clear();
    this.projectiles.clear();
    this.pickups.clear();
    this.floatText.clear();
    this.ui.screen = 'menu';
    this.ui.panel = null;
    this.player.model.root.visible = false;
    this.input.exitLock();
    this.bridge.bump();
  }

  // ── Panels ──────────────────────────────────────────────
  get paused(): boolean {
    return this.ui.screen !== 'playing' || this.ui.panel !== null;
  }

  openPanel(panel: PanelId) {
    if (this.ui.screen !== 'playing') return;
    this.ui.panel = panel;
    if (panel !== 'chest') this.ui.chestId = null;
    this.input.exitLock();
    this.audio.play('click');
    this.bridge.bump();
  }

  openMenu(tab: MenuTab) {
    if (this.ui.screen !== 'playing' || this.player.dead) return;
    if (this.building.active) this.building.setActive(false);
    if (this.ui.panel === 'menu' && this.ui.menuTab === tab) {
      this.closePanel(true);
      return;
    }
    this.ui.menuTab = tab;
    this.openPanel('menu');
  }

  closePanel(relock = true) {
    if (this.ui.panel === 'death') return;
    this.ui.panel = null;
    this.ui.chestId = null;
    this.ui.lore = null;
    if (relock) this.input.requestLock();
    this.audio.play('click');
    this.bridge.bump();
  }

  // ── Main loop ───────────────────────────────────────────
  private frame = (time?: number) => {
    if (this.disposed) return;
    this.timer.update(time);
    const realDt = this.timer.getDelta();
    const dt = Math.min(realDt, 0.05);
    this.fpsAcc += realDt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.ui.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    try {
      this.update(dt);
    } catch (e) {
      console.error(e);
    }
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  };

  /** Advance the simulation (also callable from tests). */
  update(dt: number) {
    if (this.ui.screen === 'loading') return;
    if (this.ui.screen === 'menu') {
      this.menuTime += dt;
      const center = new THREE.Vector3(SPAWN.x, this.terrain.heightAt(SPAWN.x, SPAWN.z), SPAWN.z);
      this.env.update(dt * 6, center, true);
      this.cameraRig.cinematic(this.menuTime, center);
      this.resources.update(dt, this.state.playTime, center, this.quality.viewDistance);
      this.grass.update(center);
      this.water.update(dt, this.env);
      this.landmarks.update(dt);
      this.updateLights(center);
      this.env.sky.position.copy(this.camera.position);
      return;
    }

    this.handleGlobalInput();
    const paused = this.paused;
    let simDt = paused ? 0 : dt;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      simDt *= 0.12;
    }
    const pp = this.player.body.pos;
    const canControl = !paused && !this.player.dead;

    // Camera control
    if (!paused) {
      if (this.input.locked) this.cameraRig.rotate(this.input.mouseDX, this.input.mouseDY, this.settings.mouseSensitivity, this.settings.invertY);
      const kb = 120 * dt;
      if (this.input.isDown('ArrowLeft')) this.cameraRig.rotate(-kb * 4, 0, 1, false);
      if (this.input.isDown('ArrowRight')) this.cameraRig.rotate(kb * 4, 0, 1, false);
      if (this.input.isDown('ArrowUp')) this.cameraRig.rotate(0, -kb * 2, 1, false);
      if (this.input.isDown('ArrowDown')) this.cameraRig.rotate(0, kb * 2, 1, false);
    }

    if (!paused) {
      this.state.playTime += simDt;
      // clicking the canvas re-captures the mouse instead of attacking
      let clickConsumed = false;
      if (!this.input.locked && this.input.wasMousePressed(0)) {
        this.input.requestLock();
        clickConsumed = !this.input.lockUnavailable;
      }
      if (canControl) this.handleGameplayInput(clickConsumed);
      this.boats.update(simDt, canControl && this.ui.panel === null);
      this.player.update(simDt, canControl);
      this.updateInteraction();
      this.enemies.update(simDt);
      this.projectiles.update(
        simDt,
        pp,
        this.player.body.radius,
        (p) => this.damagePlayer(p.damage, p.pos, { knock: 3, slow: p.slow, fire: p.fire }),
        (pos, color) => this.particles.burst(pos, color, 8, 2.5, 0.08, 2),
        (p) => this.playerProjectileHit(p),
      );
      const collected = this.pickups.update(simDt, pp, (p) => !this.player.dead && Inv.space(this.state.player.inventory, p.id) > 0);
      for (const p of collected) {
        const left = Inv.add(this.state.player.inventory, p.id, p.qty);
        const got = p.qty - left;
        if (got > 0) this.afterObtain(p.id, got, 'loot', true);
        if (left > 0) p.qty = left;
        else this.pickups.remove(p);
        this.audio.play('pickup');
      }
      if (this.inDungeon) {
        this.dungeon.update(simDt);
        if (!this.dungeon.keeperSpawned && this.dungeon.inBossChamber(pp) && !this.player.dead) {
          this.dungeon.keeperSpawned = true;
          const k = this.dungeon.keeperSpawn();
          const e = this.enemies.spawn('crypt_keeper', k.x, k.z, k.y);
          e.aggro = true;
          e.setState('chase');
          this.audio.play('boss');
          this.events.emit('banner', { title: e.def.name, subtitle: e.def.bossTitle ?? '', kind: 'boss' });
          this.cameraRig.shake(0.5);
        }
        if (pp.y < DUNGEON_ORIGIN.y - 6) {
          this.player.body.pos.copy(this.dungeon.entryPos);
          this.player.body.vel.set(0, 0, 0);
        }
      } else this.discovery.update(simDt);
      this.building.update(simDt, pp);
      this.updateShelter(simDt);
      this.settlement.update(simDt);
      this.defense.update(simDt);
      this.weather.update(simDt);
      this.ship.update(simDt);
      this.updateHazards(simDt);
      this.villagers.update(simDt);
      setWindowGlow(this.env.isNight ? 1 : 0);
      this.resources.update(simDt, this.state.playTime, pp, this.quality.viewDistance);
      this.env.update(simDt, pp, true);
      this.questCheckTimer -= simDt;
      if (this.questCheckTimer <= 0) {
        this.questCheckTimer = 1;
        this.quests.check();
      }
      this.autosaveTimer -= simDt;
      if (this.autosaveRequested > 0) {
        this.autosaveRequested -= simDt;
        if (this.autosaveRequested <= 0) this.autosaveTimer = 0;
      }
      if (this.autosaveTimer <= 0 && !this.player.dead) this.saveGame(true);
      this.audio.setAmbient(this.env.isNight ? 0.8 : 0.4);
    } else {
      this.env.update(0, pp, false);
      this.building.update(0, pp);
    }

    if (this.player.dead && this.ui.panel !== 'death' && this.player.deadTime > 1.2) {
      this.ui.panel = 'death';
      this.input.exitLock();
      this.bridge.bump();
    }

    this.particles.update(dt);
    this.floatText.update(dt, this.camera);
    const obstacles = this.inDungeon ? [this.dungeon.group] : [this.building.group, this.landmarks.group];
    this.cameraRig.buildMode = this.building.active;
    this.cameraRig.update(dt, pp, obstacles, this.building.active ? 0.9 : 0.55);
    if (!this.inDungeon) this.grass.update(pp);
    this.water.update(dt, this.env);
    this.landmarks.update(dt);
    this.updateLights(pp);
    this.env.sky.position.copy(this.camera.position);
    if (this.ui.fade > 0) this.ui.fade = Math.max(0, this.ui.fade - dt * 0.8);

    this.bumpTimer -= dt;
    if (this.bumpTimer <= 0) {
      this.bumpTimer = 0.1;
      this.bridge.bump();
    }
  }

  private handleGlobalInput() {
    const i = this.input;
    if (i.wasPressed('Escape')) {
      if (this.ui.panel === 'death') return;
      if (this.ui.panel === 'settings' || this.ui.panel === 'controls' || this.ui.panel === 'saveload') this.openPanel('pause');
      else if (this.ui.panel) this.closePanel(false);
      else if (this.building.active) this.building.setActive(false);
      else this.openPanel('pause');
      return;
    }
    if (this.player.dead) return;
    const typingPanel = this.ui.panel === 'pause' || this.ui.panel === 'settings' || this.ui.panel === 'saveload' || this.ui.panel === 'controls';
    if (typingPanel) return;
    if (i.wasPressed('KeyI') || (i.wasPressed('Tab') && !this.building.active)) this.openMenu('inventory');
    else if (i.wasPressed('KeyC')) this.openMenu('crafting');
    else if (i.wasPressed('KeyJ')) this.openMenu('quests');
    else if (i.wasPressed('KeyM')) this.openMenu('map');
    else if (i.wasPressed('KeyK')) this.openMenu('skills');
    else if (i.wasPressed('KeyH')) this.openMenu('village');
    else if (i.wasPressed('KeyL')) this.openMenu('civ');
    else if (i.wasPressed('KeyB') && this.inDungeon) this.events.emit('notify', { text: '묘소 안에서는 건축할 수 없습니다', kind: 'warn' });
    else if (i.wasPressed('KeyB') && this.boats?.onBoard) this.events.emit('notify', { text: '배 위에서는 건축할 수 없습니다', kind: 'warn' });
    else if (i.wasPressed('KeyB') && (this.ui.panel === null || this.ui.panel === 'menu')) {
      if (this.ui.panel) this.closePanel(true);
      this.building.setActive(!this.building.active);
      if (this.building.active) this.events.emit('notify', { text: '건축 모드: [좌클릭] 설치 · [R] 회전 · [휠] 높이 · [X] 철거 · [Tab] 분류', kind: 'info' });
    } else if ((this.ui.panel === 'chest' || this.ui.panel === 'lore' || this.ui.panel === 'villager') && (i.wasPressed('KeyE') || i.wasPressed('Tab'))) this.closePanel(true);
  }

  private handleGameplayInput(clickConsumed: boolean) {
    const i = this.input;
    const b = this.building;
    if (this.boats.onBoard) {
      // sailing: steering is read by the boat; only interaction, hotbar and zoom here
      if (i.wasPressed('KeyE') && this.ui.prompt) this.ui.prompt.run();
      for (let k = 1; k <= 4; k++) if (i.wasPressed(`Digit${k}`)) this.useHotbar(k - 1);
      if (i.wheel !== 0) this.cameraRig.zoom(i.wheel);
      return;
    }
    if (b.active) {
      if (!clickConsumed && i.wasMousePressed(0)) b.tryPlace();
      if (i.wasMousePressed(2) || i.wasPressed('KeyX') || i.wasPressed('Delete')) b.tryRemove();
      if (i.wasMousePressed(1) || i.wasPressed('KeyF')) b.copyHovered();
      if (i.wasPressed('KeyR')) b.rotate();
      if (i.wasPressed('KeyG')) {
        b.gridSnap = !b.gridSnap;
        this.events.emit('notify', { text: `자유 배치 격자: ${b.gridSnap ? '켜짐' : '꺼짐'}`, kind: 'info' });
      }
      if (i.wasPressed('Tab')) b.cycleCategory(1);
      if (i.wheel !== 0) {
        if (i.isDown('ShiftLeft')) b.rotate();
        else b.heightOffset = Math.max(-2.5, Math.min(5, b.heightOffset - i.wheel * 0.25));
      }
      if (i.wasPressed('PageUp')) b.heightOffset = Math.min(5, b.heightOffset + 0.25);
      if (i.wasPressed('PageDown')) b.heightOffset = Math.max(-2.5, b.heightOffset - 0.25);
      if (i.wasPressed('KeyQ')) b.cycleMaterial();
      if (i.wasPressed('KeyZ')) b.moveHovered();
      if (i.wasPressed('KeyP')) {
        if (b.hoverPiece) {
          b.captureTarget = b.hoverPiece.state.id;
          this.openPanel('blueprint');
        } else this.events.emit('notify', { text: '설계도로 저장할 건물을 바라보고 [P]를 누르세요', kind: 'warn' });
      }
      if (b.blueprintMode) {
        for (let k = 1; k <= 9; k++) if (i.wasPressed(`Digit${k}`) && b.blueprints[k - 1]) b.selectBlueprint(b.blueprints[k - 1].id);
      } else {
        const list = b.available(b.category);
        for (let k = 1; k <= 9; k++) if (i.wasPressed(`Digit${k}`) && list[k - 1]) b.select(list[k - 1].id);
        if (i.wasPressed('Digit0') && list[9]) b.select(list[9].id);
      }
      if (i.wasPressed('KeyE') && this.ui.prompt && this.ui.prompt.kind !== 'node') this.ui.prompt.run();
      return;
    }
    if (!clickConsumed && i.wasMousePressed(0)) this.player.startAttack(false);
    if (i.wasMousePressed(2)) this.player.startAttack(true);
    if (i.wasPressed('KeyQ')) this.player.startDodge();
    for (let k = 1; k <= 4; k++) if (i.wasPressed(`Digit${k}`)) this.useHotbar(k - 1);
    for (let k = 0; k < SKILL_KEYS.length; k++) if (i.wasPressed(SKILL_KEYS[k])) this.useSkill(k);
    if (i.wasPressed('KeyE') && this.ui.prompt) this.ui.prompt.run();
    else if (i.isDown('KeyE') && !this.player.busy && this.ui.prompt?.kind === 'node') this.ui.prompt.run();
    if (i.wheel !== 0) this.cameraRig.zoom(i.wheel);
  }

  // ── Interaction ─────────────────────────────────────────
  private updateInteraction() {
    const prev = this.ui.prompt;
    this.ui.prompt = this.player.dead ? null : this.findInteraction();
    if ((prev?.label ?? '') !== (this.ui.prompt?.label ?? '')) this.bridge.bump();
  }

  private findInteraction(): Interaction | null {
    const p = this.player.body.pos;
    const facing = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    const camF = this.cameraRig.forward();
    let best: { score: number; it: Interaction } | null = null;
    const consider = (score: number, it: Interaction) => {
      if (!best || score < best.score) best = { score, it };
    };
    // Building pieces
    const piece = this.building.interactableNear(p, camF);
    if (piece) {
      const d = Math.hypot(piece.state.x - p.x, piece.state.z - p.z);
      consider(d - 0.5, this.pieceInteraction(piece));
    }
    // Dungeon
    if (this.inDungeon) {
      for (const it of this.dungeon.interactables) {
        if (it.kind === 'chest' && this.state.openedChests.includes(it.id)) continue;
        const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
        if (d > it.radius || Math.abs(it.pos.y - p.y) > 3) continue;
        consider(d - 0.6, { label: it.label, key: 'E', kind: 'landmark', run: () => this.dungeonInteract(it) });
      }
      return best ? (best as { score: number; it: Interaction }).it : null;
    }
    // Boat & merchant ship
    if (this.boats.onBoard) {
      return { label: this.boats.landingSpot() ? '배에서 내리기' : '육지 근처에서 내릴 수 있다', key: 'E', kind: 'piece', run: () => this.boats.disembark() };
    }
    if (this.ship.canTrade(p)) consider(0.2, { label: `교역: ${'해풍 상단'}의 배`, key: 'E', kind: 'piece', run: () => this.openPanel('ship') });
    if (this.boats.near(p)) consider(0.3, { label: '배에 타기', key: 'E', kind: 'piece', run: () => this.boats.board() });
    // Villagers
    const vil = this.villagers.nearest(p, 2.4);
    if (vil) {
      const vp = new THREE.Vector3(vil.x, vil.y, vil.z);
      if (vil.down) consider(vp.distanceTo(p) - 0.9, { label: `일으켜 세우기: ${vil.name}`, key: 'E', kind: 'piece', run: () => this.villagers.revive(vil.id) });
      else consider(vp.distanceTo(p) - 0.7, { label: `대화: ${vil.name}`, key: 'E', kind: 'piece', run: () => this.talkTo(vil.id) });
    }
    // Landmarks
    for (const lm of this.landmarks.interactables) {
      if (lm.kind === 'chest' && this.state.openedChests.includes(lm.id)) continue;
      const d = Math.hypot(lm.pos.x - p.x, lm.pos.z - p.z);
      if (d > lm.radius || Math.abs(lm.pos.y - p.y) > 3) continue;
      consider(d - 0.6, { label: lm.label, key: 'E', kind: 'landmark', run: () => this.landmarkInteract(lm) });
    }
    // Resource nodes
    if (!this.building.active) {
      const nodes = this.resources.queryRadius(p.x, p.z, 4.5);
      for (const n of nodes) {
        if (!n.alive) continue;
        const def = NODES[n.type];
        const dx = n.x - p.x;
        const dz = n.z - p.z;
        const d = Math.hypot(dx, dz);
        const reach = def.collider * n.scale + (def.tool === 'hand' ? 2.3 : 1.8);
        if (d > reach) continue;
        const dot = d > 0.01 ? (dx * camF.x + dz * camF.z) / d : 1;
        const dotF = d > 0.01 ? (dx * facing.x + dz * facing.z) / d : 1;
        if (dot < -0.2 && dotF < 0.2) continue;
        const score = d - def.collider * n.scale - Math.max(dot, dotF) * 0.6 + 0.4;
        consider(score, { label: `${def.name} ${def.verb}`, key: 'E', kind: 'node', run: () => this.player.startGather(n) });
      }
    }
    return best ? (best as { score: number; it: Interaction }).it : null;
  }

  private pieceInteraction(piece: PlacedPiece): Interaction {
    const def = piece.def;
    switch (def.interact) {
      case 'door':
        return { label: piece.state.open ? '문 닫기' : '문 열기', key: 'E', kind: 'piece', run: () => this.building.toggleDoor(piece) };
      case 'chest':
        return { label: '보관함 열기', key: 'E', kind: 'piece', run: () => this.openChest(piece.state.id) };
      case 'bed':
        return { label: this.env.isNight ? '잠자기 (아침까지)' : '부활 지점 설정', key: 'E', kind: 'piece', run: () => this.useBed(piece) };
      case 'village':
        return { label: def.id === 'town_hall' ? '마을 관리' : def.id === 'warehouse' ? '창고 열기' : '시장 열기', key: 'E', kind: 'piece', run: () => this.openMenu('village') };
      case 'civ':
        return { label: '연구소 (문명)', key: 'E', kind: 'piece', run: () => this.openMenu('civ') };
      case 'farm': {
        const g = piece.state.growth ?? 0;
        return { label: g >= 1 ? '밀 수확' : `밭 살펴보기 (${Math.floor(g * 100)}%)`, key: 'E', kind: 'piece', run: () => this.settlement.harvestPlot(piece) };
      }
      default:
        return { label: `${def.name} 사용`, key: 'E', kind: 'piece', run: () => this.openMenu('crafting') };
    }
  }

  private landmarkInteract(lm: LandmarkInteractable) {
    const st = this.state;
    const loc = LOCATION_BY_ID[lm.locationId];
    if (lm.kind === 'lore') {
      this.ui.lore = loc.lore;
      this.openPanel('lore');
      if (!st.loreRead.includes(loc.id)) {
        st.loreRead.push(loc.id);
        this.gainXp(20, '고대의 기록');
        if (loc.reveals && !st.discovered.includes(loc.reveals) && !st.revealed.includes(loc.reveals)) {
          st.revealed.push(loc.reveals);
          this.events.emit('notify', { text: `지도에 표시됨: ${LOCATION_BY_ID[loc.reveals].name}`, kind: 'quest' });
        }
        this.refreshUnlocks();
        this.requestAutosave();
      }
    } else if (lm.kind === 'chest') {
      if (st.openedChests.includes(lm.id) || !loc.chest) return;
      st.openedChests.push(lm.id);
      this.landmarks.markChestOpened(lm.id);
      this.audio.play('discover');
      for (const it of loc.chest.items) this.giveItem(it.item, it.qty, 'loot');
      this.particles.rise(lm.pos, 0xffd27a, 24, 0.8);
      this.gainXp(30, '보물 발견');
      this.requestAutosave();
    } else if (lm.kind === 'altar') {
      if (this.enemies.boss) {
        this.events.emit('notify', { text: '수호자가 이미 깨어나 있다!', kind: 'warn' });
        return;
      }
      if (Inv.remove(st.player.inventory, 'ancient_sigil', 1)) {
        this.particles.rise(lm.pos, 0x5fe0f0, 40, 1.5);
        this.enemies.summonBoss();
        this.bridge.bump();
      } else {
        this.audio.play('deny');
        this.events.emit('notify', { text: '제단이 고대 인장을 원한다. (작업대에서 제작)', kind: 'warn' });
      }
    } else if (lm.kind === 'brazier') {
      const i = Number(lm.id.split('_')[1]);
      if ((st.counters[`brazier:${i}`] ?? 0) > 0) return;
      if (!Inv.remove(st.player.inventory, 'charcoal', BRAZIER_COST)) {
        this.audio.play('deny');
        this.events.emit('notify', { text: `숯 ${BRAZIER_COST}개가 필요합니다 (그을린 나무를 베면 얻는다)`, kind: 'warn' });
        return;
      }
      st.counters[`brazier:${i}`] = 1;
      this.landmarks.setBrazierLit(i, true);
      this.audio.play('discover');
      this.particles.burst(lm.pos.clone().setY(lm.pos.y + 1), 0xff6a2a, 24, 4, 0.12);
      const lit = this.landmarks.braziersLit();
      this.events.emit('notify', { text: lit >= 3 ? '세 화로가 모두 타오른다. 분화구의 봉인이 깨어났다!' : `흑요석 화로 ${lit}/3`, kind: lit >= 3 ? 'quest' : 'info' });
      if (lit >= 3) this.cameraRig.shake(0.5);
      this.quests.check();
      this.requestAutosave();
    } else if (lm.kind === 'seal') {
      if (this.enemies.boss) {
        this.events.emit('notify', { text: '용암 거신이 이미 깨어나 있다!', kind: 'warn' });
        return;
      }
      if (this.landmarks.braziersLit() < 3) {
        this.ui.lore = loc.lore;
        this.openPanel('lore');
        this.events.emit('notify', { text: `봉인이 잠잠하다. 산비탈의 흑요석 화로 ${this.landmarks.braziersLit()}/3`, kind: 'info' });
        return;
      }
      this.particles.rise(lm.pos, 0xff6a2a, 50, 2);
      this.enemies.summonTitan();
      this.bridge.bump();
    } else if (lm.kind === 'dungeon') {
      this.enterDungeon();
    } else if (lm.kind === 'station') {
      this.openMenu('crafting');
    }
  }

  private useBed(piece: PlacedPiece) {
    const p = this.state.player;
    p.spawn = { x: piece.state.x + 1.2, y: piece.state.y, z: piece.state.z };
    if (this.env.isNight) {
      const threatened = this.enemies.list.some((e) => e.aggro && e.state !== 'dead');
      if (threatened) {
        this.events.emit('notify', { text: '근처에 적이 있어 잠들 수 없습니다', kind: 'warn' });
        return;
      }
      this.ui.fade = 1.6;
      this.env.skipToMorning();
      const st = derivePlayerStats(p);
      p.hp = st.maxHp;
      p.stamina = st.maxStamina;
      this.events.emit('banner', { title: `${this.env.day}일차 아침`, subtitle: '푹 자고 나니 기운이 넘친다', kind: 'info' });
      this.saveGame(true);
    } else {
      this.events.emit('notify', { text: '부활 지점이 설정되었습니다', kind: 'info' });
      this.requestAutosave();
    }
    this.audio.play('click');
  }

  // ── Items ───────────────────────────────────────────────
  private afterObtain(id: string, qty: number, source: string, notify: boolean) {
    const st = this.state;
    if (source === 'gather' || source === 'loot' || source === 'reward') st.counters[`obtain:${id}`] = (st.counters[`obtain:${id}`] ?? 0) + qty;
    if (!st.everObtained.includes(id)) {
      st.everObtained.push(id);
      this.refreshUnlocks();
    }
    const def = ITEMS[id];
    if (def?.category === 'consumable' && !st.player.hotbar.includes(id)) {
      const empty = st.player.hotbar.indexOf(null);
      if (empty >= 0) st.player.hotbar[empty] = id;
    }
    if (notify) this.events.emit('notify', { text: itemName(id), kind: 'item', icon: id, qty });
    this.quests?.check();
    this.bridge.bump();
  }

  /** Add items to the player's bag; overflow drops on the ground. */
  giveItem(id: string, qty: number, source: 'gather' | 'loot' | 'reward' | 'craft' | 'refund' | 'transfer', notify = true): number {
    if (qty <= 0) return 0;
    const left = Inv.add(this.state.player.inventory, id, qty);
    const got = qty - left;
    if (got > 0) this.afterObtain(id, got, source, notify);
    if (left > 0) {
      const p = this.player.body.pos;
      this.pickups.spawn(id, left, new THREE.Vector3(p.x, p.y + 1.2, p.z));
      this.pickups.list[this.pickups.list.length - 1].age = -2.5;
      this.events.emit('notify', { text: '인벤토리가 가득 찼습니다', kind: 'warn' });
    }
    return got;
  }

  consumeItem(id: string) {
    const st = this.state;
    const def = ITEMS[id];
    if (!def?.use) return;
    if (def.use.launchBoat) {
      this.boats.launch();
      return;
    }
    if (def.use.upgradeSail) {
      if (st.boatSail) {
        this.events.emit('notify', { text: '이미 고급 돛을 달았습니다', kind: 'warn' });
        return;
      }
      if (!Inv.remove(st.player.inventory, id, 1)) return;
      st.boatSail = 1;
      this.events.emit('notify', { text: '배에 고급 돛을 달았다! 배 속도 +35%', kind: 'unlock' });
      this.audio.play('craft');
      this.bridge.bump();
      return;
    }
    if (!Inv.remove(st.player.inventory, id, 1)) return;
    const p = st.player;
    const stats = derivePlayerStats(p);
    const head = this.player.body.pos.clone().setY(this.player.body.pos.y + 2);
    if (def.use.heal) {
      const heal = Math.round(def.use.heal * stats.healMult);
      p.hp = Math.min(stats.maxHp, p.hp + heal);
      this.floatText.spawn(head, `+${heal}`, 'heal');
    }
    if (def.use.mana) {
      p.mana = Math.min(stats.maxMana, (p.mana ?? 0) + def.use.mana);
      this.floatText.spawn(head, `+${def.use.mana} 마나`, 'mana');
    }
    if (def.use.resetSkills) this.resetSkills();
    if (def.use.hot) {
      p.buffs = p.buffs.filter((b) => b.id !== 'hot');
      p.buffs.push({ id: 'hot', time: def.use.hot.duration, amount: (def.use.hot.amount * stats.healMult) / def.use.hot.duration });
      this.floatText.spawn(head, '치유 중', 'heal');
    }
    if (def.use.buff) {
      p.buffs = p.buffs.filter((b) => b.id !== def.use!.buff);
      p.buffs.push({ id: def.use.buff, time: 150 });
    }
    st.counters.eat = (st.counters.eat ?? 0) + 1;
    this.audio.play('eat');
    this.particles.rise(this.player.body.pos, 0x7cff8a, 10, 0.5);
    this.bridge.bump();
  }

  useHotbar(index: number) {
    const id = this.state.player.hotbar[index];
    if (!id) return;
    if (Inv.count(this.state.player.inventory, id) <= 0) {
      this.events.emit('notify', { text: `${itemName(id)}이(가) 없습니다`, kind: 'warn' });
      return;
    }
    const p = this.state.player;
    const stats = derivePlayerStats(p);
    if (ITEMS[id]?.use?.heal && !ITEMS[id]?.use?.buff && p.hp >= stats.maxHp) {
      this.events.emit('notify', { text: '체력이 가득 찼습니다', kind: 'warn' });
      return;
    }
    this.player.useItem(id);
  }

  useSlot(index: number) {
    const s = this.state.player.inventory[index];
    if (!s) return;
    const def = ITEMS[s.id];
    if (def.category === 'weapon' || def.category === 'armor' || def.category === 'accessory') this.equipFromSlot(index);
    else if (def.use) {
      this.consumeItem(s.id);
    } else if (s.id === 'settlement_charter') {
      this.ui.lore = { title: '정착 헌장', text: '"이 땅에 처음 불을 지핀 자에게, 정착지를 세우고 이웃을 맞이할 권리를 부여한다."\n\n당신은 폐허의 수호자를 쓰러뜨리고 섬의 주인으로 인정받았다. 머지않아 바다 건너에서 정착민들이 찾아올 것이다.\n\n(다음 개발 단계에서 주민, 직업, 마을 관리 시스템이 이 헌장과 함께 열립니다.)' };
      this.openPanel('lore');
    }
  }

  equipFromSlot(index: number) {
    const st = this.state.player;
    const s = st.inventory[index];
    if (!s) return;
    const def = ITEMS[s.id];
    const kind = def.category === 'weapon' ? 'weapon' : def.category === 'armor' ? 'armor' : def.category === 'accessory' ? 'trinket' : null;
    if (!kind) return;
    const prev = st.equipment[kind];
    st.equipment[kind] = s.id;
    st.inventory[index] = prev ? { id: prev, qty: 1 } : null;
    this.player.refreshEquipment();
    this.audio.play('craft');
    this.events.emit('notify', { text: `장착: ${def.name}`, kind: 'info' });
    this.bridge.bump();
  }

  unequip(kind: 'weapon' | 'armor' | 'trinket') {
    const st = this.state.player;
    const id = st.equipment[kind];
    if (!id) return;
    if (Inv.space(st.inventory, id) <= 0) {
      this.events.emit('notify', { text: '인벤토리가 가득 찼습니다', kind: 'warn' });
      return;
    }
    Inv.add(st.inventory, id, 1);
    st.equipment[kind] = null;
    this.player.refreshEquipment();
    this.bridge.bump();
  }

  dropSlot(index: number, all = true) {
    const st = this.state.player;
    const s = st.inventory[index];
    if (!s) return;
    const qty = all ? s.qty : 1;
    s.qty -= qty;
    if (s.qty <= 0) st.inventory[index] = null;
    const p = this.player.body.pos;
    const f = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    this.pickups.spawn(s.id, qty, new THREE.Vector3(p.x + f.x, p.y + 1.2, p.z + f.z));
    this.pickups.list[this.pickups.list.length - 1].age = -2.5;
    this.bridge.bump();
  }

  moveSlot(a: number, b: number) {
    Inv.moveSlot(this.state.player.inventory, a, this.state.player.inventory, b);
    this.bridge.bump();
  }

  sortInventory() {
    Inv.sort(this.state.player.inventory);
    this.audio.play('click');
    this.bridge.bump();
  }

  assignHotbar(slot: number, id: string | null) {
    const hb = this.state.player.hotbar;
    if (id) for (let i = 0; i < hb.length; i++) if (hb[i] === id) hb[i] = null;
    hb[slot] = id;
    this.bridge.bump();
  }

  // ── Chest ───────────────────────────────────────────────
  openChest(id: number) {
    this.ui.chestId = id;
    this.openPanel('chest');
  }

  chestTransfer(fromChest: boolean, index: number) {
    const piece = this.ui.chestId !== null ? this.building.getPiece(this.ui.chestId) : undefined;
    if (!piece?.state.storage) return;
    const inv = this.state.player.inventory;
    const chest = piece.state.storage;
    if (fromChest) Inv.transferStack(chest, index, inv);
    else Inv.transferStack(inv, index, chest);
    this.audio.play('click');
    this.bridge.bump();
  }

  chestTransferAll(fromChest: boolean) {
    const piece = this.ui.chestId !== null ? this.building.getPiece(this.ui.chestId) : undefined;
    if (!piece?.state.storage) return;
    const from = fromChest ? piece.state.storage : this.state.player.inventory;
    const to = fromChest ? this.state.player.inventory : piece.state.storage;
    for (let i = 0; i < from.length; i++) {
      const s = from[i];
      if (!s) continue;
      if (!fromChest && (ITEMS[s.id]?.category === 'weapon' || ITEMS[s.id]?.category === 'tool')) continue;
      Inv.transferStack(from, i, to);
    }
    this.audio.play('click');
    this.bridge.bump();
  }

  // ── Unlocks & crafting ──────────────────────────────────
  private ruleOk(r: UnlockRule): boolean {
    const st = this.state;
    switch (r.type) {
      case 'start':
        return true;
      case 'item':
        return st.everObtained.includes(r.item);
      case 'level':
        return st.player.level >= r.level;
      case 'quest':
        return st.quests.completed.includes(r.quest);
      case 'lore':
        return st.loreRead.includes(r.id);
      case 'settlement':
        return st.settlement.founded && st.settlement.tier >= r.level;
      case 'tech':
        return st.settlement.research.done.includes(r.tech);
    }
  }

  refreshUnlocks(silent = false) {
    const st = this.state;
    for (const r of RECIPES) {
      if (st.knownRecipes.includes(r.id)) continue;
      if (r.unlock.every((u) => this.ruleOk(u))) {
        st.knownRecipes.push(r.id);
        if (!silent) this.events.emit('notify', { text: `새 제작법: ${itemName(r.output)}`, kind: 'unlock', icon: r.output });
      }
    }
    for (const b of BUILDABLES) {
      if (st.knownBuildables.includes(b.id)) continue;
      if (b.unlock.every((u) => this.ruleOk(u))) {
        st.knownBuildables.push(b.id);
        if (!silent) this.events.emit('notify', { text: `새 건축물: ${b.name}`, kind: 'unlock' });
      }
    }
  }

  stationsNear(): Set<StationId> {
    const p = this.player.body.pos;
    const set = this.building.stationsNear(p, 4.5);
    for (const lm of this.landmarks.interactables) {
      if (lm.kind === 'station' && lm.pos.distanceTo(p) < 4.5) set.add('campfire');
    }
    return set;
  }

  canCraft(r: RecipeDef, near = this.stationsNear()): { ok: boolean; reason: string; max: number } {
    const inv = this.state.player.inventory;
    if (!this.state.knownRecipes.includes(r.id)) return { ok: false, reason: '모르는 제작법', max: 0 };
    if (r.station && !near.has(r.station)) return { ok: false, reason: '제작 시설이 근처에 없습니다', max: 0 };
    const max = Inv.maxCrafts(inv, r.inputs);
    if (max <= 0) return { ok: false, reason: '재료가 부족합니다', max: 0 };
    return { ok: true, reason: '', max };
  }

  craft(recipeId: string, times = 1): number {
    const r = RECIPE_BY_ID[recipeId];
    if (!r) return 0;
    const near = this.stationsNear();
    let made = 0;
    for (let i = 0; i < times; i++) {
      const c = this.canCraft(r, near);
      if (!c.ok) {
        if (made === 0) {
          this.audio.play('deny');
          this.events.emit('notify', { text: c.reason, kind: 'warn' });
        }
        break;
      }
      const inv = this.state.player.inventory;
      const snapshot = inv.map((s) => (s ? { ...s } : null));
      Inv.removeAll(inv, r.inputs);
      if (Inv.space(inv, r.output) < r.qty) {
        // roll back
        for (let k = 0; k < inv.length; k++) inv[k] = snapshot[k];
        if (made === 0) this.events.emit('notify', { text: '인벤토리 공간이 부족합니다', kind: 'warn' });
        break;
      }
      this.giveItem(r.output, r.qty, 'craft', false);
      this.state.counters[`craft:${r.output}`] = (this.state.counters[`craft:${r.output}`] ?? 0) + r.qty;
      made++;
    }
    if (made > 0) {
      this.audio.play('craft');
      this.events.emit('notify', { text: `제작 완료: ${itemName(r.output)}${made * r.qty > 1 ? ` ×${made * r.qty}` : ''}`, kind: 'item', icon: r.output, qty: made * r.qty });
      this.gainXp(r.xp * made, '제작');
      this.particles.rise(this.player.body.pos, 0xffd27a, 8, 0.6);
      this.quests.check();
      this.requestAutosave();
    }
    this.bridge.bump();
    return made;
  }

  // ── Progression ─────────────────────────────────────────
  gainXp(amount: number, _reason = '') {
    if (amount <= 0) return;
    const p = this.state.player;
    if (p.buffs.some((b) => b.id === 'rested')) amount *= 1.1;
    p.xp += Math.round(amount);
    this.floatText.spawn(this.player.body.pos.clone().setY(this.player.body.pos.y + 2.3), `+${Math.round(amount)} XP`, 'xp');
    let leveled = false;
    while (p.xp >= xpToNext(p.level)) {
      p.xp -= xpToNext(p.level);
      p.level++;
      p.attrPoints += POINTS_PER_LEVEL;
      p.skillPoints += SKILL_POINTS_PER_LEVEL;
      leveled = true;
    }
    if (leveled) {
      const st = derivePlayerStats(p);
      p.hp = st.maxHp;
      p.stamina = st.maxStamina;
      this.audio.play('levelup');
      this.events.emit('banner', { title: `레벨 ${p.level}`, subtitle: `능력치 포인트 +${POINTS_PER_LEVEL} · [Tab] 인벤토리에서 분배`, kind: 'level' });
      this.particles.rise(this.player.body.pos, 0xffd27a, 40, 1.2);
      this.refreshUnlocks();
      this.quests.check();
      this.requestAutosave();
    }
    this.bridge.bump();
  }

  allocateAttr(id: AttrId) {
    const p = this.state.player;
    if (p.attrPoints <= 0) return;
    p.attrPoints--;
    p.attrs[id]++;
    this.player.refreshEquipment();
    this.audio.play('click');
    this.bridge.bump();
  }

  // ── Combat ──────────────────────────────────────────────
  playerAttack(range: number, arcDeg: number, mult: number, heavy: boolean) {
    const pl = this.player;
    const pp = pl.body.pos;
    const stats = pl.stats;
    let hits = 0;
    for (const e of this.enemies.list) {
      if (e.state === 'dead' || e.removed) continue;
      const dx = e.body.pos.x - pp.x;
      const dz = e.body.pos.z - pp.z;
      const d = Math.hypot(dx, dz) - e.def.radius;
      if (d > range) continue;
      const dy = e.body.pos.y - pp.y;
      if (dy < -2 || dy > (e.def.flying ? 3.5 : 2.5)) continue;
      const ang = Math.abs(angleDiff(pl.yaw, Math.atan2(dx, dz)));
      if (d > 0.6 && ang > ((arcDeg / 2) * Math.PI) / 180) continue;
      const riposte = this.state.player.buffs.some((b) => b.id === 'riposte');
      const crit = riposte || Math.random() < stats.critChance;
      let dmg = stats.attack * mult * (0.9 + Math.random() * 0.2);
      if (crit) dmg *= stats.critMult;
      if (riposte) dmg *= stats.riposteMult;
      const final = Math.round(mitigate(dmg, e.def.defense));
      e.hp -= final;
      hits++;
      const at = e.body.pos.clone();
      at.y += e.def.height * 0.7 + (e.def.flying ? 1 : 0);
      this.floatText.spawn(at, String(final), crit ? 'crit' : 'dmg');
      this.particles.burst(at, crit ? 0xffd27a : 0xffffff, crit ? 14 : 8, 4, 0.07, 6, 0.4);
      this.audio.play(crit ? 'crit' : 'hit');
      const knock = new THREE.Vector3(dx, 0, dz).normalize();
      this.enemies.onDamaged(e, final, knock, heavy);
      if (e.hp <= 0) this.onEnemyKilled(e);
    }
    if (hits > 0) {
      this.hitStop = heavy ? 0.09 : 0.05;
      this.cameraRig.shake(heavy ? 0.35 : 0.15);
      const p = this.state.player;
      if (p.buffs.some((b) => b.id === 'riposte')) p.buffs = p.buffs.filter((b) => b.id !== 'riposte');
    }
    // the cracked wall in the crypt can be smashed open
    if (this.inDungeon && !this.dungeon.wallBroken) {
      const w = this.dungeon.crackWallPos();
      const dx = w.x - pp.x;
      const dz = w.z - pp.z;
      const d = Math.hypot(dx, dz);
      if (d < range + 0.6 && Math.abs(angleDiff(pl.yaw, Math.atan2(dx, dz))) < 1.2) {
        this.audio.play('mine');
        this.particles.burst(w, 0x9a8a80, 12, 3, 0.12);
        if (this.dungeon.hitCrackWall(heavy)) {
          this.particles.burst(w, 0x8a7a70, 40, 6, 0.2);
          this.audio.play('slam');
          this.cameraRig.shake(0.4);
          this.events.emit('banner', { title: '숨겨진 통로', subtitle: '무너진 벽 너머에 방이 있다', kind: 'discover' });
          this.gainXp(40, '숨겨진 방');
        }
      }
    }
  }

  private onEnemyKilled(e: Enemy, xpMult = 1) {
    const st = this.state;
    const def = e.def;
    st.counters[`kill:${def.id}`] = (st.counters[`kill:${def.id}`] ?? 0) + 1;
    if (e.raid) st.counters['kill:raider'] = (st.counters['kill:raider'] ?? 0) + 1;
    this.audio.play('death');
    const pos = e.body.pos.clone();
    pos.y += 0.8 + (def.flying ? 1 : 0);
    this.particles.burst(pos, def.model === 'slime' ? 0x5fd36a : def.model === 'wisp' ? 0x9a6aff : 0x9a8f80, 22, 5, 0.12);
    for (const d of def.drops) {
      if (Math.random() > d.chance) continue;
      const qty = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
      if (qty > 0) this.pickups.spawn(d.item, qty, pos);
    }
    this.gainXp(Math.round(def.xp * xpMult), def.name);
    if (def.id === 'warden') {
      st.bossDefeated++;
      this.events.emit('banner', { title: '수호자를 쓰러뜨렸다!', subtitle: '섬이 당신을 주인으로 인정했다', kind: 'boss' });
      this.particles.rise(pos, 0x5fe0f0, 80, 3);
      this.requestAutosave();
    } else if (def.id === 'lava_titan') {
      st.counters['boss:titan'] = (st.counters['boss:titan'] ?? 0) + 1;
      this.events.emit('banner', { title: '용암 거신을 쓰러뜨렸다!', subtitle: '불의 산이 잠잠해졌다 · 용암 핵을 얻었다', kind: 'boss' });
      this.particles.rise(pos, 0xff6a2a, 90, 3);
      // the braziers burn out; they can be lit again to face the titan once more
      for (const b of BRAZIERS) {
        st.counters[`brazier:${b.id}`] = 0;
        this.landmarks.setBrazierLit(b.id, false);
      }
      this.requestAutosave();
    } else if (def.id === 'crypt_keeper') {
      this.dungeon.keeperDefeated = true;
      this.events.emit('banner', { title: '묘지기를 쓰러뜨렸다!', subtitle: '왕의 보물함의 봉인이 풀렸다', kind: 'boss' });
      this.particles.rise(pos, 0xb06aff, 70, 2.5);
      for (const o of this.enemies.list) if (o.def.id === 'skeleton' && o.state !== 'dead') o.hp = 0, this.enemies.onDamaged(o, 999, new THREE.Vector3(), true);
      this.requestAutosave();
    }
    this.quests.check();
  }

  damagePlayer(amount: number, from: THREE.Vector3, opts: { knock?: number; slow?: boolean; source?: Enemy; unblockable?: boolean; fire?: boolean } = {}): boolean {
    const pl = this.player;
    if (pl.dead) return false;
    // fire resistance (불씨 열매) halves fire damage; rain dampens fire creatures
    if (opts.fire || opts.source?.def.fire) {
      if (this.state.player.buffs.some((b) => b.id === 'fire_ward')) amount *= 0.5;
      if (this.weather?.raining) amount *= 0.8;
    }
    const head = pl.body.pos.clone().setY(pl.body.pos.y + 2);
    if (pl.iframes > 0) {
      this.floatText.spawn(head, '회피!', 'dodge');
      return false;
    }
    const p = this.state.player;
    // Blocking: attacks from the front are parried (early) or reduced (late). Ground slams cannot be blocked.
    if (pl.blocking && !opts.unblockable) {
      const facing = Math.abs(angleDiff(pl.yaw, Math.atan2(from.x - pl.body.pos.x, from.z - pl.body.pos.z)));
      if (facing < 1.35) {
        if (pl.blockTime <= pl.stats.parryWindow) {
          this.floatText.spawn(head, '패링!', 'crit');
          this.audio.play('crit');
          this.particles.burst(head.clone().setY(head.y - 0.6), 0xffe9a0, 18, 5, 0.08, 4, 0.4);
          this.hitStop = 0.12;
          this.cameraRig.shake(0.2);
          if (opts.source) this.enemies.onParried(opts.source);
          p.buffs = p.buffs.filter((b) => b.id !== 'riposte');
          p.buffs.push({ id: 'riposte', time: 2.5 });
          p.stamina = Math.min(pl.stats.maxStamina, p.stamina + 10);
          this.state.counters.parry = (this.state.counters.parry ?? 0) + 1;
          this.quests.check();
          this.bridge.bump();
          return true;
        }
        const cost = amount * 1.1;
        if (p.stamina >= cost * 0.5) {
          p.stamina = Math.max(0, p.stamina - cost);
          amount *= 0.25;
          this.audio.play('mine', 0.6);
          this.particles.burst(head.clone().setY(head.y - 0.6), 0xdddddd, 6, 3, 0.06, 4, 0.3);
          opts = { ...opts, knock: (opts.knock ?? 0) * 0.4, slow: false };
          if (p.stamina <= 0) this.floatText.spawn(head, '가드 브레이크', 'hurt');
        } else {
          pl.action = 'none';
          this.floatText.spawn(head, '가드 브레이크', 'hurt');
        }
      }
    }
    let dmg = Math.round(mitigate(amount, pl.stats.defense));
    if (dmg >= p.hp && rank(p, 's_second') > 0 && pl.secondWindCd <= 0) {
      dmg = Math.max(0, Math.floor(p.hp) - 1);
      pl.secondWindCd = 300;
      pl.iframes = 2;
      this.floatText.spawn(head, '불굴!', 'crit');
      this.particles.rise(pl.body.pos, 0xffd27a, 30, 1);
    }
    p.hp -= dmg;
    this.floatText.spawn(head, `-${dmg}`, 'hurt');
    this.audio.play('hurt');
    this.cameraRig.shake(0.35);
    pl.hurt();
    if (opts.knock) {
      const k = new THREE.Vector3(pl.body.pos.x - from.x, 0, pl.body.pos.z - from.z).normalize().multiplyScalar(opts.knock);
      pl.body.vel.x += k.x;
      pl.body.vel.z += k.z;
    }
    if (opts.slow) {
      p.buffs = p.buffs.filter((b) => b.id !== 'slow');
      p.buffs.push({ id: 'slow', time: 2.5 });
    }
    if (p.hp <= 0) {
      p.hp = 0;
      pl.die();
      this.audio.play('death');
      this.building.setActive(false);
    }
    this.bridge.bump();
    return true;
  }

  respawn() {
    const p = this.state.player;
    if (this.inDungeon) this.leaveDungeonState();
    const sp = p.spawn ?? { x: SPAWN.x + 2.5, y: 0, z: SPAWN.z + 6.5 };
    p.x = sp.x;
    p.z = sp.z;
    p.y = Math.max(sp.y, this.terrain.heightAt(sp.x, sp.z));
    const st = derivePlayerStats(p);
    p.hp = st.maxHp;
    p.stamina = st.maxStamina;
    p.buffs = [];
    this.player.reset();
    this.cameraRig.snap();
    for (const e of this.enemies.list) {
      e.aggro = false;
      if (e.state !== 'dead') e.setState('return');
    }
    this.projectiles.clear();
    this.ui.panel = null;
    this.ui.fade = 1;
    this.input.requestLock();
    this.bridge.bump();
  }

  // ── Gathering ───────────────────────────────────────────
  onGatherHit(node: ResourceNode) {
    if (!node.alive) return;
    const def = NODES[node.type];
    const st = this.state;
    const pl = this.player;
    const tool = def.tool === 'hand' ? null : pl.bestTool(def.tool);
    const power = def.tool === 'hand' ? 999 : tool ? tool.power : 1;
    node.hp -= power;
    const at = new THREE.Vector3(node.x, node.y + (def.tool === 'axe' ? 1.4 : 0.7), node.z);
    const color: number = { oak: 0xa8743f, pine: 0x8a5a32, birch: 0xe4e0d4, rock: 0x9a958c, copper: 0xe0823e, crystal: 0x5fe0f0, bush: 0xd8283e, fiber: 0xa9c45a, charred: 0x3a3028, iron: 0xb8b8c0, obsidian: 0x5a3a8a, emberbush: 0xff7a2a }[node.type];
    this.particles.burst(at, color, 9, 3.2, 0.09);
    this.audio.play(def.tool === 'axe' ? 'chop' : def.tool === 'pickaxe' ? 'mine' : 'pick');
    this.resources.shake(node);
    const depleted = node.hp <= 0;
    for (const d of def.drops) {
      let qty = d.perHit[0] + Math.floor(Math.random() * (d.perHit[1] - d.perHit[0] + 1));
      if (depleted && d.final) qty += d.final[0] + Math.floor(Math.random() * (d.final[1] - d.final[0] + 1));
      if (qty > 0 && tool && tool.tier >= 2 && Math.random() < 0.35) qty++;
      if (qty > 0 && Math.random() < pl.stats.bonusYield) qty++;
      if (qty > 0) {
        this.giveItem(d.item, qty, 'gather', true);
        this.floatText.spawn(at, `+${qty} ${itemName(d.item)}`, 'item');
      }
    }
    if (depleted) {
      this.resources.deplete(node, st.playTime, pl.body.pos.x, pl.body.pos.z);
      st.counters[`gather:${node.type}`] = (st.counters[`gather:${node.type}`] ?? 0) + 1;
      if (def.tool === 'axe') this.audio.play('treefall');
      this.gainXp(def.xp, def.name);
      pl.gatherNode = null;
    }
    this.quests.check();
  }

  // ── Building callbacks ──────────────────────────────────
  onPiecePlaced(def: BuildableDef, x: number, y: number, z: number) {
    const st = this.state;
    const key = `build:${def.id}`;
    const first = !st.counters[key];
    st.counters[key] = (st.counters[key] ?? 0) + 1;
    this.audio.play('place');
    this.particles.burst(new THREE.Vector3(x, y + 0.3, z), 0xc9b48a, 12, 2.5, 0.08);
    this.gainXp(first ? 8 : 1, '건축');
    this.quests.check();
    this.requestAutosave();
    this.bridge.bump();
  }

  // ── Lights ──────────────────────────────────────────────
  private lightBuf: LightSource[] = [];
  private updateLights(focus: THREE.Vector3) {
    const buf = this.lightBuf;
    buf.length = 0;
    if (this.inDungeon) for (const l of this.dungeon.lights) buf.push(l);
    else {
      for (const l of this.landmarks.lights) buf.push(l);
      if (this.building) this.building.lightSources(buf);
    }
    buf.sort((a, b) => a.pos.distanceToSquared(focus) - b.pos.distanceToSquared(focus));
    const night = this.inDungeon ? 1 : 0.3 + 0.7 * (1 - this.env.daylight);
    const t = performance.now() * 0.001;
    for (let i = 0; i < this.lights.length; i++) {
      const L = this.lights[i];
      const s = buf[i];
      if (!s || s.pos.distanceTo(focus) > 70) {
        L.intensity = 0;
        continue;
      }
      L.position.copy(s.pos);
      L.color.setHex(s.color);
      L.distance = s.distance;
      L.intensity = s.intensity * night * (0.88 + Math.sin(t * 11 + i) * 0.06 + Math.sin(t * 23 + i * 2) * 0.05);
    }
  }

  // ── Village ─────────────────────────────────────────────
  talkTo(id: number) {
    this.ui.villagerId = id;
    this.openPanel('villager');
  }

  // ── Hazards: lava, the open sea, rain ───────────────────
  private updateHazards(dt: number) {
    if (this.inDungeon || this.player.dead || dt <= 0) return;
    const p = this.state.player;
    const pp = this.player.body.pos;
    const buff = (id: string) => p.buffs.some((b) => b.id === id);
    // lava pools in the crater
    for (const l of LAVA_POOLS) {
      if (Math.hypot(pp.x - l.x, pp.z - l.z) < l.r && pp.y < this.terrain.heightAt(l.x, l.z) + 0.6) {
        const dmg = 22 * dt * (buff('fire_ward') ? 0.5 : 1);
        p.hp -= dmg;
        this.player.lastHurtAt = this.state.playTime;
        if (this.state.playTime - this.lavaWarned > 3) {
          this.lavaWarned = this.state.playTime;
          this.events.emit('notify', { text: '용암에 데이고 있다! (불씨 열매: 화염 저항)', kind: 'warn' });
          this.audio.play('hurt', 0.6);
        }
        if (p.hp <= 0) this.damagePlayer(9999, pp.clone(), { unblockable: true });
        break;
      }
    }
    // swimming far out at sea: the waves wear you down - you need a boat
    if (this.player.swimming && !this.boats.onBoard && this.terrain.heightAt(pp.x, pp.z) < -9) {
      p.stamina = Math.max(0, p.stamina - 9 * dt);
      if (p.stamina <= 0) {
        p.hp -= 6 * dt;
        this.player.lastHurtAt = this.state.playTime;
        if (p.hp <= 0) this.damagePlayer(9999, pp.clone(), { unblockable: true });
      }
      if (this.state.playTime - this.seaWarned > 12) {
        this.seaWarned = this.state.playTime;
        this.events.emit('notify', { text: '거친 파도가 몸을 지치게 한다. 먼 바다는 배로 건너야 한다', kind: 'warn' });
      }
    }
    // rain soaks you unless you are under a roof (or in the boat cabin-less... the boat does not help)
    if (this.weather.raining && !this.shelter.indoors) {
      const w = p.buffs.find((b) => b.id === 'wet');
      if (w) w.time = 30;
      else p.buffs.push({ id: 'wet', time: 30 });
    }
  }

  // ── Shelter & rest ──────────────────────────────────────
  private updateShelter(dt: number) {
    this.shelterTimer -= dt;
    if (this.shelterTimer > 0) return;
    this.shelterTimer = 1;
    const pp = this.player.body.pos;
    let indoors = false;
    let heat = false;
    let comfort = 0;
    if (!this.inDungeon && this.building.pieces.size > 0) {
      this.upRay.set(new THREE.Vector3(pp.x, pp.y + 1.7, pp.z), new THREE.Vector3(0, 1, 0));
      this.upRay.camera = this.camera; // sprites (flame glows) need a camera to be raycast
      this.upRay.far = 9;
      indoors = this.upRay.intersectObject(this.building.group, true).some((h) => (h.object as THREE.Mesh).isMesh);
      const kinds = new Set<string>();
      for (const p of this.building.pieces.values()) {
        const d2 = (p.state.x - pp.x) ** 2 + (p.state.z - pp.z) ** 2;
        if (d2 > 100 || Math.abs(p.state.y - pp.y) > 4) continue;
        if (p.def.light) heat = true;
        if (p.def.comfort) kinds.add(p.def.shape);
      }
      for (const lm of this.landmarks.lights) if (lm.pos.distanceToSquared(pp) < 100) heat = true;
      comfort = Math.min(10, kinds.size);
    }
    const changed = indoors !== this.shelter.indoors || comfort !== this.shelter.comfort || heat !== this.shelter.heat;
    this.shelter = { indoors, heat, comfort };
    const p = this.state.player;
    if (indoors && heat && !this.player.dead) {
      this.restProgress += 1;
      const dur = 180 + comfort * 60;
      const existing = p.buffs.find((b) => b.id === 'rested');
      if (existing) existing.time = Math.max(existing.time, dur);
      else if (this.restProgress >= 6) {
        p.buffs.push({ id: 'rested', time: dur });
        this.state.counters.rested = (this.state.counters.rested ?? 0) + 1;
        this.events.emit('notify', { text: `휴식 중 — 안락도 ${comfort} (스태미나·체력 회복 증가, 경험치 +10%)`, kind: 'info' });
        this.quests.check();
      }
    } else this.restProgress = 0;
    if (changed) this.bridge.bump();
  }

  // ── Skills ──────────────────────────────────────────────
  skillsLearnedCount(): number {
    return Object.values(this.state.player.skills).filter((r) => r > 0).length;
  }

  canLearn(id: string): { ok: boolean; reason: string } {
    const def = SKILL_BY_ID[id];
    const p = this.state.player;
    if (!def) return { ok: false, reason: '알 수 없는 스킬' };
    if (rank(p, id) >= def.maxRank) return { ok: false, reason: '최고 단계' };
    if (p.level < def.levelReq) return { ok: false, reason: `레벨 ${def.levelReq} 필요` };
    for (const req of def.requires ?? []) if (rank(p, req.skill) < req.rank) return { ok: false, reason: `${SKILL_BY_ID[req.skill].name} ${req.rank}단계 필요` };
    if (p.skillPoints <= 0) return { ok: false, reason: '스킬 포인트 부족' };
    return { ok: true, reason: '' };
  }

  learnSkill(id: string): boolean {
    const c = this.canLearn(id);
    if (!c.ok) {
      this.audio.play('deny');
      this.events.emit('notify', { text: c.reason, kind: 'warn' });
      return false;
    }
    const p = this.state.player;
    const def = SKILL_BY_ID[id];
    p.skillPoints--;
    p.skills[id] = rank(p, id) + 1;
    if (def.kind === 'active' && !p.skillBar.includes(id)) {
      const empty = p.skillBar.indexOf(null);
      if (empty >= 0) p.skillBar[empty] = id;
    }
    this.player.refreshEquipment();
    this.audio.play('levelup', 0.6);
    this.events.emit('notify', { text: `스킬 습득: ${def.name} ${p.skills[id]}단계`, kind: 'unlock' });
    this.particles.rise(this.player.body.pos, 0x9ad0ff, 18, 0.8);
    this.quests.check();
    this.requestAutosave();
    this.bridge.bump();
    return true;
  }

  assignSkill(slot: number, id: string | null) {
    const bar = this.state.player.skillBar;
    if (id) for (let i = 0; i < bar.length; i++) if (bar[i] === id) bar[i] = null;
    bar[slot] = id;
    this.audio.play('click');
    this.bridge.bump();
  }

  resetSkills() {
    const p = this.state.player;
    const total = Object.values(p.skills).reduce((a, r) => a + r, 0);
    p.skills = {};
    p.skillBar = [null, null, null, null];
    p.skillPoints += total;
    this.player.refreshEquipment();
    this.events.emit('notify', { text: `기술을 잊었다. 스킬 포인트 ${total} 반환`, kind: 'info' });
    this.bridge.bump();
  }

  useSkill(slot: number) {
    const p = this.state.player;
    const id = p.skillBar[slot];
    if (!id) return;
    const def = SKILL_BY_ID[id];
    const pl = this.player;
    if (!def?.active || rank(p, id) <= 0 || pl.dead || pl.swimming || this.building.active || pl.busy) return;
    const cd = pl.cooldowns.get(id);
    if (cd) {
      this.events.emit('notify', { text: `${def.name} 재사용 대기 ${cd.toFixed(1)}초`, kind: 'warn' });
      return;
    }
    const a = def.active;
    if (a.stamina && p.stamina < a.stamina) {
      this.audio.play('deny');
      this.events.emit('notify', { text: '스태미나가 부족합니다', kind: 'warn' });
      return;
    }
    if (a.mana && (p.mana ?? 0) < a.mana) {
      this.audio.play('deny');
      this.events.emit('notify', { text: '마나가 부족합니다', kind: 'warn' });
      return;
    }
    if (id === 'a_heal' && p.hp >= pl.stats.maxHp) {
      this.events.emit('notify', { text: '체력이 가득 찼습니다', kind: 'warn' });
      return;
    }
    if (a.stamina) {
      p.stamina -= a.stamina;
      pl.staminaDelay = 0.7;
    }
    if (a.mana) p.mana -= a.mana;
    pl.cooldowns.set(id, a.cooldown);
    if (pl.action === 'block') pl.action = 'none';
    if (id === 'c_whirl') {
      pl.startSkill(id, 'spin', 0.6);
      this.audio.play('heavy');
    } else if (id === 'c_dash') {
      pl.startSkill(id, 'dash', 0.35);
      this.audio.play('dodge');
    } else {
      pl.startSkill(id, 'cast', 0.45);
    }
    this.bridge.bump();
  }

  /** Damage from skills / spells (not the basic weapon swing). */
  private damageEnemy(e: Enemy, raw: number, knock: THREE.Vector3, heavy: boolean, canCrit = true, cls = 'dmg') {
    const st = this.player.stats;
    const crit = canCrit && Math.random() < st.critChance;
    const final = Math.round(mitigate(raw * (crit ? st.critMult : 1), e.def.defense));
    e.hp -= final;
    const at = e.body.pos.clone();
    at.y += e.def.height * 0.7 + (e.def.flying ? 1 : 0);
    this.floatText.spawn(at, String(final), crit ? 'crit' : cls);
    this.particles.burst(at, crit ? 0xffd27a : 0xffffff, 8, 4, 0.07, 6, 0.4);
    this.audio.play(crit ? 'crit' : 'hit');
    this.enemies.onDamaged(e, final, knock, heavy);
    if (e.hp <= 0) this.onEnemyKilled(e);
  }

  /** Damage dealt by the town (guards, archer towers): no crits, half experience for kills. */
  damageEnemyBy(e: Enemy, raw: number, knock: THREE.Vector3) {
    if (e.state === 'dead' || e.removed) return;
    const final = Math.max(1, Math.round(mitigate(raw * (0.9 + Math.random() * 0.2), e.def.defense)));
    e.hp -= final;
    if (e.body.pos.distanceToSquared(this.player.body.pos) < 900) {
      const at = e.body.pos.clone();
      at.y += e.def.height * 0.7 + (e.def.flying ? 1 : 0);
      this.floatText.spawn(at, String(final), 'dmg');
      this.particles.burst(at, 0xffffff, 6, 3, 0.06, 6, 0.3);
      this.audio.play('hit', 0.5);
    }
    this.enemies.onDamaged(e, final, knock, false);
    if (e.hp <= 0) this.onEnemyKilled(e, 0.5);
  }

  onSkillImpact(id: string) {
    const p = this.state.player;
    const pl = this.player;
    const st = pl.stats;
    const r = Math.max(1, rank(p, id));
    const pp = pl.body.pos;
    if (id === 'c_whirl') {
      this.playerAttack(3.2, 360, [1.4, 1.75, 2.1][r - 1], true);
      const v = new THREE.Vector3();
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        v.set(Math.cos(a) * 7, 0.6, Math.sin(a) * 7);
        this.particles.emit(new THREE.Vector3(pp.x, pp.y + 1, pp.z), v, 0xffe2b0, 0.35, 0.09, 0);
      }
    } else if (id === 'a_bolt') {
      const camF = this.cameraRig.forward();
      let target: Enemy | null = null;
      let best = Infinity;
      for (const e of this.enemies.list) {
        if (e.state === 'dead' || e.removed) continue;
        const dx = e.body.pos.x - pp.x;
        const dz = e.body.pos.z - pp.z;
        const d = Math.hypot(dx, dz);
        if (d > 24) continue;
        const dot = (dx * camF.x + dz * camF.z) / (d || 1);
        const score = d * (dot > 0.3 ? 1 : 3);
        if (score < best) {
          best = score;
          target = e;
        }
      }
      const from = new THREE.Vector3(pp.x + Math.sin(pl.yaw) * 0.6, pp.y + 1.4, pp.z + Math.cos(pl.yaw) * 0.6);
      const dir = target ? target.body.pos.clone().setY(target.body.pos.y + target.def.height * 0.6 + (target.def.flying ? 1 : 0)).sub(from).normalize() : new THREE.Vector3(camF.x, 0.02, camF.z).normalize();
      if (target) pl.yaw = Math.atan2(target.body.pos.x - pp.x, target.body.pos.z - pp.z);
      this.projectiles.spawn(from, dir.multiplyScalar(22), st.magicPower * [1.2, 1.5, 1.8][r - 1], 0x7ad8ff, { owner: 'player', target: target ?? undefined, homing: target ? 4 : 0, life: 2.2 });
      this.audio.play('shoot');
    } else if (id === 'a_heal') {
      const heal = Math.round(st.maxHp * [0.25, 0.35, 0.45][r - 1]);
      p.hp = Math.min(st.maxHp, p.hp + heal);
      this.floatText.spawn(pp.clone().setY(pp.y + 2), `+${heal}`, 'heal');
      this.particles.rise(pp, 0x7cff8a, 30, 1);
      this.audio.play('discover', 0.6);
    } else if (id === 'a_nova') {
      const mult = [1.0, 1.3, 1.6][r - 1];
      for (const e of [...this.enemies.list]) {
        if (e.state === 'dead' || e.removed) continue;
        const dx = e.body.pos.x - pp.x;
        const dz = e.body.pos.z - pp.z;
        const d = Math.hypot(dx, dz) - e.def.radius;
        if (d > 5 || Math.abs(e.body.pos.y - pp.y) > 3) continue;
        e.slowTime = 3;
        this.damageEnemy(e, st.magicPower * mult, new THREE.Vector3(dx, 0, dz).normalize(), false, true, 'mana');
      }
      const v = new THREE.Vector3();
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        v.set(Math.cos(a) * 9, 0.4 + Math.random(), Math.sin(a) * 9);
        this.particles.emit(new THREE.Vector3(pp.x, pp.y + 0.4, pp.z), v, 0xbfe8ff, 0.5, 0.12, 1);
      }
      this.audio.play('slam', 0.5);
      this.cameraRig.shake(0.25);
    }
    this.bridge.bump();
  }

  /** Called every frame of the dash: hit each enemy along the path once. */
  skillDashHits(pl: Player) {
    const r = Math.max(1, rank(this.state.player, 'c_dash'));
    const pp = pl.body.pos;
    for (const e of this.enemies.list) {
      if (e.state === 'dead' || e.removed || pl.skillHits.has(e)) continue;
      const dx = e.body.pos.x - pp.x;
      const dz = e.body.pos.z - pp.z;
      if (Math.hypot(dx, dz) > 1.7 + e.def.radius || Math.abs(e.body.pos.y - pp.y) > 2.5) continue;
      pl.skillHits.add(e);
      this.damageEnemy(e, pl.stats.attack * [1.5, 1.9, 2.3][r - 1], new THREE.Vector3(dx, 0, dz).normalize(), true);
      this.hitStop = 0.04;
    }
  }

  /** Player spell projectiles vs enemies. */
  private playerProjectileHit(p: Projectile): boolean {
    for (const e of this.enemies.list) {
      if (e.state === 'dead' || e.removed) continue;
      const cy = e.body.pos.y + e.def.height * 0.5 + (e.def.flying ? 1 : 0);
      const d = Math.hypot(p.pos.x - e.body.pos.x, p.pos.z - e.body.pos.z);
      if (d < e.def.radius + 0.45 && Math.abs(p.pos.y - cy) < e.def.height * 0.6 + 0.4) {
        if (p.source === 'tower') this.damageEnemyBy(e, p.damage, p.vel.clone().setY(0).normalize());
        else this.damageEnemy(e, p.damage, p.vel.clone().setY(0).normalize(), false, true, 'mana');
        return true;
      }
    }
    return false;
  }

  // ── Dungeon ─────────────────────────────────────────────
  cryptExterior(): THREE.Vector3 {
    const loc = LOCATION_BY_ID.crypt_entrance;
    const x = loc.x;
    const z = loc.z + 6.5;
    return new THREE.Vector3(x, groundAt(this.terrain, this.colliders, x, z, 0.35, this.terrain.heightAt(x, z) + 30, 0) + 0.05, z);
  }

  private setDungeonVisuals(inside: boolean) {
    this.dungeon.group.visible = inside;
    this.terrain.mesh.visible = !inside;
    this.water.mesh.visible = !inside;
    this.resources.group.visible = !inside;
    this.grass.group.visible = !inside;
    this.landmarks.group.visible = !inside;
    this.building.group.visible = !inside;
    this.env.interior = inside;
  }

  enterDungeon() {
    if (this.inDungeon || this.player.dead) return;
    if (this.building.active) this.building.setActive(false);
    this.enemies.clear();
    this.projectiles.clear();
    this.dungeon.reset();
    this.inDungeon = true;
    this.setDungeonVisuals(true);
    const e = this.dungeon.entryPos;
    this.player.body.pos.set(e.x, e.y + 0.05, e.z);
    this.player.body.vel.set(0, 0, 0);
    this.player.yaw = 0;
    this.cameraRig.yaw = 0;
    this.cameraRig.pitch = 0.25;
    this.cameraRig.snap();
    for (const s of this.dungeon.spawns()) this.enemies.spawn(s.enemy, s.x, s.z, DUNGEON_ORIGIN.y);
    this.ui.fade = 1.2;
    this.audio.play('door');
    this.events.emit('banner', { title: '잊혀진 묘소', subtitle: '차가운 공기가 뼛속까지 스며든다', kind: 'region' });
    this.bridge.bump();
  }

  /** Leave interior state without moving the player (used by respawn / load). */
  leaveDungeonState() {
    this.inDungeon = false;
    this.setDungeonVisuals(false);
    this.enemies.clear();
    this.projectiles.clear();
  }

  exitDungeon() {
    if (!this.inDungeon) return;
    this.leaveDungeonState();
    const e = this.cryptExterior();
    this.player.body.pos.copy(e);
    this.player.body.vel.set(0, 0, 0);
    this.player.yaw = 0;
    this.cameraRig.yaw = 0;
    this.cameraRig.snap();
    this.ui.fade = 1.2;
    this.audio.play('door');
    this.requestAutosave();
    this.bridge.bump();
  }

  private dungeonInteract(it: DungeonInteractable) {
    const st = this.state;
    if (it.kind === 'portal') this.exitDungeon();
    else if (it.kind === 'lore') {
      this.ui.lore = {
        title: '묘지기의 기록',
        text:
          '"왕께서 잠드신 지 천 년. 나는 아직 이곳을 지킨다.\n\n세 개의 문양은 하루의 흐름을 따라야만 길을 연다. 순서를 어긴 자에게 철문은 응답하지 않는다.\n\n벽 너머에 왕의 보물 일부를 숨겨 두었다. 금이 간 돌은 오래 버티지 못하리라."',
      };
      this.openPanel('lore');
      if (!st.loreRead.includes('crypt_hall')) {
        st.loreRead.push('crypt_hall');
        this.gainXp(20, '고대의 기록');
      }
    } else if (it.kind === 'lever' && it.symbol) {
      const r = this.dungeon.pullLever(it.symbol);
      if (r === 'already') this.events.emit('notify', { text: '이미 당겨져 있다', kind: 'info' });
      else if (r === 'progress') {
        this.audio.play('door');
        this.events.emit('notify', { text: '철컥… 어딘가에서 톱니가 맞물리는 소리가 난다', kind: 'info' });
      } else if (r === 'wrong') {
        this.audio.play('deny');
        this.events.emit('notify', { text: '레버들이 덜컹거리며 제자리로 돌아간다. 순서가 틀린 것 같다', kind: 'warn' });
      } else {
        this.audio.play('slam');
        this.cameraRig.shake(0.4);
        this.events.emit('banner', { title: '철문이 열렸다', subtitle: '묘소 깊은 곳으로 가는 길이 드러났다', kind: 'discover' });
        st.counters['crypt:gate'] = (st.counters['crypt:gate'] ?? 0) + 1;
        this.gainXp(50, '퍼즐');
        this.quests.check();
      }
    } else if (it.kind === 'chest') {
      if (st.openedChests.includes(it.id)) return;
      if (it.id === 'dchest_boss' && !this.dungeon.keeperDefeated) {
        this.audio.play('deny');
        this.events.emit('notify', { text: '보이지 않는 힘이 상자를 봉인하고 있다. 묘지기를 쓰러뜨려야 한다', kind: 'warn' });
        return;
      }
      st.openedChests.push(it.id);
      const items =
        it.id === 'dchest_hidden'
          ? [
              { item: 'arcane_ring', qty: 1 },
              { item: 'mana_potion', qty: 2 },
              { item: 'skill_tome', qty: 1 },
            ]
          : [
              { item: 'copper_ingot', qty: 6 },
              { item: 'crystal', qty: 2 },
              { item: 'health_potion', qty: 2 },
            ];
      for (const x of items) this.giveItem(x.item, x.qty, 'loot');
      this.audio.play('discover');
      this.particles.rise(it.pos, 0xffd27a, 24, 0.8);
      this.gainXp(40, '보물 발견');
      this.requestAutosave();
    }
    this.bridge.bump();
  }

  // ── Helpers for UI ──────────────────────────────────────
  get stats() {
    return derivePlayerStats(this.state.player);
  }

  chestSlots(): Slot[] | null {
    if (this.ui.chestId === null) return null;
    return this.building.getPiece(this.ui.chestId)?.state.storage ?? null;
  }

  /** Debug / test helpers (exposed on window.__eternum). */
  debug = {
    give: (id: string, qty = 1) => this.giveItem(id, qty, 'loot'),
    teleport: (x: number, z: number) => {
      this.player.body.pos.set(x, groundAt(this.terrain, this.colliders, x, z, 0.35, this.terrain.heightAt(x, z) + 30, 0) + 0.05, z);
      this.player.body.vel.set(0, 0, 0);
    },
    setTime: (t: number) => {
      this.env.time = t;
    },
    xp: (n: number) => this.gainXp(n),
    research: (n: number) => this.civ.addPoints(n),
    raid: () => this.defense.startRaid(true),
    heal: () => {
      const st = derivePlayerStats(this.state.player);
      this.state.player.hp = st.maxHp;
    },
  };
}
