import { ScriptBlock, ScriptUnit } from '../scripting/scripting.models';
import { PlayerState, PlayItem, UnitAudio } from './audiobook.models';
import { excerptTitle, isVoiced } from './audiobook.rules';

export const PLAYER_RATE = 6;

export const PLAYER_TICK_MS = 150;

export const PLAYER_STEP = (PLAYER_TICK_MS / 1000) * PLAYER_RATE;

export function idlePlayer(): PlayerState {
  return { queue: [], index: -1, time: 0, on: false };
}

export function startPlayer(queue: PlayItem[]): PlayerState {
  return queue.length > 0 ? { queue, index: 0, time: 0, on: true } : idlePlayer();
}

export function currentItem(state: PlayerState): PlayItem | null {
  return state.queue[state.index] ?? null;
}

export function tickPlayer(state: PlayerState): PlayerState {
  const item = currentItem(state);
  if (!state.on || !item) {
    return state;
  }
  const time = state.time + PLAYER_STEP;
  if (time < item.dur) {
    return { ...state, time };
  }
  const index = state.index + 1;
  return index >= state.queue.length ? idlePlayer() : { ...state, index, time: 0 };
}

export function toggledPlayer(state: PlayerState): PlayerState {
  return state.queue.length > 0 ? { ...state, on: !state.on } : state;
}

export function isSingleItem(state: PlayerState, id: string): boolean {
  return state.queue.length === 1 && state.queue[0].id === id;
}

export function totalSeconds(queue: PlayItem[]): number {
  return queue.reduce((sum, item) => sum + item.dur, 0);
}

export function elapsedSeconds(state: PlayerState): number {
  return totalSeconds(state.queue.slice(0, Math.max(0, state.index))) + state.time;
}

export function overallPercent(state: PlayerState): number {
  const total = totalSeconds(state.queue);
  return total > 0 ? Math.min(100, (elapsedSeconds(state) / total) * 100) : 0;
}

export function itemPercent(state: PlayerState): number {
  const item = currentItem(state);
  return item && item.dur > 0 ? Math.min(100, (state.time / item.dur) * 100) : 0;
}

export function segmentItem(
  projectId: number,
  unit: ScriptUnit,
  unitTitle: string,
  block: ScriptBlock,
  audio: UnitAudio,
): PlayItem | null {
  const record = audio.audio[block.id];
  if (!record) {
    return null;
  }
  return {
    id: block.id,
    kind: 'segment',
    projectId,
    unitId: unit.id,
    dur: record.dur,
    title: excerptTitle(unitTitle, block.text),
    voice: '',
  };
}

export function pauseItem(projectId: number, unit: ScriptUnit, block: ScriptBlock): PlayItem {
  return {
    id: '',
    kind: 'pause',
    projectId,
    unitId: unit.id,
    dur: block.ms / 1000,
    title: '',
    voice: '',
  };
}

export function previewItem(
  projectId: number,
  unitId: string,
  speaker: string,
  voice: string,
  dur: number,
): PlayItem {
  return { id: '', kind: 'preview', projectId, unitId, dur, title: speaker, voice };
}

function chapterItem(
  projectId: number,
  unit: ScriptUnit,
  unitTitle: string,
  audio: UnitAudio,
  block: ScriptBlock,
): PlayItem | null {
  if (block.type === 'pause') {
    return pauseItem(projectId, unit, block);
  }
  return isVoiced(block) ? segmentItem(projectId, unit, unitTitle, block, audio) : null;
}

export function chapterQueue(
  projectId: number,
  unit: ScriptUnit,
  unitTitle: string,
  audio: UnitAudio,
): PlayItem[] {
  const items: PlayItem[] = [];
  for (const block of unit.blocks ?? []) {
    const item = chapterItem(projectId, unit, unitTitle, audio, block);
    if (item) {
      items.push(item);
    }
  }
  return items.some((item) => item.kind === 'segment') ? items : [];
}
