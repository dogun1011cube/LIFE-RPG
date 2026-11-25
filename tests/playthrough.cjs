/**
 * Automated playthrough check for PROJECT ETERNUM.
 * Usage:  npm run dev  (in another terminal)  then  node tests/playthrough.cjs [url]
 * Requires playwright (npm i -D playwright && npx playwright install chromium).
 * Game time is advanced deterministically via game.update(), so results do not depend on rendering speed.
 */
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !m.text().includes('GL Driver'))) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('text=새 게임', { timeout: 120000 });
  await page.evaluate(() => window.__eternum.setSetting('quality', 'low'));
  await page.click('text=새 게임');
  await page.click('text=여기서 시작');
  await sleep(1500);
  // deterministic stepping helper
  await page.evaluate(() => {
    window.__step = (sec, dt = 1 / 30) => { const g = window.__eternum; const n = Math.round(sec / dt); for (let i = 0; i < n; i++) { g.update(dt); g.input.endFrame(); } };
    window.__key = (code, down) => window.__eternum.input.simulateKey(code, down);
    window.__inv = (id) => window.__eternum.state.player.inventory.filter(Boolean).filter(s => s.id === id).reduce((a, s) => a + s.qty, 0);
    window.__near = (type) => { const g = window.__eternum; const pp = g.player.body.pos; return g.resources.nodes.filter((n) => n.alive && n.type === type).sort((a, b) => Math.hypot(a.x - pp.x, a.z - pp.z) - Math.hypot(b.x - pp.x, b.z - pp.z))[0]; };
    window.__goto = (n) => { const g = window.__eternum; g.debug.teleport(n.x - (1.1 + n.scale * 0.6), n.z); g.player.yaw = Math.PI / 2; g.cameraRig.yaw = Math.PI / 2; window.__step(0.5); };
  });
  const G = (fn, arg) => page.evaluate(fn, arg);
  const res = {};
  await G(() => window.__step(1));

  // 1) Walk 2s forward + jump + sprint
  res.walk = await G(() => {
    const g = window.__eternum; const p0 = g.player.body.pos.clone();
    __key('KeyW', true); __step(2); const d1 = g.player.body.pos.distanceTo(p0);
    __key('ShiftLeft', true); __step(1.5); __key('ShiftLeft', false); const st = Math.round(g.state.player.stamina);
    __key('Space', true); __step(0.15); const air = !g.player.body.grounded; __key('Space', false); __step(1); __key('KeyW', false); __step(0.3);
    return { walk2s: +d1.toFixed(2), staminaAfterSprint: st, jumped: air, total: +g.player.body.pos.distanceTo(p0).toFixed(2) };
  });

  // 2) Chop a full tree by hand (hold E)
  res.chop = await G(() => {
    const n = __near('oak'); __goto(n); const prompt = window.__eternum.ui.prompt?.label;
    __key('KeyE', true); __step(8); __key('KeyE', false); __step(0.5);
    return { prompt, alive: n.alive, wood: __inv('wood') };
  });
  await G(() => window.__step(0.6));
  // 3) Rock by hand, fiber, berries
  res.gather = await G(() => {
    let n = __near('rock'); __goto(n); __key('KeyE', true); __step(7); __key('KeyE', false);
    const rockAlive = n.alive;
    n = __near('fiber'); __goto(n); __key('KeyE', true); __step(0.2); __key('KeyE', false); __step(1);
    n = __near('fiber'); __goto(n); __key('KeyE', true); __step(0.2); __key('KeyE', false); __step(1);
    n = __near('bush'); __goto(n); __key('KeyE', true); __step(0.2); __key('KeyE', false); __step(1);
    __step(1.5);
    return { rockAlive, stone: __inv('stone'), fiber: __inv('fiber'), berry: __inv('berry'), quests: window.__eternum.state.quests.completed.join(',') };
  });
  // 4) Craft tools from gathered materials (top up only if short)
  res.craft = await G(() => {
    const g = window.__eternum;
    const need = { wood: 6, stone: 5, fiber: 4 };
    for (const [k, v] of Object.entries(need)) if (__inv(k) < v) g.debug.give(k, v - __inv(k));
    const a = g.craft('r_stone_axe'); const p = g.craft('r_stone_pickaxe'); __step(1.5);
    return { axe: a, pick: p, completed: g.state.quests.completed.join(','), active: g.state.quests.active.map(x => x.id).join(',') };
  });
  // 5) Chop with axe (faster) and mine copper needs pickaxe check
  res.axeChop = await G(() => {
    const n = __near('pine'); __goto(n); const w0 = __inv('wood'); const t0 = performance.now();
    __key('KeyE', true); __step(4); __key('KeyE', false); __step(0.5);
    return { alive: n.alive, gained: __inv('wood') - w0 };
  });
  // 6) Combat vs slimes (real attack input)
  res.combat = await G(() => {
    const g = window.__eternum; g.debug.teleport(20, 175); __step(0.5);
    const p = g.player.body.pos; g.player.yaw = 0; g.cameraRig.yaw = 0;
    const spawned = [g.enemies.spawn('slime', p.x, p.z + 2.4), g.enemies.spawn('slime', p.x + 1.5, p.z + 3)];
    let clicks = 0;
    for (let i = 0; i < 60 && spawned.some(e => !e.removed && e.state !== 'dead'); i++) {
      const tgt = spawned.find(e => !e.removed && e.state !== 'dead'); if (tgt) { g.cameraRig.yaw = Math.atan2(tgt.body.pos.x - p.x, tgt.body.pos.z - p.z); }
      g.input.simulateMouse(0, true); __step(0.05); g.input.simulateMouse(0, false); __step(0.35); clicks++;
      if (g.state.player.hp < 40) g.debug.heal();
    }
    __step(2.5); // let loot fly & get magnetized
    return { clicks, kills: g.state.counters['kill:slime'] ?? 0, gel: __inv('slime_gel'), hp: Math.round(g.state.player.hp), level: g.state.player.level, xp: g.state.player.xp, lockFailures: g.input.lockFailures };
  });
  // 7) Dodge iframes test vs wolf lunge
  res.dodge = await G(() => {
    const g = window.__eternum; const p = g.player.body.pos;
    const w = g.enemies.spawn('wolf', p.x, p.z + 5); w.aggro = true; w.setState('chase');
    let dodged = 0; let hurt = 0; const hp0 = g.state.player.hp;
    for (let i = 0; i < 80; i++) { if (w.state === 'windup' && w.stateTime > w.attack.windup * 0.75) { __key('KeyQ', true); __step(1/30); __key('KeyQ', false); dodged++; } __step(1 / 30); }
    return { dodgeAttempts: dodged, hpLost: Math.round(hp0 - g.state.player.hp), wolfState: w.state };
  });
  await G(() => { const g = window.__eternum; for (const e of g.enemies.list) e.hp = 0; g.enemies.clear(); g.debug.heal(); });
  // 8) Build via cursor: foundation then wall on it
  res.build = await G(() => {
    const g = window.__eternum; g.debug.give('wood', 120); g.debug.give('stone', 30); g.debug.give('fiber', 30);
    g.debug.teleport(30, 118); __step(0.5); g.player.yaw = 0; g.cameraRig.yaw = 0; g.cameraRig.pitch = 0.75;
    __key('KeyB', true); __step(1/30); __key('KeyB', false);
    g.building.select('wood_foundation'); __step(0.3);
    const pl1 = g.building.placement && { ...g.building.placement };
    g.input.simulateMouse(0, true); __step(1/30); g.input.simulateMouse(0, false); __step(0.2);
    const after1 = g.building.pieces.size;
    g.building.select('wood_wall'); __step(0.3);
    const pl2 = g.building.placement && { ...g.building.placement };
    g.input.simulateMouse(0, true); __step(1/30); g.input.simulateMouse(0, false); __step(0.2);
    const after2 = g.building.pieces.size;
    // removal with X while aiming at a piece
    const hover = g.building.hoverPiece?.def.id;
    __key('KeyX', true); __step(1/30); __key('KeyX', false); __step(0.2);
    const after3 = g.building.pieces.size;
    g.building.select('workbench'); __step(0.3);
    g.input.simulateMouse(0, true); __step(1/30); g.input.simulateMouse(0, false); __step(0.2);
    __key('KeyB', true); __step(1/30); __key('KeyB', false);
    return { pl1: pl1 && `${pl1.valid}:${pl1.reason}`, pieces1: after1, pl2: pl2 && `${pl2.valid}:${pl2.reason}`, pieces2: after2, hover, afterRemove: after3, final: g.building.pieces.size, stations: [...g.stationsNear()].join(',') };
  });
  res.swordCraft = await G(() => { const g = window.__eternum; const n = g.craft('r_stone_sword'); return { crafted: n, completed: g.state.quests.completed.join(',') }; });
  await G(() => window.__step(0.5));
  // 9) Night + bed + sleep
  res.night = await G(() => {
    const g = window.__eternum; g.debug.setTime(0.9); __step(0.5);
    const night = g.env.isNight; const day0 = g.env.day;
    const bed = g.building.available().find(b => b.id === 'bed');
    const p = g.player.body.pos; const ok = g.building.placeAt(bed, p.x + 3, g.terrain.heightAt(p.x + 3, p.z), p.z, 0);
    const piece = [...g.building.pieces.values()].find(x => x.def.id === 'bed');
    g.debug.teleport(piece.state.x - 1.3, piece.state.z); __step(0.5);
    const prompt = g.ui.prompt?.label; g.ui.prompt?.run(); __step(0.5);
    return { night, placed: ok, prompt, dayAfter: g.env.day, day0, hour: +g.env.hours.toFixed(1), spawn: !!g.state.player.spawn };
  });
  // 10) Death & respawn
  res.death = await G(() => {
    const g = window.__eternum; g.damagePlayer(9999, g.player.body.pos.clone()); __step(2);
    const panel = g.ui.panel; g.respawn(); __step(0.5);
    return { panelOnDeath: panel, aliveAfter: !g.player.dead, hp: Math.round(g.state.player.hp) };
  });
  // 11) Save -> reload -> continue
  const snap = () => G(() => { const g = window.__eternum; const s = g.state.player; return { pieces: g.building.pieces.size, items: s.inventory.filter(Boolean).map(x => x.id + x.qty).sort().join(','), equip: s.equipment.weapon, level: s.level, xp: s.xp, pos: [Math.round(s.x), Math.round(s.z)], depleted: g.resources.getDepleted().length, quests: g.state.quests.completed.length, day: g.env.day, spawn: !!s.spawn }; });
  await G(() => window.__eternum.saveGame());
  const before = await snap();
  await page.reload();
  await page.waitForSelector('text=이어하기', { timeout: 120000 });
  await page.click('text=이어하기');
  await sleep(1500);
  const after = await snap();
  res.persistOK = JSON.stringify(before) === JSON.stringify(after);
  res.persist = { before, after };
  console.log(JSON.stringify(res, null, 1));
  console.log('LOGS (' + logs.length + '):\n' + logs.slice(0, 20).join('\n'));
  const checks = {
    'walks': res.walk.walk2s > 5,
    'jumps': res.walk.jumped,
    'chops a tree by hand': !res.chop.alive && res.chop.wood > 0,
    'gathers stone/fiber/berries': res.gather.stone > 0 && res.gather.fiber > 0 && res.gather.berry > 4,
    'crafts tools': res.craft.axe === 1 && res.craft.pick === 1,
    'completes quests': res.craft.completed.includes('q_tools'),
    'axe fells a tree': !res.axeChop.alive,
    'kills monsters': res.combat.kills >= 2,
    'dodge avoids damage': res.dodge.hpLost === 0,
    'cursor building works': res.build.pieces2 >= 2 && res.build.afterRemove === res.build.pieces2 - 1,
    'sleeps through the night': res.night.dayAfter === res.night.day0 + 1,
    'death and respawn': res.death.panelOnDeath === 'death' && res.death.aliveAfter,
    'progress persists after reload': res.persistOK,
    'no runtime errors': logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]')).length === 0,
  };
  let failed = 0;
  for (const [name, ok] of Object.entries(checks)) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) failed++;
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
