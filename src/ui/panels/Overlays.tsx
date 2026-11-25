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
