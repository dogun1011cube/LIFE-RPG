/**
 * PHASE 6 polish checks: data-driven dungeons (the lava cave: valves, lava river, collapsed wall, boss, chests,
 * exit, saving inside), the crypt still working, ember-isle weather (ash / eruptions), wild enemies routing
 * around walls, tuned ember enemies.
 * Usage: npm run dev (another terminal), then node tests/phase6b.cjs [url] [screenshotDir]
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
    window.__inv = (id) => window.__eternum.state.player.inventory.filter(Boolean).filter((s) => s.id === id).reduce((a, s) => a + s.qty, 0);
    window.__face = (x, z) => { const g = window.__eternum; const p = g.player.body.pos; g.player.yaw = Math.atan2(x - p.x, z - p.z); g.cameraRig.yaw = g.player.yaw; };
    window.__dit = (id) => window.__eternum.dungeon.interactables.find((i) => i.id === id);
    window.__go = (it, dx = 0, dz = 0) => { const g = window.__eternum; g.player.body.pos.set(it.pos.x + dx, it.pos.y - 1 + 0.05, it.pos.z + dz); g.player.body.vel.set(0, 0, 0); __step(0.3); };
  });
  await inject();
  const G = (fn, arg) => page.evaluate(fn, arg);
  const res = {};

  res.setup = await G(() => {
    const g = window.__eternum; g.input.lockFailures = 2; g.weather.set('clear', 1e9);
    g.state.quests.completed.push('q_survive', 'q_tools', 'q_hunt', 'q_workbench', 'q_shelter', 'q_copper', 'w_sea', 'w_landing');
    g.quests.refreshAvailable(true);
    g.state.player.level = 12; g.state.player.attrs.str = 10; g.state.player.attrs.vit = 10; g.refreshUnlocks(true);
    g.debug.give('iron_sword', 1); g.equipFromSlot(g.state.player.inventory.findIndex((s) => s && s.id === 'iron_sword'));
    g.debug.heal();
    const loc = { x: 150, z: 990 };
    g.debug.teleport(loc.x, loc.z + 4); __step(1.5);
    const door = g.landmarks.interactables.find((i) => i.id === 'cave_door');
    return { door: !!door, caveQuest: g.state.quests.active.some((q) => q.id === 'w_cave'), discovered: g.state.discovered.includes('ember_cave'), dungeons: Object.keys(g.dungeons) };
  });

  // ── 1. into the lava cave
  res.enter = await G(() => {
    const g = window.__eternum; const door = g.landmarks.interactables.find((i) => i.id === 'cave_door');
    g.landmarkInteract(door); __step(1);
    const D = g.dungeon;
    return { inDungeon: g.inDungeon, id: D.def.id, region: g.discovery.regionName(), enemies: [...new Set(g.enemies.list.map((e) => e.def.id))], interior: g.env.interior, gate: D.gateOpen, valves: D.interactables.filter((i) => i.kind === 'valve').length };
  });
  res.valves = await G(() => {
    const g = window.__eternum; const D = g.dungeon; const p = g.state.player;
    for (const e of g.enemies.list) { e.hp = 0; g.enemies.onDamaged(e, 999, e.body.pos.clone(), true); } __step(1.5);
    const turn = (id, dx) => { __go(__dit(id), dx, 0); const label = g.ui.prompt && g.ui.prompt.label; g.ui.prompt && g.ui.prompt.run(); __step(0.3); return label; };
    const l1 = turn('valve_w', 1.3); const l2 = turn('valve_e', -1.3);
    const partial = { pulled: D.pulled.length, gate: D.gateOpen };
    // the river still burns: wade into it
    const river = D.w(0, 31);
    g.player.body.pos.set(river.x, river.y + 0.05, river.z); g.player.body.vel.set(0, 0, 0);
    p.hp = 300; __step(0.2); const h0 = p.hp; __step(1.5); const burned = Math.round(h0 - p.hp);
    const onLava = D.lavaAt(g.player.body.pos);
    g.debug.heal();
    const l3 = turn('valve_n', 0); // the last one is across the river (approach from the far side)
    __step(2.5);
    const river2 = D.w(0, 31);
    return { l1, l2, l3, partial, burned, onLava, gate: D.gateOpen, cooled: !D.lavaAt(river2), counter: g.state.counters['cave:gate'] || 0 };
  });
  await shot('p6b_cave_hall');
  res.hidden = await G(() => {
    const g = window.__eternum; const D = g.dungeon; const w = D.crackWallPos();
    g.player.body.pos.set(w.x - 1.6, D.entryPos.y + 0.05, w.z); g.player.body.vel.set(0, 0, 0); __face(w.x, w.z); __step(0.3);
    for (let i = 0; i < 6 && !D.wallBroken; i++) { g.input.simulateMouse(0, true); __step(1 / 30); g.input.simulateMouse(0, false); __step(0.7); }
    const broken = D.wallBroken;
    const ch = __dit('lchest_hidden');
    g.player.body.pos.set(ch.pos.x - 1.4, D.entryPos.y + 0.05, ch.pos.z); __step(0.4);
    const ingots0 = __inv('iron_ingot');
    g.ui.prompt && g.ui.prompt.run(); __step(0.3);
    return { broken, gotIngots: __inv('iron_ingot') - ingots0 };
  });
  res.boss = await G(() => {
    const g = window.__eternum; const D = g.dungeon; const O = D.entryPos;
    g.player.body.pos.set(O.x, O.y + 0.05, O.z + 50); g.player.body.vel.set(0, 0, 0); __step(0.6);
    const boss = g.enemies.boss; const id = boss && boss.def.id; const hp = boss ? boss.maxHp : 0;
    const sealed = (() => { const ch = __dit('lchest_boss'); const p0 = g.player.body.pos.clone(); __go(ch, 0, -1.4); g.ui.prompt && g.ui.prompt.run(); const opened = g.state.openedChests.includes('lchest_boss'); g.player.body.pos.copy(p0); return !opened; })();
    g.player.iframes = 1e9;
    __step(4);
    if (boss) { boss.hp = 5; g.damageEnemyBy(boss, 300, new boss.body.pos.constructor(0, 0, 1)); }
    __step(2);
    g.player.iframes = 0;
    const minions = g.enemies.list.filter((e) => e.def.id === 'cinder_skeleton' && e.state !== 'dead' && !e.removed).length;
    const ch = __dit('lchest_boss'); __go(ch, 0, -1.4); g.ui.prompt && g.ui.prompt.run(); __step(0.3);
    return { id, hp, sealed, defeated: D.bossDefeated, minions, ring: __inv('sentinel_ring'), quest: g.state.quests.completed.includes('w_cave'), kills: g.state.counters['kill:obsidian_sentinel'] || 0 };
  });
  if (SHOTS) {
    await G(() => { const g = window.__eternum; const D = g.dungeon; const O = D.entryPos; D.bossSpawned = false; D.bossDefeated = false; g.player.body.pos.set(O.x - 3, O.y + 0.05, O.z + 47); g.player.yaw = 0; g.cameraRig.yaw = 0.3; g.cameraRig.pitch = 0.25; g.cameraRig.targetDistance = 9; g.player.iframes = 1e9; __step(0.3); g.player.body.pos.set(O.x - 3, O.y + 0.05, O.z + 52); __step(4); });
    await shot('p6b_sentinel');
    await G(() => { const g = window.__eternum; if (g.enemies.boss) g.enemies.despawn(g.enemies.boss); for (const e of [...g.enemies.list]) g.enemies.despawn(e); g.player.iframes = 0; g.dungeon.bossDefeated = true; __step(0.3); });
  }
  res.saveInside = await G(() => { const g = window.__eternum; g.saveGame(true); return { inDungeon: g.inDungeon, id: g.activeDungeon }; });
  await page.reload();
  await page.waitForSelector('text=이어하기', { timeout: 120000 });
  await page.click('text=이어하기');
  await sleep(1500);
  await inject();
  res.loaded = await G(() => { const g = window.__eternum; const p = g.player.body.pos; const ext = g.dungeonExterior('lava_cave'); return { inDungeon: g.inDungeon, nearCave: Math.hypot(p.x - ext.x, p.z - ext.z) < 2.5, island: g.terrain.islandId(p.x, p.z) }; });
  res.exit = await G(() => {
    const g = window.__eternum; g.input.lockFailures = 2; g.weather.set('clear', 1e9);
    g.enterDungeon('lava_cave'); __step(0.5);
    const inside = g.inDungeon && g.dungeon.def.id === 'lava_cave';
    __go(__dit('lportal_entry'), 0, 1.5);
    const label = g.ui.prompt && g.ui.prompt.label; g.ui.prompt && g.ui.prompt.run(); __step(0.5);
    const p = g.player.body.pos.clone();
    // the crypt is still its old self
    g.enterDungeon('crypt'); __step(0.5);
    const crypt = { id: g.dungeon.def.id, levers: g.dungeon.interactables.filter((i) => i.kind === 'lever').length, region: g.discovery.regionName() };
    g.exitDungeon(); __step(0.5);
    const q = g.player.body.pos; const ce = g.cryptExterior();
    return { inside, label, outside: !g.inDungeon, island: g.terrain.islandId(p.x, p.z), crypt, cryptExit: Math.hypot(q.x - ce.x, q.z - ce.z) < 2.5 };
  });

  // ── 2. ember weather
  res.emberWeather = await G(() => {
    const g = window.__eternum; const W = g.weather; const p = g.state.player;
    g.debug.teleport(30, 1050); __step(0.5);
    g.player.iframes = 1e9;
    W.set('rain', 1e9); __step(8);
    const ash = { name: W.info().name, wet: p.buffs.some((b) => b.id === 'wet') };
    let thunder = 0; const play = g.audio.play.bind(g.audio); g.audio.play = (n, v) => { if (n === 'thunder') thunder++; return play(n, v); };
    const b0 = g.state.counters['eruption:bombs'] || 0;
    W.set('storm', 1e9); __step(30);
    g.audio.play = play;
    const eruption = { name: W.info().name, bombs: (g.state.counters['eruption:bombs'] || 0) - b0, thunder, tint: g.env.ashTint };
    g.debug.teleport(0, 150); __step(0.5);
    W.set('rain', 1e9); __step(4);
    const home = { name: W.info().name, wet: p.buffs.some((b) => b.id === 'wet'), tint: g.env.ashTint };
    W.set('clear', 1e9); __step(3); g.player.iframes = 0; g.debug.heal();
    return { ash, eruption, home };
  });
  if (SHOTS) {
    await G(() => { const g = window.__eternum; g.player.iframes = 1e9; g.debug.teleport(40, 900); g.debug.setTime(0.5); g.weather.set('storm', 1e9); g.player.yaw = Math.PI; g.cameraRig.yaw = Math.PI + 0.3; g.cameraRig.pitch = 0.18; g.cameraRig.targetDistance = 11; __step(12); });
    await shot('p6b_eruption');
    await G(() => { const g = window.__eternum; g.weather.set('clear', 1e9); __step(10); g.player.iframes = 0; g.debug.heal(); });
  }

  // ── 3. wild enemies route around walls
  res.chase = await G(() => {
    const g = window.__eternum; g.enemies.clear();
    // an open spot on the home island
    const x0 = -40, z0 = 170;
    g.debug.give('stone', 99); g.debug.give('stone_brick', 60); g.refreshUnlocks(true);
    const def = g.building.available().find((b) => b.id === 'castle_wall') || g.building.available().find((b) => b.id === 'stone_wall');
    for (const n of g.resources.queryRadius(x0, z0, 22)) if (n.alive) g.resources.deplete(n, g.state.playTime + 99999, n.x, n.z);
    for (let k = -4; k <= 4; k++) g.building.placeAt(def, x0 + k * 2, g.terrain.heightAt(x0 + k * 2, z0), z0, 0, true);
    __step(0.3);
    g.debug.teleport(x0, z0 + 5); g.player.iframes = 1e9; __step(0.3);
    const w = g.enemies.spawn('wolf', x0 + 1, z0 - 7);
    w.aggro = true; w.setState('chase');
    const paths0 = g.enemies.chasePaths;
    let reached = false; let t = 0;
    for (; t < 20 && !reached; t++) { __step(1); reached = Math.hypot(w.body.pos.x - g.player.body.pos.x, w.body.pos.z - g.player.body.pos.z) < 3.5; }
    g.player.iframes = 0;
    const out = { def: def.id, paths: g.enemies.chasePaths - paths0, reached, seconds: t };
    g.enemies.clear();
    return out;
  });

  // ── 4. tuned ember enemies
  res.stats = await G(() => { const g = window.__eternum; const E = (id) => { const e = g.enemies.spawn(id, 60, 900); const r = { hp: e.maxHp, dmg: e.def.damage }; g.enemies.despawn(e); return r; }; return { ash_wolf: E('ash_wolf'), lava_golem: E('lava_golem'), magma_slime: E('magma_slime') }; });

  console.log(JSON.stringify(res, null, 1));
  console.log('LOGS (' + logs.length + '):\n' + logs.slice(0, 10).join('\n'));
  const r = res;
  const checks = {
    'two data-driven dungeons; lava cave entrance on the ember isle': r.setup.door && r.setup.dungeons.includes('crypt') && r.setup.dungeons.includes('lava_cave') && r.setup.caveQuest,
    'entering the lava cave: interior, enemies, closed basalt gate': r.enter.inDungeon && r.enter.id === 'lava_cave' && r.enter.region === '용암 동굴' && r.enter.interior && !r.enter.gate && r.enter.valves === 3 && r.enter.enemies.includes('cinder_skeleton'),
    'two valves are not enough; the river burns': r.valves.l1 && r.valves.l2 && r.valves.partial.pulled === 2 && !r.valves.partial.gate && r.valves.onLava && r.valves.burned > 15,
    'the third valve cools the river and opens the gate': r.valves.l3 && r.valves.gate && r.valves.cooled && r.valves.counter === 1,
    'collapsed wall hides a chest': r.hidden.broken && r.hidden.gotIngots === 6,
    'obsidian sentinel: sealed chest, boss, ring, quest': r.boss.id === 'obsidian_sentinel' && r.boss.hp === 1400 && r.boss.sealed && r.boss.defeated && r.boss.minions === 0 && r.boss.ring === 1 && r.boss.quest,
    'saving in the cave reloads at the cave entrance': r.saveInside.inDungeon && r.saveInside.id === 'lava_cave' && !r.loaded.inDungeon && r.loaded.nearCave && r.loaded.island === 'ember',
    'cave portal leads out; the crypt still works': r.exit.inside && r.exit.outside && r.exit.island === 'ember' && r.exit.crypt.id === 'crypt' && r.exit.crypt.levers === 3 && r.exit.crypt.region === '잊혀진 묘소' && r.exit.cryptExit,
    'ember isle: ash instead of rain (no soaking)': r.emberWeather.ash.name === '화산재' && !r.emberWeather.ash.wet,
    'ember isle: eruptions instead of lightning': r.emberWeather.eruption.name === '화산 분출' && r.emberWeather.eruption.bombs >= 3 && r.emberWeather.eruption.thunder === 0 && r.emberWeather.eruption.tint === 1,
    'home island: rain still soaks': r.emberWeather.home.name === '비' && r.emberWeather.home.wet && r.emberWeather.home.tint === 0,
    'wild enemies path around walls': r.chase.paths > 0 && r.chase.reached,
    'ember enemies retuned': r.stats.ash_wolf.hp === 165 && r.stats.lava_golem.hp === 420 && r.stats.magma_slime.dmg === 16,
    'no runtime errors': logs.length === 0,
  };
  let failed = 0;
  for (const [name, ok] of Object.entries(checks)) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
