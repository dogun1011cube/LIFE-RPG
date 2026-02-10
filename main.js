const APP_VERSION = "v1.3.6 CLEAN";

const KEY_PROFILE_LIST = "lifeRpg_profiles_v1";
const KEY_ACTIVE_PROFILE = "lifeRpg_activeProfile_v1";
function stateKey(profile){ return `lifeRpg_state_${profile}_v1`; }

/* DOM */
const $dayText = document.getElementById("dayText");
const $levelText = document.getElementById("levelText");
const $xpText = document.getElementById("xpText");
const $goldText = document.getElementById("goldText");
const $floorText = document.getElementById("floorText");
const $battleText = document.getElementById("battleText");
const $totalText = document.getElementById("totalText");
const $lastDrop = document.getElementById("lastDrop");

const $subjectSelect = document.getElementById("subjectSelect");
const $addSubjectOpenBtn = document.getElementById("addSubjectOpenBtn");
const $addSubjectRow = document.getElementById("addSubjectRow");
const $newSubjectInput = document.getElementById("newSubjectInput");
const $addSubjectBtn = document.getElementById("addSubjectBtn");

const $hoursInput = document.getElementById("hoursInput");
const $minutesInput = document.getElementById("minutesInput");
const $secondsInput = document.getElementById("secondsInput");
const $addStudyBtn = document.getElementById("addStudyBtn");
const $nextDayBtn = document.getElementById("nextDayBtn");

const $log = document.getElementById("log");

/* Overlays */
const $profileBtn = document.getElementById("profileBtn");
const $recordsBtn = document.getElementById("recordsBtn");

const $profileOverlay = document.getElementById("profileOverlay");
const $closeProfileBtn = document.getElementById("closeProfileBtn");
const $profileSelect = document.getElementById("profileSelect");
const $newProfileBtn = document.getElementById("newProfileBtn");
const $newProfileRow = document.getElementById("newProfileRow");
const $newProfileInput = document.getElementById("newProfileInput");
const $createProfileBtn = document.getElementById("createProfileBtn");
const $exportBtn = document.getElementById("exportBtn");
const $importBtn = document.getElementById("importBtn");
const $importFile = document.getElementById("importFile");

const $recordsOverlay = document.getElementById("recordsOverlay");
const $closeRecordsBtn = document.getElementById("closeRecordsBtn");
const $recordsList = document.getElementById("recordsList");
const $recordsSearch = document.getElementById("recordsSearch");
const $recordsSelectAll = document.getElementById("recordsSelectAll");
const $deleteSelectedBtn = document.getElementById("deleteSelectedBtn");

const $editOverlay = document.getElementById("editOverlay");
const $closeEditBtn = document.getElementById("closeEditBtn");
const $editSubjectSelect = document.getElementById("editSubjectSelect");
const $editAddSubjectOpenBtn = document.getElementById("editAddSubjectOpenBtn");
const $editAddSubjectRow = document.getElementById("editAddSubjectRow");
const $editNewSubjectInput = document.getElementById("editNewSubjectInput");
const $editAddSubjectBtn = document.getElementById("editAddSubjectBtn");
const $editHours = document.getElementById("editHours");
const $editMinutes = document.getElementById("editMinutes");
const $editSeconds = document.getElementById("editSeconds");
const $saveEditBtn = document.getElementById("saveEditBtn");
const $deleteEditBtn = document.getElementById("deleteEditBtn");
let editingSessionId = null;

function openOverlay(el){ if(!el) return; el.classList.remove("hidden"); }
function closeOverlay(el){ if(!el) return; el.classList.add("hidden"); }

