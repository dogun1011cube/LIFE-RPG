import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../GameContext';
import { ItemIcon } from '../icons';
import { ITEMS, RARITY_COLOR, RARITY_NAME, CATEGORY_NAME } from '../../game/data/items';
import { RECIPES, STATION_NAME, RECIPE_CATEGORY_NAME, type RecipeDef, type StationId } from '../../game/data/recipes';
import { QUESTS, QUEST_BY_ID } from '../../game/data/quests';
import { LOCATIONS } from '../../game/data/locations';
import { ATTR_INFO, ATTR_ORDER, xpToNext } from '../../game/systems/Stats';
import { Inv } from '../../game/systems/Inventory';
import { drawWorldMap } from '../mapDraw';
import type { MenuTab } from '../../game/Game';
import type { Slot } from '../../game/state/types';
import { SKILLS, TREE_INFO, SKILL_KEY_LABELS, type SkillTree } from '../../game/data/skills';
import { rank } from '../../game/systems/Stats';
import { DUNGEON_ORIGIN } from '../../game/world/Dungeon';
import { MAP_REGION } from '../../game/config';
import { JOBS, JOB_ORDER, TIERS, MARKET_STOCK, FOOD_VALUE, type JobId } from '../../game/data/village';
import { CivTab } from './CivTab';

const TABS: { id: MenuTab; name: string; key: string }[] = [
  { id: 'inventory', name: '인벤토리', key: 'Tab' },
  { id: 'skills', name: '스킬', key: 'K' },
  { id: 'crafting', name: '제작', key: 'C' },
  { id: 'quests', name: '퀘스트', key: 'J' },
  { id: 'map', name: '지도', key: 'M' },
  { id: 'village', name: '마을', key: 'H' },
  { id: 'civ', name: '문명', key: 'L' },
];

export function MenuShell() {
  const game = useGame();
  const tab = game.ui.menuTab;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && game.closePanel(true)}>
      <div className="window">
        <div className="window-head">
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => game.openMenu(t.id)}>
                {t.name}
                <kbd>{t.key}</kbd>
              </button>
            ))}
          </div>
          <button className="close-btn" onClick={() => game.closePanel(true)} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="window-body">
          {tab === 'inventory' && <InventoryTab />}
          {tab === 'skills' && <SkillsTab />}
          {tab === 'crafting' && <CraftingTab />}
          {tab === 'quests' && <QuestsTab />}
          {tab === 'map' && <MapTab />}
          {tab === 'village' && <VillageTab />}
          {tab === 'civ' && <CivTab />}
        </div>
      </div>
    </div>
  );
}

// ── Shared slot grid ─────────────────────────────────────
export function SlotView({ slot, selected, onClick, onDouble, onDrop, index, dragScope }: { slot: Slot; selected?: boolean; onClick?: () => void; onDouble?: () => void; onDrop?: (from: number) => void; index: number; dragScope: string }) {
  const def = slot ? ITEMS[slot.id] : null;
  return (
    <div
      className={`slot ${selected ? 'sel' : ''} ${slot ? 'filled' : ''}`}
      style={def ? { borderColor: RARITY_COLOR[def.rarity] + '88' } : undefined}
      onClick={onClick}
      onDoubleClick={onDouble}
      draggable={!!slot}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', `${dragScope}:${index}`);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const [scope, idx] = e.dataTransfer.getData('text/plain').split(':');
        if (scope === dragScope && onDrop) onDrop(Number(idx));
      }}
      title={def ? def.name : ''}
    >
      {slot && <ItemIcon id={slot.id} size={38} />}
      {slot && slot.qty > 1 && <span className="qty">{slot.qty}</span>}
    </div>
  );
}

