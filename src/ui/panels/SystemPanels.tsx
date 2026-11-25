import { useState } from 'react';
import { useGame } from '../GameContext';
import { formatTime } from '../../game/core/math';
import type { Quality } from '../../game/core/Settings';

export function PausePanel() {
  const game = useGame();
  const [confirmQuit, setConfirmQuit] = useState(false);
  return (
    <div className="modal-backdrop dim">
      <div className="panel pause-panel">
        <div className="panel-title">일시 정지</div>
        <div className="pause-meta">
          {game.env.day}일차 · 플레이 시간 {formatTime(game.state.playTime)} · 슬롯 {game.ui.saveSlot + 1}
        </div>
        <button className="menu-btn" onClick={() => game.closePanel(true)}>
          계속하기
        </button>
        <button className="menu-btn" onClick={() => game.saveGame()}>
          저장하기
        </button>
        <button className="menu-btn" onClick={() => game.openPanel('saveload')}>
          불러오기
        </button>
        <button className="menu-btn" onClick={() => game.openPanel('settings')}>
          설정
        </button>
        <button className="menu-btn" onClick={() => game.openPanel('controls')}>
          조작법
        </button>
        {confirmQuit ? (
          <div className="confirm-row">
            <span>저장 후 메인 메뉴로 나갈까요?</span>
            <button className="btn danger" onClick={() => game.quitToMenu()}>
              나가기
            </button>
            <button className="btn" onClick={() => setConfirmQuit(false)}>
              취소
            </button>
          </div>
        ) : (
          <button className="menu-btn" onClick={() => setConfirmQuit(true)}>
            메인 메뉴로
          </button>
        )}
      </div>
    </div>
  );
}

export function SettingsBody() {
  const game = useGame();
  const s = game.settings;
  return (
    <div className="settings">
      <label className="set-row">
        <span>그래픽 품질</span>
        <div className="seg">
          {(['low', 'medium', 'high'] as Quality[]).map((q) => (
            <button key={q} className={`chip ${s.quality === q ? 'on' : ''}`} onClick={() => game.setSetting('quality', q)}>
              {{ low: '낮음', medium: '보통', high: '높음' }[q]}
            </button>
          ))}
        </div>
      </label>
      <label className="set-row">
        <span>마우스 감도 ({s.mouseSensitivity.toFixed(1)})</span>
        <input type="range" min={0.2} max={3} step={0.1} value={s.mouseSensitivity} onChange={(e) => game.setSetting('mouseSensitivity', Number(e.target.value))} />
      </label>
      <label className="set-row">
        <span>카메라 거리 ({s.cameraDistance.toFixed(1)}m)</span>
        <input
          type="range"
          min={3}
          max={12}
          step={0.5}
          value={s.cameraDistance}
          onChange={(e) => {
            game.setSetting('cameraDistance', Number(e.target.value));
            if (game.cameraRig) game.cameraRig.targetDistance = Number(e.target.value);
          }}
        />
      </label>
      <label className="set-row">
        <span>음량 ({Math.round(s.volume * 100)}%)</span>
        <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => game.setSetting('volume', Number(e.target.value))} />
      </label>
      <label className="set-row">
        <span>Y축 반전</span>
        <input type="checkbox" checked={s.invertY} onChange={(e) => game.setSetting('invertY', e.target.checked)} />
      </label>
      <label className="set-row">
        <span>FPS 표시</span>
        <input type="checkbox" checked={s.showFps} onChange={(e) => game.setSetting('showFps', e.target.checked)} />
      </label>
    </div>
  );
}

export function SettingsPanel() {
  const game = useGame();
  return (
    <div className="modal-backdrop dim">
      <div className="panel">
        <div className="panel-title">설정</div>
        <SettingsBody />
        <button className="btn" onClick={() => game.openPanel('pause')}>
          ← 뒤로
        </button>
      </div>
    </div>
  );
}

