import type { Slot } from '../state/types';
import type { Cost } from '../data/recipes';
import { ITEMS } from '../data/items';

/** Pure inventory helpers operating on a Slot[] array (so the same code works for player bags and chests). */
export const Inv = {
  stackSize(id: string): number {
    return ITEMS[id]?.stack ?? 99;
  },

  count(slots: Slot[], id: string): number {
    let n = 0;
    for (const s of slots) if (s && s.id === id) n += s.qty;
    return n;
  },

  /** How many of `id` can still fit. */
  space(slots: Slot[], id: string): number {
    const max = Inv.stackSize(id);
    let n = 0;
    for (const s of slots) {
      if (!s) n += max;
      else if (s.id === id) n += max - s.qty;
    }
    return n;
  },

  /** Adds items, returns the leftover that did not fit. */
  add(slots: Slot[], id: string, qty: number): number {
    const max = Inv.stackSize(id);
    let left = qty;
    for (let i = 0; i < slots.length && left > 0; i++) {
      const s = slots[i];
      if (s && s.id === id && s.qty < max) {
        const take = Math.min(max - s.qty, left);
        s.qty += take;
        left -= take;
      }
    }
    for (let i = 0; i < slots.length && left > 0; i++) {
      if (!slots[i]) {
        const take = Math.min(max, left);
        slots[i] = { id, qty: take };
        left -= take;
      }
    }
    return left;
  },

  /** Removes qty of id. All-or-nothing. */
  remove(slots: Slot[], id: string, qty: number): boolean {
    if (Inv.count(slots, id) < qty) return false;
    let left = qty;
    for (let i = slots.length - 1; i >= 0 && left > 0; i--) {
      const s = slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.qty, left);
        s.qty -= take;
        left -= take;
        if (s.qty <= 0) slots[i] = null;
      }
    }
    return true;
  },

  hasAll(slots: Slot[], costs: Cost[]): boolean {
    return costs.every((c) => Inv.count(slots, c.item) >= c.qty);
  },

  removeAll(slots: Slot[], costs: Cost[]): boolean {
    if (!Inv.hasAll(slots, costs)) return false;
    for (const c of costs) Inv.remove(slots, c.item, c.qty);
    return true;
  },

  /** Max number of crafts affordable. */
  maxCrafts(slots: Slot[], costs: Cost[]): number {
    let n = Infinity;
    for (const c of costs) n = Math.min(n, Math.floor(Inv.count(slots, c.item) / c.qty));
    return n === Infinity ? 0 : n;
  },

  /** Move/merge/swap slot a into slot b (possibly across two arrays). */
  moveSlot(from: Slot[], a: number, to: Slot[], b: number) {
    if (from === to && a === b) return;
    const sa = from[a];
    const sb = to[b];
    if (!sa) return;
    if (sb && sb.id === sa.id) {
      const max = Inv.stackSize(sa.id);
      const take = Math.min(max - sb.qty, sa.qty);
      sb.qty += take;
      sa.qty -= take;
      if (sa.qty <= 0) from[a] = null;
      return;
    }
    from[a] = sb;
    to[b] = sa;
  },

  /** Transfer an entire stack into another container, merging where possible. Returns true if fully moved. */
  transferStack(from: Slot[], index: number, to: Slot[]): boolean {
    const s = from[index];
    if (!s) return false;
    const left = Inv.add(to, s.id, s.qty);
    if (left <= 0) {
      from[index] = null;
      return true;
    }
    s.qty = left;
    return false;
  },

  sort(slots: Slot[]) {
    const order = ['weapon', 'tool', 'armor', 'consumable', 'material', 'special'];
    const merged = new Map<string, number>();
    for (const s of slots) if (s) merged.set(s.id, (merged.get(s.id) ?? 0) + s.qty);
    const ids = [...merged.keys()].sort((x, y) => {
      const cx = order.indexOf(ITEMS[x]?.category ?? 'material');
      const cy = order.indexOf(ITEMS[y]?.category ?? 'material');
      if (cx !== cy) return cx - cy;
      return (ITEMS[x]?.name ?? x).localeCompare(ITEMS[y]?.name ?? y, 'ko');
    });
    for (let i = 0; i < slots.length; i++) slots[i] = null;
    for (const id of ids) Inv.add(slots, id, merged.get(id)!);
  },
};
