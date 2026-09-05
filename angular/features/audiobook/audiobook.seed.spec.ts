import { describe, expect, it, vi } from 'vitest';

import {
  audiobookEnvOf,
  audiobookVoices,
  seedAudiobooks,
} from '../../stories/screens/audiobook.fixtures';
import { audiobookHandlers } from '../../stories/screens/audiobook.mocks';
import { projectModuleStatesFor } from '../../stories/screens/project-management.fixtures';
import { seedScripts } from '../../stories/screens/scripting.fixtures';
import { createScriptingState } from '../../stories/screens/scripting.mocks';
import { PipelineEvent, PipelineSnapshot } from '../novel/novel.translation.models';
import { Audiobook, AudioRecord, SegmentRequest, UnitAudio } from './audiobook.models';
// prettier-ignore
import { audiobookProgress, emptyUnitAudio, segmentInfo, unitStat, voicedBlocks } from './audiobook.rules';

const scripts = seedScripts();
const books = seedAudiobooks(scripts);

function statsOf(projectId: number) {
  const env = audiobookEnvOf(scripts[projectId], books[projectId]);
  return scripts[projectId].units.map((unit) => unitStat(env, unit));
}

describe('audiobook seed', () => {
  it('matches the prototype for the Harrowmere audiobook', () => {
    const book = books[1];
    expect(book.voices['narr']).toEqual({ voice: 1, speed: 0.95 });
    expect(book.voices['E3']).toEqual({ voice: 1, speed: 1.05 });
    expect(book.voices['E5'].speed).toBe(0.9);
    expect(book.voices['E16']).toBeUndefined();
    const stats = statsOf(1);
    expect(stats.slice(0, 3).map((stat) => stat.state)).toEqual(['done', 'stale', 'done']);
    expect(stats.slice(3).map((stat) => stat.state)).toEqual([
      'done',
      'stale',
      'done',
      'done',
      'done',
      'done',
      'none',
      'none',
      'none',
    ]);
    expect(stats[1]).toMatchObject({ total: 12, done: 8, stale: 1, none: 3 });
    expect(stats[2]).toMatchObject({ total: 5, done: 5, stale: 0 });
    expect(audiobookProgress(audiobookEnvOf(scripts[1], book), scripts[1])).toMatchObject({
      state: 'stale',
      done: 7,
      total: 12,
    });
  });

  it('keeps every segment of chapter three current', () => {
    const env = audiobookEnvOf(scripts[1], books[1]);
    const third = scripts[1].units[2];
    const infos = voicedBlocks(third).map((block) => segmentInfo(env, third, block));
    expect(infos.every((info) => info.state === 'done')).toBe(true);
  });

  it('marks the missing tea woman voice and the segment generated at an older speed', () => {
    const env = audiobookEnvOf(scripts[1], books[1]);
    const second = scripts[1].units[1];
    const states = voicedBlocks(second).map((block) => segmentInfo(env, second, block));
    expect(states.filter((info) => info.state === 'none')).toHaveLength(3);
    const stale = states.filter((info) => info.state === 'stale');
    expect(stale).toHaveLength(1);
    expect(stale[0].reasons).toEqual(['speed']);
    expect(stale[0].record?.speed).toBeLessThan(books[1].voices['narr'].speed);
  });

  it('seeds the trial and shorts projects', () => {
    expect(
      statsOf(4)
        .slice(0, 4)
        .map((stat) => stat.state),
    ).toEqual(['done', 'done', 'done', 'none']);
    expect(statsOf(5).every((stat) => stat.state === 'done')).toBe(true);
    expect(audiobookVoices().map((voice) => voice.id)).toContain(1);
  });
});

function modulesFor(args: Record<string, unknown>): unknown {
  return projectModuleStatesFor(Number(args['projectId']));
}

