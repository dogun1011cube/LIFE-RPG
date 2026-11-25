import { useEffect, useRef, useState } from 'react';
import { useGame } from './GameContext';
import { ItemIcon, BuildIcon } from './icons';
import { QUEST_BY_ID } from '../game/data/quests';
import { BUILDABLE_BY_ID, BUILD_CATEGORY_NAME } from '../game/data/buildables';
import { xpToNext } from '../game/systems/Stats';
import { Inv } from '../game/systems/Inventory';
import type { GameEvents, NotifyKind } from '../game/core/Events';
import { drawWorldMap } from './mapDraw';

function Bar({ value, max, cls, label }: { value: number; max: number; cls: string; label?: boolean }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className={`bar ${cls}`}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
      {label && (
        <div className="bar-label">
          {Math.ceil(value)} / {Math.round(max)}
        </div>
      )}
    </div>
  );
}

const BUFF_INFO: Record<string, { name: string; icon: string }> = {
  well_fed: { name: '배부름', icon: '🍖' },
  hot: { name: '치유', icon: '✚' },
  slow: { name: '둔화', icon: '❄' },
};

function StatusPanel() {
  const game = useGame();
  const p = game.state.player;
  const st = game.stats;
  return (
    <div className="hud-status">
      <div className="lvl-badge">
        <span>{p.level}</span>
      </div>
      <div className="status-body">
        <div className="status-name">
          {p.name}
          {p.attrPoints > 0 && <span className="pts-badge">+{p.attrPoints}</span>}
        </div>
        <Bar value={p.hp} max={st.maxHp} cls="hp" label />
        <Bar value={p.stamina} max={st.maxStamina} cls="stamina" />
        <div className="buffs">
          {p.buffs.map((b) => (
            <div key={b.id} className={`buff ${b.id === 'slow' ? 'debuff' : ''}`} title={BUFF_INFO[b.id]?.name}>
              <span>{BUFF_INFO[b.id]?.icon ?? '•'}</span>
              <small>{Math.ceil(b.time)}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Hotbar() {
  const game = useGame();
  const p = game.state.player;
  const need = xpToNext(p.level);
  return (
    <div className="hud-bottom">
      <div className="xp-row">
        <span className="xp-lv">Lv.{p.level}</span>
        <div className="xp-bar">
          <div className="xp-fill" style={{ width: `${(p.xp / need) * 100}%` }} />
        </div>
        <span className="xp-num">
          {p.xp} / {need}
        </span>
      </div>
      <div className="hotbar">
        <div className="hb-slot weapon" title="장착 무기">
          {p.equipment.weapon && <ItemIcon id={p.equipment.weapon} size={38} />}
          <span className="hb-key">무기</span>
        </div>
        {p.hotbar.map((id, i) => {
          const count = id ? Inv.count(p.inventory, id) : 0;
          return (
            <div key={i} className={`hb-slot ${id && count === 0 ? 'empty-stock' : ''}`} onClick={() => game.useHotbar(i)}>
              {id && <ItemIcon id={id} size={36} />}
              <span className="hb-key">{i + 1}</span>
              {id && <span className="hb-count">{count}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Minimap() {
  const game = useGame();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 90) return;
      last = t;
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      const pp = game.player.body.pos;
      drawWorldMap(ctx, game, pp.x, pp.z, 150, c.width, c.height, { fog: true, labels: false, enemies: true, scale: 1.1 });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [game]);
  const h = game.env.hours;
  const hh = String(Math.floor(h)).padStart(2, '0');
  const mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
  return (
    <div className="hud-minimap">
      <div className="minimap-frame">
        <canvas ref={ref} width={180} height={180} />
        <span className="compass n">N</span>
      </div>
      <div className="clock">
        <span className="clock-icon">{game.env.isNight ? '☾' : '☀'}</span>
        {game.env.day}일차 · {hh}:{mm}
      </div>
      <div className="region-name">{game.discovery.regionName()}</div>
    </div>
  );
}

function QuestTracker() {
  const game = useGame();
  const qs = game.state.quests;
  const tracked = qs.tracked.filter((id) => qs.active.some((a) => a.id === id)).slice(0, 3);
  if (tracked.length === 0) return null;
  return (
    <div className="hud-quests">
      {tracked.map((id) => {
        const q = QUEST_BY_ID[id];
        const objs = game.quests.objectiveViews(id);
        return (
          <div key={id} className={`qt ${q.chain}`}>
            <div className="qt-title">
              <span className="qt-mark">{q.chain === 'main' ? '◆' : '◇'}</span>
              {q.title}
            </div>
            {objs.map((o, i) => (
              <div key={i} className={`qt-obj ${o.done ? 'done' : ''}`}>
                <span>{o.done ? '✓' : '·'}</span> {o.label}
                {o.target > 1 && (
                  <b>
                    {' '}
                    {o.current}/{o.target}
                  </b>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

interface Note {
  id: number;
  text: string;
  kind: NotifyKind;
  icon?: string;
  qty?: number;
  t: number;
}

let noteId = 1;
function Notifications() {
  const game = useGame();
  const [notes, setNotes] = useState<Note[]>([]);
  useEffect(() => {
    const off = game.events.on('notify', (n: GameEvents['notify']) => {
      setNotes((prev) => {
        // merge repeated item pickups
        if (n.kind === 'item' && n.icon) {
          const ex = prev.find((p) => p.kind === 'item' && p.icon === n.icon && Date.now() - p.t < 3000);
          if (ex) return prev.map((p) => (p === ex ? { ...p, qty: (p.qty ?? 1) + (n.qty ?? 1), t: Date.now() } : p));
        }
        return [...prev.slice(-6), { id: noteId++, ...n, t: Date.now() }];
      });
    });
    const iv = setInterval(() => setNotes((prev) => prev.filter((p) => Date.now() - p.t < 4200)), 300);
    return () => {
      off();
      clearInterval(iv);
    };
  }, [game]);
  return (
    <div className="hud-notes">
      {notes.map((n) => (
        <div key={n.id} className={`note ${n.kind}`} style={{ opacity: Math.min(1, (4200 - (Date.now() - n.t)) / 800) }}>
          {n.icon && <ItemIcon id={n.icon} size={22} />}
          <span>{n.text}</span>
          {n.kind === 'item' && n.qty ? <b>×{n.qty}</b> : null}
        </div>
      ))}
    </div>
  );
}

function Banner() {
  const game = useGame();
  const [b, setB] = useState<(GameEvents['banner'] & { key: number }) | null>(null);
  const [region, setRegion] = useState<{ name: string; key: number } | null>(null);
  useEffect(() => {
    let tm: ReturnType<typeof setTimeout>;
    let tr: ReturnType<typeof setTimeout>;
    const off = game.events.on('banner', (x: GameEvents['banner']) => {
      setB({ ...x, key: Date.now() });
      clearTimeout(tm);
      tm = setTimeout(() => setB(null), 3800);
    });
    const off2 = game.events.on('region', (x: GameEvents['region']) => {
      setRegion({ name: x.name, key: Date.now() });
      clearTimeout(tr);
      tr = setTimeout(() => setRegion(null), 2500);
    });
    return () => {
      off();
      off2();
      clearTimeout(tm);
      clearTimeout(tr);
    };
  }, [game]);
  return (
    <>
      {b && (
        <div key={b.key} className={`banner ${b.kind}`}>
          <div className="banner-line" />
          <div className="banner-title">{b.title}</div>
          {b.subtitle && <div className="banner-sub">{b.subtitle}</div>}
          <div className="banner-line" />
        </div>
      )}
      {region && !b && (
        <div key={region.key} className="region-toast">
          {region.name}
        </div>
      )}
    </>
  );
}

function BossBar() {
  const game = useGame();
  const boss = game.enemies.boss;
  if (!boss || boss.state === 'dead') return null;
  return (
    <div className="boss-bar">
      <div className="boss-name">
        {boss.def.name} <small>Lv.{boss.def.level}</small>
        {boss.phase === 2 && <span className="enraged"> 분노</span>}
      </div>
      <div className="boss-track">
        <div className="boss-fill" style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }} />
        <div className="boss-half" />
      </div>
    </div>
  );
}

function BuildBar() {
  const game = useGame();
  const b = game.building;
  const cats = b.categoriesAvailable();
  const list = b.available(b.category);
  const inv = game.state.player.inventory;
  const pl = b.placement;
  const sel = BUILDABLE_BY_ID[b.selected];
  return (
    <div className="build-bar">
      <div className="build-head">
        <span className="build-title">건축 모드</span>
        <div className="build-cats">
          {cats.map((c) => (
            <button key={c} className={`chip ${c === b.category ? 'on' : ''}`} onClick={() => b.cycleCategory(cats.indexOf(c) - cats.indexOf(b.category))}>
              {BUILD_CATEGORY_NAME[c]}
            </button>
          ))}
          <span className="hint">[Tab] 분류</span>
        </div>
      </div>
      <div className="build-items">
        {list.map((d, i) => {
          const afford = Inv.hasAll(inv, d.cost);
          return (
            <div key={d.id} className={`build-item ${d.id === b.selected ? 'sel' : ''} ${afford ? '' : 'poor'}`} onClick={() => b.select(d.id)} title={d.desc}>
              <span className="bi-key">{i + 1}</span>
              <BuildIcon shape={d.shape} material={d.material} size={40} />
              <div className="bi-name">{d.name}</div>
              <div className="bi-cost">
                {d.cost.map((c) => (
                  <span key={c.item} className={Inv.count(inv, c.item) >= c.qty ? 'ok' : 'no'}>
                    <ItemIcon id={c.item} size={14} />
                    {c.qty}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="build-hints">
        <span>
          <kbd>좌클릭</kbd> 설치
        </span>
        <span>
          <kbd>R</kbd> {sel?.snap === 'edge' ? '뒤집기' : '회전'}
        </span>
        <span>
          <kbd>휠</kbd> 높이 {b.heightOffset !== 0 ? `(${b.heightOffset > 0 ? '+' : ''}${b.heightOffset.toFixed(2)}m)` : ''}
        </span>
        <span>
          <kbd>X</kbd>/<kbd>우클릭</kbd> 철거
        </span>
        <span>
          <kbd>F</kbd> 복사
        </span>
        {sel?.snap === 'free' && (
          <span>
            <kbd>G</kbd> 격자 {b.gridSnap ? '켬' : '끔'}
          </span>
        )}
        <span>
          <kbd>B</kbd> 종료
        </span>
      </div>
      {pl && !pl.valid && <div className="build-reason">{pl.reason}</div>}
      {b.hoverPiece && <div className="build-hover">대상: {b.hoverPiece.def.name}</div>}
    </div>
  );
}

function Prompt() {
  const game = useGame();
  const p = game.ui.prompt;
  if (!p || game.player.dead) return null;
  return (
    <div className="prompt">
      <kbd>{p.key}</kbd>
      <span>{p.label}</span>
      {p.kind === 'node' && <small>꾹 눌러 계속</small>}
    </div>
  );
}

function KeyHints() {
  return (
    <div className="key-hints">
      <span>
        <kbd>Tab</kbd>인벤토리
      </span>
      <span>
        <kbd>C</kbd>제작
      </span>
      <span>
        <kbd>B</kbd>건축
      </span>
      <span>
        <kbd>J</kbd>퀘스트
      </span>
      <span>
        <kbd>M</kbd>지도
      </span>
      <span>
        <kbd>Esc</kbd>메뉴
      </span>
    </div>
  );
}

export function HUD() {
  const game = useGame();
  const showClickHint = game.ui.panel === null && !game.input.locked && !game.player.dead;
  const lowHp = game.state.player.hp / game.stats.maxHp < 0.25 && !game.player.dead;
  return (
    <div className="hud">
      {lowHp && <div className="low-hp" />}
      <StatusPanel />
      <Minimap />
      <QuestTracker />
      <Notifications />
      <Banner />
      <BossBar />
      <div className={`crosshair ${game.building.active ? 'build' : ''}`} />
      <Prompt />
      {game.building.active ? <BuildBar /> : <Hotbar />}
      {!game.building.active && <KeyHints />}
      {showClickHint && <div className="click-hint">화면을 클릭하면 마우스로 시점을 조작합니다</div>}
      {game.settings.showFps && <div className="fps">{game.ui.fps} FPS</div>}
      {game.ui.fade > 0 && <div className="fade" style={{ opacity: Math.min(1, game.ui.fade) }} />}
    </div>
  );
}

