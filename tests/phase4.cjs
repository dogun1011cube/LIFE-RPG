/**
 * Phase 4 checks: settlement founding, villagers (arrival, homes, jobs, daily AI), production,
 * warehouse, food upkeep, tiers, market, persistence.
 * Usage: npm run dev (another terminal), then node tests/phase4.cjs [url] [screenshotDir]
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
    window.__inv = (id) => window.__eternum.state.player.inventory.filter(Boolean).filter((s) => s.id === id).reduce((a, s) => a + s.qty, 0);
    /** a reasonably flat area away from ruins; trees/rocks inside are cleared (as a player would chop them) */
    window.__flat = (x0, z0, w, d, tol = 2.5) => {
      const g = window.__eternum; const t = g.terrain;
      for (let r = 0; r < 200; r += 4) for (let a = 0; a < 6.28; a += 0.35) {
        const cx = Math.round((x0 + Math.cos(a) * r) / 2) * 2; const cz = Math.round((z0 + Math.sin(a) * r) / 2) * 2;
        let lo = 99, hi = -99;
        for (let x = cx; x <= cx + w; x += 2) for (let z = cz; z <= cz + d; z += 2) { const h = t.heightAt(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
        if (hi - lo > tol || lo < 1.5) continue;
        if (g.colliders.query(cx - 1, cz - 1, cx + w + 1, cz + d + 1).some((c) => !(c.owner && typeof c.owner === 'object' && 'type' in c.owner))) continue;
        for (const n of g.resources.queryRadius(cx + w / 2, cz + d / 2, Math.hypot(w, d) / 2 + 3)) if (n.alive) g.resources.deplete(n, g.state.playTime + 99999, n.x, n.z);
        return { cx, cz };
      }
      return null;
    };
    window.__place = (id, x, z, rot = 0) => { const g = window.__eternum; return g.building.placeAt(__def(id), x, g.terrain.heightAt(x, z), z, rot); };
  });
  await inject();
  const G = (fn, arg) => page.evaluate(fn, arg);
  const res = {};
  res.found = await G(() => {
    const g = window.__eternum; g.input.lockFailures = 2;
    g.state.quests.completed.push('q_survive', 'q_tools', 'q_hunt', 'q_workbench', 'q_shelter'); g.quests.refreshAvailable(true);
    g.state.player.level = 6; g.refreshUnlocks(true);
    for (const [id, q] of [['wood', 99], ['wood', 99], ['wood', 99], ['stone', 99], ['stone', 99], ['fiber', 99], ['copper_ingot', 10], ['berry', 40]]) g.debug.give(id, q);
    __step(2);
    const spot = __flat(10, 120, 28, 24); window.__v = spot;
    if (!spot) return { spot: null };
    const { cx, cz } = spot;
    g.debug.teleport(cx - 6, cz - 6); __step(0.3);
    const knownHall = g.state.knownBuildables.includes('town_hall');
    const hall = __place('town_hall', cx + 14, cz + 12, 0);
    __step(4);
    const st = g.state.settlement;
    return { knownHall, hall, founded: st.founded, tier: st.tier, farmKnown: g.state.knownBuildables.includes('farm_plot'), questFound: g.state.quests.completed.includes('v_found'), secondHall: g.building.validate(__def('town_hall'), cx + 2, g.terrain.heightAt(cx + 2, cz + 2), cz + 2, 0).reason };
  });
  res.build = await G(() => {
    const g = window.__eternum; const { cx, cz } = window.__v; const r = [];
    r.push(__place('warehouse', cx + 6, cz + 4, 0));
    for (let k = 0; k < 4; k++) r.push(__place('bed', cx + 20 + k * 1.5, cz + 4, 0));
    r.push(__place('farm_plot', cx + 3, cz + 15, 0));
    r.push(__place('farm_plot', cx + 5, cz + 15, 0));
    r.push(__place('lumber_camp', cx + 22, cz + 18, 0));
    r.push(__place('mine_shaft', cx + 6, cz + 20, Math.PI));
    r.push(__place('well', cx + 14, cz + 18, 0));
    const outside = g.building.validate(__def('farm_plot'), cx + 70, g.terrain.heightAt(cx + 70, cz), cz, 0).reason;
    const deposited = g.settlement.depositFood();
    __step(1);
    return { placed: r, beds: g.settlement.beds().length, capacity: g.settlement.capacity(), food: g.settlement.foodStock(), deposited, outside };
  });
  res.arrival = await G(() => {
    const g = window.__eternum; g.debug.setTime(0.4); __step(42);
    const natural = g.state.settlement.villagers.length;
    while (g.settlement.forceArrival()) {}
    __step(1);
    return { natural, pop: g.state.settlement.villagers.length, agents: g.villagers.group.children.length, homes: g.state.settlement.villagers.filter((v) => v.homeId !== null).length, questFirst: g.state.quests.completed.includes('v_first') };
  });
  res.jobs = await G(() => {
    const g = window.__eternum; const n = g.settlement.autoAssign(); __step(3.5);
    return { assigned: n, employed: g.settlement.employedCount(), jobs: g.state.settlement.villagers.map((v) => v.job).join(','), questJobs: g.state.quests.completed.includes('v_jobs') };
  });
  res.work = await G(() => {
    const g = window.__eternum; g.debug.setTime(0.36); // ~08:40
    for (let i = 0; i < 30; i++) __step(1);
    const working = g.state.settlement.villagers.filter((v) => g.villagers.isWorking(v.id)).length;
    const wh0 = { ...g.state.settlement.warehouse };
    __step(45);
    const wh = g.state.settlement.warehouse;
    const plots = [...g.building.pieces.values()].filter((p) => p.def.id === 'farm_plot').map((p) => +(p.state.growth ?? 0).toFixed(2));
    return { working, wood: wh.wood ?? 0, stone: wh.stone ?? 0, wheat: wh.wheat ?? 0, plots, before: wh0, tier: g.state.settlement.tier, questVillage: g.state.quests.completed.includes('v_village') };
  });
  await G(() => { const g = window.__eternum; const { cx, cz } = window.__v; g.debug.teleport(cx + 14, cz - 4); g.player.yaw = 0; g.cameraRig.yaw = 0.2; g.cameraRig.pitch = 0.32; g.cameraRig.targetDistance = 11; __step(1); });
  await shot('p4_village_day');
  res.market = await G(() => {
    const g = window.__eternum; const { cx, cz } = window.__v; const S = g.settlement;
    const known = g.state.knownBuildables.includes('market_stall');
    const stall = __place('market_stall', cx + 10, cz + 8, 0);
    __place('bed', cx + 26, cz + 4, 0); __step(3.5);
    const arrived = S.forceArrival(); __step(0.5);
    const newbie = g.state.settlement.villagers.find((v) => !v.job);
    const assigned = newbie ? S.assignJob(newbie.id, 'merchant') : false;
    const open = S.marketOpen();
    const woodSlot = g.state.player.inventory.findIndex((s) => s && s.id === 'wood');
    const coins0 = S.coins();
    S.sell(woodSlot, false); S.sell(woodSlot, false);
    const coins1 = S.coins();
    g.debug.give('coin', 20);
    const bought = S.buy('bread');
    return { known, stall, arrived, assigned, open, earned: coins1 - coins0, bought, bread: __inv('bread'), questTrade: g.state.quests.completed.includes('v_trade') };
  });
  await G(() => window.__eternum.openMenu('village'));
  await shot('p4_village_tab');
  await G(() => window.__eternum.closePanel());
  res.talk = await G(() => { const g = window.__eternum; const v = g.state.settlement.villagers[0]; g.talkTo(v.id); const panel = g.ui.panel; g.closePanel(); return { panel }; });
  res.night = await G(() => {
    const g = window.__eternum; g.debug.setTime(0.96); for (let i = 0; i < 40; i++) __step(1);
    const sleeping = g.state.settlement.villagers.filter((v) => g.villagers.activityOf(v.id) === '자는 중').length;
    return { sleeping, withHome: g.state.settlement.villagers.filter((v) => v.homeId !== null).length };
  });
  await G(() => { const g = window.__eternum; const { cx, cz } = window.__v; g.debug.teleport(cx + 22, cz - 1); g.player.yaw = 0; g.cameraRig.yaw = 0; g.cameraRig.pitch = 0.45; g.cameraRig.targetDistance = 7; __step(1); });
  await shot('p4_village_night');
  res.upkeep = await G(() => {
    const g = window.__eternum; const S = g.settlement; const food0 = S.foodStock(); const day0 = g.env.day;
    g.env.day += 1; __step(1);
    return { food0: +food0.toFixed(1), food1: +S.foodStock().toFixed(1), pop: g.state.settlement.villagers.length, fed: g.state.settlement.villagers.filter((v) => v.fed).length, happiness: Math.round(S.averageHappiness()), dayChanged: g.env.day === day0 + 1 };
  });
  const snap = () => G(() => { const g = window.__eternum; const st = g.state.settlement; return { founded: st.founded, tier: st.tier, pop: st.villagers.length, jobs: st.villagers.map((v) => v.job).sort().join(','), wh: Object.keys(st.warehouse).sort().join(',') }; });
  await G(() => window.__eternum.saveGame(true));
  const before = await snap();
  await page.reload();
  await page.waitForSelector('text=이어하기', { timeout: 120000 });
  await page.click('text=이어하기');
  await sleep(1500);
  await inject();
  const after = await snap();
  res.persist = { before, after, agents: await G(() => window.__eternum.villagers.group.children.length) };
  console.log(JSON.stringify(res, null, 1));
  console.log('LOGS (' + logs.length + '):\n' + logs.slice(0, 10).join('\n'));
  const r = res;
  const checks = {
    'town hall founds settlement (tier 1)': r.found.knownHall && r.found.hall && r.found.founded && r.found.tier === 1 && r.found.questFound,
    'only one town hall': r.found.secondHall.includes('하나만'),
    'village buildings unlocked, placed in radius': r.found.farmKnown && r.build.placed.every(Boolean) && r.build.outside.includes('반경'),
    'beds give housing, food deposited': r.build.beds === 4 && r.build.capacity === 4 && r.build.food >= 10,
    'a villager arrives on its own': r.arrival.natural >= 1,
    'villagers fill the beds, models exist': r.arrival.pop === 4 && r.arrival.agents === 4 && r.arrival.homes === 4 && r.arrival.questFirst,
    'auto-assign gives everyone a job': r.jobs.employed === 4 && r.jobs.questJobs,
    'villagers walk to work by day': r.work.working >= 3,
    'production fills the warehouse': r.work.wood >= 2 && r.work.stone >= 2,
    'settlement grows to 마을 (tier 2)': r.work.tier === 2 && r.work.questVillage,
    'market: merchant enables trading': r.market.known && r.market.stall && r.market.assigned && r.market.open && r.market.earned > 0 && r.market.bought && r.market.questTrade,
    'talking opens villager dialogue': r.talk.panel === 'villager',
    'villagers sleep in their beds at night': r.night.sleeping >= 3,
    'daily upkeep eats food': r.upkeep.dayChanged && r.upkeep.food1 < r.upkeep.food0 && r.upkeep.fed === r.upkeep.pop,
    'settlement persists after reload': JSON.stringify(r.persist.before) === JSON.stringify(r.persist.after) && r.persist.agents === r.persist.after.pop,
    'no runtime errors': logs.length === 0,
  };
  let failed = 0;
  for (const [name, ok] of Object.entries(checks)) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