/* Utils */
function nowStamp(){
  const d = new Date();
  const p = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function formatHMS(total){
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  const ss = s%60;
  const p = n => String(n).padStart(2,"0");
  return `${p(h)}:${p(m)}:${p(ss)}`;
}
function ensureNumberInputZero(el){
  if(!el) return;
  if(el.value === "" || el.value === null || typeof el.value === "undefined") el.value = "0";
  const n = Number(el.value);
  if(!Number.isFinite(n) || n < 0) el.value = "0";
}
function genId(){
  return "s" + Math.random().toString(16).slice(2,10) + Date.now().toString(16);
}
function calcLevel(xp){
  // simple leveling: 0-999 = Lv1, 1000-1999 = Lv2 ...
  return Math.floor(Math.max(0, xp)/1000) + 1;
}
function computeGainsFromSeconds(seconds){
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const xpGain = minutes;
  const goldGain = Math.floor(minutes / 10);
  const floorsUp = Math.floor(minutes / 10);
  return { minutes, xpGain, goldGain, floorsUp };
}
function secondsToHMS(total){
  const s = Math.max(0, Math.floor(total));
  return { h: Math.floor(s/3600), m: Math.floor((s%3600)/60), s: s%60 };
}
function setDropText(t){ if($lastDrop) $lastDrop.textContent = t; }

/* Profiles + State */
function getProfiles(){
  try{ return JSON.parse(localStorage.getItem(KEY_PROFILE_LIST) || "[]"); }catch{ return []; }
}
function setProfiles(list){ localStorage.setItem(KEY_PROFILE_LIST, JSON.stringify(list)); }

function getActiveProfile(){
  return localStorage.getItem(KEY_ACTIVE_PROFILE) || "default";
}
function setActiveProfile(name){
  localStorage.setItem(KEY_ACTIVE_PROFILE, name);
}

function defaultState(){
  return {
    day: 1,
    totalSeconds: 0,
    xp: 0,
    gold: 0,
    floor: 0,
    battleCount: 0,
    level: 1,
    subjects: {},
    subjectsList: ["화학2","물리1","수학","국어","영어"],
    sessions: [], // {id, kind:"study", time, day, subject, seconds, xpGain, goldGain, floorsUp}
    logs: []
  };
}

let profile = getActiveProfile();
let state = loadState(profile);

function loadState(p){
  const k = stateKey(p);
  try{
    const raw = localStorage.getItem(k);
    if(!raw) {
      const s = defaultState();
      persist(p, s);
      return s;
    }
    const s = JSON.parse(raw);
    // harden
    if(typeof s.day !== "number") s.day = 1;
    if(typeof s.totalSeconds !== "number") s.totalSeconds = 0;
    if(typeof s.xp !== "number") s.xp = 0;
    if(typeof s.gold !== "number") s.gold = 0;
    if(typeof s.floor !== "number") s.floor = 0;
    if(typeof s.battleCount !== "number") s.battleCount = 0;
    s.subjects = (s.subjects && typeof s.subjects === "object") ? s.subjects : {};
    s.subjectsList = Array.isArray(s.subjectsList) ? s.subjectsList : ["화학2","물리1","수학","국어","영어"];
    s.sessions = Array.isArray(s.sessions) ? s.sessions : [];
    s.logs = Array.isArray(s.logs) ? s.logs : [];
    s.level = calcLevel(s.xp);
    return s;
  }catch(e){
    const s = defaultState();
    persist(p, s);
    return s;
  }
}

function persist(p = profile, s = state){
  localStorage.setItem(stateKey(p), JSON.stringify(s));
}

function pushLog(title, msg){
  state.logs.unshift({ title, msg, time: nowStamp() });
  state.logs = state.logs.slice(0, 200);
}

/* Subjects UI */
function renderSubjects(){
  if(!$subjectSelect) return;
  const cur = $subjectSelect.value;
  $subjectSelect.innerHTML = state.subjectsList.map(s => `<option value="${s}">${s}</option>`).join("");
  if(cur && state.subjectsList.includes(cur)) $subjectSelect.value = cur;
}
function renderSubjectsInto(sel){
  if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = state.subjectsList.map(s => `<option value="${s}">${s}</option>`).join("");
  if(cur && state.subjectsList.includes(cur)) sel.value = cur;
}

/* Stats UI */
function renderStats(){
  $dayText.textContent = String(state.day);
  $xpText.textContent = String(state.xp);
  $goldText.textContent = `${state.gold}G`;
  $floorText.textContent = `${state.floor}F`;
  $battleText.textContent = String(state.battleCount);
  state.level = calcLevel(state.xp);
  $levelText.textContent = String(state.level);
  $totalText.textContent = formatHMS(state.totalSeconds);
}

/* Sessions */
function addStudySession(subject, seconds){
  if(seconds <= 0) return { ok:false, error:"시간은 1초 이상이어야 해." };
  const g = computeGainsFromSeconds(seconds);
  if(g.minutes <= 0) return { ok:false, error:"1분 이상부터 XP가 쌓여. (초만 입력하면 0 XP)" };

  state.totalSeconds += seconds;
  state.xp += g.xpGain;
  state.gold += g.goldGain;
  state.floor += g.floorsUp;
  state.battleCount += 1;

  state.subjects[subject] = (state.subjects[subject] || 0) + seconds;

  const sess = {
    id: genId(),
    kind: "study",
    time: nowStamp(),
    day: state.day,
    subject,
    seconds,
    xpGain: g.xpGain,
    goldGain: g.goldGain,
    floorsUp: g.floorsUp
  };
  state.sessions.unshift(sess);
  pushLog("✅ 공부 기록", `${subject} / ${formatHMS(seconds)} → +XP ${g.xpGain} / +G ${g.goldGain} / +${g.floorsUp}F`);
  return { ok:true, session: sess };
}

function deleteSession(sessionId){
  const i = state.sessions.findIndex(s => s.id === sessionId);
  if(i === -1) return;
  const s = state.sessions[i];
  if(s.kind && s.kind !== "study") return alert("이 기록은 삭제할 수 없어.");

  if(!confirm(`이 기록을 삭제할까요?\n${s.subject} / ${formatHMS(s.seconds)}\n(되돌리면 XP/Gold/층도 함께 감소)`)) return;

  // reverse
  state.totalSeconds = Math.max(0, state.totalSeconds - s.seconds);
  state.xp = Math.max(0, state.xp - s.xpGain);
  state.gold = Math.max(0, state.gold - s.goldGain);
  state.floor = Math.max(0, state.floor - s.floorsUp);
  state.battleCount = Math.max(0, state.battleCount - 1);
  state.subjects[s.subject] = Math.max(0, (state.subjects[s.subject]||0) - s.seconds);

  state.sessions.splice(i,1);
  pushLog("🗑️ 기록 삭제", `${s.subject} / ${formatHMS(s.seconds)} 삭제`);
  persist(); renderStats(); renderLogs(); renderRecordsList();
}

function applySessionEdit(sessionId, newSubject, newSeconds){
  const i = state.sessions.findIndex(s => s.id === sessionId);
  if(i === -1) return false;
  const old = state.sessions[i];
  if(old.kind && old.kind !== "study") { alert("상점 구매 기록은 수정할 수 없어."); return false; }
  if(newSeconds <= 0) { alert("시간은 1초 이상"); return false; }
  const g = computeGainsFromSeconds(newSeconds);
  if(g.minutes <= 0){ alert("1분 이상부터 XP가 쌓여"); return false; }

  // reverse old
  state.totalSeconds = Math.max(0, state.totalSeconds - old.seconds);
  state.xp = Math.max(0, state.xp - old.xpGain);
  state.gold = Math.max(0, state.gold - old.goldGain);
  state.floor = Math.max(0, state.floor - old.floorsUp);
  state.subjects[old.subject] = Math.max(0, (state.subjects[old.subject]||0) - old.seconds);

  // apply new
  state.totalSeconds += newSeconds;
  state.xp += g.xpGain;
  state.gold += g.goldGain;
  state.floor += g.floorsUp;
  state.subjects[newSubject] = (state.subjects[newSubject]||0) + newSeconds;

  state.sessions[i] = { ...old, subject:newSubject, seconds:newSeconds, xpGain:g.xpGain, goldGain:g.goldGain, floorsUp:g.floorsUp };
  pushLog("✏️ 기록 수정", `${old.subject}/${formatHMS(old.seconds)} → ${newSubject}/${formatHMS(newSeconds)}`);
  persist(); renderStats(); renderLogs(); renderRecordsList();
  return true;
}

/* Logs UI (click-to-edit) */
function openEditSession(sessionId){
  const sess = state.sessions.find(s => s.id === sessionId);
  if(!sess) return;
  if(sess.kind && sess.kind !== "study") return alert("상점 구매 기록은 수정할 수 없어.");
  editingSessionId = sessionId;

  renderSubjectsInto($editSubjectSelect);
  $editSubjectSelect.value = sess.subject;

  const hms = secondsToHMS(sess.seconds);
  $editHours.value = String(hms.h);
  $editMinutes.value = String(hms.m);
  $editSeconds.value = String(hms.s);
  [$editHours,$editMinutes,$editSeconds].forEach(ensureNumberInputZero);
  openOverlay($editOverlay);
}

function renderLogs(){
  const sessionsHtml = state.sessions.slice(0, 25).map(s => `
    <div class="logItem clickable" data-edit="${s.id}">
      <div class="t">📌 ${s.subject}</div>
      <div class="m">${formatHMS(s.seconds)} (Day ${s.day}) → +XP ${s.xpGain} / +G ${s.goldGain} / +${s.floorsUp}F</div>
      <div class="m" style="opacity:.55">${s.time}</div>
    </div>
  `).join("");

  const sysHtml = state.logs.slice(0, 25).map(l => `
    <div class="logItem">
      <div class="t">${l.title}</div>
      <div class="m">${l.msg}</div>
      <div class="m" style="opacity:.55">${l.time}</div>
    </div>
  `).join("");

  $log.innerHTML = `
    <div class="logItem" style="border-style:dashed; opacity:.95;">
      <div class="t">🧾 최근 공부 기록 (클릭해서 수정)</div>
      <div class="m" style="opacity:.7;">삭제는 수정 창에서 가능</div>
    </div>
    ${sessionsHtml || `<div class="logItem"><div class="m" style="opacity:.7;">최근 기록 없음</div></div>`}
    <div class="logItem" style="border-style:dashed; opacity:.95; margin-top:8px;">
      <div class="t">📜 시스템 로그</div>
    </div>
    ${sysHtml}
  `;

  document.querySelectorAll("[data-edit]").forEach(el => {
    el.onclick = () => openEditSession(el.getAttribute("data-edit"));
  });
}

/* Records Manager */
function renderRecordsList(){
  const q = ($recordsSearch.value || "").trim().toLowerCase();
  const list = state.sessions.filter(s => s.kind === "study").slice(0, 200).filter(s => !q || s.subject.toLowerCase().includes(q));
  $recordsList.innerHTML = list.map(s => `
    <div class="recordRow clickable" data-edit="${s.id}">
      <input type="checkbox" class="recChk" data-rec-id="${s.id}" onclick="event.stopPropagation()"/>
      <div>
        <div style="font-weight:1000;">${s.subject} — ${formatHMS(s.seconds)}</div>
        <div class="recordMeta">Day ${s.day} · +XP ${s.xpGain} / +G ${s.goldGain} / +${s.floorsUp}F · ${s.time}</div>
      </div>
      <button class="smallBtn danger" data-del="${s.id}" type="button">삭제</button>
    </div>
  `).join("") || `<div class="logItem"><div class="m" style="opacity:.7;">표시할 기록이 없어</div></div>`;

  $recordsList.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); deleteSession(btn.getAttribute("data-del")); };
  });
  $recordsList.querySelectorAll("[data-edit]").forEach(row => {
    row.onclick = () => openEditSession(row.getAttribute("data-edit"));
  });
  $recordsSelectAll.checked = false;
}