const CONTROLS: [string, string][] = [
  ['W A S D', '이동'],
  ['마우스', '시점 회전 (화면 클릭 시 고정)'],
  ['Shift', '달리기 (스태미나 소모)'],
  ['Space', '점프'],
  ['좌클릭', '공격 (연타 시 3단 콤보)'],
  ['우클릭', '강공격'],
  ['Q', '구르기 (무적 시간)'],
  ['F (누르고 있기)', '막기 · 막기 직후는 패링'],
  ['R · T · G · V', '등록한 액티브 스킬'],
  ['E', '상호작용 · 채집 (꾹 누르면 계속 채집)'],
  ['1 – 4', '단축키 소모품 사용'],
  ['휠', '카메라 거리'],
  ['Tab / I', '인벤토리 · 캐릭터'],
  ['K', '스킬'],
  ['C', '제작'],
  ['J', '퀘스트'],
  ['M', '지도'],
  ['B', '건축 모드'],
  ['Esc', '메뉴 · 닫기'],
  ['방향키', '시점 회전 (마우스 대신)'],
];

const BUILD_CONTROLS: [string, string][] = [
  ['좌클릭', '설치'],
  ['R', '회전 / 벽 뒤집기'],
  ['휠 · PageUp/Down', '높이 조절'],
  ['Shift + 휠', '회전'],
  ['X · 우클릭 · Delete', '철거 (재료 100% 반환)'],
  ['F · 휠클릭', '바라보는 건축물 복사'],
  ['G', '자유 배치 격자 켜기/끄기'],
  ['Tab', '분류 변경'],
  ['1 – 9', '건축물 선택'],
];

export function ControlsList() {
  return (
    <div className="controls">
      <div className="controls-col">
        <div className="req-title">기본</div>
        {CONTROLS.map(([k, v]) => (
          <div key={k} className="ctrl-row">
            <kbd>{k}</kbd>
            <span>{v}</span>
          </div>
        ))}
      </div>
      <div className="controls-col">
        <div className="req-title">건축 모드</div>
        {BUILD_CONTROLS.map(([k, v]) => (
          <div key={k} className="ctrl-row">
            <kbd>{k}</kbd>
            <span>{v}</span>
          </div>
        ))}
        <div className="req-title">팁</div>
        <p className="muted small">
          도구는 인벤토리에 있기만 하면 자동으로 사용됩니다. 불빛(횃불·모닥불) 근처에는 밤의 괴물이 나타나지 않습니다. 침대를 놓으면 부활 지점이 되고, 밤에는 잠을 자서 아침으로
          넘어갈 수 있습니다. 게임은 60초마다 자동 저장됩니다.
        </p>
      </div>
    </div>
  );
}

export function ControlsPanel() {
  const game = useGame();
  return (
    <div className="modal-backdrop dim">
      <div className="panel wide">
        <div className="panel-title">조작법</div>
        <ControlsList />
        <button className="btn" onClick={() => game.openPanel('pause')}>
          ← 뒤로
        </button>
      </div>
    </div>
  );
}

export function SaveLoadPanel() {
  const game = useGame();
  const saves = game.saves;
  return (
    <div className="modal-backdrop dim">
      <div className="panel">
        <div className="panel-title">불러오기</div>
        <p className="muted small">현재 진행 상황은 불러오기 전에 자동 저장되지 않습니다. 필요하면 먼저 저장하세요.</p>
        <div className="slot-list">
          {saves.map((s, i) => (
            <div key={i} className={`slot-card ${s ? '' : 'empty'}`}>
              <div className="slot-head">
                <span className="slot-num">
                  슬롯 {i + 1} {i === game.ui.saveSlot && <em>(현재)</em>}
                </span>
              </div>
              {s ? (
                <div className="slot-meta">
                  <span>Lv.{s.level}</span>
                  <span>{s.day}일차</span>
                  <span>플레이 {formatTime(s.playTime)}</span>
                </div>
              ) : (
                <div className="slot-meta muted">빈 슬롯</div>
              )}
              <div className="slot-actions">
                <button className="btn primary small" disabled={!s} onClick={() => game.loadGame(i)}>
                  불러오기
                </button>
              </div>
            </div>
          ))}
        </div>
        <button className="btn" onClick={() => game.openPanel('pause')}>
          ← 뒤로
        </button>
      </div>
    </div>
  );
}
