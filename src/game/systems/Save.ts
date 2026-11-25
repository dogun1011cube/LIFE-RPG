import { SAVE_SLOTS, SAVE_VERSION } from '../config';
import type { GameState, SaveFile, SaveMeta } from '../state/types';

/**
 * Local save storage. The SaveFile is plain JSON; to move to server-side saves later,
 * replace these functions with API calls - nothing else in the game touches localStorage for progress.
 */
const key = (slot: number) => `eternum_save_slot_${slot}`;
const metaKey = (slot: number) => `eternum_save_meta_${slot}`;

export function writeSave(slot: number, state: GameState): boolean {
  const file: SaveFile = { version: SAVE_VERSION, slot, savedAt: Date.now(), state };
  const meta: SaveMeta = { slot, savedAt: file.savedAt, level: state.player.level, day: state.world.day, playTime: state.playTime, name: state.player.name };
  try {
    localStorage.setItem(key(slot), JSON.stringify(file));
    localStorage.setItem(metaKey(slot), JSON.stringify(meta));
    return true;
  } catch (e) {
    console.error('Save failed', e);
    return false;
  }
}

export function readSave(slot: number): SaveFile | null {
  try {
    const raw = localStorage.getItem(key(slot));
    if (!raw) return null;
    const file = JSON.parse(raw) as SaveFile;
    if (!file.state || typeof file.version !== 'number') return null;
    return migrate(file);
  } catch (e) {
    console.error('Load failed', e);
    return null;
  }
}

/** Upgrade older save formats here when SAVE_VERSION increases. */
function migrate(file: SaveFile): SaveFile {
  return file;
}

export function listSaves(): (SaveMeta | null)[] {
  const out: (SaveMeta | null)[] = [];
  for (let i = 0; i < SAVE_SLOTS; i++) {
    try {
      const raw = localStorage.getItem(metaKey(i));
      out.push(raw ? (JSON.parse(raw) as SaveMeta) : null);
    } catch {
      out.push(null);
    }
  }
  return out;
}

export function deleteSave(slot: number) {
  localStorage.removeItem(key(slot));
  localStorage.removeItem(metaKey(slot));
}

export function latestSlot(): number | null {
  const saves = listSaves();
  let best: SaveMeta | null = null;
  for (const s of saves) if (s && (!best || s.savedAt > best.savedAt)) best = s;
  return best ? best.slot : null;
}