function deleteSelectedSessions(){
  const chks = Array.from(document.querySelectorAll(".recChk:checked"));
  if(chks.length === 0) return alert("삭제할 기록을 선택해줘.");
  if(!confirm(`선택한 ${chks.length}개의 기록을 삭제할까요?\n(되돌리면 XP/Gold/층/누적시간이 같이 감소)`)) return;
  const ids = chks.map(c => c.getAttribute("data-rec-id"));
  ids.forEach(id => {
    // silent delete without confirm (study only)
    const i = state.sessions.findIndex(s => s.id === id && s.kind === "study");
    if(i === -1) return;
    const s = state.sessions[i];
    state.totalSeconds = Math.max(0, state.totalSeconds - s.seconds);
    state.xp = Math.max(0, state.xp - s.xpGain);
    state.gold = Math.max(0, state.gold - s.goldGain);
    state.floor = Math.max(0, state.floor - s.floorsUp);
    state.battleCount = Math.max(0, state.battleCount - 1);
    state.subjects[s.subject] = Math.max(0, (state.subjects[s.subject]||0) - s.seconds);
    state.sessions.splice(i, 1);
  });
  pushLog("🗑️ 선택 삭제", `${ids.length}개 기록 삭제`);
  persist(); renderStats(); renderLogs(); renderRecordsList();
}