describe('audiobook mock backend', () => {
  function backend() {
    return audiobookHandlers(createScriptingState(), modulesFor);
  }

  const request: SegmentRequest = {
    text: 'Hello brave world',
    speaker: 'narr',
    voice: 1,
    speed: 1,
    paren: 'soft',
  };

  it('serves, saves and merges books', () => {
    const handlers = backend();
    const stored = handlers['audiobook_get']({ projectId: 1 }) as Audiobook;
    expect(Object.keys(stored.voices)).toEqual(['narr', 'E1', 'E3', 'E5']);
    expect(handlers['audiobook_get']({ projectId: 99 })).toBeNull();
    handlers['audiobook_config_save']({
      projectId: 1,
      config: { voices: {} },
    });
    const next = handlers['audiobook_get']({ projectId: 1 }) as Audiobook;
    expect(next.voices).toEqual({});
    expect(Object.keys(next.units).length).toBeGreaterThan(0);
    handlers['audiobook_config_save']({
      projectId: 99,
      config: { voices: {} },
    });
    expect((handlers['audiobook_get']({ projectId: 99 }) as Audiobook).units).toEqual({});
    const unit = Object.keys(next.units)[0];
    const mix = handlers['audiobook_mix_save']({
      projectId: 1,
      unitId: unit,
      mix: { gap: 9, intro: 1, outro: 1, vol: 0 },
    });
    expect(mix).toEqual({ gap: 5, intro: 1, outro: 1, vol: 0 });
    expect((handlers['audiobook_get']({ projectId: 1 }) as Audiobook).units[unit].mix.gap).toBe(5);
    expect(
      (handlers['audiobook_unit_get']({ projectId: 1, unitId: unit }) as UnitAudio).mix.gap,
    ).toBe(5);
    expect(handlers['audiobook_unit_get']({ projectId: 77, unitId: 'x' })).toEqual(
      emptyUnitAudio(),
    );
    expect(() => handlers['audiobook_mix_save']({ projectId: 77, unitId: 'x', mix: {} })).toThrow();
  });

  it('sets and clears flags on existing records only', () => {
    const handlers = backend();
    const book = handlers['audiobook_get']({ projectId: 1 }) as Audiobook;
    const [unitId, unit] = Object.entries(book.units).find(
      ([, item]) => Object.keys(item.audio).length > 0,
    ) as [string, UnitAudio];
    const blockId = Object.keys(unit.audio)[0];
    const flagged = handlers['audiobook_flag_set']({ projectId: 1, unitId, blockId, flag: 'bad' });
    expect(flagged).toMatchObject({ flag: 'bad' });
    const cleared = handlers['audiobook_flag_set']({ projectId: 1, unitId, blockId, flag: '' });
    expect(cleared).toMatchObject({ flag: '' });
    expect(() =>
      handlers['audiobook_flag_set']({ projectId: 1, unitId, blockId: 'nope', flag: 'x' }),
    ).toThrow();
    const audio = handlers['audiobook_segment_audio']({ projectId: 1, unitId, blockId });
    expect(audio).toBeInstanceOf(ArrayBuffer);
    expect(() =>
      handlers['audiobook_segment_audio']({ projectId: 1, unitId, blockId: 'nope' }),
    ).toThrow();
  });

  it('runs an audio pipeline, emits events and supports cancel', async () => {
    vi.useFakeTimers();
    const fallback = { pipeline_start: vi.fn(() => 'novel'), pipeline_cancel: vi.fn(() => false) };
    const scripting = createScriptingState();
    const handlers = audiobookHandlers(scripting, modulesFor, fallback);
    const unit = seedScripts()[1].units[1];
    const blocks = (unit.blocks ?? []).filter((item) => item.type === 'narration').slice(0, 2);
    const events: PipelineEvent[] = [];
    const sink = { emit: (event: PipelineEvent) => events.push(event) };
    const requests = Object.fromEntries(blocks.map((block) => [block.id, request]));
    const tasks = [...blocks.map((block) => ({ chapterId: unit.id, segmentId: block.id }))];
    tasks.push({ chapterId: unit.id, segmentId: 'ghost' });
    const start = { kind: 'audio', projectId: 1, tasks, params: { requests }, onEvent: sink };
    const snapshot = handlers['pipeline_start'](start) as PipelineSnapshot;
    expect(snapshot).toMatchObject({ kind: 'audio', projectId: 1, novelId: null, total: 3 });
    await vi.runAllTimersAsync();
    const finished = events.at(-1);
    expect(events[0].type).toBe('started');
    expect(finished).toMatchObject({
      type: 'finished',
      pipeline: { status: 'failed', done: 2, failed: 1 },
    });
    const stored = handlers['audiobook_unit_get']({ projectId: 1, unitId: unit.id }) as UnitAudio;
    expect(stored.audio[blocks[0].id].text).toBe(request.text);
    const second = handlers['pipeline_start']({ ...start, onEvent: sink }) as PipelineSnapshot;
    expect(handlers['pipeline_cancel']({ pipelineId: second.id })).toBe(true);
    await vi.runAllTimersAsync();
    expect(events.at(-1)).toMatchObject({ type: 'finished', pipeline: { status: 'cancelled' } });
    expect(handlers['pipeline_start']({ kind: 'translation' })).toBe('novel');
    expect(handlers['pipeline_cancel']({ pipelineId: 1 })).toBe(false);
    expect(audiobookHandlers(scripting, modulesFor)['pipeline_start']({})).toBeUndefined();
    vi.useRealTimers();
  });

  it('generates a record after a short delay and validates the segment', async () => {
    vi.useFakeTimers();
    const handlers = backend();
    const scripts = seedScripts();
    const unit = scripts[1].units[1];
    const block = unit.blocks?.find((item) => item.type === 'narration');
    const pending = handlers['audiobook_segment_generate']({
      projectId: 1,
      unitId: unit.id,
      blockId: block?.id,
      request,
    }) as Promise<AudioRecord>;
    await vi.runAllTimersAsync();
    const record = await pending;
    expect(record).toMatchObject({ text: request.text, voice: 1, paren: 'soft', flag: '' });
    expect(record.dur).toBeGreaterThan(0);
    const stored = handlers['audiobook_get']({ projectId: 1 }) as Audiobook;
    expect(stored.units[unit.id].audio[block?.id ?? ''].text).toBe(request.text);
    const missing = handlers['audiobook_segment_generate']({
      projectId: 1,
      unitId: unit.id,
      blockId: 'nope',
      request,
    }) as Promise<AudioRecord>;
    const failure = expect(missing).rejects.toMatchObject({ code: 'not_found' });
    await vi.runAllTimersAsync();
    await failure;
    const ghost = handlers['audiobook_segment_generate']({
      projectId: 2,
      unitId: unit.id,
      blockId: 'x',
      request,
    }) as Promise<AudioRecord>;
    const ghostFailure = expect(ghost).rejects.toMatchObject({ code: 'not_found' });
    await vi.runAllTimersAsync();
    await ghostFailure;
    vi.useRealTimers();
  });

  it('answers previews and derives the audiobook module row', () => {
    const handlers = backend();
    const preview = handlers['audiobook_voice_preview']({ text: 'one', speed: 1 }) as ArrayBuffer;
    expect(preview.byteLength).toBe(44 + 2 * 8000 * 2);
    const rows = handlers['project_modules']({ projectId: 1 }) as { id: string; note: string }[];
    expect(rows.find((row) => row.id === 'audiobook')?.note).toBe('7/12 chapters · 2 need review');
    expect(rows.find((row) => row.id === 'scripting')).toBeDefined();
    const other = handlers['project_modules']({ projectId: 2 }) as { id: string }[];
    expect(other.map((row) => row.id)).toEqual(['video']);
    expect((handlers['library_voice_list']({}) as unknown[]).length).toBeGreaterThan(0);
  });
});
