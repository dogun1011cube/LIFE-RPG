/**
 * Phase 2 checks: skills, mana, block/parry, accessories, the crypt dungeon, save migration.
 * Usage: npm run dev (another terminal), then node tests/phase2.cjs [url] [screenshotDir]
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
  const shot = async (name) => { if (SHOTS) { await sleep(700); await page.screenshot({ path: `${SHOTS}/${name}.png` }); } };
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
    window.__key = (code, down) => window.__eternum.input.simulateKey(code, down);
    window.__tap = (code) => { __key(code, true); __step(1 / 30); __key(code, false); __step(1 / 30); };
    window.__inv = (id) => window.__eternum.state.player.inventory.filter(Boolean).filter((s) => s.id === id).reduce((a, s) => a + s.qty, 0);
    window.__face = (x, z) => { const g = window.__eternum; const p = g.player.body.pos; const y = Math.atan2(x - p.x, z - p.z); g.player.yaw = y; g.cameraRig.yaw = y; };
  });
  await inject();
  const G = (fn, arg) => page.evaluate(fn, arg);
  const res = {};

  res.skills = await G(() => {
    const g = window.__eternum; const p = g.state.player;
    // automation cannot re-acquire pointer lock after menus close; let clicks act as attacks
    g.input.lockFailures = 2;
    // skip the early tutorial chain so the crypt side quest is active
    g.state.quests.completed.push('q_survive', 'q_tools', 'q_hunt'); g.quests.refreshAvailable(true);
    g.debug.xp(2600); __step(0.2);
    const pts = p.skillPoints; const lvl = p.level;
    const learned = ['c_whirl', 'a_bolt', 'a_mana', 'c_dash', 'a_nova'].map((id) => g.learnSkill(id));
    return { lvl, pts, learned, bar: p.skillBar.join(','), left: p.skillPoints, maxMana: g.stats.maxMana };
  });
  res.whirl = await G(() => {
    const g = window.__eternum; g.debug.teleport(20, 175); __step(0.3); const p = g.player.body.pos;
    const a = g.enemies.spawn('slime', p.x + 1.5, p.z); const b = g.enemies.spawn('slime', p.x - 1.5, p.z + 0.5);
    const slot = g.state.player.skillBar.indexOf('c_whirl'); __tap(['KeyR', 'KeyT', 'KeyG', 'KeyV'][slot]); __step(0.8);
    return { aHp: Math.round(a.hp), bHp: Math.round(b.hp), cooldown: +(g.player.cooldowns.get('c_whirl') ?? 0).toFixed(1) };
  });
  res.bolt = await G(() => {
    const g = window.__eternum; g.enemies.clear(); const p = g.player.body.pos;
    const e = g.enemies.spawn('wolf', p.x, p.z + 10); const m0 = g.state.player.mana; __face(e.body.pos.x, e.body.pos.z);
    const slot = g.state.player.skillBar.indexOf('a_bolt'); __tap(['KeyR', 'KeyT', 'KeyG', 'KeyV'][slot]); __step(1.2);
    return { wolfHp: Math.round(e.hp), max: e.maxHp, manaSpent: Math.round(m0 - g.state.player.mana) };
  });
  res.nova = await G(() => {
    const g = window.__eternum; g.enemies.clear(); g.state.player.mana = 200; const p = g.player.body.pos;
    const e = g.enemies.spawn('wolf', p.x + 2, p.z + 2);
    const slot = g.state.player.skillBar.indexOf('a_nova'); __tap(['KeyR', 'KeyT', 'KeyG', 'KeyV'][slot]); __step(0.6);
    return { hp: Math.round(e.hp), max: e.maxHp, slowed: e.slowTime > 0 };
  });
  res.dash = await G(() => {
    const g = window.__eternum; g.enemies.clear(); const p = g.player.body.pos;
    const e = g.enemies.spawn('golem', p.x, p.z + 4); __face(e.body.pos.x, e.body.pos.z); const z0 = p.z;
    const slot = g.state.player.skillBar.indexOf('c_dash'); __tap(['KeyR', 'KeyT', 'KeyG', 'KeyV'][slot]); __step(0.6);
    return { golemHp: Math.round(e.hp), max: e.maxHp, moved: +(g.player.body.pos.z - z0).toFixed(1) };
  });
  res.parry = await G(() => {
    const g = window.__eternum; g.enemies.clear(); g.debug.heal(); const p = g.player.body.pos;
    const w = g.enemies.spawn('wolf', p.x, p.z + 1.9); w.aggro = true; w.setState('chase'); w.cooldown = 0;
    w.attack = w.def.attacks[0]; w.setState('windup'); __face(w.body.pos.x, w.body.pos.z);
    const hp0 = g.state.player.hp; let parried = false;
    for (let i = 0; i < 60; i++) {
      if (w.state === 'windup' && w.stateTime > w.attack.windup - 0.08 && !g.player.blocking) __key('KeyF', true);
      __step(1 / 30);
      if (w.state === 'hurt' && w.staggerFor > 0) parried = true;
    }
    __key('KeyF', false); __step(0.1);
    return { parried, hpLost: Math.round(hp0 - g.state.player.hp), parries: g.state.counters.parry ?? 0, riposte: g.state.player.buffs.some((b) => b.id === 'riposte') || parried };
  });
  res.block = await G(() => {
    const g = window.__eternum; g.enemies.clear(); g.debug.heal(); g.state.player.stamina = 100; const p = g.player.body.pos;
    __key('KeyF', true); __step(0.6);
    const hp0 = g.state.player.hp; const blocking = g.player.blocking;
    g.damagePlayer(40, p.clone().setZ(p.z + Math.cos(g.player.yaw) * 2).setX(p.x + Math.sin(g.player.yaw) * 2), { knock: 3 });
    const blockedLoss = hp0 - g.state.player.hp; __key('KeyF', false); __step(0.1);
    const hp1 = g.state.player.hp; g.damagePlayer(40, p.clone().setZ(p.z + 2), {});
    return { blocking, blockedLoss: Math.round(blockedLoss), unblockedLoss: Math.round(hp1 - g.state.player.hp) };
  });
  res.trinket = await G(() => {
    const g = window.__eternum; const before = g.stats.maxMana; g.debug.give('arcane_ring', 1);
    const idx = g.state.player.inventory.findIndex((s) => s && s.id === 'arcane_ring'); g.useSlot(idx);
    return { equipped: g.state.player.equipment.trinket, before, after: g.stats.maxMana };
  });
  await G(() => window.__eternum.openMenu('skills'));
  await shot('p2_skills');
  await G(() => { window.__eternum.closePanel(); window.__eternum.input.lockFailures = 2; });

  // ── Dungeon
  res.entrance = await G(() => {
    const g = window.__eternum; g.enemies.clear(); g.debug.heal();
    const lore = g.landmarks.interactables.find((i) => i.id === 'lore_crypt_entrance');
    g.debug.teleport(lore.pos.x - 1.4, lore.pos.z); __step(1.5);
    g.ui.prompt?.run(); __step(0.2); g.closePanel(false);
    const door = g.landmarks.interactables.find((i) => i.id === 'crypt_door');
    g.debug.teleport(door.pos.x, door.pos.z + 1.8); __face(door.pos.x, door.pos.z); __step(0.4);
    const prompt = g.ui.prompt?.label;
    return { discovered: g.state.discovered.includes('crypt_entrance'), tomeRecipe: g.state.knownRecipes.includes('r_skill_tome'), prompt };
  });
  await shot('p2_crypt_entrance');
  res.enter = await G(() => {
    const g = window.__eternum; g.ui.prompt?.run(); __step(1);
    return { inDungeon: g.inDungeon, enemies: g.enemies.list.map((e) => e.def.id).join(','), interior: g.env.interior, region: g.discovery.regionName(), y: +g.player.body.pos.y.toFixed(1) };
  });
  await shot('p2_dungeon_hall');
  res.levers = await G(() => {
    const g = window.__eternum; g.state.player.level = 9; g.state.player.attrs.str = 10; g.state.player.attrs.vit = 8; g.player.refreshEquipment(); g.debug.heal();
    for (const e of g.enemies.list) { e.hp = 0; g.enemies.onDamaged(e, 999, e.body.pos.clone(), true); } __step(1.5);
    const pull = (sym) => { const it = g.dungeon.interactables.find((i) => i.symbol === sym); g.player.body.pos.set(it.pos.x + (it.pos.x > g.dungeon.entryPos.x ? -1.2 : it.pos.x < g.dungeon.entryPos.x - 5 ? 1.2 : 0), it.pos.y - 1 + 0.05, it.pos.z - (Math.abs(it.pos.x - g.dungeon.entryPos.x) < 6 ? 1.2 : 0)); g.player.body.vel.set(0, 0, 0); __step(0.3); const label = g.ui.prompt?.label; g.ui.prompt?.run(); __step(0.2); return label; };
    const wrong1 = pull('moon'); __step(1.5); const afterWrong = g.dungeon.pulled.length;
    const l1 = pull('sun'); const l2 = pull('moon'); const l3 = pull('star'); __step(2.5);
    return { wrong1, afterWrong, labels: [l1, l2, l3], gateOpen: g.dungeon.gateOpen, gateCounter: g.state.counters['crypt:gate'] ?? 0 };
  });
  await shot('p2_levers');
  res.hidden = await G(() => {
    const g = window.__eternum; const w = g.dungeon.crackWallPos();
    g.player.body.pos.set(w.x - 1.6, g.dungeon.entryPos.y + 0.05, w.z); g.player.body.vel.set(0, 0, 0); __face(w.x, w.z); __step(0.3);
    for (let i = 0; i < 4 && !g.dungeon.wallBroken; i++) { g.input.simulateMouse(0, true); __step(1 / 30); g.input.simulateMouse(0, false); __step(0.7); }
    const broken = g.dungeon.wallBroken;
    const ch = g.dungeon.interactables.find((i) => i.id === 'dchest_hidden');
    g.player.body.pos.set(ch.pos.x - 1.4, g.dungeon.entryPos.y + 0.05, ch.pos.z); __step(0.4);
    const prompt = g.ui.prompt?.label; g.ui.prompt?.run(); __step(0.3);
    return { broken, prompt, ring: __inv('arcane_ring') + (g.state.player.equipment.trinket === 'arcane_ring' ? 1 : 0), tome: __inv('skill_tome'), manaPotion: __inv('mana_potion') };
  });
  res.boss = await G(() => {
    const g = window.__eternum; g.debug.give('crystal_blade', 1); const idx = g.state.player.inventory.findIndex((s) => s && s.id === 'crystal_blade'); g.equipFromSlot(idx); g.debug.heal();
    const O = g.dungeon.entryPos; g.player.body.pos.set(O.x, O.y + 0.05, O.z + 49); g.player.body.vel.set(0, 0, 0); __step(0.5);
    const spawned = g.dungeon.keeperSpawned; const k = g.enemies.boss;
    if (!k) return { spawned, ok: false };
    const sealed = (() => { const ch = g.dungeon.interactables.find((i) => i.id === 'dchest_boss'); const p0 = g.player.body.pos.clone(); g.player.body.pos.set(ch.pos.x, O.y + 0.05, ch.pos.z + 1.3); __step(0.2); g.ui.prompt?.run(); const opened = g.state.openedChests.includes('dchest_boss'); g.player.body.pos.copy(p0); return !opened; })();
    let summoned = 0; let attacks = 0;
    for (let i = 0; i < 1600 && !k.removed && k.state !== 'dead'; i++) {
      const p = g.player.body.pos; const b = k.body.pos; const d = Math.hypot(b.x - p.x, b.z - p.z); __face(b.x, b.z);
      if (k.state === 'windup' && k.attack.kind === 'summon') summoned++;
      if (d > 3.2) { __key('KeyW', true); if ((i % 90) > 60) __key('KeyD', true); __step(1 / 30); __key('KeyW', false); __key('KeyD', false); }
      else { g.input.simulateMouse(0, true); __step(1 / 30); g.input.simulateMouse(0, false); attacks++; }
      __step(1 / 30);
      if (g.player.dead) { g.respawn(); return { spawned, died: true }; }
      if (g.state.player.hp < 120) g.debug.heal();
    }
    __step(3);
    const ch = g.dungeon.interactables.find((i) => i.id === 'dchest_boss');
    g.player.body.pos.set(ch.pos.x, O.y + 0.05, ch.pos.z + 1.3); __step(0.3); g.ui.prompt?.run(); __step(0.3);
    return { spawned, sealed, summonWindups: summoned > 0, attacks, keeperDead: k.removed || k.state === 'dead', defeated: g.dungeon.keeperDefeated, blade: __inv('ancient_blade'), bossChest: g.state.openedChests.includes('dchest_boss'), kills: g.state.counters['kill:crypt_keeper'] ?? 0, questDone: g.state.quests.completed.includes('s_crypt') };
  });
  await shot('p2_boss_room');
  res.saveInside = await G(() => { const g = window.__eternum; g.saveGame(true); return { inDungeon: g.inDungeon }; });
  await page.reload();
  await page.waitForSelector('text=이어하기', { timeout: 120000 });
  await page.click('text=이어하기');
  await sleep(1500);
  await inject();
  res.loadedOutside = await G(() => { const g = window.__eternum; const p = g.player.body.pos; const ext = g.cryptExterior(); return { inDungeon: g.inDungeon, nearEntrance: Math.hypot(p.x - ext.x, p.z - ext.z) < 2, skills: Object.keys(g.state.player.skills).length, trinket: g.state.player.equipment.trinket, terrainVisible: g.terrain.mesh.visible }; });
  // re-enter and leave through the portal
  res.portal = await G(() => {
    const g = window.__eternum; g.enterDungeon(); __step(0.5); const inside = g.inDungeon;
    const it = g.dungeon.interactables.find((i) => i.id === 'dportal_entry'); g.player.body.pos.set(it.pos.x, it.pos.y - 1 + 0.05, it.pos.z + 1.5); __step(0.3);
    const prompt = g.ui.prompt?.label; g.ui.prompt?.run(); __step(0.5);
    return { inside, prompt, outside: !g.inDungeon, interior: g.env.interior };
  });
  // migration: craft a v1-style save (no skills/mana/int/trinket) and load it
  res.migration = await G(() => {
    const g = window.__eternum; const snap = g.snapshot();
    delete snap.player.skills; delete snap.player.skillBar; delete snap.player.skillPoints; delete snap.player.mana; delete snap.player.attrs.int; delete snap.player.equipment.trinket;
    snap.player.level = 4;
    localStorage.setItem('eternum_save_slot_2', JSON.stringify({ version: 1, slot: 2, savedAt: Date.now(), state: snap }));
    localStorage.setItem('eternum_save_meta_2', JSON.stringify({ slot: 2, savedAt: Date.now(), level: 4, day: 1, playTime: 1, name: 'x' }));
    const ok = g.loadGame(2); __step(1);
    const p = g.state.player;
    return { ok, skillPoints: p.skillPoints, int: p.attrs.int, trinket: p.equipment.trinket, mana: Math.round(p.mana), maxMana: g.stats.maxMana, hpOk: Number.isFinite(g.stats.maxHp) };
  });
  console.log(JSON.stringify(res, null, 1));
  console.log('LOGS (' + logs.length + '):\n' + logs.slice(0, 10).join('\n'));
  const r = res;
  const checks = {
    'skill points from levels': r.skills.pts === r.skills.lvl - 1,
    'learn 5 skills, actives on bar': r.skills.learned.every(Boolean) && r.skills.bar.split(',').filter(Boolean).length === 4,
    'whirlwind hits all around + cooldown': r.whirl.aHp < 32 && r.whirl.bHp < 32 && r.whirl.cooldown > 5,
    'arcane bolt homes and damages, costs mana': r.bolt.wolfHp < r.bolt.max && r.bolt.manaSpent >= 8,
    'frost nova damages and slows': r.nova.hp < r.nova.max && r.nova.slowed,
    'dash strike moves and hits': r.dash.golemHp < r.dash.max && r.dash.moved > 2,
    'parry staggers attacker without damage': r.parry.parried && r.parry.hpLost === 0 && r.parry.parries >= 1,
    'block reduces damage': r.block.blocking && r.block.blockedLoss < r.block.unblockedLoss * 0.5,
    'accessory raises max mana': r.trinket.equipped === 'arcane_ring' && r.trinket.after > r.trinket.before,
    'crypt discovered, lore unlocks recipe': r.entrance.discovered && r.entrance.tomeRecipe && r.entrance.prompt === '묘소로 들어가기',
    'enter dungeon (interior, enemies)': r.enter.inDungeon && r.enter.interior && r.enter.enemies.includes('skeleton_archer'),
    'wrong lever order resets': r.levers.afterWrong === 0,
    'correct order opens gate': r.levers.gateOpen && r.levers.gateCounter === 1,
    'cracked wall breaks, hidden chest loot': r.hidden.broken && r.hidden.ring >= 2 && r.hidden.tome === 1,
    'keeper spawns, sealed chest, defeat': r.boss.spawned && r.boss.sealed && r.boss.keeperDead && r.boss.defeated,
    'keeper loot + boss chest + quest': r.boss.blade >= 1 && r.boss.bossChest && r.boss.questDone,
    'save inside -> load at entrance': r.loadedOutside.inDungeon === false && r.loadedOutside.nearEntrance && r.loadedOutside.terrainVisible,
    'portal exits dungeon': r.portal.inside && r.portal.outside && !r.portal.interior,
    'v1 save migrates': r.migration.ok && r.migration.skillPoints === 3 && r.migration.int === 0 && r.migration.trinket === null && r.migration.hpOk,
    'no runtime errors': logs.length === 0,
  };
  let failed = 0;
  for (const [name, ok] of Object.entries(checks)) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
