// LIFE RPG v1.3.4 — Data-safe recovery + clicks restored
// Problem fixed: v1.3.3 could write an empty pack to stable key from blocked page.
// This version:
//  - validates stable pack structure
//  - auto-recovers from legacy keys if stable is broken/empty
//  - keeps backups before overwriting
// Storage key (stable): life_rpg_profiles

const PROFILES_KEY = "life_rpg_profiles";
const LEGACY_KEYS = ['life_rpg_profiles_v133', 'life_rpg_profiles_v132', 'life_rpg_profiles_v131', 'life_rpg_profiles_v13', 'life_rpg_hardcore_v12'];

function p2(n){ return String(n).padStart(2,"0"); }
function nowStamp(){
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function defaultState(){
  return {
    day: 1,
    dayStatus: "INACTIVE",
    level: 1,
    xp: 0,
    gold: 0,
    floor: 0,
    battleCount: 0,
    totalSeconds: 0,
    reward: { active:false, label:null, url:null, endsAtMs:0, winName:null, sameTab:false },
    block: { active:false, label:null, endedAtMs:0 },
    logs: [{ time: nowStamp(), title: "새 프로필 생성", msg: "Day 1부터 시작 (v1.3.4)" }],
    subjects: {},
    boss: { shown21:false, defeated21:false },
    prefs: { lastRewardUrl:"", sameTab:false },
    subjectsList: ["화학2","물리1","수학","국어","영어"],
    sessions: [],
  };
}

function tryReadJson(key){
  const raw = localStorage.getItem(key);
  if(!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function isValidPack(p){
  return !!(p && typeof p === "object" && p.activeId && p.profiles && typeof p.profiles === "object" && p.profiles[p.activeId]);
}

function backupCurrentStable(){
  const cur = localStorage.getItem(PROFILES_KEY);
  if(!cur) return;
  const k = "life_rpg_profiles_backup_" + Date.now();
  localStorage.setItem(k, cur);
}

function findBestLegacyPack(){
  // Prefer packs with profiles+activeId
  for(const k of LEGACY_KEYS){
    const p = tryReadJson(k);
    if(p && p.profiles && p.activeId && p.profiles[p.activeId]) return {key:k, pack:p};
  }
  return null;
}

function migrateToStable(force=false){
  const stable = tryReadJson(PROFILES_KEY);
  if(!force && isValidPack(stable)) return stable;

  const legacy = findBestLegacyPack();
  if(legacy){
    backupCurrentStable();
    localStorage.setItem(PROFILES_KEY, JSON.stringify(legacy.pack));
    return legacy.pack;
  }

  // If stable exists but invalid, keep a backup then reset to default
  backupCurrentStable();
  const pack = { activeId:"p1", profiles:{ "p1": { name:"기본", state: defaultState() } } };
  localStorage.setItem(PROFILES_KEY, JSON.stringify(pack));
  return pack;
}

function writePack(pack){ localStorage.setItem(PROFILES_KEY, JSON.stringify(pack)); }
function genId(){ return "p" + Math.random().toString(16).slice(2,10); }

function pushLog(state, title, msg){
  state.logs.unshift({ time: nowStamp(), title, msg });
  if(state.logs.length > 250) state.logs.pop();
}

function calcLevel(xp){
  if (xp >= 4000) return 5;
  if (xp >= 3000) return 4;
  if (xp >= 2000) return 3;
  if (xp >= 1000) return 2;
  return 1;
}

function floorEvents(f){
  const map = {
    4: "각성층: 보너스 XP + 스탯 상승(연출)",
    7: "선택 이벤트층: XP 부스트 or 체력 회복(연출)",
    13:"금기층: 슬라임 분열, 희귀 드랍 확정(연출)",
    21:"중간 보스층: 거대 슬라임, 레벨업 확정(연출)",
    33:"멘탈 시험층: 랜덤 버프/디버프(연출)",
  };
  return map[f] || null;
}

function formatHMS(seconds){
  const s = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(s/3600);
  const mm = Math.floor((s%3600)/60);
  const ss = s%60;
  return `${hh}시간 ${mm}분 ${ss}초`;
}

function addStudySeconds(state, subject, seconds){
  if(!Number.isFinite(seconds) || seconds <= 0) return { ok:false, error:"시간은 1초 이상이어야 해." };
  subject = (subject || "").trim() || "미분류";
  if(state.dayStatus !== "ACTIVE") pushLog(state, "⚠️ Day가 시작되지 않음", `"일어났어"로 Day 시작 추천 (현재 Day ${state.day})`);

  const minutes = Math.floor(seconds/60);
  const xpGain = minutes;
  const goldGain = Math.floor(minutes/10);
  const floorsUp = Math.floor(minutes/10);

  state.totalSeconds += seconds;
  state.xp += xpGain;
  state.gold += goldGain;

  const startFloor = state.floor;
  state.floor += floorsUp;
  state.battleCount += 1;
  state.level = calcLevel(state.xp);

  state.subjects[subject] = (state.subjects[subject] || 0) + seconds;

  for(let f=startFloor+1; f<=state.floor; f++){ const ev = floorEvents(f); if(ev) pushLog(state, `🌟 특수층 도달: ${f}F`, ev); }
  pushLog(state, `📚 공부 추가: ${subject}`, `${formatHMS(seconds)} → +XP ${xpGain} / +G ${goldGain} / +${floorsUp}F`);
  return { ok:true, xpGain, goldGain, floorsUp, minutes };
}

function deleteSession(sessionId){
  const i = (state.sessions || []).findIndex(s => s.id === sessionId);
  if(i === -1) return;
  const s = state.sessions[i];
  if(!confirm(`이 기록을 삭제할까요?\n${s.subject} / ${formatHMS(s.seconds)}\n(되돌리면 XP/Gold/층도 함께 감소)`)) return;

  state.totalSeconds = Math.max(0, (state.totalSeconds || 0) - (s.seconds || 0));
  state.xp = Math.max(0, (state.xp || 0) - (s.xpGain || 0));
  state.gold = Math.max(0, (state.gold || 0) - (s.goldGain || 0));
  state.floor = Math.max(0, (state.floor || 0) - (s.floorsUp || 0));
  state.battleCount = Math.max(0, (state.battleCount || 0) - 1);
  state.level = calcLevel(state.xp);

  if(state.subjects && typeof state.subjects === "object"){
    const cur = state.subjects[s.subject] || 0;
    state.subjects[s.subject] = Math.max(0, cur - (s.seconds || 0));
  }

  state.sessions.splice(i, 1);
  pushLog(state, "🗑️ 기록 삭제", `${s.subject} / ${formatHMS(s.seconds)} 기록을 삭제했어 (되돌림)`);
  persist(); renderStats(); renderLogs();
}


function msToMMSS(ms){ const s = Math.max(0, Math.floor(ms/1000)); return `${p2(Math.floor(s/60))}:${p2(s%60)}`; }
function normalizeUrl(url){ url=(url||"").trim(); if(!url) return ""; if(!/^https?:\/\//i.test(url)) url="https://"+url; return url; }
function tryOpenUrl(url, winName){ if(!url) return {ok:false}; try{ const w = window.open(url, winName||"_blank"); if(w) return {ok:true, used:"window.open"}; }catch{}
  try{ const a=document.createElement("a"); a.href=url; a.target=winName?winName:"_blank"; a.rel="noopener"; a.style.display="none"; document.body.appendChild(a); a.click(); a.remove(); return {ok:true, used:"a.click"}; }catch{}
  return {ok:false};
}

/* UI refs */
const $stats = document.getElementById("stats");
const $log = document.getElementById("log");
const $lastDrop = document.getElementById("lastDrop");

const $profileBtn = document.getElementById("profileBtn");
const $wakeBtn = document.getElementById("wakeBtn");
const $endDayBtn = document.getElementById("endDayBtn");
const $resetBtn = document.getElementById("resetBtn");
const $shopBtn = document.getElementById("shopBtn");

const $subjectSelect = document.getElementById("subjectSelect");
const $addSubjectOpenBtn = document.getElementById("addSubjectOpenBtn");
const $addSubjectRow = document.getElementById("addSubjectRow");
const $newSubjectInput = document.getElementById("newSubjectInput");
const $addSubjectBtn = document.getElementById("addSubjectBtn");
const $hoursInput = document.getElementById("hoursInput");
const $minutesInput = document.getElementById("minutesInput");
const $secondsInput = document.getElementById("secondsInput");
const $addStudyBtn = document.getElementById("addStudyBtn");

const $profileOverlay = document.getElementById("profileOverlay");
const $closeProfileBtn = document.getElementById("closeProfileBtn");
const $activeProfileLabel = document.getElementById("activeProfileLabel");
const $profileSelect = document.getElementById("profileSelect");
const $switchProfileBtn = document.getElementById("switchProfileBtn");
const $newProfileName = document.getElementById("newProfileName");
const $createProfileBtn = document.getElementById("createProfileBtn");
const $recoverBtn = document.getElementById("recoverBtn");
const $deleteProfileBtn = document.getElementById("deleteProfileBtn");

const $shopOverlay = document.getElementById("shopOverlay");
const $closeShopBtn = document.getElementById("closeShopBtn");
const $shopInfo = document.getElementById("shopInfo");
const $rewardUrlInput = document.getElementById("rewardUrlInput");
const $sameTabToggle = document.getElementById("sameTabToggle");

const $rewardOverlay = document.getElementById("rewardOverlay");
const $closeRewardBtn = document.getElementById("closeRewardBtn");
const $rewardName = document.getElementById("rewardName");
const $rewardTime = document.getElementById("rewardTime");
const $openRewardSiteBtn = document.getElementById("openRewardSiteBtn");
const $stopRewardBtn = document.getElementById("stopRewardBtn");

const $bossOverlay = document.getElementById("bossOverlay");
const $bossFightBtn = document.getElementById("bossFightBtn");

function openOverlay(el){ el.classList.remove("hidden"); }
function closeOverlay(el){ el.classList.add("hidden"); }
function setDropText(text){ $lastDrop.innerHTML = text || "최근 드랍 없음"; }

let pack = migrateToStable(false);
let activeId = pack.activeId;
let activeProfile = pack.profiles[activeId];
let state = activeProfile.state;
state.prefs = state.prefs || { lastRewardUrl:"", sameTab:false };
state.subjectsList = Array.isArray(state.subjectsList) ? state.subjectsList : ["화학2","물리1","수학","국어","영어"];
state.sessions = Array.isArray(state.sessions) ? state.sessions : [];

function persist(){ pack.profiles[activeId].state = state; pack.activeId = activeId; writePack(pack); }
function ensureNotBlocked(){ if(state.block && state.block.active) location.replace("blocked.html"); }
ensureNotBlocked();

function renderProfileUI(){
  $activeProfileLabel.textContent = activeProfile?.name || "-";
  $profileSelect.innerHTML = Object.entries(pack.profiles).map(([id,p]) => `<option value="${id}" ${id===activeId?"selected":""}>${p.name}</option>`).join("");
}

function renderStats(){
  const totalMin = Math.floor(state.totalSeconds/60);
  const totalText = `${formatHMS(state.totalSeconds)} (${totalMin}분 기준 XP/Gold 계산)`;
  const items = [
    ["프로필", activeProfile?.name || "-"],
    ["Day", `Day ${state.day} (${state.dayStatus})`],
    ["Level", `Lv.${state.level}`],
    ["XP", `${state.xp}`],
    ["Gold", `${state.gold}G`],
    ["Tower", `${state.floor}F`],
    ["Battle", `${state.battleCount}회`],
    ["누적 공부", totalText],
    ["보상 모드", state.reward.active ? `진행중: ${state.reward.label}` : "없음"],
  ];
  $stats.innerHTML = items.map(([k,v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
}


function genSessionId(){
  return "s" + Math.random().toString(16).slice(2,10) + Date.now().toString(16);
}
function renderSubjects(){
  const cur = $subjectSelect ? $subjectSelect.value : "";
  const opts = (state.subjectsList || []).map(s => `<option value="${s}">${s}</option>`).join("");
  if($subjectSelect) $subjectSelect.innerHTML = opts;
  if(cur && (state.subjectsList || []).includes(cur) && $subjectSelect) $subjectSelect.value = cur;
}
function ensureNumberInputZero(el){
  if(!el) return;
  if(el.value === "" || el.value === null || typeof el.value === "undefined") el.value = "0";
  const n = Number(el.value);
  if(!Number.isFinite(n) || n < 0) el.value = "0";
}
function renderLogs(){
  const sessionsHtml = (state.sessions || []).slice(0, 20).map(s => `
    <div class="logItem">
      <div class="t">📌 기록: ${s.subject}</div>
      <div class="m">${formatHMS(s.seconds)} (Day ${s.day}) → +XP ${s.xpGain} / +G ${s.goldGain} / +${s.floorsUp}F</div>
      <div class="m" style="opacity:.55">${s.time}</div>
      <div class="logActions">
        <button class="smallBtn danger" data-del-session="${s.id}">삭제(되돌리기)</button>
      </div>
    </div>
  `).join("");

  const logsHtml = (state.logs || []).slice(0, 60).map(l => `
    <div class="logItem">
      <div class="t">${l.title}</div>
      <div class="m">${l.msg}</div>
      <div class="m" style="opacity:.55">${l.time}</div>
    </div>
  `).join("");

  $log.innerHTML = `
    <div class="logItem" style="border-style:dashed; opacity:.95;">
      <div class="t">🧾 최근 공부 기록 (삭제 가능)</div>
      <div class="m" style="opacity:.7;">잘못 입력한 건 여기서 삭제하면 XP/Gold/층/누적시간이 같이 되돌아가.</div>
    </div>
    ${sessionsHtml || `<div class="logItem"><div class="m" style="opacity:.7;">최근 기록 없음</div></div>`}
    <div class="logItem" style="border-style:dashed; opacity:.95; margin-top:8px;">
      <div class="t">📜 시스템 로그</div>
    </div>
    ${logsHtml}
  `;

  document.querySelectorAll("[data-del-session]").forEach(btn => {
    btn.onclick = () => deleteSession(btn.getAttribute("data-del-session"));
  });
}


/* Profile actions */
$profileBtn.onclick = () => { renderProfileUI(); openOverlay($profileOverlay); };
$closeProfileBtn.onclick = () => closeOverlay($profileOverlay);

/* Subject management */
if($addSubjectOpenBtn && $addSubjectRow){
  $addSubjectOpenBtn.onclick = () => {
    $addSubjectRow.classList.toggle("hidden");
    if(!$addSubjectRow.classList.contains("hidden") && $newSubjectInput) $newSubjectInput.focus();
  };
}
if($addSubjectBtn){
  $addSubjectBtn.onclick = () => {
    const name = ($newSubjectInput?.value || "").trim();
    if(!name) return alert("과목 이름을 입력해줘.");
    state.subjectsList = state.subjectsList || [];
    if(state.subjectsList.includes(name)) return alert("이미 있는 과목이야.");
    state.subjectsList.unshift(name);
    state.subjects = state.subjects || {};
    state.subjects[name] = state.subjects[name] || 0;
    if($newSubjectInput) $newSubjectInput.value = "";
    if($addSubjectRow) $addSubjectRow.classList.add("hidden");
    persist();
    renderSubjects();
    if($subjectSelect) $subjectSelect.value = name;
    renderStats(); renderLogs();
  };
}


$recoverBtn.onclick = () => {
  const before = tryReadJson(PROFILES_KEY);
  const legacy = findBestLegacyPack();
  if(!legacy) return alert("복구할 이전 데이터가 안 보여. (이전 키가 없거나 삭제됨)");
  backupCurrentStable();
  localStorage.setItem(PROFILES_KEY, JSON.stringify(legacy.pack));
  alert(`복구 완료! (출처: ${legacy.key})\n페이지를 새로고침할게.`);
  location.reload();
};

$switchProfileBtn.onclick = () => {
  const id = $profileSelect.value;
  if(!id || !pack.profiles[id]) return;
  persist();
  activeId = id;
  activeProfile = pack.profiles[activeId];
  state = activeProfile.state;
  state.prefs = state.prefs || { lastRewardUrl:"", sameTab:false };
  writePack(pack);
  location.href = "index.html";
};

$createProfileBtn.onclick = () => {
  const name = ($newProfileName.value||"").trim();
  if(!name) return alert("프로필 이름을 입력해줘.");
  const id = genId();
  pack.profiles[id] = { name, state: defaultState() };
  pack.activeId = id;
  writePack(pack);
  location.href = "index.html";
};

$deleteProfileBtn.onclick = () => {
  const keys = Object.keys(pack.profiles);
  if(keys.length <= 1) return alert("프로필은 최소 1개는 남아야 해.");
  if(!confirm(`현재 프로필 "${activeProfile.name}"을(를) 삭제할까요? (복구 불가)`)) return;
  delete pack.profiles[activeId];
  pack.activeId = Object.keys(pack.profiles)[0];
  writePack(pack);
  location.href = "index.html";
};

/* Day */
$wakeBtn.onclick = () => {
  if(state.reward.active) return setDropText("보상 모드 중");
  state.day += 1; state.dayStatus = "ACTIVE";
  pushLog(state, "🌅 Day 시작", `Day ${state.day} 시작`);
  persist(); renderStats(); renderLogs();
};
$endDayBtn.onclick = () => {
  if(state.reward.active) return setDropText("보상 모드 중");
  state.dayStatus = "COMPLETED";
  pushLog(state, "✅ Day 마감", `Day ${state.day} 종료`);
  persist(); renderStats(); renderLogs();
};
$resetBtn.onclick = () => {
  if(!confirm(`현재 프로필 "${activeProfile.name}" 진행을 초기화할까요? (복구 불가)`)) return;
  state = defaultState();
  pack.profiles[activeId].state = state;
  persist();
  location.href = "index.html";
};

/* Study */
$addStudyBtn.onclick = () => {
  if(state.reward.active) return setDropText("보상 모드 중");
  const h = Number($hoursInput.value || 0);
  const m = Number($minutesInput.value || 0);
  const s = Number($secondsInput.value || 0);
  const total = (h*3600) + (m*60) + s;

  const subject = ($subjectSelect && $subjectSelect.value) ? $subjectSelect.value : "미분류";
  const res = addStudySeconds(state, subject, total);
  if(!res.ok) return alert(res.error);

  const sid = genSessionId();
  state.sessions.unshift({
    id: sid,
    time: nowStamp(),
    day: state.day,
    subject,
    seconds: total,
    xpGain: res.xpGain,
    goldGain: res.goldGain,
    floorsUp: res.floorsUp
  });

  persist(); renderStats(); renderLogs();
  if($hoursInput) $hoursInput.value = "0";
  if($minutesInput) $minutesInput.value = "0";
  if($secondsInput) $secondsInput.value = "0";
  maybeShowBoss21();
};

/* Reward/Shop */
function activateBlockAndRedirect(label){ state.block = { active:true, label:label||"-", endedAtMs: Date.now() }; persist(); location.replace("blocked.html"); }
function startReward(minutes, price, url, sameTab){ 
  if(state.reward.active) return setDropText("이미 보상 모드 중");
  if(state.gold < price){ pushLog(state, "💸 골드 부족", `보상 ${minutes}분 구매 실패 (필요 ${price}G)`); persist(); renderLogs(); return; }
  state.gold -= price;
  const label = `보상 ${minutes}분`;
  const endsAtMs = Date.now() + minutes*60*1000;
  const winName = "life_rpg_reward_" + Date.now();
  state.reward = { active:true, label, url, endsAtMs, winName, sameTab };
  state.prefs.lastRewardUrl = url || state.prefs.lastRewardUrl || "";
  state.prefs.sameTab = !!sameTab;
  pushLog(state, "🛒 상점 구매", `${label} (-${price}G) / 타이머 시작`);
  persist(); renderStats(); renderLogs();

  if(sameTab){
    if(!url){ alert("같은 탭 모드를 켰으면 URL을 입력해야 해."); return; }
    location.href = url;
    return;
  }

  if(url){
    const r = tryOpenUrl(url, winName);
    pushLog(state, r.ok ? "✅ 보상 탭 열기 시도" : "⚠️ 탭 열기 실패", r.ok ? `방법: ${r.used}` : "팝업/확장프로그램 차단 가능성");
    persist(); renderLogs();
  } else {
    pushLog(state, "ℹ️ URL 없음", "상점에서 URL을 입력하면 바로 열 수 있어.");
    persist(); renderLogs();
  }

  $rewardName.textContent = label;
  $rewardTime.textContent = msToMMSS(minutes*60*1000);
  openOverlay($rewardOverlay);
}

function stopReward(){
  if(!state.reward.active) return;
  pushLog(state, "⏹ 보상 종료", `${state.reward.label} 종료(사용자)`);
  state.reward = { active:false, label:null, url:null, endsAtMs:0, winName:null, sameTab:false };
  persist(); renderStats(); renderLogs();
  closeOverlay($rewardOverlay);
}

function tickReward(){
  if(!state.reward.active) return;
  const left = state.reward.endsAtMs - Date.now();
  $rewardTime.textContent = msToMMSS(left);
  if(left <= 0){
    const label = state.reward.label;
    const winName = state.reward.winName;
    pushLog(state, "⏰ 보상 시간 종료", `${label} 종료 → blocked로 이동`);
    state.reward = { active:false, label:null, url:null, endsAtMs:0, winName:null, sameTab:false };
    persist();
    try{ if(winName){ const w = window.open("", winName); if(w) w.location.replace("blocked.html"); } }catch{}
    activateBlockAndRedirect(label);
  }
}

$shopBtn.onclick = () => {
  if(state.reward.active){ openOverlay($rewardOverlay); return; }
  $shopInfo.textContent = `현재 Gold: ${state.gold}G`;
  $rewardUrlInput.value = state.prefs.lastRewardUrl || "";
  $sameTabToggle.checked = !!state.prefs.sameTab;
  openOverlay($shopOverlay);
};
$closeShopBtn.onclick = () => closeOverlay($shopOverlay);

document.querySelectorAll(".shopItem").forEach(btn => {
  btn.onclick = () => {
    const minutes = Number(btn.dataset.min);
    const price = Number(btn.dataset.price);
    const url = normalizeUrl($rewardUrlInput.value);
    const sameTab = !!$sameTabToggle.checked;
    closeOverlay($shopOverlay);
    startReward(minutes, price, url, sameTab);
  };
});

$closeRewardBtn.onclick = () => closeOverlay($rewardOverlay);
$openRewardSiteBtn.onclick = () => {
  if(!state.reward.active) return;
  if(state.reward.sameTab) return alert("같은 탭 모드에서는 재시도가 필요 없어.");
  const url = state.reward.url || state.prefs.lastRewardUrl || "";
  if(!url) return alert("URL을 입력해줘. 예: https://www.youtube.com");
  const r = tryOpenUrl(url, state.reward.winName || "_blank");
  pushLog(state, r.ok ? "✅ 사이트 열기(재시도)" : "❌ 탭 열기 실패", r.ok ? `방법: ${r.used}` : "팝업/확장프로그램 차단 가능성");
  persist(); renderLogs();
};
$stopRewardBtn.onclick = stopReward;

/* Boss 21F */
function maybeShowBoss21(){ if(state.floor >= 21 && !state.boss.shown21 && !state.boss.defeated21){ state.boss.shown21=true; persist(); openOverlay($bossOverlay); } }
$bossFightBtn.onclick = () => {
  if(state.boss.defeated21) return;
  state.boss.defeated21 = true;
  pushLog(state, "👑 21F 보스 처치!", "XP +500");
  state.xp += 500; state.level = calcLevel(state.xp);
  persist(); renderStats(); renderLogs();
  closeOverlay($bossOverlay);
  setDropText("보스 격파!");
};

/* Canvas */
const ctx = document.getElementById("gameCanvas").getContext("2d");
const PX = 4;
const GW = 520 / PX;
const GH = 520 / PX;
function drawPixel(x,y,color){ ctx.fillStyle=color; ctx.fillRect(x*PX,y*PX,PX,PX); }
function drawCircle(cx, cy, r, palette){ for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){ if(x*x+y*y<=r*r){ const t=(x+y)/(2*r); const idx=t<-0.2?0:t<0.2?1:2; drawPixel(cx+x,cy+y,palette[Math.max(0,Math.min(2,idx))]); } } }
function drawStarfield(){ for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){ const g=Math.floor(10+(y/GH)*10); drawPixel(x,y,`rgb(${6+g},${3+g},${18+g})`); } for(let i=0;i<260;i++){ const x=(i*73)%GW, y=(i*91)%GH; const b=180+(i%70); drawPixel(x,y,`rgb(${b},${b},${b})`); if(i%7===0&&x+1<GW) drawPixel(x+1,y,`rgb(${b-30},${b-30},${b-30})`); } const planets=[{x:12,y:20,r:9,p:["#ffb65c","#e0882f","#b55a18"]},{x:48,y:18,r:8,p:["#bfe6ff","#7bb7ff","#3f78d7"]},{x:78,y:34,r:7,p:["#ffd2d2","#d996a7","#a45d6f"]},{x:20,y:82,r:10,p:["#c9c9cf","#8e8ea1","#5c5c73"]},{x:82,y:84,r:9,p:["#ffdb7a","#d8a94d","#a36c2d"]}]; for(const pl of planets) drawCircle(pl.x,pl.y,pl.r,pl.p); drawCircle(62,64,8,["#ffe2a0","#d4a86a","#a8743d"]); for(let x=-12;x<=12;x++){ if(Math.abs(x)<2) continue; drawPixel(62+x,64,"#c9b38a"); drawPixel(62+x,65,"#9c8762"); } }
function drawTower(floor){ const tx=14,ty=34,tw=18,th=84; for(let y=0;y<th;y++)for(let x=0;x<tw;x++){ const edge=x==0||x==tw-1||y==0||y==th-1; drawPixel(tx+x,ty+y,edge?"#2a3a75":"#1b2552"); } const floorsToDraw=20; const step=Math.floor(th/floorsToDraw); for(let i=0;i<floorsToDraw;i++){ const y=ty+th-2-i*step; for(let x=2;x<tw-2;x++) drawPixel(tx+x,y,"rgba(255,255,255,0.10)"); } const marker=floor%floorsToDraw; const my=ty+th-2-marker*step; for(let k=0;k<3;k++){ drawPixel(tx-2,my-k,"#3a4cff"); drawPixel(tx-3,my-k,"#91a0ff"); } for(let x=0;x<tw;x++) drawPixel(tx+x,ty-1,"#3a4cff"); }
function drawSlime(t){ const sx=62,sy=104; const wob=Math.round(Math.sin(t/18)*2); const body=["#62ffb6","#29d897","#10946c"]; for(let y=-10;y<=10;y++)for(let x=-12;x<=12;x++){ const d=(x*x)/144+(y*y)/100; if(d<=1){ const idx=y<-3?0:y<4?1:2; drawPixel(sx+x,sy+y+wob,body[idx]); } } drawPixel(sx-5,sy-2+wob,"#0b0f1a"); drawPixel(sx-6,sy-2+wob,"#0b0f1a"); drawPixel(sx+5,sy-2+wob,"#0b0f1a"); drawPixel(sx+6,sy-2+wob,"#0b0f1a"); drawPixel(sx-8,sy-6+wob,"rgba(255,255,255,0.35)"); drawPixel(sx-7,sy-7+wob,"rgba(255,255,255,0.25)"); }
function renderCanvas(t){ drawStarfield(); drawTower(state.floor); drawSlime(t); ctx.fillStyle="rgba(255,255,255,0.90)"; ctx.font="16px system-ui"; ctx.fillText(`${state.floor}F`, 14*PX, 26*PX); }
let t=0; function loop(){ t++; tickReward(); renderCanvas(t); requestAnimationFrame(loop); }

/* Init */
renderStats(); renderLogs(); renderProfileUI();
renderSubjects();
[$hoursInput,$minutesInput,$secondsInput].forEach(el=>{ ensureNumberInputZero(el); el && el.addEventListener("blur", ()=>ensureNumberInputZero(el)); });
setDropText("v1.3.5 적용됨: 기록 삭제(되돌리기) + 과목 선택/추가 + 시간칸 자동 0");
if(state.reward.active){ $rewardName.textContent = state.reward.label; openOverlay($rewardOverlay); }
maybeShowBoss21();
loop();
