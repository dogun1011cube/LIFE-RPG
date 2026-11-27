import { useGame } from '../GameContext';
import { ItemIcon } from '../icons';
import { ERAS, TECHS, type TechDef } from '../../game/data/techs';
import { ITEMS } from '../../game/data/items';
import { GUARD_WAGE, RESEARCH_DONATIONS, TAX_LEVELS } from '../../game/data/village';
import { Inv } from '../../game/systems/Inventory';

/** Civilisation tab: eras, the technology tree, treasury & taxes, defence and relic donations. */
export function CivTab() {
  const game = useGame();
  const st = game.state.settlement;
  const civ = game.civ;
  const S = game.settlement;
  if (!st.founded) {
    return (
      <div className="village-empty">
        <div className="qd-title">문명은 정착지에서 시작됩니다</div>
        <p className="qd-desc">마을 회관을 짓고 정착지를 세운 뒤, "마을" 단계가 되면 연구소를 지어 학자를 배정하세요. 학자가 모은 연구 점수로 기술을 연구해 시대를 발전시킬 수 있습니다.</p>
      </div>
    );
  }
  const era = civ.era();
  const inv = game.state.player.inventory;
  const scholars = civ.scholars();
  const desks = S.workplaces('scholar').length;
  const raid = st.raid;
  const guards = st.villagers.filter((v) => v.job === 'guard' && v.workId !== null);
  const towers = S.count('archer_tower');
  const income = S.taxIncome();
  const wages = S.wageCost();
  const myCoins = Inv.count(inv, 'coin');
  return (
    <div className="civ-layout">
      <div className="civ-head">
        <div>
          <div className="qd-title">{ERAS[era - 1].name}</div>
          <div className="muted small">{ERAS[era - 1].desc}</div>
        </div>
        <div className="vstat">
          <span>연구 점수</span>
          <b className="rp">{civ.points()}</b>
          <small className="muted">
            학자 {scholars}명 · 연구소 {desks}곳
          </small>
        </div>
        <div className="vstat">
          <span>마을 금고</span>
          <b className="coin-text">{st.treasury} 은화</b>
          <button className="btn tiny" disabled={myCoins <= 0} onClick={() => S.depositCoins(Math.min(50, myCoins))} title="내 은화를 최대 50개 금고에 넣습니다">
            +맡기기
          </button>
          <button className="btn tiny" disabled={st.treasury <= 0} onClick={() => S.withdrawCoins(Math.min(50, st.treasury))} title="금고에서 최대 50 은화를 꺼냅니다">
            꺼내기
          </button>
        </div>
      </div>
      <div className="civ-body">
        <div className="tech-tree">
          {ERAS.map((e) => (
            <div key={e.level} className={`era-col ${e.level > era ? 'future' : ''}`}>
              <div className="list-head">
                {e.level <= era ? '' : '🔒 '}
                {e.name}
              </div>
              {TECHS.filter((t) => t.era === e.level).map((t) => (
                <TechCard key={t.id} t={t} />
              ))}
            </div>
          ))}
        </div>
        <div className="civ-side">
          <div className="list-head">재정 (하루)</div>
          <div className="fin-row">
            <span>세율</span>
            <select className="job-select" value={st.taxLevel} onChange={(e) => S.setTaxLevel(Number(e.target.value))}>
              {TAX_LEVELS.map((l, i) => (
                <option key={i} value={i} disabled={i > 0 && !civ.has('t_currency')}>
                  {l.name} ({l.perVillager}/명{l.happiness ? ` · 행복 ${l.happiness}` : ''})
                </option>
              ))}
            </select>
          </div>
          {!civ.has('t_currency') && <p className="muted small">"화폐"를 연구하면 세금을 걷을 수 있습니다.</p>}
          <div className="fin-row">
            <span>세금 수입</span>
            <b className="good">+{income}</b>
          </div>
          <div className="fin-row">
            <span>경비병 급료 ({guards.length}명 × {GUARD_WAGE})</span>
            <b className={wages > 0 ? 'bad' : ''}>-{wages}</b>
          </div>
          <div className="fin-row">
            <span>상인 수입</span>
            <small className="muted">일하는 동안 20초마다</small>
          </div>
          <div className="fin-row total">
            <span>하루 예상 수지</span>
            <b className={income - wages >= 0 ? 'good' : 'bad'}>
              {income - wages >= 0 ? '+' : ''}
              {income - wages}
            </b>
          </div>

          <div className="list-head">방어</div>
          <div className="fin-row">
            <span>경비병 · 궁수탑</span>
            <b>
              {guards.length}명 · {towers}기
            </b>
          </div>
          <div className="fin-row">
            <span>습격</span>
            <b className={game.defense.active ? 'bad' : raid.tonight ? 'warn-text' : ''}>
              {game.defense.active ? `진행 중 (남은 괴물 ${game.defense.remaining()})` : raid.tonight ? '오늘 밤 22시' : st.tier < 2 ? '"마을" 단계부터' : raid.nextDay ? `${raid.nextDay}일차 밤 무렵` : '-'}
            </b>
          </div>
          <div className="fin-row">
            <span>막아낸 습격 / 피해</span>
            <b>
              {raid.repelled} / {raid.lost}
            </b>
          </div>
          <p className="muted small">습격은 아침에 예고되고 밤 22시에 옵니다. 경비병은 초소 주변을 지키고 습격 때는 마을 전체를 방어합니다. 주민들은 집으로 대피하고, 쓰러진 주민은 [E]로 일으킬 수 있습니다.</p>

          <div className="list-head">유물 기증 (연구 점수)</div>
          <div className="donate-grid">
            {Object.entries(RESEARCH_DONATIONS).map(([id, rp]) => {
              const n = Inv.count(inv, id);
              return (
                <div
                  key={id}
                  className={`donate-item ${n > 0 ? '' : 'empty'}`}
                  title={`${ITEMS[id].name} 1개 = 연구 점수 ${rp} · 클릭: 1개 · 우클릭: 전부`}
                  onClick={() => civ.donate(id, false)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    civ.donate(id, true);
                  }}
                >
                  <ItemIcon id={id} size={28} />
                  <span>{n}</span>
                  <small>+{rp}</small>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TechCard({ t }: { t: TechDef }) {
  const game = useGame();
  const civ = game.civ;
  const status = civ.status(t);
  const why = status === 'done' ? '' : civ.blocker(t);
  return (
    <div className={`tech-card ${status} ${t.advancesTo ? 'era-tech' : ''}`}>
      <div className="tech-top">
        <b>
          {status === 'done' ? '✓ ' : ''}
          {t.name}
        </b>
        {status !== 'done' && (
          <span className="tech-cost">
            {t.cost} 연구{t.coins ? ` · ${t.coins} 은화` : ''}
          </span>
        )}
      </div>
      <div className="muted small">{t.desc}</div>
      <ul className="tech-effects">
        {t.effects.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      {status !== 'done' && (
        <div className="tech-foot">
          {why ? <small className="muted">{why}</small> : <small className="good">연구 가능</small>}
          <button className="btn tiny primary" disabled={!!why} onClick={() => civ.researchTech(t.id)}>
            연구
          </button>
        </div>
      )}
    </div>
  );
}
