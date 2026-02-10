const PROFILES_KEY="life_rpg_profiles_v13",LEGACY_KEY="life_rpg_hardcore_v12";
function p2(n){return String(n).padStart(2,"0")}function nowStamp(){const d=new Date();return`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`}
function defaultState(){return{day:1,dayStatus:"INACTIVE",level:1,xp:0,gold:0,floor:0,battleCount:0,totalSeconds:0,reward:{active:false,label:null,url:null,endsAtMs:0},block:{active:false,label:null,endedAtMs:0},logs:[{time:nowStamp(),title:"새 프로필 생성",msg:"Day 1부터 시작"}],subjects:{},boss:{shown21:false,defeated21:false}}}
function readProfiles(){const raw=localStorage.getItem(PROFILES_KEY);if(raw){try{return JSON.parse(raw)}catch{}}
const pack={activeId:null,profiles:{}};const legacyRaw=localStorage.getItem(LEGACY_KEY);
if(legacyRaw){try{pack.profiles.legacy={name:"기존(자동이전)",state:JSON.parse(legacyRaw)};pack.activeId="legacy"}catch{}}
if(!pack.activeId){pack.profiles.p1={name:"기본",state:defaultState()};pack.activeId="p1"}
localStorage.setItem(PROFILES_KEY,JSON.stringify(pack));return pack}
function writeProfiles(p){localStorage.setItem(PROFILES_KEY,JSON.stringify(p))}
function genId(){return"p"+Math.random().toString(16).slice(2,10)}
function pushLog(s,t,m){s.logs.unshift({time:nowStamp(),title:t,msg:m});if(s.logs.length>250)s.logs.pop()}
function calcLevel(xp){return xp>=4000?5:xp>=3000?4:xp>=2000?3:xp>=1000?2:1}
function floorEvents(f){return({4:"각성층: 보너스 XP + 스탯 상승(연출)",7:"선택 이벤트층: XP 부스트 or 체력 회복(연출)",13:"금기층: 슬라임 분열, 희귀 드랍 확정(연출)",21:"중간 보스층: 거대 슬라임, 레벨업 확정(연출)",33:"멘탈 시험층: 랜덤 버프/디버프(연출)"})[f]||null}
function formatHMS(sec){sec=Math.max(0,Math.floor(sec));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return`${h}시간 ${m}분 ${s}초`}
function addStudySeconds(st,subject,seconds){
  if(!Number.isFinite(seconds)||seconds<=0)return{ok:false,error:"시간은 1초 이상이어야 해."};
  subject=(subject||"").trim()||"미분류";
  if(st.dayStatus!=="ACTIVE")pushLog(st,"⚠️ Day가 시작되지 않음",`"일어났어"로 Day 시작 추천 (현재 Day ${st.day})`);
  const minutes=Math.floor(seconds/60),xpGain=minutes,goldGain=Math.floor(minutes/10),floorsUp=Math.floor(minutes/10);
  st.totalSeconds+=seconds;st.xp+=xpGain;st.gold+=goldGain;
  const startFloor=st.floor;st.floor+=floorsUp;st.battleCount+=1;st.level=calcLevel(st.xp);
  st.subjects[subject]=(st.subjects[subject]||0)+seconds;
  for(let f=startFloor+1;f<=st.floor;f++){const ev=floorEvents(f);if(ev)pushLog(st,`🌟 특수층 도달: ${f}F`,ev)}
  pushLog(st,`📚 공부 추가: ${subject}`,`${formatHMS(seconds)} → +XP ${xpGain} / +G ${goldGain} / +${floorsUp}F`);
  return{ok:true}
}
const SHOP={YT30:{price:100,label:"유튜브 30분",minutes:30,url:"https://www.youtube.com"},DESSERT:{price:80,label:"디저트",minutes:20,url:null},WALK:{price:50,label:"산책",minutes:20,url:null},TEST1:{price:0,label:"테스트 1분",minutes:1,url:null}};
function msToMMSS(ms){const s=Math.max(0,Math.floor(ms/1000));return`${p2(Math.floor(s/60))}:${p2(s%60)}`}