function ItemDetails({ id, children }: { id: string; children?: React.ReactNode }) {
  const def = ITEMS[id];
  return (
    <div className="details">
      <div className="details-head">
        <div className="details-icon" style={{ borderColor: RARITY_COLOR[def.rarity] }}>
          <ItemIcon id={id} size={56} />
        </div>
        <div>
          <div className="details-name" style={{ color: RARITY_COLOR[def.rarity] }}>
            {def.name}
          </div>
          <div className="details-sub">
            {RARITY_NAME[def.rarity]} · {CATEGORY_NAME[def.category]}
          </div>
        </div>
      </div>
      <p className="details-desc">{def.desc}</p>
      <div className="details-stats">
        {def.weapon && <div>공격력 +{def.weapon.damage}</div>}
        {def.weapon && <div>사거리 {def.weapon.reach.toFixed(1)}m</div>}
        {def.tool && <div>{def.tool.kind === 'axe' ? '벌목' : '채광'} 위력 {def.tool.power} · 등급 {def.tool.tier}</div>}
        {def.armor && <div>방어력 +{def.armor.defense}</div>}
        {def.trinket?.hp && <div>최대 체력 +{def.trinket.hp}</div>}
        {def.trinket?.mana && <div>최대 마나 +{def.trinket.mana}</div>}
        {def.trinket?.manaRegen && <div>마나 회복 +{def.trinket.manaRegen}/초</div>}
        {def.trinket?.crit && <div>치명타 확률 +{Math.round(def.trinket.crit * 100)}%</div>}
        {def.trinket?.attackPct && <div>공격력 +{Math.round(def.trinket.attackPct * 100)}%</div>}
        {def.trinket?.defense && <div>방어력 +{def.trinket.defense}</div>}
        {def.use?.mana && <div>마나 회복 +{def.use.mana}</div>}
        {def.use?.resetSkills && <div>모든 스킬 포인트 반환</div>}
        {def.use?.heal && <div>체력 회복 +{def.use.heal}</div>}
        {def.use?.hot && (
          <div>
            {def.use.hot.duration}초간 체력 +{def.use.hot.amount}
          </div>
        )}
        {def.use?.buff === 'well_fed' && <div>배부름: 체력·스태미나 회복 증가 (150초)</div>}
      </div>
      {children}
    </div>
  );
}

