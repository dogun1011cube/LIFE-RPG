const STORAGE_KEY = "life_rpg_hardcore_v11";

function nowStamp() {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function defaultState() {
  return {
    day: 2,
    dayStatus: "COMPLETED",
    level: 2,
    xp: 1251,
    gold: 187,
    floor: 20,
    battleCount: 9,
    totalMinutes: 1251,
    reward: { active: false, type: null, label: null, url: null, endsAtMs: 0 },
    block: { active: false, label: null, endedAtMs: 0 },
    buffs: { nextGachaBoost: 0 },
    logs: [{ time: nowStamp(), title: "초기 상태 로드", msg: "Day 1~2 완료 / Day 3 대기" }],
    subjects: {},
    boss: { shown21: false, defeated21: false }
  };
}

function save(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState();
  try { return JSON.parse(raw); } catch { return defaultState(); }
}

function pushLog(state, title, msg) {
  state.logs.unshift({ time: nowStamp(), title, msg });
  if (state.logs.length > 250) state.logs.pop();
}

function calcLevel(xp) {
  if (xp >= 4000) return 5;
  if (xp >= 3000) return 4;
  if (xp >= 2000) return 3;
  if (xp >= 1000) return 2;
  return 1;
}

function floorEvents(floor) {
  const map = {
    4: "각성층: 보너스 XP + 스탯 상승(연출)",
    7: "선택 이벤트층: XP 부스트 or 체력 회복(연출)",
    13: "금기층: 슬라임 분열, 희귀 드랍 확정(연출)",
    21: "중간 보스층: 거대 슬라임, 레벨업 확정(연출)",
    33: "멘탈 시험층: 랜덤 버프/디버프(연출)",
  };
  return map[floor] || null;
}

function rollGacha(state) {
  let rates = { common: 60, rare: 25, epic: 12, legendary: 3 };
  if (state.buffs.nextGachaBoost > 0) {
    rates = { common: 50, rare: 30, epic: 15, legendary: 5 };
    state.buffs.nextGachaBoost = 0;
  }

  const r = Math.random() * 100;
  let grade = "Common";
  if (r < rates.legendary) grade = "Legendary";
  else if (r < rates.legendary + rates.epic) grade = "Epic";
  else if (r < rates.legendary + rates.epic + rates.rare) grade = "Rare";

  const pool = {
    Common: [
      { name: "잔돈 주머니", type: "goldBonus", v: 3 },
      { name: "미세 집중", type: "xpMult", v: 1.05 },
    ],
    Rare: [
      { name: "보너스 지갑", type: "goldBonus", v: 10 },
      { name: "집중 부스터", type: "xpMult", v: 1.15 },
      { name: "드랍 부적", type: "nextGachaBoost", v: 1 },
    ],
    Epic: [
      { name: "황금 상자", type: "goldBonus", v: 25 },
      { name: "고농축 XP", type: "xpMult", v: 1.35 },
      { name: "드랍 부적+", type: "nextGachaBoost", v: 1 },
    ],
    Legendary: [
      { name: "왕의 금고", type: "goldBonus", v: 60 },
      { name: "각성의 룬", type: "xpMult", v: 1.75 },
      { name: "운명의 부적", type: "nextGachaBoost", v: 1 },
    ],
  };

  const item = pool[grade][Math.floor(Math.random() * pool[grade].length)];
  return { grade, item };
}

function addStudy(state, subject, minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return { ok:false, error:"시간(분)은 1 이상이어야 해." };
  subject = (subject || "").trim() || "미분류";

  if (state.dayStatus !== "ACTIVE") {
    pushLog(state, "⚠️ Day가 시작되지 않음", `"일어났어"로 Day를 시작하는 걸 추천 (현재 Day ${state.day})`);
  }

  const g = rollGacha(state);
  const baseXP = minutes;
  const baseGold = Math.floor(minutes / 10);
  let xpGain = baseXP;
  let goldGain = baseGold;

  if (g.item.type === "xpMult") xpGain = Math.floor(xpGain * g.item.v);
  if (g.item.type === "goldBonus") goldGain += g.item.v;
  if (g.item.type === "nextGachaBoost") state.buffs.nextGachaBoost += g.item.v;

  state.totalMinutes += minutes;
  state.xp += xpGain;
  state.gold += goldGain;
  state.subjects[subject] = (state.subjects[subject] || 0) + minutes;

  const floorsUp = Math.floor(minutes / 10);
  const startFloor = state.floor;
  state.floor += floorsUp;

  state.battleCount += 1;
  const newLevel = calcLevel(state.xp);
  const leveledUp = newLevel > state.level;
  state.level = newLevel;

  for (let f = startFloor + 1; f <= state.floor; f++) {
    const ev = floorEvents(f);
    if (ev) pushLog(state, `🌟 특수층 도달: ${f}F`, ev);
  }
  if (leveledUp) pushLog(state, "⬆️ 레벨업!", `Level ${newLevel} 달성 (XP: ${state.xp})`);

  pushLog(state, `📚 공부 추가: ${subject} ${minutes}분`, `+XP ${xpGain} / +G ${goldGain} / +${floorsUp}F / 가챠: ${g.grade} – ${g.item.name}`);
  return { ok:true, gacha:g, xpGain, goldGain, floorsUp };
}

/* ===== Canvas ===== */
function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}
function renderCanvas(ctx, state, anim) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = "#0f1426";
  ctx.fillRect(0,0,W,H);

  const towerX = 60, towerY = 60, towerW = 140, towerH = 400;
  ctx.fillStyle = "#1c2750";
  ctx.fillRect(towerX, towerY, towerW, towerH);

  ctx.fillStyle = "rgba(255,255,255,.18)";
  const floorsToDraw = 20;
  const step = towerH / floorsToDraw;
  for (let i=0;i<=floorsToDraw;i++){
    const y = towerY + i*step;
    ctx.fillRect(towerX, y, towerW, 1);
  }

  ctx.fillStyle = "#3a4cff";
  const markerY = towerY + towerH - ((state.floor % floorsToDraw) * step);
  ctx.fillRect(towerX-8, markerY-6, 8, 12);

  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.font = "18px system-ui";
  ctx.fillText(`${state.floor}F`, towerX+10, towerY+26);

  const sx = 330, sy = 300;
  const wobble = Math.sin(anim.t/120) * 6;
  const hurt = anim.hurt > 0 ? (Math.sin(anim.t/30) * 8) : 0;

  ctx.fillStyle = anim.hurt > 0 ? "#ff3a66" : "#62ffb6";
  roundRect(ctx, sx + hurt, sy + wobble, 130, 110, 18);
  ctx.fill();
}