// bind elements
const $=id=>document.getElementById(id);
const $stats=$("stats"),$log=$("log"),$lastDrop=$("lastDrop");
const $profileBtn=$("profileBtn"),$wakeBtn=$("wakeBtn"),$endDayBtn=$("endDayBtn"),$shopBtn=$("shopBtn"),$resetBtn=$("resetBtn");
const $subjectInput=$("subjectInput"),$hoursInput=$("hoursInput"),$minutesInput=$("minutesInput"),$secondsInput=$("secondsInput"),$addStudyBtn=$("addStudyBtn");
const $profileOverlay=$("profileOverlay"),$closeProfileBtn=$("closeProfileBtn"),$activeProfileLabel=$("activeProfileLabel"),$profileSelect=$("profileSelect"),$switchProfileBtn=$("switchProfileBtn"),$newProfileName=$("newProfileName"),$createProfileBtn=$("createProfileBtn"),$deleteProfileBtn=$("deleteProfileBtn");
const $shopOverlay=$("shopOverlay"),$closeShopBtn=$("closeShopBtn"),$shopInfo=$("shopInfo");
const $rewardOverlay=$("rewardOverlay"),$closeRewardBtn=$("closeRewardBtn"),$rewardName=$("rewardName"),$rewardTime=$("rewardTime"),$openRewardSiteBtn=$("openRewardSiteBtn"),$stopRewardBtn=$("stopRewardBtn");
const $bossOverlay=$("bossOverlay"),$bossFightBtn=$("bossFightBtn");

function openOverlay(el){el.classList.remove("hidden")}function closeOverlay(el){el.classList.add("hidden")}

let pack=readProfiles(),activeId=pack.activeId,activeProfile=pack.profiles[activeId],state=activeProfile.state;
function persist(){pack.profiles[activeId].state=state;pack.activeId=activeId;writeProfiles(pack)}
if(state.block&&state.block.active)location.replace("blocked.html");

