import { describe, expect, it, vi } from 'vitest';

import {
  AUDIOBOOK_LEXICON,
  audiobookEnvOf,
  audiobookVoices,
  seedAudiobooks,
} from '../../stories/screens/audiobook.fixtures';
import { audiobookHandlers } from '../../stories/screens/audiobook.mocks';
import { projectModuleStatesFor } from '../../stories/screens/project-management.fixtures';
import { seedScripts } from '../../stories/screens/scripting.fixtures';
import { createScriptingState } from '../../stories/screens/scripting.mocks';
import { Audiobook, AudioRecord, SegmentRequest } from './audiobook.models';
import { audiobookProgress, segmentInfo, unitStat, voicedBlocks } from './audiobook.rules';

const scripts = seedScripts(false);
const books = seedAudiobooks(scripts);

function statsOf(projectId: number) {
  const env = audiobookEnvOf(scripts[projectId], books[projectId]);
  return scripts[projectId].units.map((unit) => unitStat(env, unit));
}

describe('audiobook seed', () => {
  it('matches the prototype for the Harrowmere audiobook', () => {
    const book = books[1];
    expect(book.lex.map((rule) => rule.id)).toEqual(['L01', 'L02', 'L03', 'L04', 'L05']);
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

  it('marks the missing tea woman voice and the older Sevrin rule', () => {
    const env = audiobookEnvOf(scripts[1], books[1]);
    const second = scripts[1].units[1];
    const states = voicedBlocks(second).map((block) => segmentInfo(env, second, block));
    expect(states.filter((info) => info.state === 'none')).toHaveLength(3);
    expect(states.some((info) => info.reasons.includes('rule'))).toBe(true);
  });

  it('seeds the trial and shorts projects', () => {
    expect(
      statsOf(4)
        .slice(0, 4)
        .map((stat) => stat.state),
    ).toEqual(['done', 'done', 'done', 'none']);
    expect(books[4].lex).toEqual([]);
    expect(statsOf(5).every((stat) => stat.state === 'done')).toBe(true);
    expect(books[5].lex).toHaveLength(AUDIOBOOK_LEXICON.length);
    expect(audiobookVoices().map((voice) => voice.id)).toContain(1);
  });
});

describe('audiobook mock backend', () => {
  function backend() {
    const scripting = createScriptingState(false);
    return audiobookHandlers(scripting, (args) =>
      projectModuleStatesFor(Number(args['projectId'])),
    );
  }

  const request: SegmentRequest = {
    text: 'Hello brave world',
    readText: 'Hello brave world',
    voice: 1,
    speed: 1,
    rules: '',
    paren: 'soft',
    symbols: [],
  };

  it('serves, saves and merges books', () => {
    const handlers = backend();
    const stored = handlers['audiobook_get']({ projectId: 1 }) as Audiobook;
    expect(stored.lex).toHaveLength(5);
    expect(handlers['audiobook_get']({ projectId: 99 })).toBeNull();
    handlers['audiobook_config_save']({
      projectId: 1,
      config: { voices: {}, lex: [], symbols: [] },
    });
    const next = handlers['audiobook_get']({ projectId: 1 }) as Audiobook;
    expect(next.lex).toEqual([]);
    expect(Object.keys(next.units).length).toBeGreaterThan(0);
    handlers['audiobook_config_save']({
      projectId: 99,
      config: { voices: {}, lex: [], symbols: [] },
    });
    expect((handlers['audiobook_get']({ projectId: 99 }) as Audiobook).units).toEqual({});
    const unit = Object.keys(next.units)[0];
    handlers['audiobook_unit_save']({
      projectId: 1,
      unitId: unit,
      unit: { audio: {}, mix: { gap: 1, intro: 1, outro: 1, vol: 0 }, meta: 'none' },
    });
    expect((handlers['audiobook_get']({ projectId: 1 }) as Audiobook).units[unit].mix.gap).toBe(1);
    expect(() =>
      handlers['audiobook_unit_save']({ projectId: 77, unitId: 'x', unit: {} }),
    ).toThrow();
  });

  it('generates a record after a short delay and validates the segment', async () => {
    vi.useFakeTimers();
    const handlers = backend();
    const scripts = seedScripts(false);
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
    expect(handlers['audiobook_voice_preview']({ text: 'one', speed: 1 })).toEqual({ dur: 2 });
    const rows = handlers['project_modules']({ projectId: 1 }) as { id: string; note: string }[];
    expect(rows.find((row) => row.id === 'audiobook')?.note).toBe('7/12 chapters · 2 need review');
    expect(rows.find((row) => row.id === 'scripting')).toBeDefined();
    const other = handlers['project_modules']({ projectId: 2 }) as { id: string }[];
    expect(other.map((row) => row.id)).toEqual(['video']);
    expect((handlers['library_voice_list']({}) as unknown[]).length).toBeGreaterThan(0);
  });
});