function InventoryTab() {
  const game = useGame();
  const p = game.state.player;
  const st = game.stats;
  const [sel, setSel] = useState<number | null>(null);
  const slot = sel !== null ? p.inventory[sel] : null;
  const def = slot ? ITEMS[slot.id] : null;
  const need = xpToNext(p.level);
  return (
    <div className="inv-layout">
      <div className="char-col">
        <div className="char-name">
          {p.name} <span>Lv.{p.level}</span>
        </div>
        <div className="xp-mini">
          <div style={{ width: `${(p.xp / need) * 100}%` }} />
        </div>
        <div className="muted small">
          경험치 {p.xp} / {need}
        </div>
        <div className="equip-row">
          {(['weapon', 'armor', 'trinket'] as const).map((k) => (
            <div key={k} className="equip-slot" onClick={() => game.unequip(k)} title="클릭하여 해제">
              <div className="slot filled">{p.equipment[k] ? <ItemIcon id={p.equipment[k]!} size={40} /> : <span className="muted small">{{ weapon: '무기', armor: '방어구', trinket: '장신구' }[k]}</span>}</div>
              <div className="equip-label">{p.equipment[k] ? ITEMS[p.equipment[k]!].name : { weapon: '무기 없음', armor: '방어구 없음', trinket: '장신구 없음' }[k]}</div>
            </div>
          ))}
        </div>
        <div className="stat-list">
          <div>
            <span>체력</span>
            <b>
              {Math.ceil(p.hp)} / {st.maxHp}
            </b>
          </div>
          <div>
            <span>스태미나</span>
            <b>{st.maxStamina}</b>
          </div>
          <div>
            <span>마나</span>
            <b>
              {Math.floor(p.mana ?? 0)} / {st.maxMana}
            </b>
          </div>
          <div>
            <span>마력</span>
            <b>{Math.round(st.magicPower)}</b>
          </div>
          <div>
            <span>공격력</span>
            <b>{Math.round(st.attack)}</b>
          </div>
          <div>
            <span>방어력</span>
            <b>{st.defense.toFixed(1)}</b>
          </div>
          <div>
            <span>치명타 확률</span>
            <b>{(st.critChance * 100).toFixed(1)}%</b>
          </div>
          <div>
            <span>이동 속도</span>
            <b>{Math.round(st.moveMult * 100)}%</b>
          </div>
          <div>
            <span>채집 속도</span>
            <b>{Math.round(st.gatherSpeed * 100)}%</b>
          </div>
        </div>
        <div className="attr-head">
          능력치 {p.attrPoints > 0 && <span className="pts-badge">포인트 {p.attrPoints}</span>}
        </div>
        {ATTR_ORDER.map((a) => (
          <div key={a} className="attr-row" title={ATTR_INFO[a].desc}>
            <span className="attr-name">{ATTR_INFO[a].name}</span>
            <span className="attr-desc">{ATTR_INFO[a].desc}</span>
            <b>{p.attrs[a]}</b>
            <button className="btn tiny" disabled={p.attrPoints <= 0} onClick={() => game.allocateAttr(a)}>
              +
            </button>
          </div>
        ))}
      </div>
      <div className="grid-col">
        <div className="grid-head">
          <span>소지품</span>
          <button className="btn small" onClick={() => game.sortInventory()}>
            정렬
          </button>
        </div>
        <div className="slot-grid">
          {p.inventory.map((s, i) => (
            <SlotView
              key={i}
              index={i}
              dragScope="inv"
              slot={s}
              selected={sel === i}
              onClick={() => setSel(i)}
              onDouble={() => game.useSlot(i)}
              onDrop={(from) => {
                game.moveSlot(from, i);
                setSel(i);
              }}
            />
          ))}
        </div>
        <div className="grid-head">
          <span>단축키 (1-4)</span>
        </div>
        <div className="hotbar-edit">
          {p.hotbar.map((id, i) => (
            <div key={i} className="slot filled small-slot" onClick={() => game.assignHotbar(i, null)} title="클릭하여 비우기">
              {id && <ItemIcon id={id} size={30} />}
              <span className="hb-key">{i + 1}</span>
            </div>
          ))}
        </div>
        <div className="muted small tip">더블클릭: 사용/장착 · 드래그: 이동 · 도구는 소지만 해도 자동 사용</div>
      </div>
      <div className="detail-col">
        {slot && def ? (
          <ItemDetails id={slot.id}>
            <div className="detail-actions">
              {(def.category === 'weapon' || def.category === 'armor' || def.category === 'accessory') && (
                <button className="btn primary" onClick={() => game.equipFromSlot(sel!)}>
                  장착
                </button>
              )}
              {def.use && (
                <button className="btn primary" onClick={() => game.useSlot(sel!)}>
                  사용
                </button>
              )}
              {slot.id === 'settlement_charter' && (
                <button className="btn primary" onClick={() => game.useSlot(sel!)}>
                  읽기
                </button>
              )}
              {def.category === 'consumable' && (
                <div className="assign">
                  단축키:
                  {[0, 1, 2, 3].map((k) => (
                    <button key={k} className={`btn tiny ${p.hotbar[k] === slot.id ? 'on' : ''}`} onClick={() => game.assignHotbar(k, slot.id)}>
                      {k + 1}
                    </button>
                  ))}
                </div>
              )}
              <div className="assign">
                <button className="btn small" onClick={() => game.dropSlot(sel!, false)}>
                  1개 버리기
                </button>
                {slot.qty > 1 && (
                  <button className="btn small" onClick={() => game.dropSlot(sel!, true)}>
                    모두 버리기
                  </button>
                )}
              </div>
            </div>
          </ItemDetails>
        ) : (
          <div className="details empty-details">
            <p className="muted">아이템을 선택하세요.</p>
            <p className="muted small">무기와 방어구는 장착해야 효과가 있습니다. 산딸기, 고기 같은 소모품은 단축키 1~4에 등록해 전투 중에 사용하세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CraftingTab() {
  const game = useGame();
  const [cat, setCat] = useState<string>('all');
  const [onlyCraftable, setOnlyCraftable] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const near = game.stationsNear();
  const known = game.state.knownRecipes;
  const inv = game.state.player.inventory;
  const list = RECIPES.filter((r) => known.includes(r.id) && (cat === 'all' || r.category === cat) && (!onlyCraftable || game.canCraft(r, near).ok));
  const unknownCount = RECIPES.length - known.length;
  const sel: RecipeDef | undefined = RECIPES.find((r) => r.id === selId) ?? list[0];
  const cats = ['all', ...Object.keys(RECIPE_CATEGORY_NAME)];
  const can = sel ? game.canCraft(sel, near) : null;
  return (
    <div className="craft-layout">
      <div className="craft-list-col">
        <div className="stations">
          {(['workbench', 'campfire', 'furnace'] as StationId[]).map((s) => (
            <span key={s} className={`station ${near.has(s) ? 'on' : ''}`}>
              {near.has(s) ? '✓' : '✕'} {STATION_NAME[s]}
            </span>
          ))}
        </div>
        <div className="chips">
          {cats.map((c) => (
            <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>
              {c === 'all' ? '전체' : RECIPE_CATEGORY_NAME[c as RecipeDef['category']]}
            </button>
          ))}
          <label className="check">
            <input type="checkbox" checked={onlyCraftable} onChange={(e) => setOnlyCraftable(e.target.checked)} /> 제작 가능만
          </label>
        </div>
        <div className="recipe-list">
          {list.map((r) => {
            const c = game.canCraft(r, near);
            return (
              <div key={r.id} className={`recipe-row ${sel?.id === r.id ? 'sel' : ''}`} onClick={() => setSelId(r.id)}>
                <ItemIcon id={r.output} size={32} />
                <div className="rr-text">
                  <div style={{ color: RARITY_COLOR[ITEMS[r.output].rarity] }}>
                    {ITEMS[r.output].name}
                    {r.qty > 1 ? ` ×${r.qty}` : ''}
                  </div>
                  <small>{r.station ? STATION_NAME[r.station] : '맨손 제작'}</small>
                </div>
                <span className={`dot ${c.ok ? 'ok' : r.station && !near.has(r.station) ? 'far' : 'no'}`} />
              </div>
            );
          })}
          {list.length === 0 && <div className="muted small pad">해당하는 제작법이 없습니다.</div>}
          {unknownCount > 0 && <div className="muted small pad">🔒 아직 발견하지 못한 제작법 {unknownCount}개 — 새로운 재료를 얻거나, 레벨을 올리거나, 고대의 기록을 읽어 해금하세요.</div>}
        </div>
      </div>
      <div className="craft-detail-col">
        {sel && can ? (
          <ItemDetails id={sel.output}>
            <div className="req">
              <div className="req-title">필요 재료</div>
              {sel.inputs.map((c) => {
                const have = Inv.count(inv, c.item);
                return (
                  <div key={c.item} className={`req-row ${have >= c.qty ? 'ok' : 'no'}`}>
                    <ItemIcon id={c.item} size={26} />
                    <span>{ITEMS[c.item].name}</span>
                    <b>
                      {have} / {c.qty}
                    </b>
                  </div>
                );
              })}
              <div className="req-title">제작 시설</div>
              <div className={`req-row ${!sel.station || near.has(sel.station) ? 'ok' : 'no'}`}>
                <span>{sel.station ? STATION_NAME[sel.station] : '필요 없음 (맨손)'}</span>
                <b>{!sel.station ? '' : near.has(sel.station) ? '근처에 있음' : '근처에 없음 — 건축 모드[B]로 설치'}</b>
              </div>
            </div>
            <div className="craft-actions">
              <button className="btn primary big" disabled={!can.ok} onClick={() => game.craft(sel.id, 1)}>
                제작
              </button>
              <button className="btn" disabled={can.max < 5} onClick={() => game.craft(sel.id, 5)}>
                ×5
              </button>
              <button className="btn" disabled={can.max < 2} onClick={() => game.craft(sel.id, can.max)}>
                최대 ({can.max})
              </button>
            </div>
            {!can.ok && <div className="warn-text">{can.reason}</div>}
            <div className="muted small">제작 경험치 +{sel.xp}</div>
          </ItemDetails>
        ) : (
          <div className="details empty-details muted">제작법을 선택하세요.</div>
        )}
      </div>
    </div>
  );
}

function QuestsTab() {
  const game = useGame();
  const qs = game.state.quests;
  const active = QUESTS.filter((q) => qs.active.some((a) => a.id === q.id));
  const done = QUESTS.filter((q) => qs.completed.includes(q.id));
  const [selId, setSelId] = useState<string | null>(null);
  const sel = selId ? QUEST_BY_ID[selId] : active[0] ?? done[0];
  const toggleTrack = (id: string) => {
    if (qs.tracked.includes(id)) qs.tracked = qs.tracked.filter((t) => t !== id);
    else qs.tracked = [id, ...qs.tracked].slice(0, 4);
    game.bridge.bump();
  };
  return (
    <div className="quest-layout">
      <div className="quest-list">
        <div className="list-head">진행 중 ({active.length})</div>
        {active.map((q) => (
          <div key={q.id} className={`quest-row ${sel?.id === q.id ? 'sel' : ''}`} onClick={() => setSelId(q.id)}>
            <span className={`q-badge ${q.chain}`}>{q.chain === 'main' ? '메인' : '서브'}</span>
            {q.title}
            {qs.tracked.includes(q.id) && <span className="tracked">추적</span>}
          </div>
        ))}
        <div className="list-head">완료 ({done.length})</div>
        {done.map((q) => (
          <div key={q.id} className={`quest-row done ${sel?.id === q.id ? 'sel' : ''}`} onClick={() => setSelId(q.id)}>
            <span className={`q-badge ${q.chain}`}>{q.chain === 'main' ? '메인' : '서브'}</span>
            {q.title} ✓
          </div>
        ))}
      </div>
      <div className="quest-detail">
        {sel ? (
          <>
            <div className="qd-title">{sel.title}</div>
            <div className="qd-summary">{sel.summary}</div>
            <p className="qd-desc">{sel.description}</p>
            <div className="req-title">목표</div>
            {game.quests.objectiveViews(sel.id).map((o, i) => (
              <div key={i} className={`obj ${o.done ? 'done' : ''}`}>
                <span>
                  {o.done ? '✓' : '○'} {o.label}
                </span>
                <div className="obj-bar">
                  <div style={{ width: `${(o.current / o.target) * 100}%` }} />
                </div>
                <b>
                  {o.current}/{o.target}
                </b>
              </div>
            ))}
            <div className="req-title">보상</div>
            <div className="rewards">
              <span className="xp-pill">+{sel.rewards.xp} XP</span>
              {sel.rewards.items?.map((it) => (
                <span key={it.item} className="reward-item">
                  <ItemIcon id={it.item} size={22} /> {ITEMS[it.item].name} ×{it.qty}
                </span>
              ))}
            </div>
            {qs.active.some((a) => a.id === sel.id) && (
              <button className="btn" onClick={() => toggleTrack(sel.id)}>
                {qs.tracked.includes(sel.id) ? '추적 해제' : '화면에 추적'}
              </button>
            )}
          </>
        ) : (
          <div className="muted">퀘스트가 없습니다.</div>
        )}
      </div>
    </div>
  );
}

function MapTab() {
  const game = useGame();
  const ref = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number] | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cz: number } | null>(null);
  const pp = game.player.body.pos;
  const inD = game.inDungeon;
  // zoom 1 shows the island you are on; zoom out further for the whole sea chart
  const isle = game.terrain.islandOf(pp.x, pp.z) ?? game.terrain.home;
  const span = (inD ? 90 : zoom < 1 ? MAP_REGION.size : isle.size) / Math.max(1, zoom);
  const cx = center ? center[0] : inD ? DUNGEON_ORIGIN.x : zoom < 1 ? MAP_REGION.cx : zoom === 1 ? isle.cx : pp.x;
  const cz = center ? center[1] : inD ? DUNGEON_ORIGIN.z + 34 : zoom < 1 ? MAP_REGION.cz : zoom === 1 ? isle.cz : pp.z;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    drawWorldMap(c.getContext('2d')!, game, cx, cz, span, c.width, c.height, { fog: true, labels: true, enemies: false, scale: 1.4 });
  });
  const discovered = useMemo(() => LOCATIONS.filter((l) => game.state.discovered.includes(l.id)), [game.state.discovered.length]); // eslint-disable-line
  return (
    <div className="map-layout">
      <div className="map-canvas-wrap">
        <canvas
          ref={ref}
          width={620}
          height={620}
          className="map-canvas"
          onWheel={(e) => setZoom((z) => (z < 1 ? (e.deltaY < 0 ? 1 : z) : z <= 1 && e.deltaY > 0 ? 0.5 : Math.max(1, Math.min(6, z * (e.deltaY < 0 ? 1.25 : 0.8)))))}
          onMouseDown={(e) => (drag.current = { x: e.clientX, y: e.clientY, cx, cz })}
          onMouseMove={(e) => {
            if (!drag.current) return;
            const k = span / 620;
            setCenter([drag.current.cx - (e.clientX - drag.current.x) * k, drag.current.cz - (e.clientY - drag.current.y) * k]);
          }}
          onMouseUp={() => (drag.current = null)}
          onMouseLeave={() => (drag.current = null)}
        />
        <div className="map-tools">
          <button className="btn tiny" onClick={() => setZoom((z) => Math.min(6, z * 1.5))}>
            +
          </button>
          <button className="btn tiny" onClick={() => setZoom((z) => (z <= 1 ? 0.5 : Math.max(1, z / 1.5)))}>
            −
          </button>
          <button className="btn tiny" title="해도: 두 섬과 바다 전체" onClick={() => (setZoom(0.5), setCenter(null))}>
            🗺
          </button>
          <button className="btn tiny" onClick={() => setCenter(null)}>
            ◎
          </button>
        </div>
      </div>
      <div className="map-side">
        <div className="req-title">발견한 장소 ({discovered.length}/{LOCATIONS.length})</div>
        {LOCATIONS.map((l) => {
          const d = game.state.discovered.includes(l.id);
          const r = game.state.revealed.includes(l.id);
          return (
            <div key={l.id} className={`loc-row ${d ? '' : 'unknown'}`} onClick={() => d && (setZoom(3), setCenter([l.x, l.z]))}>
              <span className="loc-mark">{d ? '◆' : r ? '?' : '·'}</span>
              <div>
                <div>{d ? l.name : r ? '표시된 장소' : '미발견'}</div>
                {d && <small>{l.subtitle}</small>}
              </div>
            </div>
          );
        })}
        <div className="muted small pad">
          좌표 X {Math.round(pp.x)} · Z {Math.round(pp.z)}
          <br />
          휠: 확대/축소 · 드래그: 이동
        </div>
      </div>
    </div>
  );
}

