import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { Game } from '../game/Game';

const Ctx = createContext<Game | null>(null);

export function GameProvider({ game, children }: { game: Game; children: ReactNode }) {
  return <Ctx.Provider value={game}>{children}</Ctx.Provider>;
}

/** Access the game and re-render whenever the game bumps the UI bridge. */
export function useGame(): Game {
  const g = useContext(Ctx);
  if (!g) throw new Error('useGame outside provider');
  useSyncExternalStore(g.bridge.subscribe, g.bridge.getVersion);
  return g;
}
