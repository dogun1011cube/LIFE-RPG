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

export type Screen = 'loading' | 'menu' | 'playing';
export type PanelId = 'menu' | 'pause' | 'settings' | 'controls' | 'chest' | 'lore' | 'death' | 'saveload';
export type MenuTab = 'inventory' | 'crafting' | 'quests' | 'map';

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
    level: 1,
    xp: 0,
    attrPoints: 0,
    attrs: { str: 0, vit: 0, end: 0, agi: 0, skl: 0 },
    inventory: Array.from({ length: INVENTORY_SIZE }, () => null),
    equipment: { weapon: 'wooden_club', armor: null },
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
    const zones = LOCATIONS.map((l) => ({ x: l.x, z: l.z, r: l.flatRadius, h: l.flatHeight }));
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
    await this.step('지도를 그리는 중...', 0.9);
    this.mapImage = renderMapImage(this.terrain, 512);
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
    this.state = { ...fresh, ...file.state, player: { ...fresh.player, ...file.state.player }, quests: { ...fresh.quests, ...file.state.quests } };
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
    this.discovery.reset();
    this.discovery.loadExplored(st.explored);
    for (const id of st.openedChests) this.landmarks.markChestOpened(id);
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
    st.pieces = this.building.serialize();
    st.depletedNodes = this.resources.getDepleted();
    st.explored = this.discovery.serializeExplored();
    return JSON.parse(JSON.stringify(st)) as GameState;
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
      this.player.update(simDt, canControl);
      this.updateInteraction();
      this.enemies.update(simDt);
      this.projectiles.update(
        simDt,
        pp,
        this.player.body.radius,
        (p) => this.damagePlayer(p.damage, p.pos, { knock: 3, slow: p.slow }),
        (pos, color) => this.particles.burst(pos, color, 8, 2.5, 0.08, 2),
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
      this.discovery.update(simDt);
      this.building.update(simDt, pp);
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
    const obstacles = [this.building.group, this.landmarks.group];
    this.cameraRig.buildMode = this.building.active;
    this.cameraRig.update(dt, pp, obstacles, this.building.active ? 0.9 : 0.55);
    this.grass.update(pp);
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
    else if (i.wasPressed('KeyB') && (this.ui.panel === null || this.ui.panel === 'menu')) {
      if (this.ui.panel) this.closePanel(true);
      this.building.setActive(!this.building.active);
      if (this.building.active) this.events.emit('notify', { text: '건축 모드: [좌클릭] 설치 · [R] 회전 · [휠] 높이 · [X] 철거 · [Tab] 분류', kind: 'info' });
    } else if ((this.ui.panel === 'chest' || this.ui.panel === 'lore') && (i.wasPressed('KeyE') || i.wasPressed('Tab'))) this.closePanel(true);
  }

  private handleGameplayInput(clickConsumed: boolean) {
    const i = this.input;
    const b = this.building;
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
      const list = b.available(b.category);
      for (let k = 1; k <= 9; k++) if (i.wasPressed(`Digit${k}`) && list[k - 1]) b.select(list[k - 1].id);
      if (i.wasPressed('KeyE') && this.ui.prompt && this.ui.prompt.kind !== 'node') this.ui.prompt.run();
      return;
    }
    if (!clickConsumed && i.wasMousePressed(0)) this.player.startAttack(false);
    if (i.wasMousePressed(2)) this.player.startAttack(true);
    if (i.wasPressed('KeyQ')) this.player.startDodge();
    for (let k = 1; k <= 4; k++) if (i.wasPressed(`Digit${k}`)) this.useHotbar(k - 1);
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
    if (!Inv.remove(st.player.inventory, id, 1)) return;
    const p = st.player;
    const stats = derivePlayerStats(p);
    const head = this.player.body.pos.clone().setY(this.player.body.pos.y + 2);
    if (def.use.heal) {
      p.hp = Math.min(stats.maxHp, p.hp + def.use.heal);
      this.floatText.spawn(head, `+${def.use.heal}`, 'heal');
    }
    if (def.use.hot) {
      p.buffs = p.buffs.filter((b) => b.id !== 'hot');
      p.buffs.push({ id: 'hot', time: def.use.hot.duration, amount: def.use.hot.amount / def.use.hot.duration });
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
    if (def.category === 'weapon' || def.category === 'armor') this.equipFromSlot(index);
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
    const kind = def.category === 'weapon' ? 'weapon' : def.category === 'armor' ? 'armor' : null;
    if (!kind) return;
    const prev = st.equipment[kind];
    st.equipment[kind] = s.id;
    st.inventory[index] = prev ? { id: prev, qty: 1 } : null;
    this.player.refreshEquipment();
    this.audio.play('craft');
    this.events.emit('notify', { text: `장착: ${def.name}`, kind: 'info' });
    this.bridge.bump();
  }

  unequip(kind: 'weapon' | 'armor') {
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
    p.xp += Math.round(amount);
    this.floatText.spawn(this.player.body.pos.clone().setY(this.player.body.pos.y + 2.3), `+${Math.round(amount)} XP`, 'xp');
    let leveled = false;
    while (p.xp >= xpToNext(p.level)) {
      p.xp -= xpToNext(p.level);
      p.level++;
      p.attrPoints += POINTS_PER_LEVEL;
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
      const crit = Math.random() < stats.critChance;
      let dmg = stats.attack * mult * (0.9 + Math.random() * 0.2);
      if (crit) dmg *= stats.critMult;
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
    }
  }

  private onEnemyKilled(e: Enemy) {
    const st = this.state;
    const def = e.def;
    st.counters[`kill:${def.id}`] = (st.counters[`kill:${def.id}`] ?? 0) + 1;
    this.audio.play('death');
    const pos = e.body.pos.clone();
    pos.y += 0.8 + (def.flying ? 1 : 0);
    this.particles.burst(pos, def.model === 'slime' ? 0x5fd36a : def.model === 'wisp' ? 0x9a6aff : 0x9a8f80, 22, 5, 0.12);
    for (const d of def.drops) {
      if (Math.random() > d.chance) continue;
      const qty = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
      if (qty > 0) this.pickups.spawn(d.item, qty, pos);
    }
    this.gainXp(def.xp, def.name);
    if (def.boss) {
      st.bossDefeated++;
      this.events.emit('banner', { title: '수호자를 쓰러뜨렸다!', subtitle: '섬이 당신을 주인으로 인정했다', kind: 'boss' });
      this.particles.rise(pos, 0x5fe0f0, 80, 3);
      this.requestAutosave();
    }
    this.quests.check();
  }

  damagePlayer(amount: number, from: THREE.Vector3, opts: { knock?: number; slow?: boolean } = {}): boolean {
    const pl = this.player;
    if (pl.dead) return false;
    const head = pl.body.pos.clone().setY(pl.body.pos.y + 2);
    if (pl.iframes > 0) {
      this.floatText.spawn(head, '회피!', 'dodge');
      return false;
    }
    const p = this.state.player;
    const dmg = Math.round(mitigate(amount, pl.stats.defense));
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
    const color = { oak: 0xa8743f, pine: 0x8a5a32, birch: 0xe4e0d4, rock: 0x9a958c, copper: 0xe0823e, crystal: 0x5fe0f0, bush: 0xd8283e, fiber: 0xa9c45a }[node.type];
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
    for (const l of this.landmarks.lights) buf.push(l);
    if (this.building) this.building.lightSources(buf);
    buf.sort((a, b) => a.pos.distanceToSquared(focus) - b.pos.distanceToSquared(focus));
    const night = 0.3 + 0.7 * (1 - this.env.daylight);
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
    heal: () => {
      const st = derivePlayerStats(this.state.player);
      this.state.player.hp = st.maxHp;
    },
  };
}
