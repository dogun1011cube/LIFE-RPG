/**
 * Phase 6 checks: the ember isle (terrain, resources, monsters), sea chart map + old fog migration,
 * sailing by boat (and the dangerous open sea), weather effects, iron tier, braziers + lava titan, lava,
 * dock + merchant ship + reputation, raider path finding, persistence.
 * Usage: npm run dev (another terminal), then node tests/phase6.cjs [url] [screenshotDir]
 */
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:5173';
const SHOTS = process.argv[3] || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  const shot = async (name) => { if (SHOTS) { await sleep(800); await page.screenshot({ path: `${SHOTS}/${name}.png` }); } };
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('text=새 게임', { timeout: 120000 });
  await page.evaluate(() => window.__eternum.setSetting('quality', 'low'));
  await page.click('text=새 게임');
  await page.click('text=여기서 시작');
  await sleep(1500);
  const inject = () => page.evaluate(() => {
    window.__step = (sec, dt = 1 / 30) => { const g = window.__eternum; const n = Math.round(sec / dt); for (let i = 0; i < n; i++) { g.update(dt); g.input.endFrame(); } };
    window.__def = (id) => window.__eternum.building.available().find((b) => b.id === id);
    window.__inv = (id) => window.__eternum.state.player.inventory.filter(Boolean).filter((s) => s.id === id).reduce((a, s) => a + s.qty, 0);
    window.__lm = (id) => window.__eternum.landmarks.interactables.find((i) => i.id === id);
    /** a dock spot on the south coast of the home island: land under the middle, sea under the far end */
    window.__coast = () => {
      const T = window.__eternum.terrain;
      for (let x = -60; x <= 60; x += 4) for (let z = 220; z < 400; z += 0.5) {
        const h = T.heightAt(x, z);
        if (h > 0.3 && h < 1.6 && T.heightAt(x, z - 3.5) > 0 && T.heightAt(x, z + 5.5) < -0.8 && T.heightAt(x, z + 9) < -1.2) return { x, z };
      }
      return null;
    };
  });
  await inject();
  const G = (fn, arg) => page.evaluate(fn, arg);
  const res = {};

  // ── 1. the world: a second island and a bigger sea chart
  res.world = await G(() => {
    const g = window.__eternum; g.input.lockFailures = 2;
    g.weather.set('clear', 1e9);
    g.state.quests.completed.push('q_survive', 'q_tools', 'q_hunt', 'q_workbench', 'q_shelter', 'q_copper', 'v_found');
    g.quests.refreshAvailable(true);
    g.state.player.level = 9; g.refreshUnlocks(true);
    const T = g.terrain;
    const types = {}; for (const n of g.resources.nodes) types[n.type] = (types[n.type] || 0) + 1;
    const emberEnemies = ['magma_slime', 'ash_wolf', 'lava_golem', 'fire_wisp', 'lava_titan'];
    return {
      ember: T.islandId(60, 980), sea: T.islandId(60, 600), home: T.islandId(0, 150),
      crater: +T.heightAt(75, 955).toFixed(1), seaDepth: T.heightAt(30, 600),
      biomes: [T.biomeAt(-56, 986), T.biomeAt(75, 955)],
      iron: types.iron || 0, charred: types.charred || 0, obsidian: types.obsidian || 0, emberbush: types.emberbush || 0,
      homeNodes: (types.oak || 0) + (types.pine || 0),
      mapW: g.mapImage.width, explore: g.discovery.explored.length,
      boatRecipe: g.state.knownRecipes.includes('r_boat_basic'), dockKnown: g.state.knownBuildables.includes('dock'),
      questSea: g.state.quests.active.some((q) => q.id === 'w_sea'),
      monsters: emberEnemies.every((id) => !!g.enemies.constructor),
    };
  });
  res.fog = await G(() => {
    const g = window.__eternum; const D = g.discovery;
    // an old save's 128x128 fog with a single explored cell at the spawn camp (0, 150)
    const bytes = new Uint8Array(2048); const ix = Math.floor((0 + 400) / 6.25); const iz = Math.floor((150 + 400) / 6.25); const i = iz * 128 + ix; bytes[i >> 3] |= 1 << (i & 7);
    let s = ''; for (const b of bytes) s += String.fromCharCode(b);
    D.loadExplored(btoa(s));
    const ok = D.isExplored(1, 151) && !D.isExplored(100, 150);
    D.reset();
    return { ok };
  });

  // ── 2. swimming far out wears you down
  res.deepSea = await G(() => {
    const g = window.__eternum; const p = g.state.player;
    g.debug.teleport(30, 560); __step(0.5);
    const s0 = p.stamina; const h0 = p.hp;
    __step(18);
    const out = { swimming: g.player.swimming, staminaLost: Math.round(s0 - p.stamina), hpLost: Math.round(h0 - p.hp) };
    p.hp = 100; p.stamina = 100; g.debug.teleport(0, 150); __step(0.5);
    return out;
  });

  // ── 3. dock + boat: build at the south coast, launch, sail to the ember isle
  res.dock = await G(() => {
    const g = window.__eternum; const c = __coast(); window.__c = c;
    if (!c) return { coast: null };
    g.debug.teleport(c.x - 3, c.z - 6); __step(0.3);
    for (const k of __def('dock').cost) g.debug.give(k.item, k.qty * 2);
    const inland = g.building.validate(__def('dock'), c.x, g.terrain.heightAt(c.x, c.z - 30), c.z - 30, 0).reason;
    const ok = g.building.placeAt(__def('dock'), c.x, g.terrain.heightAt(c.x, c.z), c.z, 0);
    __step(1);
    return { coast: c, ok, inland, questDock: g.state.quests.completed.includes('w_dock') };
  });
  res.sail = await G(() => {
    const g = window.__eternum; const c = window.__c; const B = g.boats;
    g.debug.teleport(c.x, c.z + 5); __step(0.3);
    g.debug.give('boat', 1);
    g.consumeItem('boat');
    const launched = B.placed && B.onBoard;
    __step(0.5);
    const questSea = g.state.quests.completed.includes('w_sea');
    const start = B.group.position.clone();
    const target = { x: 52, z: 826 };
    g.input.simulateKey('KeyW', true);
    let t = 0; let stuck = 0;
    while (t < 120) {
      const p = B.group.position;
      B.yaw = Math.atan2(target.x - p.x, target.z - p.z);
      __step(1); t++;
      if (Math.abs(B.speed) < 0.6) stuck++; else stuck = 0;
      if (stuck > 3 && t > 10) break;
    }
    g.input.simulateKey('KeyW', false);
    __step(1);
    const end = B.group.position.clone();
    return { launched, questSea, travelled: Math.round(Math.hypot(end.x - start.x, end.z - start.z)), seconds: t, end: [Math.round(end.x), Math.round(end.z)], playerOnBoat: g.player.mounted, distance: Math.round(g.state.counters['boat:distance'] || 0) };
  });
  if (SHOTS) {
    await G(() => { const g = window.__eternum; const B = g.boats; g.debug.setTime(0.42); B.group.position.set(40, 0, 640); B.yaw = Math.PI * 0.95; g.cameraRig.yaw = Math.PI * 0.95 + 0.4; g.cameraRig.pitch = 0.25; g.cameraRig.targetDistance = 9; g.input.simulateKey('KeyW', true); __step(2); g.input.simulateKey('KeyW', false); });
    await shot('p6_sailing');
    await G(() => { const g = window.__eternum; const B = g.boats; B.group.position.set(48, 0, 812); B.yaw = Math.PI * 0.05; B.speed = 0; __step(0.5); });
  }
  res.land = await G(() => {
    const g = window.__eternum; const B = g.boats;
    const spot = B.landingSpot();
    const off = B.disembark();
    __step(1);
    // walk to the landing camp so it is discovered
    g.debug.teleport(52, 845); __step(2);
    const p = g.player.body.pos;
    return { spot: !!spot, off, island: g.terrain.islandId(p.x, p.z), boatLeft: B.placed && !B.onBoard, discovered: g.state.discovered.includes('ember_landing'), questLanding: g.state.quests.completed.includes('w_landing'), region: g.discovery.regionName() };
  });

  // ── 4. weather
  res.weather = await G(() => {
    const g = window.__eternum; const W = g.weather; const p = g.state.player;
    g.player.iframes = 1e9; // lightning is tested by its thunder, not by dying
    W.set('rain', 1e9); __step(12);
    const rain = { raining: W.raining, wet: p.buffs.some((b) => b.id === 'wet'), growth: W.growthMult, overcast: +g.env.overcast.toFixed(2) };
    W.set('fog', 1e9); __step(14);
    const fog = { aggro: +W.aggroMult.toFixed(2), far: Math.round(g.env.fog.far) };
    let thunder = 0; const play = g.audio.play.bind(g.audio); g.audio.play = (n, v) => { if (n === 'thunder') thunder++; return play(n, v); };
    W.set('storm', 1e9); __step(50);
    g.audio.play = play;
    const storm = { thunder, sail: W.sailMult };
    W.set('clear', 1e9); __step(10);
    g.player.iframes = 0; g.debug.heal();
    return { rain, fog, storm, clearFar: Math.round(g.env.fog.far) };
  });
  if (SHOTS) {
    await G(() => { const g = window.__eternum; g.player.iframes = 1e9; g.weather.set('storm', 1e9); g.debug.setTime(0.55); g.debug.teleport(40, 870); g.player.yaw = Math.PI; g.cameraRig.yaw = Math.PI + 0.2; g.cameraRig.pitch = 0.12; g.cameraRig.targetDistance = 10; __step(14); });
    await shot('p6_storm');
    await G(() => { const g = window.__eternum; g.weather.set('clear', 1e9); __step(14); g.player.iframes = 0; g.debug.heal(); });
  }

  // ── 5. ember isle monsters
  res.spawns = await G(() => {
    const g = window.__eternum; g.enemies.clear();
    g.debug.teleport(-10, 1040); g.debug.setTime(0.95); __step(0.5);
    for (let i = 0; i < 30; i++) __step(1);
    const ids = [...new Set(g.enemies.list.map((e) => e.def.id))];
    g.enemies.clear(); g.debug.setTime(0.45); __step(0.5);
    return { ids, count: ids.length };
  });

  // ── 6. iron: mine, smelt with charcoal, forge gear
  res.iron = await G(() => {
    const g = window.__eternum; const pp = g.player.body.pos;
    g.debug.give('copper_pickaxe', 1); g.debug.give('copper_axe', 1);
    const near = (type) => g.resources.nodes.filter((n) => n.alive && n.type === type).sort((a, b) => Math.hypot(a.x - pp.x, a.z - pp.z) - Math.hypot(b.x - pp.x, b.z - pp.z))[0];
    const ironNode = near('iron');
    g.debug.teleport(ironNode.x - 1.6, ironNode.z); __step(0.3);
    const ore0 = __inv('iron_ore');
    for (let i = 0; i < 12 && ironNode.alive; i++) g.onGatherHit(ironNode);
    const ore = __inv('iron_ore') - ore0;
    const tree = near('charred');
    g.debug.teleport(tree.x - 1.4, tree.z); __step(0.3);
    for (let i = 0; i < 10 && tree.alive; i++) g.onGatherHit(tree);
    const coal = __inv('charcoal');
    // a furnace and workbench on the beach
    const x = pp.x + 3, z = pp.z;
    g.debug.give('stone', 40); g.debug.give('wood', 40); g.debug.give('copper_ore', 1); g.refreshUnlocks(true);
    g.building.placeAt(__def('furnace'), x, g.terrain.heightAt(x, z), z, 0, true);
    g.building.placeAt(__def('workbench'), x, g.terrain.heightAt(x, z + 3), z + 3, 0, true);
    g.debug.give('iron_ore', 10); g.debug.give('charcoal', 6);
    const near0 = [...g.stationsNear()]; const known = g.state.knownRecipes.includes('r_iron_ingot');
    const made = g.craft('r_iron_ingot', 4);
    g.debug.give('leather', 3); g.debug.give('wood', 4); g.debug.give('iron_ingot', 4);
    const before = Math.round(g.player.stats.attack);
    const sword = g.craft('r_iron_sword', 1);
    const slot = g.state.player.inventory.findIndex((s) => s && s.id === 'iron_sword');
    g.equipFromSlot(slot); __step(0.2);
    const after = Math.round(g.player.stats.attack);
    return { ore, coal, made, sword, before, after, near0, known, questIron: g.state.quests.completed.includes('w_iron') };
  });

  // ── 7. lava and the lava titan
  res.lava = await G(() => {
    const g = window.__eternum; const p = g.state.player; const pool = g.landmarks.lavaPools[0];
    g.debug.teleport(pool.x, pool.z); p.hp = 200; __step(0.2); const h0 = p.hp; __step(2); const burn = h0 - p.hp;
    p.buffs.push({ id: 'fire_ward', time: 60 }); p.hp = 200; __step(0.2); const h1 = p.hp; __step(2); const warded = h1 - p.hp;
    g.debug.teleport(pool.x + 6, pool.z); g.debug.heal(); __step(0.5);
    return { burn: Math.round(burn), warded: Math.round(warded) };
  });
  res.titan = await G(() => {
    const g = window.__eternum;
    g.debug.give('charcoal', 6);
    const sealEarly = (() => { g.debug.teleport(75, 958); __step(0.3); g.landmarkInteract(__lm('crater_seal')); g.closePanel(); return !!g.enemies.boss; })();
    for (const i of [0, 1, 2]) { const b = __lm(`brazier_${i}`); g.debug.teleport(b.pos.x + 1.5, b.pos.z); __step(0.3); g.landmarkInteract(b); }
    const lit = g.landmarks.braziersLit();
    g.debug.teleport(75, 960); __step(0.3);
    g.landmarkInteract(__lm('crater_seal'));
    const boss = g.enemies.boss; const id = boss && boss.def.id;
    __step(3);
    const hp = boss ? boss.hp : 0;
    g.player.iframes = 999;
    if (boss) { boss.hp = 5; g.damageEnemyBy(boss, 200, new boss.body.pos.constructor(0, 0, 1)); }
    __step(2);
    g.player.iframes = 0;
    const cores = g.pickups.list.filter((p) => p.id === 'ember_core').length + __inv('ember_core');
    return { sealEarly, lit, id, hp, dead: !g.enemies.boss, counter: g.state.counters['boss:titan'] || 0, cores, relit: g.landmarks.braziersLit(), questTitan: g.state.quests.completed.includes('w_titan') };
  });
  if (SHOTS) {
    await G(() => { const g = window.__eternum; g.debug.setTime(0.8); g.debug.teleport(75, 978); g.player.yaw = Math.PI; g.cameraRig.yaw = Math.PI; g.cameraRig.pitch = 0.32; g.cameraRig.targetDistance = 16; g.player.iframes = 999; g.enemies.summonTitan(); __step(5); });
    await shot('p6_titan');
    await G(() => { const g = window.__eternum; if (g.enemies.boss) g.enemies.despawn(g.enemies.boss); g.player.iframes = 0; __step(0.5); });
  }

  // ── 8. the merchant ship at the dock
  res.ship = await G(() => {
    const g = window.__eternum; const S = g.ship; const c = window.__c;
    g.debug.setTime(0.36); g.debug.teleport(c.x, c.z + 4); __step(0.5);
    const arrived = S.arrive();
    for (let i = 0; i < 26; i++) __step(1);
    const docked = S.isDocked();
    g.debug.teleport(c.x, c.z + 5); __step(0.3);
    const canTrade = S.canTrade(g.player.body.pos);
    g.debug.give('coin', 400); g.debug.give('plank', 40); g.debug.give('tool_kit', 6);
    const coins0 = __inv('coin');
    const bought = S.buy('iron_ingot') && S.buy('spice');
    const lockedBoat = S.buy('sail_upgrade');
    const pl = g.state.player.inventory.findIndex((s) => s && s.id === 'plank');
    const sold = S.sell(pl, true);
    const tk = g.state.player.inventory.findIndex((s) => s && s.id === 'tool_kit');
    S.sell(tk, true);
    const rep = g.state.faction.rep;
    g.openPanel('ship');
    return { arrived, docked, canTrade, bought, lockedBoat, sold, coinsDelta: __inv('coin') - coins0, rep, level: S.repLevel().name, questTrade: g.state.quests.completed.includes('w_trade'), panel: g.ui.panel };
  });
  if (SHOTS) {
    await shot('p6_ship_panel');
    await G(() => { const g = window.__eternum; g.closePanel(); const c = window.__c; g.debug.teleport(c.x - 6, c.z - 4); g.player.yaw = 0; g.cameraRig.yaw = 0.6; g.cameraRig.pitch = 0.28; g.cameraRig.targetDistance = 18; __step(1); });
    await shot('p6_ship_docked');
  }
  res.leave = await G(() => {
    const g = window.__eternum; g.closePanel(); g.debug.setTime(18.95 / 24); for (let i = 0; i < 6; i++) __step(1);
    const leaving = g.ship.phase; for (let i = 0; i < 26; i++) __step(1);
    return { leaving, after: g.ship.phase, next: g.state.faction.nextVisitDay };
  });

  // ── 9. raiders find a way around walls
  res.raidPath = await G(() => {
    const g = window.__eternum; const c = window.__c;
    // a settlement just inland of the dock
    const hx = c.x, hz = c.z - 30;
    g.debug.give('wood', 99); g.debug.give('stone', 99); g.debug.give('fiber', 20);
    const hall = g.building.placeAt(__def('town_hall'), hx, g.terrain.heightAt(hx, hz), hz, 0, true);
    __step(3.5);
    // a wall right between the raider and the hall
    g.debug.give('stone', 99); g.debug.give('stone_brick', 40);
    for (let k = -4; k <= 4; k++) g.building.placeAt(__def('castle_wall') || { ...__def('stone_wall') }, hx + k * 2, g.terrain.heightAt(hx + k * 2, hz - 12), hz - 12, 0, true);
    __step(0.5);
    g.debug.teleport(hx + 60, hz + 60); __step(0.2);
    const paths0 = g.enemies.raidPaths;
    const e = g.enemies.spawn('wolf', hx, hz - 22);
    e.raid = true; e.aggro = true; e.home.set(hx, 0, hz); e.setState('chase');
    __step(3);
    const path = e.path || [];
    const crosses = path.some((p) => Math.abs(p.z - (hz - 12)) < 0.8 && Math.abs(p.x - hx) < 9);
    __step(12);
    const reached = Math.hypot(e.body.pos.x - hx, e.body.pos.z - hz) < 12;
    g.enemies.despawn(e);
    return { hall, founded: g.state.settlement.founded, paths: g.enemies.raidPaths - paths0, waypoints: path.length, crosses, reached };
  });
  await G(() => { const g = window.__eternum; g.openMenu('map'); });
  await G(() => { const b = [...document.querySelectorAll('.map-tools .btn')].find((x) => x.textContent.includes('🗺')); if (b) b.click(); });
  await shot('p6_sea_chart');
  await G(() => window.__eternum.closePanel());

  // ── 10. persistence
  const snap = () => G(() => { const g = window.__eternum; const st = g.state; const b = st.boat; return { boat: b ? [Math.round(b.x), Math.round(b.z)] : null, rep: st.faction.rep, visits: st.faction.visits, titan: st.counters['boss:titan'] || 0, weather: g.weather.kind, docks: [...g.building.pieces.values()].filter((p) => p.def.id === 'dock').length, explored: g.discovery.explored.reduce((a, v) => a + v, 0) }; });
  await G(() => { const g = window.__eternum; g.weather.set('fog', 500); g.saveGame(true); });
  const before = await snap();
  await page.reload();
  await page.waitForSelector('text=이어하기', { timeout: 120000 });
  await page.click('text=이어하기');
  await sleep(1500);
  await inject();
  const after = await snap();
  res.persist = { before, after, exploredKept: after.explored >= before.explored };
  delete before.explored; delete after.explored;
  console.log(JSON.stringify(res, null, 1));
  console.log('LOGS (' + logs.length + '):\n' + logs.slice(0, 10).join('\n'));
  const r = res;
  const ember = ['magma_slime', 'ash_wolf', 'lava_golem', 'fire_wisp'];
  const checks = {
    'ember isle exists across the sea (crater, biomes)': r.world.ember === 'ember' && r.world.sea === null && r.world.home === 'home' && r.world.crater === 44 && r.world.seaDepth === -13 && r.world.biomes[0] === 6 && r.world.biomes[1] === 7,
    'island resources: iron, charred trees, obsidian, ember bushes': r.world.iron > 20 && r.world.charred > 20 && r.world.obsidian > 0 && r.world.emberbush > 0 && r.world.homeNodes > 1000,
    'sea chart map and fog grid cover both islands': r.world.mapW === 1024 && r.world.explore === 272 * 272,
    'old saves keep their explored fog': r.fog.ok,
    'the open sea cannot be swum': r.deepSea.swimming && r.deepSea.staminaLost >= 90 && r.deepSea.hpLost > 0,
    'dock: built on the shore, refused inland': r.dock.ok && r.dock.inland.includes('물') && r.dock.questDock,
    'boat: launched from the dock, sails to the ember isle': r.sail.launched && r.sail.questSea && r.sail.travelled > 300 && r.sail.end[1] > 760,
    'step ashore on the ember isle, landing discovered': r.land.off && r.land.island === 'ember' && r.land.boatLeft && r.land.discovered && r.land.questLanding,
    'rain: wet, faster crops, grey sky': r.weather.rain.raining && r.weather.rain.wet && r.weather.rain.growth === 1.5 && r.weather.rain.overcast > 0.3,
    'fog hides you and shortens the view': r.weather.fog.aggro < 0.75 && r.weather.fog.far < r.weather.clearFar * 0.6,
    'storm: lightning and thunder, slower boat': r.weather.storm.thunder >= 2 && r.weather.storm.sail < 1,
    'ember monsters spawn on the isle': r.spawns.count >= 2 && r.spawns.ids.every((id) => ember.includes(id)),
    'iron: mine ore, charcoal, smelt, forge a stronger sword': r.iron.ore > 0 && r.iron.coal > 0 && r.iron.made === 4 && r.iron.sword === 1 && r.iron.after > r.iron.before && r.iron.questIron,
    'lava burns; fire ward halves it': r.lava.burn > 25 && r.lava.warded > 0 && r.lava.warded < r.lava.burn * 0.7,
    'three braziers wake the lava titan; its core drops': !r.titan.sealEarly && r.titan.lit === 3 && r.titan.id === 'lava_titan' && r.titan.hp > 1000 && r.titan.dead && r.titan.counter === 1 && r.titan.cores === 1 && r.titan.relit === 0 && r.titan.questTitan,
    'merchant ship docks; trading raises reputation': r.ship.arrived && r.ship.docked && r.ship.canTrade && r.ship.bought && !r.ship.lockedBoat && r.ship.sold && r.ship.rep > 0 && r.ship.questTrade && r.ship.panel === 'ship',
    'the ship leaves in the evening': r.leave.leaving === 'leaving' && r.leave.after === 'away' && r.leave.next > 0,
    'raiders path around a wall to the town hall': r.raidPath.founded && r.raidPath.paths > 0 && r.raidPath.waypoints >= 2 && !r.raidPath.crosses && r.raidPath.reached,
    'boat, reputation, titan, weather persist': JSON.stringify(r.persist.before) === JSON.stringify(r.persist.after) && r.persist.exploredKept,
    'no runtime errors': logs.length === 0,
  };
  let failed = 0;
  for (const [name, ok] of Object.entries(checks)) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
