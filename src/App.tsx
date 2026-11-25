import { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import { GameProvider, useGame } from './ui/GameContext';
import { MainMenu, LoadingScreen } from './ui/MainMenu';
import { HUD } from './ui/HUD';
import { MenuShell } from './ui/panels/MenuShell';
import { PausePanel, SettingsPanel, ControlsPanel, SaveLoadPanel } from './ui/panels/SystemPanels';
import { ChestPanel } from './ui/panels/ChestPanel';
import { LorePanel, DeathScreen, BlueprintNamePanel } from './ui/panels/Overlays';

declare global {
  interface Window {
    __eternum?: Game;
  }
}

function UIRoot() {
  const game = useGame();
  const { screen, panel } = game.ui;
  if (screen === 'loading') return <LoadingScreen />;
  if (screen === 'menu') return <MainMenu />;
  return (
    <>
      <HUD />
      {panel === 'menu' && <MenuShell />}
      {panel === 'pause' && <PausePanel />}
      {panel === 'settings' && <SettingsPanel />}
      {panel === 'controls' && <ControlsPanel />}
      {panel === 'saveload' && <SaveLoadPanel />}
      {panel === 'chest' && <ChestPanel />}
      {panel === 'lore' && <LorePanel />}
      {panel === 'death' && <DeathScreen />}
      {panel === 'blueprint' && <BlueprintNamePanel />}
    </>
  );
}

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    let g: Game | null = null;
    try {
      g = new Game(hostRef.current);
      window.__eternum = g;
      setGame(g);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    }
    return () => {
      g?.dispose();
      window.__eternum = undefined;
    };
  }, []);

  return (
    <div className="app">
      <div ref={hostRef} className="viewport" />
      {error && (
        <div className="fatal">
          <h1>PROJECT ETERNUM</h1>
          <p>게임을 시작할 수 없습니다. WebGL을 지원하는 최신 브라우저(Chrome, Edge, Firefox)에서 실행해 주세요.</p>
          <code>{error}</code>
        </div>
      )}
      {game && (
        <GameProvider game={game}>
          <UIRoot />
        </GameProvider>
      )}
    </div>
  );
}
