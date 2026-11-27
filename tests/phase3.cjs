/**
 * Phase 3 checks: structural stability, roads, material cycling, move, blueprints, fortress, shelter/rest.
 * Usage: npm run dev (another terminal), then node tests/phase3.cjs [url] [screenshotDir]
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
    // weather is random since PHASE 6; keep these checks deterministic
    if (window.__eternum.weather) window.__eternum.weather.set('clear', 1e9);
    window.__key = (code, down) => window.__eternum.input.simulateKey(code, down);
    window.__def = (id) => window.__eternum.building.available().find((b) => b.id === id);
    window.__top = (x, z) => { const t = window.__eternum.terrain; let m = -99; for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) m = Math.max(m, t.heightAt(x + dx, z + dz)); return Math.ceil((m + 0.08) / 0.25) * 0.25; };
    /** find a flat open area of w x d metres near (x0, z0); returns its grid-aligned corner */
    window.__flat = (x0, z0, w, d, tol = 0.7) => {
      const g = window.__eternum; const t = g.terrain;
      for (let r = 0; r < 120; r += 4) for (let a = 0; a < 6.28; a += 0.4) {
        const cx = Math.round((x0 + Math.cos(a) * r) / 2) * 2; const cz = Math.round((z0 + Math.sin(a) * r) / 2) * 2;
        let lo = 99, hi = -99, ok = true;
        for (let x = cx; x <= cx + w; x += 1) for (let z = cz; z <= cz + d; z += 1) { const h = t.heightAt(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
        if (hi - lo > tol || lo < 1.5) ok = false;
        if (ok && g.colliders.query(cx - 1, cz - 1, cx + w + 1, cz + d + 1).length) ok = false;
        if (ok && g.resources.queryRadius(cx + w / 2, cz + d / 2, Math.hypot(w, d) / 2 + 2).some((n) => n.alive && n.collider && n.x > cx - 1.5 && n.x < cx + w + 1.5 && n.z > cz - 1.5 && n.z < cz + d + 1.5)) ok = false;
        if (ok) return { cx, cz };
      }
      return null;
    };
  });
  await inject();
  const G = (fn, arg) => page.evaluate(fn, arg);
  const res = {};
  res.setup = await G(() => {
    const g = window.__eternum; g.input.lockFailures = 2;
    g.state.quests.completed.push('q_survive', 'q_tools', 'q_hunt', 'q_workbench', 'q_shelter', 'q_copper'); g.quests.refreshAvailable(true);
    g.state.player.level = 6; g.refreshUnlocks(true);
    for (const [id, q] of [['wood', 600], ['stone', 600], ['fiber', 200], ['stone_brick', 200], ['copper_ingot', 20], ['berry', 20]]) g.debug.give(id, q);
    // inventory stacks cap at 99 per slot - the give overflows into pickups; collect them
    __step(3);
    return { marble: g.state.knownBuildables.includes('marble_wall'), castle: g.state.knownBuildables.includes('castle_wall'), wood: g.state.player.inventory.filter(Boolean).filter((s) => s.id === 'wood').reduce((a, s) => a + s.qty, 0) };
  });
  res.stability = await G(() => {
    const g = window.__eternum; const B = g.building;
    const spot = __flat(40, 110, 14, 4); if (!spot) return { spot: null };
    window.__spot = spot;
    const { cx, cz } = spot; const T = __top(cx + 1, cz + 1);
    g.debug.teleport(cx - 4, cz + 1); __step(0.3);
    const F = B.placeAt(__def('wood_foundation'), cx + 1, T, cz + 1, 0);
    const walls = [[cx + 1, cz, 0], [cx + 1, cz + 2, 0], [cx, cz + 1, Math.PI / 2], [cx + 2, cz + 1, Math.PI / 2]].map(([x, z, r]) => B.placeAt(__def('wood_wall'), x, T, z, r));
    const floorDef = __def('wood_floor');
    const results = [];
    for (let k = 0; k < 6; k++) {
      const x = cx + 1 + k * 2; const v = B.validate(floorDef, x, T + 2.5, cz + 1, 0);
      results.push({ k, valid: v.valid, reason: v.reason, stab: +B.ghostStability.toFixed(2) });
      if (v.valid) B.placeAt(floorDef, x, T + 2.5, cz + 1, 0);
    }
    const n0 = B.pieces.size; const pick0 = g.pickups.list.length;
    // remove the floor that links the overhang to the walls: everything beyond it must fall
    const link = [...B.pieces.values()].find((p) => p.def.id === 'wood_floor' && Math.abs(p.state.x - (cx + 3)) < 0.01);
    B.removePiece(link, true); __step(0.2);
    const n1 = B.pieces.size;
    const farFloor = [...B.pieces.values()].filter((p) => p.def.id === 'wood_floor').map((p) => +(p.state.x - cx).toFixed(1));
    return { F, walls, results, piecesBefore: n0, piecesAfter: n1, floorsLeft: farFloor, droppedLoot: g.pickups.list.length > pick0 };
  });
  res.roads = await G(() => {
    const g = window.__eternum; const B = g.building;
    const spot = __flat(-40, 120, 22, 2, 2.5); if (!spot) return { spot: null };
    const { cx, cz } = spot; let placed = 0;
    for (let k = 0; k < 10; k++) { const x = cx + 1 + k * 2; if (B.placeAt(__def(k < 5 ? 'road_dirt' : 'road_stone'), x, g.terrain.heightAt(x, cz + 1), cz + 1, 0)) placed++; }
    const onRoad = B.isRoadAt(cx + 3, cz + 1);
    const walk = (x, z) => { g.debug.teleport(x, z); g.player.yaw = Math.PI / 2; g.cameraRig.yaw = Math.PI / 2; __step(0.3); const p0 = g.player.body.pos.clone(); __key('KeyW', true); __step(1.5); __key('KeyW', false); __step(0.3); return g.player.body.pos.distanceTo(p0); };
    const dRoad = walk(cx + 1, cz + 1); const dOff = walk(cx + 1, cz + 7);
    return { placed, onRoad, dRoad: +dRoad.toFixed(2), dOff: +dOff.toFixed(2), ratio: +(dRoad / dOff).toFixed(2), questRoads: g.state.quests.completed.includes('s_roads') };
  });
  await G(() => { const g = window.__eternum; const s = window.__spot; g.debug.teleport(s.cx + 1, s.cz - 6); g.player.yaw = 0; g.cameraRig.yaw = 0.4; g.cameraRig.pitch = 0.35; g.building.setActive(true); g.building.select('wood_floor'); __step(1); });
  await shot('p3_buildmode');
  res.material = await G(() => {
    const B = window.__eternum.building; B.select('wood_wall'); const seq = [B.selected];
    for (let i = 0; i < 3; i++) { B.cycleMaterial(); seq.push(B.selected); }
    return seq;
  });
  res.move = await G(() => {
    const g = window.__eternum; const B = g.building; const n0 = B.pieces.size;
    const target = [...B.pieces.values()].find((p) => p.def.id === 'wood_floor');
    B.hoverPiece = target; B.moveHovered();
    return { removed: B.pieces.size === n0 - 1, selected: B.selected };
  });
  res.blueprint = await G(() => {
    const g = window.__eternum; const B = g.building; B.setActive(false);
    const f = [...B.pieces.values()].find((p) => p.def.id === 'wood_foundation');
    const group = B.connectedGroup(f).length;
    const bp = B.captureBlueprint('테스트 건물', f.state.id);
    const stored = JSON.parse(localStorage.getItem('eternum_blueprints_v1') || '[]').length;
    const spot = __flat(60, 80, 8, 8);
    const n0 = B.pieces.size; const wood0 = g.state.player.inventory.filter(Boolean).filter((s) => s.id === 'wood').reduce((a, s) => a + s.qty, 0);
    g.debug.teleport(spot.cx - 6, spot.cz - 6); __step(0.2);
    const ok = B.placeBlueprintAt(bp, spot.cx, spot.cz, 1);
    const n1 = B.pieces.size; const wood1 = g.state.player.inventory.filter(Boolean).filter((s) => s.id === 'wood').reduce((a, s) => a + s.qty, 0);
    const again = B.placeBlueprintAt(bp, spot.cx, spot.cz, 1); // overlapping -> must be refused
    // built-in cottage
    const cottage = B.blueprints.find((b) => b.builtin);
    const cs = __flat(-70, 90, 6, 6); window.__cottage = cs;
    g.debug.teleport(cs.cx - 5, cs.cz - 5); __step(0.2);
    const c0 = B.pieces.size; const cok = B.placeBlueprintAt(cottage, cs.cx, cs.cz, 0); const c1 = B.pieces.size;
    return { group, saved: bp ? bp.pieces.length : 0, stored, ok, added: n1 - n0, woodSpent: wood0 - wood1, overlapRefused: !again, cottage: cok, cottageAdded: c1 - c0, cottagePieces: cottage.pieces.length, questArchitect: g.state.quests.completed.includes('s_architect') };
  });
  await G(() => { const g = window.__eternum; const cs = window.__cottage; g.debug.teleport(cs.cx + 2, cs.cz - 7); g.player.yaw = 0; g.cameraRig.yaw = 0.5; g.cameraRig.pitch = 0.3; g.cameraRig.targetDistance = 9; __step(1.2); });
  await shot('p3_cottage');
  res.rested = await G(() => {
    const g = window.__eternum; const cs = window.__cottage; const B = g.building;
    const f = [...B.pieces.values()].find((p) => p.def.id === 'wood_foundation' && Math.abs(p.state.x - (cs.cx + 3)) < 0.1 && Math.abs(p.state.z - (cs.cz + 1)) < 0.1);
    g.player.body.pos.set(cs.cx + 3, f.state.y + 0.05, cs.cz + 2); g.player.body.vel.set(0, 0, 0);
    __step(8);
    return { indoors: g.shelter.indoors, heat: g.shelter.heat, comfort: g.shelter.comfort, rested: g.state.player.buffs.some((b) => b.id === 'rested'), quest: g.state.quests.completed.includes('s_rested') };
  });
  res.fortress = await G(() => {
    const g = window.__eternum; const B = g.building;
    const spot = __flat(20, 160, 16, 6, 2.5); if (!spot) return { spot: null }; const { cx, cz } = spot;
    g.debug.teleport(cx - 5, cz - 5); __step(0.2);
    let walls = 0;
    for (let k = 0; k < 6; k++) { const x = cx + 1 + k * 2; if (B.placeAt(__def('castle_wall'), x, g.terrain.heightAt(x, cz + 2), cz + 2, 0)) walls++; }
    const tx = cx + 14, tz = cz + 2; const tower = B.placeAt(__def('castle_tower'), tx, g.terrain.heightAt(tx, tz), tz, 0);
    const tp = [...B.pieces.values()].find((p) => p.def.id === 'castle_tower');
    g.player.body.pos.set(tx, tp.state.y + 8.5, tz); g.player.body.vel.set(0, 0, 0); __step(1.5);
    const standY = +(g.player.body.pos.y - tp.state.y).toFixed(2);
    const safe = B.isSafeAt(tx + 25, tz);
    const wp = [...B.pieces.values()].find((p) => p.def.id === 'castle_wall');
    g.player.body.pos.set(wp.state.x, wp.state.y + 6, wp.state.z - 0.2); __step(1.5);
    const wallTop = +(g.player.body.pos.y - wp.state.y).toFixed(2);
    window.__fort = { tx, tz, y: tp.state.y };
    return { walls, tower, standY, wallTop, safe, quest: g.state.quests.completed.includes('s_fortress') };
  });
  await G(() => { const g = window.__eternum; const f = window.__fort; g.debug.teleport(f.tx - 6, f.tz - 14); g.player.yaw = 0; g.cameraRig.yaw = -0.35; g.cameraRig.pitch = 0.22; g.cameraRig.targetDistance = 10; __step(1.2); });
  await shot('p3_fortress');
  const snap = () => G(() => { const g = window.__eternum; const B = g.building; return { pieces: B.pieces.size, roads: [...B.pieces.values()].filter((p) => p.def.shape === 'road').length, towers: [...B.pieces.values()].filter((p) => p.def.id === 'castle_tower').length }; });
  await G(() => window.__eternum.saveGame(true));
  const before = await snap();
  await page.reload();
  await page.waitForSelector('text=이어하기', { timeout: 120000 });
  await page.click('text=이어하기');
  await sleep(1500);
  await inject();
  const after = await snap();
  res.persist = { before, after, stabilityComputed: await G(() => window.__eternum.building.stability.size === window.__eternum.building.pieces.size), blueprintsAfter: await G(() => window.__eternum.building.blueprints.length) };
  console.log(JSON.stringify(res, null, 1));
  console.log('LOGS (' + logs.length + '):\n' + logs.slice(0, 10).join('\n'));
  const r = res;
  const fl = r.stability.results || [];
  const checks = {
    'new tiers unlocked by level/brick': r.setup.marble && r.setup.castle,
    'supported floors valid near support': fl.slice(0, 5).every((x) => x.valid),
    'overhang too far is unstable': fl[5] && !fl[5].valid && fl[5].reason.includes('불안정'),
    'removing support collapses overhang': r.stability.piecesAfter === r.stability.piecesBefore - 4 && r.stability.droppedLoot,
    'roads placed and detected': r.roads.placed === 10 && r.roads.onRoad,
    'roads speed up travel (~30%)': r.roads.ratio > 1.2 && r.roads.ratio < 1.45,
    'material cycling wood->stone->marble': r.material.join(',') === 'wood_wall,stone_wall,marble_wall,wood_wall',
    'move picks a piece up': r.move.removed && r.move.selected === 'wood_floor',
    'capture blueprint of connected building': r.blueprint.saved === r.blueprint.group && r.blueprint.stored === 1,
    'place blueprint (rotated) costs materials': r.blueprint.ok && r.blueprint.added === r.blueprint.saved && r.blueprint.woodSpent > 0,
    'overlapping blueprint refused': r.blueprint.overlapRefused,
    'built-in cottage places fully': r.blueprint.cottage && r.blueprint.cottageAdded === r.blueprint.cottagePieces,
    'shelter: indoors + fire -> rested': r.rested.indoors && r.rested.heat && r.rested.rested && r.rested.comfort >= 1,
    'castle walls + tower; stand on top': r.fortress.walls === 6 && r.fortress.tower && Math.abs(r.fortress.standY - 7.5) < 0.1 && Math.abs(r.fortress.wallTop - 5) < 0.1,
    'tower beacon makes a wide safe zone': r.fortress.safe,
    'phase 3 side quests complete': r.roads.questRoads && r.blueprint.questArchitect && r.rested.quest && r.fortress.quest,
    'buildings persist after reload': JSON.stringify(r.persist.before) === JSON.stringify(r.persist.after) && r.persist.stabilityComputed && r.persist.blueprintsAfter === 2,
    'no runtime errors': logs.length === 0,
  };
  let failed = 0;
  for (const [name, ok] of Object.entries(checks)) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
