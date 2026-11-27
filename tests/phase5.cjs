/**
 * Phase 5 checks: research & eras, treasury/taxes, production chain, houses, path finding (walls, doors),
 * night raids with guards and archer towers, injuries, town/city tiers, persistence.
 * Usage: npm run dev (another terminal), then node tests/phase5.cjs [url] [screenshotDir]
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
    window.__def = (id) => window.__eternum.building.available().find((b) => b.id === id);
    window.__flat = (x0, z0, w, d, tol = 2.5) => {
      const g = window.__eternum; const t = g.terrain;
      for (let r = 0; r < 260; r += 4) for (let a = 0; a < 6.28; a += 0.3) {
        const cx = Math.round((x0 + Math.cos(a) * r) / 2) * 2; const cz = Math.round((z0 + Math.sin(a) * r) / 2) * 2;
        let lo = 99, hi = -99;
        for (let x = cx; x <= cx + w; x += 2) for (let z = cz; z <= cz + d; z += 2) { const h = t.heightAt(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
        if (hi - lo > tol || lo < 1.5) continue;
        if (g.colliders.query(cx - 1, cz - 1, cx + w + 1, cz + d + 1).some((c) => !(c.owner && typeof c.owner === 'object' && 'type' in c.owner))) continue;
        for (const n of g.resources.queryRadius(cx + w / 2, cz + d / 2, Math.hypot(w, d) / 2 + 4)) if (n.alive) g.resources.deplete(n, g.state.playTime + 99999, n.x, n.z);
        return { cx, cz };
      }
      return null;
    };
    /** place a piece, paying its cost with debug items (validation optional) */
    window.__place = (id, x, z, rot = 0, validate = false) => {
      const g = window.__eternum; const d = __def(id); if (!d) return false;
      for (const c of d.cost) g.debug.give(c.item, c.qty);
      return g.building.placeAt(d, x, g.terrain.heightAt(x, z), z, rot, !validate);
    };
    window.__arrive = (n) => { const g = window.__eternum; let k = 0; for (let i = 0; i < n; i++) if (g.settlement.forceArrival()) k++; return k; };
    window.__free = (job) => { const g = window.__eternum; return g.state.settlement.villagers.find((v) => !v.job || v.job === 'farmer'); };
    window.__job = (job) => { const g = window.__eternum; const v = g.state.settlement.villagers.find((x) => !x.job) ?? g.state.settlement.villagers.find((x) => x.job === 'farmer' || x.job === 'woodcutter'); return v ? g.settlement.assignJob(v.id, job) : false; };
    window.__wh = (id, n) => { const g = window.__eternum; g.state.settlement.warehouse[id] = (g.state.settlement.warehouse[id] ?? 0) + n; };
  });
  await inject();
  const G = (fn, arg) => page.evaluate(fn, arg);
  const res = {};

  // ── 1. a working village (tier 2) to start from
  res.village = await G(() => {
    const g = window.__eternum; g.input.lockFailures = 2;
    g.state.quests.completed.push('q_survive', 'q_tools', 'q_hunt', 'q_workbench', 'q_shelter', 'q_copper', 'q_ancients', 'q_sigil', 'q_warden'); g.quests.refreshAvailable(true);
    g.state.player.level = 10; g.refreshUnlocks(true);
    __step(1);
    const spot = __flat(30, 140, 44, 40, 3.2); window.__v = spot;
    if (!spot) return { spot: null };
    const { cx, cz } = spot; window.__hall = { x: cx + 22, z: cz + 20 };
    g.debug.teleport(cx - 4, cz - 4); __step(0.3);
    const hall = __place('town_hall', cx + 22, cz + 20, 0, true);
    __step(3.5);
    const cats1 = g.building.categoriesAvailable();
    __place('warehouse', cx + 14, cz + 26, 0);
    for (let k = 0; k < 5; k++) __place('bed', cx + 30 + k * 1.5, cz + 28, 0);
    __place('farm_plot', cx + 8, cz + 32, 0); __place('farm_plot', cx + 10, cz + 32, 0);
    __place('lumber_camp', cx + 34, cz + 36, 0);
    __place('mine_shaft', cx + 16, cz + 38, Math.PI);
    __place('well', cx + 22, cz + 30, 0);
    __wh('bread', 80);
    __step(3.5);
    __arrive(5); g.settlement.autoAssign(); __step(3.5);
    return { hall, founded: g.state.settlement.founded, tier: g.state.settlement.tier, pop: g.state.settlement.villagers.length, villageCategory: cats1.includes('village'), deskKnown: g.state.knownBuildables.includes('research_desk') };
  });

  // ── 2. research: desk + scholar + bookshelves
  res.research = await G(() => {
    const g = window.__eternum; const { cx, cz } = window.__v;
    __place('research_desk', cx + 28, cz + 12, 0);
    __place('bookshelf', cx + 30.5, cz + 11, 0); __place('bookshelf', cx + 25.5, cz + 11, 0);
    __place('bed', cx + 37.5, cz + 28, 0); __step(3.5); __arrive(1);
    const scholar = __job('scholar');
    const sv = g.state.settlement.villagers.find((x) => x.job === 'scholar');
    g.debug.setTime(0.36);
    for (let i = 0; i < 60 && !g.villagers.isWorking(sv.id); i++) __step(1);
    const working = g.villagers.isWorking(sv.id);
    g.state.settlement.productionTimer = 0; sv.happiness = 70;
    const p0 = g.civ.points(); __step(41); // two production ticks
    const perTwoTicks = g.civ.points() - p0;
    const points = g.civ.points();
    // speed things up for the rest of the test
    g.debug.research(2000); g.debug.give('coin', 400); g.settlement.depositCoins(400);
    const order = ['t_carpentry', 't_housing', 't_currency', 't_agriculture', 't_writing'];
    const bronzeEarly = g.civ.researchTech('t_bronze_age'); // needs 3 era-1 techs first
    const done = order.map((id) => g.civ.researchTech(id));
    const tooEarly = g.civ.researchTech('t_smelting'); // needs the bronze age
    const bronze = g.civ.researchTech('t_bronze_age');
    __step(3.5);
    return { scholar, working, perTwoTicks, points, done, bronze, era: g.civ.era(), tooEarly, cats: g.building.categoriesAvailable().includes('city'), sawmill: g.state.knownBuildables.includes('sawmill'), house: g.state.knownBuildables.includes('house_wood'), plankRecipe: g.state.knownRecipes.includes('r_plank'), questResearch: g.state.quests.completed.includes('c_research'), questBronze: g.state.quests.completed.includes('c_bronze'), bronzeEarly };
  });

  // ── 3. houses: more homes, villagers prefer them, go inside at night
  res.houses = await G(() => {
    const g = window.__eternum; const { cx, cz } = window.__v; const S = g.settlement;
    const cap0 = S.homeSlots().length;
    const a = __place('house_wood', cx + 6, cz + 12, 0); const b = __place('house_wood', cx + 12, cz + 12, 0);
    __step(3.5);
    const cap1 = S.homeSlots().length;
    const arrived = __arrive(4); __step(3.5);
    const inHouses = g.state.settlement.villagers.filter((v) => v.homeId !== null && (g.building.pieces.get(v.homeId)?.def.housing ?? 1) > 1).length;
    return { a, b, cap0, cap1, arrived, inHouses };
  });

  // ── 4. production chain: sawmill -> smelter -> smithy, tool kits boost workers
  res.chain = await G(() => {
    const g = window.__eternum; const { cx, cz } = window.__v; const S = g.settlement;
    const t = ['t_smelting', 't_toolmaking'].map((id) => g.civ.researchTech(id));
    __step(3.5);
    __place('sawmill', cx + 36, cz + 4, 0); __place('smelter', cx + 4, cz + 4, 0); __place('smithy', cx + 14, cz + 4, 0);
    for (let k = 0; k < 3; k++) __place('bed', cx + 30 + k * 1.5, cz + 31, 0);
    __step(3.5); __arrive(3);
    const jobs = [__job('sawyer'), __job('smelter'), __job('smith')];
    __wh('wood', 60); __wh('copper_ore', 20);
    const kits0 = g.state.counters['village:tool_kit'] ?? 0;
    g.debug.setTime(0.36); for (let i = 0; i < 90; i++) __step(1);
    const wh = g.state.settlement.warehouse;
    return { t, jobs, plank: wh.plank ?? 0, ingot: wh.copper_ingot ?? 0, kitsMade: (g.state.counters['village:tool_kit'] ?? 0) - kits0, kitsLeft: wh.tool_kit ?? 0, wear: g.state.settlement.toolWear, questChain: g.state.quests.completed.includes('c_chain') };
  });

  // ── 5. taxes and wages
  res.tax = await G(() => {
    const g = window.__eternum; const S = g.settlement; const st = g.state.settlement;
    const ok = S.setTaxLevel(2);
    const t0 = st.treasury; const expect = S.taxIncome();
    g.env.day += 1; __step(1);
    return { ok, expect, gained: st.treasury - t0 - 0, collected: g.state.counters['tax:collected'] ?? 0, pop: st.villagers.length };
  });

  // ── 6. path finding around a wall and through a cottage door
  res.path = await G(() => {
    const g = window.__eternum; const { cx, cz } = window.__v; const nav = g.nav;
    // a 12 m stone wall between two points
    for (let k = 0; k < 6; k++) __place('castle_wall', cx + 2 + k * 2, cz + 22, 0);
    nav.ensure();
    const ms = Math.round(nav.lastBuildMs);
    const A = new (g.player.body.pos.constructor)(cx + 7, 0, cz + 18); const B = new (g.player.body.pos.constructor)(cx + 7, 0, cz + 26);
    const path = nav.findPath(A, B) || [];
    let len = 0; let prev = A; for (const p of path) { len += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; }
    const crossesWall = path.some((p) => Math.abs(p.z - (cz + 22)) < 0.8 && p.x > cx + 1 && p.x < cx + 13);
    return { ms, cells: nav.n * nav.n, waypoints: path.length, len: +len.toFixed(1), straight: 8, crossesWall };
  });
  res.door = await G(() => {
    const g = window.__eternum; const { cx, cz } = window.__v; const b = g.building;
    const bp = b.blueprints.find((x) => x.id === 'builtin_cottage');
    for (const c of b.blueprintCostOf(bp)) g.debug.give(c.item, c.qty);
    const ok = b.placeBlueprintAt(bp, cx + 32, cz + 18, 0);
    __step(3.5);
    // the cottage bed becomes the home of one villager
    const bed = [...b.pieces.values()].filter((p) => p.def.id === 'bed').sort((p, q) => Math.hypot(p.state.x - cx - 34, p.state.z - cz - 20) - Math.hypot(q.state.x - cx - 34, q.state.z - cz - 20))[0];
    const v = g.state.settlement.villagers.find((x) => x.homeId === bed.state.id) ?? g.state.settlement.villagers.find((x) => (g.building.pieces.get(x.homeId)?.def.housing ?? 1) === 1);
    const other = g.state.settlement.villagers.find((x) => x.homeId === bed.state.id);
    if (other && other !== v) other.homeId = null;
    v.homeId = bed.state.id; v.homeSlot = 0;
    // start them outside the cottage, in front of the door side
    v.x = cx + 36; v.z = cz + 14; v.y = g.terrain.heightAt(v.x, v.z); g.villagers.sync();
    g.villagers.clear(); g.villagers.sync();
    const tp0 = g.villagers.teleports;
    g.debug.setTime(0.93); // 22:20 -> bedtime
    let asleep = false; let doorOpened = false;
    for (let i = 0; i < 60 && !asleep; i++) { __step(0.5); asleep = g.villagers.activityOf(v.id) === '자는 중'; if ([...b.pieces.values()].some((p) => p.def.id === 'wood_door' && p.state.open)) doorOpened = true; }
    return { ok, asleep, doorOpened, teleports: g.villagers.teleports - tp0, dist: +Math.hypot(v.x - bed.state.x, v.z - bed.state.z).toFixed(2) };
  });
  res.night = await G(() => {
    const g = window.__eternum;
    for (let i = 0; i < 20; i++) __step(1);
    const inside = g.state.settlement.villagers.filter((v) => g.villagers.activityOf(v.id).startsWith('집 안')).length;
    return { inside, hidden: g.villagers.group.children.filter((c) => !c.visible).length };
  });

  // ── 7. defence: militia, archer tower (era 3), a live night raid
  res.defenseSetup = await G(() => {
    const g = window.__eternum; const { cx, cz } = window.__v;
    const t = ['t_militia', 't_masonry', 't_trade', 't_kingdom', 't_fortification', 't_architecture', 't_administration'].map((id) => g.civ.researchTech(id));
    __step(3.5);
    __place('guard_post', cx + 26, cz + 36, 0); __place('guard_post', cx + 38, cz + 12, 0);
    __place('archer_tower', cx + 4, cz + 36, 0); __place('archer_tower', cx + 40, cz + 34, 0);
    for (let k = 0; k < 2; k++) __place('bed', cx + 30 + k * 1.5, cz + 34, 0);
    __step(3.5); __arrive(2);
    const guards = [__job('guard'), __job('guard')];
    return { t, era: g.civ.era(), guards, towers: g.settlement.count('archer_tower') };
  });
  res.raid = await G(() => {
    const g = window.__eternum; const H = window.__hall; const D = g.defense;
    g.debug.setTime(21.9 / 24); g.state.settlement.raid.tonight = true;
    g.debug.teleport(H.x, H.z + 8);
    for (let i = 0; i < 12 && !D.active; i++) __step(0.5);
    const started = D.active; const raiders = D.remaining();
    // move the player well away (opposite the raiders) so the town defends itself
    let sx = 0, sz = 0; for (const e of D.raiders) { sx += e.body.pos.x; sz += e.body.pos.z; }
    sx /= Math.max(1, D.raiders.size); sz /= Math.max(1, D.raiders.size);
    const dx = H.x - sx, dz = H.z - sz, dl = Math.hypot(dx, dz) || 1;
    g.debug.teleport(H.x + (dx / dl) * 95, H.z + (dz / dl) * 95);
    g.player.iframes = 999;
    __step(2);
    const sheltered = g.state.settlement.villagers.filter((v) => /대피|집 안|숨어/.test(g.villagers.activityOf(v.id))).length;
    const fighting0 = g.state.settlement.villagers.filter((v) => v.job === 'guard').map((v) => g.villagers.activityOf(v.id));
    let t = 0; let sawFight = false;
    while (D.active && t < 150) { __step(1); t++; if (g.state.settlement.villagers.some((v) => g.villagers.activityOf(v.id) === '전투 중')) sawFight = true; }
    return { started, raiders, sheltered, fighting0, sawFight, seconds: t, active: D.active, result: g.state.settlement.raid.lastResult, stolen: g.state.settlement.raid.stolen, killed: g.state.counters['kill:raider'] ?? 0, questDefend: g.state.quests.completed.includes('c_defend'), down: g.state.settlement.villagers.filter((v) => v.down).length };
  });
  res.offline = await G(() => {
    const g = window.__eternum; const H = window.__hall; const D = g.defense;
    g.debug.teleport(H.x + 260, H.z); __step(0.5);
    const ok = D.startRaid();
    return { ok, active: D.active, result: g.state.settlement.raid.lastResult, liveRaiders: D.raiders.size };
  });
  res.injury = await G(() => {
    const g = window.__eternum; const H = window.__hall;
    g.debug.teleport(H.x, H.z + 9); __step(0.5);
    g.villagers.recoverAll(); __step(0.2);
    const v = g.state.settlement.villagers.find((x) => x.job !== 'guard' && !x.down);
    if (!v) return { none: true };
    g.villagers.damage(v.id, 999, g.player.body.pos);
    const down = v.down; const act = g.villagers.activityOf(v.id);
    const revived = g.villagers.revive(v.id);
    g.villagers.damage(v.id, 999, g.player.body.pos);
    g.villagers.recoverAll();
    return { down, act, revived, afterRecover: !v.down, hp: v.hp };
  });

  // ── 8. town and city tiers
  res.city = await G(() => {
    const g = window.__eternum; const { cx, cz } = window.__v; const S = g.settlement; const st = g.state.settlement;
    S.setTaxLevel(0);
    st.charter = true;
    __place('market_stall', cx + 20, cz + 8, 0); __step(3.5);
    __job('merchant');
    // stone houses for a growing population + decoration
    const spots = [[-8, 0], [-8, 8], [-8, 16], [-8, 24], [0, 44], [10, 44], [20, 44]];
    let houses = 0; for (const [x, z] of spots) if (__place('house_stone', cx + x, cz + z, 0)) houses++;
    __place('fountain', cx + 22, cz + 4, 0);
    for (const [x, z] of [[18, 24], [26, 24], [18, 16], [26, 16]]) __place('lantern_post', cx + x, cz + z, 0);
    __place('planter', cx + 20, cz + 30, 0); __place('banner', cx + 24, cz + 30, 0);
    __wh('bread', 200);
    __step(3.5);
    const tiers = [];
    for (let i = 0; i < 12; i++) { __arrive(4); __step(3.5); tiers.push(st.tier); }
    for (let i = 0; i < 6; i++) __step(3.5);
    return { houses, pop: st.villagers.length, slots: S.homeSlots().length, happiness: Math.round(S.averageHappiness()), tier: st.tier, tiers: [...new Set(tiers)], radius: S.radius(), fountain: S.count('fountain'), questTown: g.state.quests.completed.includes('c_town'), questKingdom: g.state.quests.completed.includes('c_kingdom'), questCity: g.state.quests.completed.includes('c_city') };
  });
  res.perf = await G(() => {
    const g = window.__eternum; const H = window.__hall; g.debug.setTime(0.4); g.debug.teleport(H.x - 6, H.z + 14); __step(2);
    const t0 = performance.now(); __step(2); const ms = (performance.now() - t0) / 60;
    return { villagers: g.state.settlement.villagers.length, msPerUpdate: +ms.toFixed(1), navMs: Math.round(g.nav.lastBuildMs) };
  });
  await G(() => { const g = window.__eternum; const H = window.__hall; g.player.iframes = 0; g.debug.teleport(H.x - 4, H.z + 22); g.player.yaw = Math.PI; g.cameraRig.yaw = Math.PI + 0.5; g.cameraRig.pitch = 0.42; g.cameraRig.targetDistance = 16; __step(1.5); });
  await shot('p5_city_day');
  await G(() => window.__eternum.openMenu('civ'));
  await shot('p5_civ_tab');
  await G(() => window.__eternum.closePanel());
  await G(() => { const g = window.__eternum; const H = window.__hall; g.debug.setTime(0.94); __step(3); g.debug.teleport(H.x + 2, H.z + 16); g.player.yaw = Math.PI; g.cameraRig.yaw = Math.PI - 0.3; g.cameraRig.pitch = 0.3; g.cameraRig.targetDistance = 14; __step(1.5); });
  await shot('p5_city_night');
  await G(() => { const g = window.__eternum; const H = window.__hall; g.state.settlement.raid.tonight = false; g.defense.startRaid(true); __step(4); let best = null; for (const e of g.defense.raiders) best = e; if (best) { g.debug.teleport(best.body.pos.x * 0.5 + H.x * 0.5, best.body.pos.z * 0.5 + H.z * 0.5); } g.player.iframes = 999; __step(6); });
  await shot('p5_raid');
  await G(() => { const g = window.__eternum; for (const e of [...g.defense.raiders]) g.enemies.despawn(e); g.defense.raiders.clear(); g.state.settlement.raid.active = false; g.player.iframes = 0; __step(0.5); });

  // ── 9. persistence
  const snap = () => G(() => { const g = window.__eternum; const st = g.state.settlement; return { tier: st.tier, era: g.civ.era(), techs: st.research.done.length, points: Math.floor(st.research.points), treasury: st.treasury, tax: st.taxLevel, pop: st.villagers.length, inHouse: st.villagers.filter((v) => (g.building.pieces.get(v.homeId)?.def.housing ?? 1) > 1).length, repelled: st.raid.repelled }; });
  await G(() => window.__eternum.saveGame(true));
  const before = await snap();
  await page.reload();
  await page.waitForSelector('text=이어하기', { timeout: 120000 });
  await page.click('text=이어하기');
  await sleep(1500);
  await inject();
  const after = await snap();
  res.persist = { before, after };
  console.log(JSON.stringify(res, null, 1));
  console.log('LOGS (' + logs.length + '):\n' + logs.slice(0, 10).join('\n'));
  const r = res;
  const checks = {
    'village category visible in the build menu (bug fix)': r.village.founded && r.village.tier === 2 && r.village.villageCategory && r.village.deskKnown,
    'scholars gather research points (bookshelves help)': r.research.scholar && r.research.working && r.research.perTwoTicks >= 8,
    'techs researched, bronze age reached': !r.research.bronzeEarly && !r.research.tooEarly && r.research.done.every(Boolean) && r.research.bronze && r.research.era === 2 && r.research.questResearch && r.research.questBronze,
    'techs unlock buildings / recipes, city category': r.research.cats && r.research.sawmill && r.research.house && r.research.plankRecipe,
    'houses add homes; villagers move in': r.houses.a && r.houses.b && r.houses.cap1 === r.houses.cap0 + 4 && r.houses.inHouses >= 3,
    'production chain: planks, ingots, tool kits': r.chain.t.every(Boolean) && r.chain.jobs.every(Boolean) && r.chain.plank > 0 && r.chain.ingot > 0 && r.chain.kitsMade > 0 && r.chain.questChain,
    'taxes fill the treasury': r.tax.ok && r.tax.expect > 0 && r.tax.collected >= r.tax.expect,
    'A* path goes around a wall': r.path.waypoints >= 2 && !r.path.crossesWall && r.path.len > r.path.straight,
    'villager walks through a door to a bed inside a cottage': r.door.ok && r.door.asleep && r.door.doorOpened && r.door.teleports === 0,
    'villagers with houses go inside at night': r.night.inside >= 3,
    'era 3 techs, guards and towers set up': r.defenseSetup.t.every(Boolean) && r.defenseSetup.era === 3 && r.defenseSetup.guards.every(Boolean) && r.defenseSetup.towers === 2,
    'night raid: villagers shelter, guards and towers repel it': r.raid.started && r.raid.raiders >= 4 && r.raid.sheltered >= 3 && r.raid.sawFight && !r.raid.active && r.raid.result === 'repelled' && r.raid.questDefend,
    'raid while away is resolved off-screen': r.offline.ok && !r.offline.active && r.offline.liveRaiders === 0 && !!r.offline.result,
    'villagers can be knocked out, helped up, recover at dawn': r.injury.down && r.injury.revived && r.injury.afterRecover,
    'town grows to 소도시 and 도시 (radius 75m)': r.city.tier === 5 && r.city.radius === 75 && r.city.questTown && r.city.questKingdom && r.city.questCity,
    'civilisation persists after reload': JSON.stringify(r.persist.before) === JSON.stringify(r.persist.after),
    'no runtime errors': logs.length === 0,
  };
  let failed = 0;
  for (const [name, ok] of Object.entries(checks)) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
