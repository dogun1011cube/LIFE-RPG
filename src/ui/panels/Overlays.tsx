import { useState } from 'react';
import { useGame } from '../GameContext';

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
