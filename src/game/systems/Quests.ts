import { QUESTS, QUEST_BY_ID, type Objective, type QuestDef } from '../data/quests';
import { ITEMS } from '../data/items';
import { ENEMIES } from '../data/enemies';
import { BUILDABLE_BY_ID } from '../data/buildables';
import { LOCATION_BY_ID } from '../data/locations';
import type { Game } from '../Game';

export interface ObjectiveView {
  label: string;
  current: number;
  target: number;
  done: boolean;
}

function counterKey(o: Objective): string | null {
  switch (o.type) {
    case 'obtain':
      return `obtain:${o.item}`;
    case 'craft':
      return `craft:${o.item}`;
    case 'kill':
      return `kill:${o.enemy}`;
    case 'build':
      return `build:${o.piece}`;
    case 'eat':
      return 'eat';
    default:
      return null;
  }
}

/** Quest progress tracking. Cumulative objectives are measured from a counter baseline taken at quest start. */
export class QuestSystem {
  constructor(private game: Game) {}

  /** Start all quests whose requirements are complete and that are not yet active/completed. */
  refreshAvailable(silent = false) {
    const qs = this.game.state.quests;
    for (const q of QUESTS) {
      if (qs.completed.includes(q.id) || qs.active.some((a) => a.id === q.id)) continue;
      if (!q.requires.every((r) => qs.completed.includes(r))) continue;
      this.start(q, silent);
    }
  }

  private start(q: QuestDef, silent: boolean) {
    const qs = this.game.state.quests;
    const baseline: Record<string, number> = {};
    for (const o of q.objectives) {
      const k = counterKey(o);
      if (k) baseline[k] = this.game.state.counters[k] ?? 0;
    }
    qs.active.push({ id: q.id, baseline });
    if (q.chain === 'main' || qs.tracked.length < 3) {
      if (!qs.tracked.includes(q.id)) qs.tracked.unshift(q.id);
      qs.tracked = qs.tracked.slice(0, 4);
    }
    if (!silent) {
      this.game.events.emit('notify', { text: `새 퀘스트: ${q.title}`, kind: 'quest' });
    }
  }

  objectiveViews(id: string): ObjectiveView[] {
    const q = QUEST_BY_ID[id];
    const prog = this.game.state.quests.active.find((a) => a.id === id);
    const done = this.game.state.quests.completed.includes(id);
    const st = this.game.state;
    return q.objectives.map((o) => {
      let label = '';
      let current = 0;
      let target = 1;
      const k = counterKey(o);
      // Kill / eat objectives count from quest start; gathering, crafting and building count all-time progress,
      // so players who did things early (e.g. crafted tools before the quest appeared) are not punished.
      const usesBaseline = o.type === 'kill' || o.type === 'eat';
      const delta = k ? (st.counters[k] ?? 0) - (usesBaseline ? (prog?.baseline[k] ?? 0) : 0) : 0;
      switch (o.type) {
        case 'obtain':
          label = `${ITEMS[o.item]?.name ?? o.item} 획득`;
          current = delta;
          target = o.count;
          break;
        case 'craft':
          label = `${ITEMS[o.item]?.name ?? o.item} 제작`;
          current = delta;
          target = o.count;
          break;
        case 'kill':
          label = `${ENEMIES[o.enemy]?.name ?? o.enemy} 처치`;
          current = delta;
          target = o.count;
          break;
        case 'build':
          label = `${BUILDABLE_BY_ID[o.piece]?.name ?? o.piece} 건설`;
          current = delta;
          target = o.count;
          break;
        case 'eat':
          label = '음식 섭취';
          current = delta;
          target = o.count;
          break;
        case 'have_built':
          label = `${o.label} 설치`;
          current = this.game.building.countShapes(o.shapes);
          target = o.count;
          break;
        case 'discover':
          label = `${LOCATION_BY_ID[o.location]?.name ?? o.location} 발견`;
          current = st.discovered.includes(o.location) ? 1 : 0;
          target = 1;
          break;
        case 'discover_count':
          label = '특별한 장소 발견';
          current = st.discovered.length;
          target = o.count;
          break;
        case 'counter':
          label = o.label;
          current = st.counters[o.key] ?? 0;
          target = o.count;
          break;
        case 'skills_learned':
          label = '스킬 습득';
          current = this.game.skillsLearnedCount();
          target = o.count;
          break;
        case 'level':
          label = `레벨 ${o.level} 달성`;
          current = st.player.level;
          target = o.level;
          break;
      }
      if (done) current = target;
      current = Math.max(0, Math.min(current, target));
      return { label, current, target, done: current >= target };
    });
  }

  /** Check active quests and complete any that are finished. */
  check() {
    const qs = this.game.state.quests;
    for (const a of [...qs.active]) {
      const views = this.objectiveViews(a.id);
      if (views.every((v) => v.done)) this.complete(a.id);
    }
  }

  private complete(id: string) {
    const game = this.game;
    const qs = game.state.quests;
    const q = QUEST_BY_ID[id];
    qs.active = qs.active.filter((a) => a.id !== id);
    qs.completed.push(id);
    qs.tracked = qs.tracked.filter((t) => t !== id);
    game.events.emit('banner', { title: '퀘스트 완료', subtitle: q.title, kind: 'quest' });
    game.audio.play('quest');
    for (const it of q.rewards.items ?? []) game.giveItem(it.item, it.qty, 'reward');
    game.gainXp(q.rewards.xp, `퀘스트: ${q.title}`);
    game.refreshUnlocks();
    this.refreshAvailable();
    game.requestAutosave();
  }
}
