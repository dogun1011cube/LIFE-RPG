import { useGame } from '../GameContext';
import { SlotView } from './MenuShell';

export function ChestPanel() {
  const game = useGame();
  const chest = game.chestSlots();
  const inv = game.state.player.inventory;
  if (!chest) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && game.closePanel(true)}>
      <div className="window chest-window">
        <div className="window-head">
          <div className="panel-title">보관함</div>
          <button className="close-btn" onClick={() => game.closePanel(true)}>
            ✕
          </button>
        </div>
        <div className="chest-layout">
          <div>
            <div className="grid-head">
              <span>보관함</span>
              <button className="btn small" onClick={() => game.chestTransferAll(true)}>
                모두 꺼내기 →
              </button>
            </div>
            <div className="slot-grid six">
              {chest.map((s, i) => (
                <SlotView key={i} index={i} dragScope="chest" slot={s} onClick={() => game.chestTransfer(true, i)} />
              ))}
            </div>
          </div>
          <div>
            <div className="grid-head">
              <span>소지품</span>
              <button className="btn small" onClick={() => game.chestTransferAll(false)}>
                ← 재료 모두 넣기
              </button>
            </div>
            <div className="slot-grid six">
              {inv.map((s, i) => (
                <SlotView key={i} index={i} dragScope="inv" slot={s} onClick={() => game.chestTransfer(false, i)} />
              ))}
            </div>
          </div>
        </div>
        <div className="muted small tip">아이템을 클릭하면 반대편으로 옮깁니다. ([E] 또는 Esc로 닫기)</div>
      </div>
    </div>
  );
}