/* Wire */
$addSubjectOpenBtn.onclick = () => {
  $addSubjectRow.classList.toggle("hidden");
  if(!$addSubjectRow.classList.contains("hidden")) $newSubjectInput.focus();
};
$addSubjectBtn.onclick = () => {
  const name = ($newSubjectInput.value || "").trim();
  if(!name) return alert("과목 이름을 입력해줘.");
  if(state.subjectsList.includes(name)) return alert("이미 있는 과목이야.");
  state.subjectsList.unshift(name);
  state.subjects[name] = state.subjects[name] || 0;
  $newSubjectInput.value = "";
  $addSubjectRow.classList.add("hidden");
  renderSubjects();
  $subjectSelect.value = name;
  persist();
};

$addStudyBtn.onclick = () => {
  const subject = $subjectSelect.value || "미분류";
  const h = Number($hoursInput.value || 0);
  const m = Number($minutesInput.value || 0);
  const s = Number($secondsInput.value || 0);
  const total = (h*3600) + (m*60) + s;
  const res = addStudySession(subject, total);
  if(!res.ok) return alert(res.error);
  $hoursInput.value = "0"; $minutesInput.value = "0"; $secondsInput.value = "0";
  persist(); renderStats(); renderLogs(); renderRecordsList();
};

$nextDayBtn.onclick = () => {
  state.day += 1;
  pushLog("🌅 Day 증가", `Day ${state.day} 시작`);
  persist(); renderStats(); renderLogs();
  setDropText(`Day ${state.day} 시작!`);
};

