const STORAGE_KEY = "life_rpg_hardcore";

function now() {
  return new Date().toLocaleString();
}

function defaultState() {
  return {
    day: 2,
    dayStatus: "COMPLETED",
    level: 2,
    xp: 1251,
    gold: 187,
    floor: 20,
    battle: 9,
    totalMinutes: 1251,
    logs: [{ t: now(), title: "시작", msg: "Day 1~2 완료, Day 3 대기" }]
  };
}

function save(s){ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
function load(){
  const d = localStorage.getItem(STORAGE_KEY);
  return d ? JSON.parse(d) : defaultState();
}

const state = load();

function log(title, msg){
  state.logs.unshift({ t: now(), title, msg });
}

function renderStats(){
  const s = document.getElementById("stats");
  s.innerHTML = `
    <div class="stat"><div class="k">Day</div><div class="v">${state.day}</div></div>
    <div class="stat"><div class="k">Level</div><div class="v">${state.level}</div></div>
    <div class="stat"><div class="k">XP</div><div class="v">${state.xp}</div></div>
    <div class="stat"><div class="k">Gold</div><div class="v">${state.gold}G</div></div>
    <div class="stat"><div class="k">Tower</div><div class="v">${state.floor}F</div></div>
    <div class="stat"><div class="k">누적 공부</div><div class="v">${state.totalMinutes}분</div></div>
  `;
}

function renderLogs(){
  const l = document.getElementById("log");
  l.innerHTML = state.logs.slice(0,40).map(x=>`
    <div class="logItem">
      <b>${x.title}</b><br/>
      ${x.msg}<br/>
      <small>${x.t}</small>
    </div>
  `).join("");
}

document.getElementById("wakeBtn").onclick = ()=>{
  state.day++;
  state.dayStatus="ACTIVE";
  log("🌅 Day 시작", `Day ${state.day}`);
  save(state);
  renderStats(); renderLogs();
};

document.getElementById("endDayBtn").onclick = ()=>{
  state.dayStatus="COMPLETED";
  log("✅ Day 종료", `Day ${state.day}`);
  save(state);
  renderStats(); renderLogs();
};

document.getElementById("addStudyBtn").onclick = ()=>{
  const m = Number(document.getElementById("minutesInput").value);
  if(!m||m<=0) return alert("시간 입력");

  const xp = m;
  const g = Math.floor(m/10);
  const f = Math.floor(m/10);

  state.totalMinutes+=m;
  state.xp+=xp;
  state.gold+=g;
  state.floor+=f;
  state.battle++;

  log("📚 공부", `${m}분 → XP+${xp}, Gold+${g}, +${f}F`);
  save(state);
  renderStats(); renderLogs();
};

renderStats();
renderLogs();