function SkillsTab() {
  const game = useGame();
  const p = game.state.player;
  const trees: SkillTree[] = ['combat', 'survival', 'arcane'];
  return (
    <div className="skills-layout">
      <div className="skills-head">
        <span className={`sp-count ${p.skillPoints > 0 ? 'has' : ''}`}>스킬 포인트 {p.skillPoints}</span>
        <span className="muted small">레벨이 오를 때마다 1포인트. 액티브 스킬은 R · T · G · V 칸에 등록해 사용합니다. 망각의 서로 초기화할 수 있습니다.</span>
      </div>
      <div className="skill-trees">
        {trees.map((t) => (
          <div key={t} className="skill-tree">
            <div className="tree-head" style={{ color: TREE_INFO[t].color }}>
              {TREE_INFO[t].name}
              <small>{TREE_INFO[t].desc}</small>
            </div>
            {SKILLS.filter((s) => s.tree === t).map((s) => {
              const r = rank(p, s.id);
              const c = game.canLearn(s.id);
              const locked = r === 0 && !c.ok && c.reason !== '스킬 포인트 부족';
              return (
                <div key={s.id} className={`skill-card ${r > 0 ? 'learned' : ''} ${locked ? 'locked' : ''}`} style={{ borderColor: r > 0 ? TREE_INFO[t].color : undefined }}>
                  <div className="sc-top">
                    <span className="sc-icon" style={{ background: TREE_INFO[t].color + '33' }}>
                      {s.icon}
                    </span>
                    <div className="sc-title">
                      <div>
                        {s.name} <span className={`kind ${s.kind}`}>{s.kind === 'active' ? '액티브' : '패시브'}</span>
                      </div>
                      <div className="pips">
                        {Array.from({ length: s.maxRank }, (_, i) => (
                          <span key={i} className={i < r ? 'on' : ''} style={i < r ? { background: TREE_INFO[t].color } : undefined} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="sc-desc">{s.describe(Math.max(1, r))}</div>
                  {r > 0 && r < s.maxRank && <div className="sc-next">다음 단계: {s.describe(r + 1)}</div>}
                  {s.active && (
                    <div className="sc-meta">
                      {s.active.mana ? `마나 ${s.active.mana}` : `스태미나 ${s.active.stamina}`} · 재사용 {s.active.cooldown}초
                    </div>
                  )}
                  {locked && <div className="sc-req">🔒 {c.reason}</div>}
                  <div className="sc-actions">
                    {r < s.maxRank && (
                      <button className="btn small primary" disabled={!c.ok} onClick={() => game.learnSkill(s.id)}>
                        {r === 0 ? '배우기' : '강화'} (1P)
                      </button>
                    )}
                    {s.kind === 'active' && r > 0 && (
                      <div className="assign">
                        {SKILL_KEY_LABELS.map((k, i) => (
                          <button key={k} className={`btn tiny ${p.skillBar[i] === s.id ? 'on' : ''}`} onClick={() => game.assignSkill(i, p.skillBar[i] === s.id ? null : s.id)}>
                            {k}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}


function moodIcon(h: number) {
  return h >= 70 ? '😊' : h >= 40 ? '🙂' : h >= 20 ? '😟' : '😢';
}

function VillageTab() {
  const game = useGame();
  const S = game.settlement;
  const st = game.state.settlement;
  const inv = game.state.player.inventory;
  if (!st.founded) {
    const known = game.state.knownBuildables.includes('town_hall');
    return (
      <div className="village-empty">
        <div className="qd-title">정착지가 아직 없습니다</div>
        <p className="qd-desc">
          {known
            ? '[B] 건축 모드의 "마을" 분류에서 마을 회관을 지으면 정착지가 세워집니다. 회관 반경 45m 안에 침대나 주택을 놓으면 주민이 찾아옵니다.'
            : '먼저 메인 퀘스트 "나만의 보금자리"를 완료해 집을 지으면 마을 회관을 지을 수 있게 됩니다.'}
        </p>
        <div className="req-title">성장 단계</div>
        {TIERS.map((t) => (
          <div key={t.level} className="tier-row">
            <b>{t.name}</b> <span className="muted small">수용 {t.capacity}명 · {t.requirement}</span>
          </div>
        ))}
      </div>
    );
  }
  const cap = S.capacity();
  const beds = S.homeSlots().length;
  const food = S.foodStock();
  const avg = S.averageHappiness();
  const used = S.warehouseUsed();
  const wcap = S.warehouseCapacity();
  const market = S.marketOpen();
  const hasStall = S.workplaces('merchant').length > 0;
  const items = Object.entries(st.warehouse).sort((a, b) => b[1] - a[1]);
  return (
    <div className="village-layout">
      <div className="village-head">
        <div>
          <div className="qd-title">{st.name}</div>
          <div className="muted small">
            {S.tierName()} · 주민 {st.villagers.length}/{cap} (거처 {beds}) · 반경 {S.radius()}m · 금고 {st.treasury} 은화
          </div>
        </div>
        <div className="vstat">
          <span>행복도</span>
          <div className="obj-bar wide">
            <div style={{ width: `${avg}%`, background: avg >= 60 ? '#7fd36a' : avg >= 30 ? '#e9c46a' : '#ff6a5a' }} />
          </div>
          <b>{Math.round(avg)}</b>
        </div>
        <div className="vstat">
          <span>식량</span>
          <b className={food < st.villagers.length ? 'bad' : ''}>
            {food.toFixed(1)} ({st.villagers.length ? `${(food / st.villagers.length).toFixed(1)}일분` : '-'})
          </b>
        </div>
        <div className="vbtns">
          <button className="btn small" onClick={() => S.autoAssign()}>
            자동 배정
          </button>
          {!st.charter && Inv.count(inv, 'settlement_charter') > 0 && (
            <button className="btn small primary" onClick={() => S.useCharter()}>
              정착 헌장 사용
            </button>
          )}
        </div>
      </div>
      <div className="village-cols">
        <div className="vcol">
          <div className="list-head">주민</div>
          {st.villagers.length === 0 && <p className="muted small">아직 주민이 없습니다. 빈 침대(또는 주택)와 창고의 음식이 있으면 여행자가 찾아옵니다.</p>}
          {st.villagers.map((v) => (
            <div key={v.id} className="villager-row">
              <span className="vmood" title={`행복도 ${Math.round(v.happiness)}`}>
                {moodIcon(v.happiness)}
              </span>
              <div className="vinfo">
                <b>{v.name}</b>
                <small className={v.down ? 'bad' : ''}>
                  {game.villagers.activityOf(v.id)}
                  {v.homeId === null ? ' · 집 없음' : ''}
                  {!v.fed ? ' · 굶주림' : ''}
                </small>
              </div>
              <select
                className="job-select"
                value={v.job ?? ''}
                onChange={(e) => S.assignJob(v.id, (e.target.value || null) as JobId | null)}
              >
                <option value="">무직</option>
                {JOB_ORDER.map((j) => (
                  <option key={j} value={j} disabled={v.job !== j && S.freeWorkplaces(j).length === 0}>
                    {JOBS[j].name} ({S.freeWorkplaces(j).length}/{S.workplaces(j).length})
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="list-head">일터</div>
          {JOB_ORDER.map((j) => (
            <div key={j} className="job-row">
              <span>{JOBS[j].name}</span>
              <small className="muted">{JOBS[j].desc}</small>
              <b>
                {S.workplaces(j).length - S.freeWorkplaces(j).length}/{S.workplaces(j).length}
              </b>
            </div>
          ))}
        </div>
        <div className="vcol">
          <div className="grid-head">
            <span>
              창고 {used}/{wcap}
            </span>
            <button className="btn small" onClick={() => S.depositFood()}>
              음식 맡기기
            </button>
          </div>
          <div className="wh-grid">
            {items.length === 0 && <p className="muted small">비어 있습니다.</p>}
            {items.map(([id, n]) => (
              <div key={id} className="wh-item" title={`클릭: ${ITEMS[id]?.name ?? id} 꺼내기`} onClick={() => S.withdraw(id)}>
                <ItemIcon id={id} size={30} />
                <span>{n}</span>
                {FOOD_VALUE[id] !== undefined && <i className="food-dot" />}
              </div>
            ))}
          </div>
          <div className="muted small tip">클릭하면 꺼냅니다 · 아래 소지품을 클릭하면 맡깁니다</div>
          <div className="slot-grid mini">
            {inv.map((s, i) => (
              <div key={i} className={`slot filled tiny-slot`} onClick={() => S.depositSlot(i)} title={s ? ITEMS[s.id].name : ''}>
                {s && <ItemIcon id={s.id} size={24} />}
                {s && s.qty > 1 && <span className="qty">{s.qty}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="vcol">
          <div className="list-head">시장 {market ? '· 영업 중' : ''}</div>
          {!hasStall && <p className="muted small">"마을" 단계가 되면 시장 가판대를 지을 수 있습니다. 상인을 배정하면 거래가 열립니다.</p>}
          {hasStall && !market && <p className="muted small">시장 가판대에 상인을 배정하면 거래할 수 있습니다.</p>}
          {market && (
            <>
              <div className="req-title">사기 (은화 {S.coins()})</div>
              {MARKET_STOCK.map((m) => (
                <div key={m.item} className="trade-row">
                  <ItemIcon id={m.item} size={22} />
                  <span>{ITEMS[m.item].name}</span>
                  <button className="btn tiny" onClick={() => S.buy(m.item)}>
                    {S.buyPrice(m.item)} 은화
                  </button>
                </div>
              ))}
              <div className="req-title">팔기 (클릭: 1개 · 우클릭: 전부)</div>
              <div className="slot-grid mini">
                {inv.map((s, i) => (
                  <div
                    key={i}
                    className="slot filled tiny-slot"
                    title={s ? `${ITEMS[s.id].name} · ${S.sellPrice(s.id)} 은화` : ''}
                    onClick={() => S.sell(i, false)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      S.sell(i, true);
                    }}
                  >
                    {s && <ItemIcon id={s.id} size={24} />}
                    {s && s.qty > 1 && <span className="qty">{s.qty}</span>}
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="list-head">성장 단계</div>
          {TIERS.map((t) => (
            <div key={t.level} className={`tier-row ${st.tier >= t.level ? 'done' : ''}`}>
              <b>
                {st.tier >= t.level ? '✓ ' : ''}
                {t.name}
              </b>
              <span className="muted small">
                수용 {t.capacity}명 · {t.requirement}
              </span>
            </div>
          ))}
          <div className="list-head">마을 소식</div>
          <div className="vlog">
            {st.log
              .slice(-8)
              .reverse()
              .map((l, i) => (
                <div key={i}>
                  <span className="muted small">{l.day}일차</span> {l.text}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