[$hoursInput,$minutesInput,$secondsInput].forEach(el => el.addEventListener("blur", ()=>ensureNumberInputZero(el)));

/* Profile overlay */
function renderProfileUI(){
  let list = getProfiles();
  if(list.length === 0){
    list = ["default"];
    setProfiles(list);
  }
  if(!list.includes(profile)){
    profile = list[0];
    setActiveProfile(profile);
    state = loadState(profile);
  }
  $profileSelect.innerHTML = list.map(p => `<option value="${p}">${p}</option>`).join("");
  $profileSelect.value = profile;
}
$profileBtn.onclick = () => { renderProfileUI(); openOverlay($profileOverlay); };
$closeProfileBtn.onclick = () => closeOverlay($profileOverlay);
$newProfileBtn.onclick = () => { $newProfileRow.classList.toggle("hidden"); if(!$newProfileRow.classList.contains("hidden")) $newProfileInput.focus(); };
$createProfileBtn.onclick = () => {
  const name = ($newProfileInput.value || "").trim();
  if(!name) return alert("이름을 입력해줘.");
  const list = getProfiles();
  if(list.includes(name)) return alert("이미 있는 프로필이야.");
  list.push(name);
  setProfiles(list);
  profile = name;
  setActiveProfile(profile);
  state = defaultState();
  persist(profile, state);
  $newProfileInput.value = "";
  $newProfileRow.classList.add("hidden");
  renderProfileUI();
  renderSubjects();
  renderStats(); renderLogs(); renderRecordsList();
};