function renderProfileUI(){
  $activeProfileLabel.textContent=activeProfile?.name||"-";
  $profileSelect.innerHTML=Object.entries(pack.profiles).map(([id,p])=>`<option value="${id}" ${id===activeId?"selected":""}>${p.name}</option>`).join("");
}
function renderStats(){
  const totalMin=Math.floor(state.totalSeconds/60);
  const items=[["프로필",activeProfile?.name||"-"],["Day",`Day ${state.day} (${state.dayStatus})`],["Level",`Lv.${state.level}`],["XP",`${state.xp}`],["Gold",`${state.gold}G`],["Tower",`${state.floor}F`],["Battle",`${state.battleCount}회`],["누적 공부",`${formatHMS(state.totalSeconds)} (${totalMin}분 기준 XP/Gold 계산)`],["보상 모드",state.reward.active?`진행중: ${state.reward.label}`:"없음"]];
  $stats.innerHTML=items.map(([k,v])=>`<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
}
function renderLogs(){
  $log.innerHTML=state.logs.slice(0,70).map(l=>`<div class="logItem"><div class="t">${l.title}</div><div class="m">${l.msg}</div><div class="m" style="opacity:.55">${l.time}</div></div>`).join("");
}
function setDropText(t){$lastDrop.innerHTML=t||"최근 드랍 없음"}

$profileBtn.onclick=()=>{renderProfileUI();openOverlay($profileOverlay)};
$closeProfileBtn.onclick=()=>closeOverlay($profileOverlay);
$switchProfileBtn.onclick=()=>{const id=$profileSelect.value;if(!id||!pack.profiles[id])return;persist();activeId=id;pack.activeId=id;writeProfiles(pack);location.href="index.html";}
$createProfileBtn.onclick=()=>{const name=($newProfileName.value||"").trim();if(!name)return alert("프로필 이름을 입력해줘.");const id=genId();pack.profiles[id]={name,state:defaultState()};pack.activeId=id;writeProfiles(pack);location.href="index.html";}
$deleteProfileBtn.onclick=()=>{const keys=Object.keys(pack.profiles);if(keys.length<=1)return alert("프로필은 최소 1개는 남아야 해.");if(!confirm(`현재 프로필 "${activeProfile.name}"을(를) 삭제할까요? (복구 불가)`))return;delete pack.profiles[activeId];pack.activeId=Object.keys(pack.profiles)[0];writeProfiles(pack);location.href="index.html";}

function activateBlockAndRedirect(label){state.block={active:true,label:label||"-",endedAtMs:Date.now()};persist();location.replace("blocked.html")}
function tickReward(){if(!state.reward.active)return;const left=state.reward.endsAtMs-Date.now();$rewardTime.textContent=msToMMSS(left);if(left<=0){const label=state.reward.label;pushLog(state,"⏰ 보상 시간 종료",`${label} 종료 → 차단 페이지 이동`);state.reward={active:false,label:null,url:null,endsAtMs:0};persist();activateBlockAndRedirect(label)}}
function startReward(sku){
  const item=SHOP[sku];if(!item)return;
  if(state.reward.active)return setDropText("보상 모드 진행중");
  if(state.gold<item.price){pushLog(state,"💸 골드 부족",`${item.label} 구매 실패 (필요 ${item.price}G)`);persist();renderLogs();return setDropText("골드 부족")}
  state.gold-=item.price;state.reward={active:true,label:item.label,url:item.url,endsAtMs:Date.now()+item.minutes*60*1000};
  pushLog(state,"🛒 상점 구매",`${item.label} (-${item.price}G) / ${item.minutes}분 시작`);persist();renderStats();renderLogs();
  $rewardName.textContent=item.label;$rewardTime.textContent=msToMMSS(item.minutes*60*1000);openOverlay($rewardOverlay)
}
function stopReward(){if(!state.reward.active)return;pushLog(state,"⏹ 보상 종료",`${state.reward.label} 종료(사용자)`);state.reward={active:false,label:null,url:null,endsAtMs:0};persist();renderStats();renderLogs();closeOverlay($rewardOverlay)}

function maybeShowBoss21(){if(state.floor>=21&&!state.boss.shown21&&!state.boss.defeated21){state.boss.shown21=true;persist();openOverlay($bossOverlay)}}
function defeatBoss21(){if(state.boss.defeated21)return;state.boss.defeated21=true;pushLog(state,"👑 21F 보스 처치!","XP +500");state.xp+=500;state.level=calcLevel(state.xp);persist();renderStats();renderLogs();closeOverlay($bossOverlay);setDropText("보스 격파!")}

$wakeBtn.onclick=()=>{if(state.reward.active)return setDropText("보상 모드 중");state.day+=1;state.dayStatus="ACTIVE";pushLog(state,"🌅 Day 시작",`Day ${state.day} 시작`);persist();renderStats();renderLogs()}
$endDayBtn.onclick=()=>{if(state.reward.active)return setDropText("보상 모드 중");state.dayStatus="COMPLETED";pushLog(state,"✅ Day 마감",`Day ${state.day} 종료`);persist();renderStats();renderLogs()}
$resetBtn.onclick=()=>{if(!confirm(`현재 프로필 "${activeProfile.name}" 진행을 초기화할까요? (복구 불가)`))return;state=defaultState();pack.profiles[activeId].state=state;persist();location.href="index.html";}
$addStudyBtn.onclick=()=>{
  if(state.reward.active)return setDropText("보상 모드 중");
  const h=Number($hoursInput.value||0),m=Number($minutesInput.value||0),s=Number($secondsInput.value||0);
  const total=h*3600+m*60+s;const res=addStudySeconds(state,$subjectInput.value,total);if(!res.ok)return alert(res.error);
  persist();renderStats();renderLogs();$minutesInput.value="";$secondsInput.value="";maybeShowBoss21();
}
$shopBtn.onclick=()=>{if(state.reward.active){openOverlay($rewardOverlay);return;}$shopInfo.textContent=`현재 Gold: ${state.gold}G / 테스트 1분은 0G`;openOverlay($shopOverlay)}
$closeShopBtn.onclick=()=>closeOverlay($shopOverlay)
document.querySelectorAll(".shopItem").forEach(btn=>btn.onclick=()=>{startReward(btn.dataset.sku);closeOverlay($shopOverlay)})
$closeRewardBtn.onclick=()=>closeOverlay($rewardOverlay)
$openRewardSiteBtn.onclick=()=>{if(!state.reward.active)return;if(state.reward.url)window.open(state.reward.url,"_blank","noopener,noreferrer");pushLog(state,"🔗 보상 사이트 열기",state.reward.url?state.reward.url:"외부 링크 없음");persist();renderLogs()}
$stopRewardBtn.onclick=stopReward
$bossFightBtn.onclick=defeatBoss21

// Canvas pixel render
const ctx=document.getElementById("gameCanvas").getContext("2d");const PX=4,GW=520/PX,GH=520/PX;
function drawPixel(x,y,c){ctx.fillStyle=c;ctx.fillRect(x*PX,y*PX,PX,PX)}
function drawCircle(cx,cy,r,p){for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){const d=x*x+y*y;if(d<=r*r){const t=(x+y)/(2*r);const idx=t<-0.2?0:t<0.2?1:2;drawPixel(cx+x,cy+y,p[Math.max(0,Math.min(2,idx))])}}}
function drawStarfield(){for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){const g=Math.floor(10+(y/GH)*10);drawPixel(x,y,`rgb(${6+g},${3+g},${18+g})`)}
for(let i=0;i<260;i++){const x=(i*73)%GW,y=(i*91)%GH,b=180+(i%70);drawPixel(x,y,`rgb(${b},${b},${b})`);if(i%7===0&&x+1<GW)drawPixel(x+1,y,`rgb(${b-30},${b-30},${b-30})`)}
const planets=[{x:12,y:20,r:9,p:["#ffb65c","#e0882f","#b55a18"]},{x:48,y:18,r:8,p:["#bfe6ff","#7bb7ff","#3f78d7"]},{x:78,y:34,r:7,p:["#ffd2d2","#d996a7","#a45d6f"]},{x:20,y:82,r:10,p:["#c9c9cf","#8e8ea1","#5c5c73"]},{x:82,y:84,r:9,p:["#ffdb7a","#d8a94d","#a36c2d"]}];
for(const pl of planets)drawCircle(pl.x,pl.y,pl.r,pl.p);drawCircle(62,64,8,["#ffe2a0","#d4a86a","#a8743d"]);
for(let x=-12;x<=12;x++){if(Math.abs(x)<2)continue;drawPixel(62+x,64,"#c9b38a");drawPixel(62+x,65,"#9c8762")}}
function drawTower(floor){const tx=14,ty=34,tw=18,th=84;for(let y=0;y<th;y++)for(let x=0;x<tw;x++){const edge=x==0||x==tw-1||y==0||y==th-1;drawPixel(tx+x,ty+y,edge?"#2a3a75":"#1b2552")}
const floorsToDraw=20,step=Math.floor(th/floorsToDraw);for(let i=0;i<floorsToDraw;i++){const y=ty+th-2-i*step;for(let x=2;x<tw-2;x++)drawPixel(tx+x,y,"rgba(255,255,255,0.10)")}
const marker=floor%floorsToDraw,my=ty+th-2-marker*step;for(let k=0;k<3;k++){drawPixel(tx-2,my-k,"#3a4cff");drawPixel(tx-3,my-k,"#91a0ff")}for(let x=0;x<tw;x++)drawPixel(tx+x,ty-1,"#3a4cff")}
function drawSlime(t){const sx=62,sy=104,wob=Math.round(Math.sin(t/18)*2),body=["#62ffb6","#29d897","#10946c"];
for(let y=-10;y<=10;y++)for(let x=-12;x<=12;x++){const d=(x*x)/144+(y*y)/100;if(d<=1){const idx=y<-3?0:y<4?1:2;drawPixel(sx+x,sy+y+wob,body[idx])}}
drawPixel(sx-5,sy-2+wob,"#0b0f1a");drawPixel(sx-6,sy-2+wob,"#0b0f1a");drawPixel(sx+5,sy-2+wob,"#0b0f1a");drawPixel(sx+6,sy-2+wob,"#0b0f1a");
drawPixel(sx-8,sy-6+wob,"rgba(255,255,255,0.35)");drawPixel(sx-7,sy-7+wob,"rgba(255,255,255,0.25)")}
function renderCanvas(t){drawStarfield();drawTower(state.floor);drawSlime(t);ctx.fillStyle="rgba(255,255,255,0.90)";ctx.font="16px system-ui";ctx.fillText(`${state.floor}F`,14*PX,26*PX)}
let t=0;function loop(){t++;tickReward();renderCanvas(t);requestAnimationFrame(loop)}

renderStats();renderLogs();renderProfileUI();setDropText("v1.3: 프로필 저장/전환 + 새 프로필 Day1 시작");
if(state.reward.active){$rewardName.textContent=state.reward.label;openOverlay($rewardOverlay)}maybeShowBoss21();loop();
