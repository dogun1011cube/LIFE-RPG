/**
 * UI bridge: the game mutates plain state, then calls bump().
 * React components subscribe through useSyncExternalStore and re-render once per animation frame at most.
 */
export class UIBridge {
  private listeners = new Set<() => void>();
  private version = 0;
  private scheduled = false;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getVersion = () => this.version;

  bump() {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.version++;
      for (const l of [...this.listeners]) l();
    });
  }
}