const state = load();

// If blocked, force redirect
if (state.block && state.block.active) location.replace("blocked.html");

const $stats = document.getElementById("stats");
const $log = document.getElementById("log");
const $lastDrop = document.getElementById("lastDrop");

const $wakeBtn = document.getElementById("wakeBtn");
const $endDayBtn = document.getElementById("endDayBtn");
const $resetBtn = document.getElementById("resetBtn");
const $shopBtn = document.getElementById("shopBtn");

const $subjectInput = document.getElementById("subjectInput");
const $minutesInput = document.getElementById("minutesInput");

const ctx = document.getElementById("gameCanvas").getContext("2d");

const $shopOverlay = document.getElementById("shopOverlay");
const $closeShopBtn = document.getElementById("closeShopBtn");
const $shopInfo = document.getElementById("shopInfo");

const $rewardOverlay = document.getElementById("rewardOverlay");
const $closeRewardBtn = document.getElementById("closeRewardBtn");
const $rewardName = document.getElementById("rewardName");
const $rewardTime = document.getElementById("rewardTime");
const $openRewardSiteBtn = document.getElementById("openRewardSiteBtn");
const $stopRewardBtn = document.getElementById("stopRewardBtn");

const $bossOverlay = document.getElementById("bossOverlay");
const $bossFightBtn = document.getElementById("bossFightBtn");

let anim = { t:0, hp:1, hurt:0, toast:"", toastTime:0 };
function toast(msg) { anim.toast = msg; anim.toastTime = 180; }

