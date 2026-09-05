import { audioRecord } from '@testing/audiobook';
import { scriptBlock, scriptUnit } from '@testing/scripting';
import { describe, expect, it } from 'vitest';

import { PlayerState, UnitAudio } from './audiobook.models';
import * as playback from './audiobook.playback';
import { emptyUnitAudio } from './audiobook.rules';

const unit = scriptUnit({ id: 'U01' });

const audio: UnitAudio = {
  ...emptyUnitAudio(),
  audio: { n1: audioRecord({ dur: 4 }), n2: audioRecord({ dur: 2 }) },
};

const n1 = scriptBlock({ id: 'n1', type: 'narration', text: 'First' });
const n2 = scriptBlock({ id: 'n2', type: 'narration', text: 'Second' });
const gap = scriptBlock({ id: 'p', type: 'pause', text: '', ms: 1500 });

function item(id: string, dur: number) {
  return { id, kind: 'segment', projectId: 1, unitId: 'U01', dur, title: id, voice: '' } as const;
}

describe('player state machine', () => {
  it('starts idle and ignores empty queues', () => {
    expect(playback.idlePlayer()).toEqual({ queue: [], index: -1, time: 0, on: false });
    expect(playback.startPlayer([])).toEqual(playback.idlePlayer());
    const started = playback.startPlayer([item('a', 3)]);
    expect(started).toMatchObject({ index: 0, time: 0, on: true });
    expect(playback.currentItem(started)?.id).toBe('a');
    expect(playback.currentItem(playback.idlePlayer())).toBeNull();
  });

  it('moves to the next item and goes idle after the last one', () => {
    let state: PlayerState = playback.startPlayer([item('a', 2), item('b', 1)]);
    state = playback.timedPlayer(state, 1.5);
    expect(state.time).toBe(1.5);
    state = playback.advancedPlayer(state);
    expect(state).toMatchObject({ index: 1, time: 0, on: true });
    expect(playback.advancedPlayer(state)).toEqual(playback.idlePlayer());
  });

  it('clamps reported time and applies the measured duration', () => {
    const state = playback.startPlayer([item('a', 2), item('b', 1)]);
    expect(playback.timedPlayer(state, 9).time).toBe(2);
    expect(playback.timedPlayer(state, -1).time).toBe(0);
    const unknown = playback.startPlayer([item('p', 0)]);
    expect(playback.timedPlayer(unknown, 3).time).toBe(3);
    const idle = playback.idlePlayer();
    expect(playback.timedPlayer(idle, 3)).toBe(idle);
    const measured = playback.measuredPlayer(state, 2.5);
    expect(measured.queue.map((entry) => entry.dur)).toEqual([2.5, 1]);
    expect(playback.measuredPlayer(state, 0)).toBe(state);
    expect(playback.measuredPlayer(idle, 2)).toBe(idle);
  });

  it('toggles only a non-empty queue', () => {
    const paused = playback.toggledPlayer(playback.startPlayer([item('a', 3)]));
    expect(paused.on).toBe(false);
    expect(playback.toggledPlayer(paused).on).toBe(true);
    const idle = playback.idlePlayer();
    expect(playback.toggledPlayer(idle)).toBe(idle);
  });

  it('reports progress', () => {
    const state: PlayerState = { queue: [item('a', 4), item('b', 6)], index: 1, time: 3, on: true };
    expect(playback.totalSeconds(state.queue)).toBe(10);
    expect(playback.elapsedSeconds(state)).toBe(7);
    expect(playback.overallPercent(state)).toBe(70);
    expect(playback.itemPercent(state)).toBe(50);
    expect(playback.overallPercent(playback.idlePlayer())).toBe(0);
    expect(playback.itemPercent(playback.idlePlayer())).toBe(0);
    expect(playback.itemPercent({ ...state, queue: [item('a', 0)], index: 0 })).toBe(0);
    expect(playback.overallPercent({ ...state, time: 99 })).toBe(100);
  });

  it('recognises a single item queue', () => {
    const state = playback.startPlayer([item('a', 3)]);
    expect(playback.isSingleItem(state, 'a')).toBe(true);
    expect(playback.isSingleItem(state, 'b')).toBe(false);
    expect(playback.isSingleItem(playback.startPlayer([item('a', 1), item('b', 1)]), 'a')).toBe(
      false,
    );
  });
});

describe('queue builders', () => {
  it('builds segment, pause and preview items', () => {
    expect(playback.segmentItem(1, unit, 'Intro', n1, audio)).toMatchObject({
      id: 'n1',
      kind: 'segment',
      dur: 4,
      title: 'Intro · First',
    });
    expect(playback.segmentItem(1, unit, 'Intro', scriptBlock({ id: 'zz' }), audio)).toBeNull();
    expect(playback.pauseItem(1, unit, gap)).toMatchObject({ id: '', kind: 'pause', dur: 1.5 });
    expect(playback.previewItem(1, 'U01', 'Narrator', 'Voice', 6)).toMatchObject({
      kind: 'preview',
      title: 'Narrator',
      voice: 'Voice',
      dur: 6,
    });
  });

  it('builds a chapter queue with pauses and only existing audio', () => {
    const full = scriptUnit({
      id: 'U01',
      blocks: [n1, gap, n2, scriptBlock({ id: 'x', type: 'note', text: 'n' })],
    });
    const queue = playback.chapterQueue(1, full, 'Intro', audio);
    expect(queue.map((entry) => entry.kind)).toEqual(['segment', 'pause', 'segment']);
    const noAudio = playback.chapterQueue(1, full, 'Intro', emptyUnitAudio());
    expect(noAudio).toEqual([]);
    expect(playback.chapterQueue(1, scriptUnit({ blocks: null }), 'Intro', audio)).toEqual([]);
  });
});