$profileSelect.onchange = () => {
  const name = $profileSelect.value;
  profile = name;
  setActiveProfile(profile);
  state = loadState(profile);
  renderSubjects();
  renderStats(); renderLogs(); renderRecordsList();
};

$exportBtn.onclick = () => {
  const blob = new Blob([JSON.stringify({profile, state}, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `life-rpg-backup-${profile}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

$importBtn.onclick = () => $importFile.click();
$importFile.onchange = async () => {
  const f = $importFile.files && $importFile.files[0];
  if(!f) return;
  const txt = await f.text();
  try{
    const obj = JSON.parse(txt);
    if(!obj || !obj.profile || !obj.state) throw new Error("bad");
    const name = String(obj.profile);
    const list = getProfiles();
    if(!list.includes(name)) { list.push(name); setProfiles(list); }
    profile = name;
    setActiveProfile(profile);
    state = obj.state;
    persist(profile, state);
    renderProfileUI(); renderSubjects(); renderStats(); renderLogs(); renderRecordsList();
    alert("가져오기 완료!");
  }catch(e){
    alert("가져오기 실패: 파일이 올바르지 않아.");
  }
};

/* Records overlay */
$recordsBtn.onclick = () => { renderRecordsList(); openOverlay($recordsOverlay); };
$closeRecordsBtn.onclick = () => closeOverlay($recordsOverlay);
$recordsSearch.oninput = () => renderRecordsList();
$recordsSelectAll.onchange = () => {
  document.querySelectorAll(".recChk").forEach(c => c.checked = $recordsSelectAll.checked);
};
$deleteSelectedBtn.onclick = () => deleteSelectedSessions();

/* Edit overlay */
$closeEditBtn.onclick = () => { editingSessionId = null; closeOverlay($editOverlay); };
$saveEditBtn.onclick = () => {
  if(!editingSessionId) return;
  const subject = $editSubjectSelect.value || "미분류";
  const h = Number($editHours.value || 0);
  const m = Number($editMinutes.value || 0);
  const s = Number($editSeconds.value || 0);
  const total = (h*3600) + (m*60) + s;
  applySessionEdit(editingSessionId, subject, total);
  editingSessionId = null;
  closeOverlay($editOverlay);
};
$deleteEditBtn.onclick = () => {
  if(!editingSessionId) return;
  deleteSession(editingSessionId);
  editingSessionId = null;
  closeOverlay($editOverlay);
};

$editAddSubjectOpenBtn.onclick = () => {
  $editAddSubjectRow.classList.toggle("hidden");
  if(!$editAddSubjectRow.classList.contains("hidden")) $editNewSubjectInput.focus();
};
$editAddSubjectBtn.onclick = () => {
  const name = ($editNewSubjectInput.value || "").trim();
  if(!name) return alert("과목 이름을 입력해줘.");
  if(state.subjectsList.includes(name)) return alert("이미 있는 과목이야.");
  state.subjectsList.unshift(name);
  state.subjects[name] = state.subjects[name] || 0;
  $editNewSubjectInput.value = "";
  $editAddSubjectRow.classList.add("hidden");
  renderSubjects(); renderSubjectsInto($editSubjectSelect);
  $editSubjectSelect.value = name;
  persist();
};
[$editHours,$editMinutes,$editSeconds].forEach(el => el.addEventListener("blur", ()=>ensureNumberInputZero(el)));

/* Init */
try{
  // ensure profile list exists
  let list = getProfiles();
  if(list.length === 0){ list = ["default"]; setProfiles(list); }
  if(!list.includes(profile)){ profile = list[0]; setActiveProfile(profile); state = loadState(profile); }

  renderProfileUI();
  renderSubjects();
  renderStats();
  renderLogs();
  renderRecordsList();
  setDropText(`${APP_VERSION} 적용됨`);
}catch(err){
  console.error(err);
  setDropText("⚠️ JS 에러: F12 콘솔 확인");
}
