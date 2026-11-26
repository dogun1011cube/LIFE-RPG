import { useState } from 'react';
import { useGame } from '../GameContext';
import { JOBS, JOB_ORDER, VILLAGER_LINES, type JobId } from '../../game/data/village';

export function LorePanel() {
  const game = useGame();
  const lore = game.ui.lore;
  if (!lore) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && game.closePanel(true)}>
      <div className="lore-card">
        <div className="lore-title">{lore.title}</div>
        <div className="lore-text">{lore.text}</div>
        <button className="btn" onClick={() => game.closePanel(true)}>
          닫기 <kbd>E</kbd>
        </button>
      </div>
    </div>
  );
}

export function DeathScreen() {
  const game = useGame();
  const hasBed = !!game.state.player.spawn;
  return (
    <div className="death-screen">
      <div className="death-title">쓰러졌습니다</div>
      <div className="death-sub">소지품과 경험치는 그대로 유지됩니다.</div>
      <button className="btn primary big" onClick={() => game.respawn()}>
        {hasBed ? '침대에서 부활' : '잿불 야영지에서 부활'}
      </button>
    </div>
  );
}

export function BlueprintNamePanel() {
  const game = useGame();
  const target = game.building.captureTarget;
  const piece = target !== null ? game.building.getPiece(target) : undefined;
  const count = piece ? game.building.connectedGroup(piece).length : 0;
  const [name, setName] = useState(`설계도 ${game.building.blueprints.filter((b) => !b.builtin).length + 1}`);
  const save = () => {
    if (target !== null) game.building.captureBlueprint(name, target);
    game.building.captureTarget = null;
    game.closePanel(true);
  };
  return (
    <div className="modal-backdrop dim">
      <div className="panel">
        <div className="panel-title">설계도 저장</div>
        <p className="muted small">바라보던 조각과 연결된 건물 전체({count}개 조각)를 설계도로 저장합니다. 설계도는 이 브라우저의 모든 저장 슬롯에서 쓸 수 있습니다.</p>
        <input
          className="text-input"
          autoFocus
          maxLength={24}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
        <div className="confirm-row">
          <button className="btn primary" disabled={!piece} onClick={save}>
            저장
          </button>
          <button
            className="btn"
            onClick={() => {
              game.building.captureTarget = null;
              game.closePanel(true);
            }}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

export function VillagerPanel() {
  const game = useGame();
  const id = game.ui.villagerId;
  const v = id !== null ? game.settlement.villager(id) : undefined;
  if (!v) return null;
  const S = game.settlement;
  const mood = !v.fed ? 'hungry' : v.homeId === null ? 'homeless' : !v.job ? 'jobless' : v.happiness >= 70 ? 'happy' : v.happiness >= 35 ? 'ok' : 'sad';
  const lines = VILLAGER_LINES[mood];
  const line = lines[(v.id + game.env.day) % lines.length];
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && game.closePanel(true)}>
      <div className="panel villager-panel">
        <div className="panel-title">
          {v.name} <span className="muted small">· {v.job ? JOBS[v.job as JobId].name : '무직'}</span>
        </div>
        <div className="villager-quote">"{line}"</div>
        <div className="stat-list">
          <div>
            <span>상태</span>
            <b>{game.villagers.activityOf(v.id)}</b>
          </div>
          <div>
            <span>행복도</span>
            <b>{Math.round(v.happiness)}</b>
          </div>
          <div>
            <span>집</span>
            <b>{v.homeId !== null ? '있음' : '없음'}</b>
          </div>
          <div>
            <span>식사</span>
            <b>{v.fed ? '배부름' : '굶주림'}</b>
          </div>
          <div>
            <span>정착일</span>
            <b>{v.arrivedDay}일차</b>
          </div>
        </div>
        <div className="req-title">일 맡기기</div>
        <div className="job-buttons">
          {JOB_ORDER.map((j) => {
            const free = S.freeWorkplaces(j).length;
            return (
              <button key={j} className={`btn small ${v.job === j ? 'primary' : ''}`} disabled={v.job !== j && free === 0} onClick={() => S.assignJob(v.id, j)}>
                {JOBS[j].name} <small>({free})</small>
              </button>
            );
          })}
          <button className="btn small" onClick={() => S.assignJob(v.id, null)}>
            쉬게 하기
          </button>
        </div>
        <button className="btn" onClick={() => game.closePanel(true)}>
          닫기 <kbd>E</kbd>
        </button>
      </div>
    </div>
  );
}