function formatHM(totalMinutes){
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}시간 ${m}분`;
}

function renderStats() {
  const nextLevelXP =
    state.level === 1 ? 1000 :
    state.level === 2 ? 2000 :
    state.level === 3 ? 3000 :
    state.level === 4 ? 4000 : 5000;

  const remain = Math.max(0, nextLevelXP - state.xp);
  const rewardText = state.reward.active ? `진행중: ${state.reward.label}` : "없음";

  const items = [
    ["Day", `Day ${state.day} (${state.dayStatus})`],
    ["Level", `Lv.${state.level}`],
    ["XP", `${state.xp} (다음까지 ${remain})`],
    ["Gold", `${state.gold}G`],
    ["Tower", `${state.floor}F`],
    ["Battle", `${state.battleCount}회`],
    ["누적 공부", `${formatHM(state.totalMinutes)} (${state.totalMinutes}분)`],
    ["보상 모드", rewardText],
  ];

  $stats.innerHTML = items.map(([k,v]) => `
    <div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>
  `).join("");
}

function renderLogs() {
  $log.innerHTML = state.logs.slice(0, 70).map(l => `
    <div class="logItem">
      <div class="t">${l.title}</div>
      <div class="m">${l.msg}</div>
      <div class="m" style="opacity:.55">${l.time}</div>
    </div>
  `).join("");
}

function setDropText(gacha) {
  if (!gacha) { $lastDrop.textContent = "최근 가챠 결과 없음"; return; }
  $lastDrop.innerHTML = `<b>가챠:</b> ${gacha.grade} – ${gacha.item.name}`;
}

/* Shop / Reward */
const SHOP = {
  YT30: { price: 100, label: "유튜브 30분", minutes: 30, url: "https://www.youtube.com" },
  DESSERT: { price: 80, label: "디저트", minutes: 20, url: null },
  WALK: { price: 50, label: "산책", minutes: 20, url: null },
};

function openOverlay(el){ el.classList.remove("hidden"); }
function closeOverlay(el){ el.classList.add("hidden"); }

function startReward(sku){
  const item = SHOP[sku];
  if (!item) return;
  if (state.reward.active) return toast("보상 모드 진행중");
  if (state.gold < item.price) return toast("골드 부족");

  state.gold -= item.price;
  state.reward = { active:true, type: sku, label:item.label, url:item.url, endsAtMs: Date.now() + item.minutes*60*1000 };
  pushLog(state, "🛒 상점 구매", `${item.label} (-${item.price}G) / ${item.minutes}분 시작`);
  save(state);
  renderStats(); renderLogs();
  showRewardOverlay();
}

function msToMMSS(ms){
  const sec = Math.max(0, Math.floor(ms/1000));
  const mm = String(Math.floor(sec/60)).padStart(2,"0");
  const ss = String(sec%60).padStart(2,"0");
  return `${mm}:${ss}`;
}

function showRewardOverlay(){
  if(!state.reward.active) return;
  $rewardName.textContent = state.reward.label;
  openOverlay($rewardOverlay);
}

function activateBlock(label){
  state.block = { active:true, label: label || "-", endedAtMs: Date.now() };
  save(state);
  location.replace("blocked.html");
}

function tickReward(){
  if(!state.reward.active) return;
  const left = state.reward.endsAtMs - Date.now();
  $rewardTime.textContent = msToMMSS(left);
  if(left <= 0){
    const label = state.reward.label;
    pushLog(state, "⏰ 보상 시간 종료", `${label} 종료 → 차단 페이지 이동`);
    state.reward = { active:false, type:null, label:null, url:null, endsAtMs:0 };
    save(state);
    renderStats(); renderLogs();
    activateBlock(label);
  }
}

function stopReward(){
  if(!state.reward.active) return;
  pushLog(state, "⏹ 보상 종료", `${state.reward.label} 종료(사용자)`);
  state.reward = { active:false, type:null, label:null, url:null, endsAtMs:0 };
  save(state);
  renderStats(); renderLogs();
  closeOverlay($rewardOverlay);
}

/* Boss 21F (간단) */
function maybeShowBoss21(){
  if (state.floor >= 21 && !state.boss.shown21 && !state.boss.defeated21) {
    state.boss.shown21 = true;
    save(state);
    openOverlay($bossOverlay);
  }
}
function defeatBoss21(){
  if (state.boss.defeated21) return;
  state.boss.defeated21 = true;
  pushLog(state, "👑 21F 보스 처치!", "XP +500");
  state.xp += 500;
  state.level = calcLevel(state.xp);
  save(state);
  renderStats(); renderLogs();
  closeOverlay($bossOverlay);
  toast("보스 격파!");
}

/* Buttons */
$wakeBtn.onclick = () => {
  if (state.reward.active) return toast("보상 모드 중");
  state.day += 1;
  state.dayStatus = "ACTIVE";
  pushLog(state, "🌅 Day 시작", `Day ${state.day} 시작`);
  save(state);
  renderStats(); renderLogs();
};

$endDayBtn.onclick = () => {
  if (state.reward.active) return toast("보상 모드 중");
  state.dayStatus = "COMPLETED";
  pushLog(state, "✅ Day 마감", `Day ${state.day} 종료`);
  save(state);
  renderStats(); renderLogs();
};

$resetBtn.onclick = () => {
  if (!confirm("정말 초기화할까요?")) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState()));
  location.href = "index.html";
};

document.getElementById("addStudyBtn").onclick = () => {
  if (state.reward.active) return toast("보상 모드 중");
  const subject = $subjectInput.value;
  const minutes = Number($minutesInput.value);
  const res = addStudy(state, subject, minutes);
  if (!res.ok) return alert(res.error);

  setDropText(res.gacha);
  save(state);
  renderStats(); renderLogs();
  $minutesInput.value = "";
  maybeShowBoss21();
};

$shopBtn.onclick = () => {
  if (state.reward.active) return showRewardOverlay();
  $shopInfo.textContent = `현재 Gold: ${state.gold}G`;
  openOverlay($shopOverlay);
};
$closeShopBtn.onclick = () => closeOverlay($shopOverlay);

document.querySelectorAll(".shopItem").forEach(btn => {
  btn.onclick = () => {
    startReward(btn.dataset.sku);
    closeOverlay($shopOverlay);
  };
});

$closeRewardBtn.onclick = () => closeOverlay($rewardOverlay);
$openRewardSiteBtn.onclick = () => {
  if(!state.reward.active) return;
  if(state.reward.url) window.open(state.reward.url, "_blank", "noopener,noreferrer");
};
$stopRewardBtn.onclick = stopReward;

$bossFightBtn.onclick = defeatBoss21;

function tick(){
  anim.t += 1;
  tickReward();
  renderCanvas(ctx, state, anim);
  requestAnimationFrame(tick);
}

renderStats();
renderLogs();
setDropText(null);
if(state.reward.active) showRewardOverlay();
maybeShowBoss21();
tick();
