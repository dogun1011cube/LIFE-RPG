type Handler<T> = (payload: T) => void;

/** Minimal typed event emitter. */
export class Emitter<E extends Record<string, unknown>> {
  private handlers = new Map<keyof E, Set<Handler<any>>>();

  on<K extends keyof E>(key: K, h: Handler<E[K]>): () => void {
    let set = this.handlers.get(key);
    if (!set) {
      set = new Set();
      this.handlers.set(key, set);
    }
    set.add(h);
    return () => set!.delete(h);
  }

  emit<K extends keyof E>(key: K, payload: E[K]): void {
    const set = this.handlers.get(key);
    if (!set) return;
    for (const h of [...set]) h(payload);
  }
}

export type NotifyKind = 'item' | 'info' | 'warn' | 'quest' | 'xp' | 'unlock';

export interface GameEvents extends Record<string, unknown> {
  notify: { text: string; kind: NotifyKind; icon?: string; qty?: number };
  banner: { title: string; subtitle?: string; kind: 'level' | 'quest' | 'discover' | 'region' | 'boss' | 'info' };
  region: { name: string };
}
