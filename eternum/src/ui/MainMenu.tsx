import { useState } from 'react';
import { useGame } from './GameContext';
import { formatTime } from '../game/core/math';
import { ControlsList } from './panels/SystemPanels';
import { SettingsBody } from './panels/SystemPanels';

export function LoadingScreen() {
  const game = useGame();
  return (
    <div className="loading">
      <div className="logo">
        <div className="logo-sub">PROJECT</div>
        <div className="logo-main">ETERNUM</div>
      </div>
      <div className="loading-bar">
        <div className="loading-fill" style={{ width: `${game.ui.loadingProgress * 100}%` }} />
      </div>
      <div className="loading-text">{game.ui.loadingText}</div>
    </div>
  );
}

function fmtDate(t: number) {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function MainMenu() {
  const game = useGame();
  const [mode, setMode] = useState<'main' | 'new' | 'load' | 'controls' | 'settings'>('main');
  const [confirm, setConfirm] = useState<number | null>(null);
  const saves = game.saves;
  const latest = game.latestSave;

  const slotList = (forNew: boolean) => (
    <div className="slot-list">
      {saves.map((s, i) => (
        <div key={i} className={`slot-card ${s ? '' : 'empty'}`}>
          <div className="slot-head">
            <span className="slot-num">슬롯 {i + 1}</span>
            {s && <span className="slot-date">{fmtDate(s.savedAt)}</span>}
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
            {forNew ? (
              confirm === i ? (
                <>
                  <span className="warn-text">덮어쓸까요?</span>
                  <button className="btn danger small" onClick={() => game.newGame(i)}>
                    덮어쓰기
                  </button>
                  <button className="btn small" onClick={() => setConfirm(null)}>
                    취소
                  </button>
                </>
              ) : (
                <button className="btn primary small" onClick={() => (s ? setConfirm(i) : game.newGame(i))}>
                  {s ? '새로 시작' : '여기서 시작'}
                </button>
              )
            ) : (
              <>
                <button className="btn primary small" disabled={!s} onClick={() => game.loadGame(i)}>
                  불러오기
                </button>
                {s &&
                  (confirm === i ? (
                    <button
                      className="btn danger small"
                      onClick={() => {
                        game.deleteSave(i);
                        setConfirm(null);
                      }}
                    >
                      삭제 확인
                    </button>
                  ) : (
                    <button className="btn small" onClick={() => setConfirm(i)}>
                      삭제
                    </button>
                  ))}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="main-menu">
      <div className="menu-vignette" />
      <div className="menu-left">
        <div className="logo big">
          <div className="logo-sub">PROJECT</div>
          <div className="logo-main">ETERNUM</div>
          <div className="logo-tag">영원의 섬 · 탐험하고, 성장하고, 건설하라</div>
        </div>
        {mode === 'main' && (
          <nav className="menu-buttons">
            {latest !== null && (
              <button className="menu-btn" onClick={() => game.loadGame(latest)}>
                이어하기
                <small>슬롯 {latest + 1}</small>
              </button>
            )}
            <button className="menu-btn" onClick={() => setMode('new')}>
              새 게임
            </button>
            <button className="menu-btn" onClick={() => setMode('load')}>
              불러오기
            </button>
            <button className="menu-btn" onClick={() => setMode('controls')}>
              조작법
            </button>
            <button className="menu-btn" onClick={() => setMode('settings')}>
              설정
            </button>
          </nav>
        )}
        {mode !== 'main' && (
          <div className="menu-sub panel">
            <div className="panel-title">{{ new: '새 게임 – 슬롯 선택', load: '불러오기', controls: '조작법', settings: '설정', main: '' }[mode]}</div>
            {mode === 'new' && slotList(true)}
            {mode === 'load' && slotList(false)}
            {mode === 'controls' && <ControlsList />}
            {mode === 'settings' && <SettingsBody />}
            <button
              className="btn"
              onClick={() => {
                setMode('main');
                setConfirm(null);
              }}
            >
              ← 뒤로
            </button>
          </div>
        )}
      </div>
      <div className="menu-footer">PHASE 1 · v0.1 — 오픈월드 RPG · 건축 · 문명 (개발 중)</div>
    </div>
  );
}
