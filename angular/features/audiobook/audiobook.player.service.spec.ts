import { TestBed } from '@angular/core/testing';
import { LanguageService } from '@shared/language/language.service';
import { installAudiobookBackend, prepareEngines } from '@testing/audiobook';
import { FakeIpc } from '@testing/fake-ipc';
import { flushEffects, setupApp } from '@testing/service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PLAYER_TICK_MS } from './audiobook.playback';
import {
  AUDIOBOOK_CLOCK,
  AudiobookClock,
  AudiobookPlayerService,
} from './audiobook.player.service';
import { AudiobookService } from './audiobook.service';

const PROJECT = 1;

class ManualClock implements AudiobookClock {
  callback: (() => void) | null = null;
  interval = 0;
  stopped = 0;

  start(callback: () => void, intervalMs: number): unknown {
    this.callback = callback;
    this.interval = intervalMs;
    return 'handle';
  }

  stop(): void {
    this.stopped += 1;
    this.callback = null;
  }
}

describe('AudiobookPlayerService', () => {
  let ipc: FakeIpc;
  let audiobook: AudiobookService;
  let player: AudiobookPlayerService;
  let clock: ManualClock;

  beforeEach(async () => {
    ipc = setupApp();
    installAudiobookBackend(ipc);
    clock = new ManualClock();
    TestBed.configureTestingModule({ providers: [{ provide: AUDIOBOOK_CLOCK, useValue: clock }] });
    prepareEngines();
    TestBed.inject(LanguageService).init();
    audiobook = TestBed.inject(AudiobookService);
    player = TestBed.inject(AudiobookPlayerService);
    flushEffects();
    await audiobook.load(PROJECT);
  });

  function firstAudioId(): string {
    return audiobook.contextOf(PROJECT)?.segments.find((row) => row.record)?.block.id ?? '';
  }

  it('plays one segment on a timer and stops when it ends', () => {
    const id = firstAudioId();
    expect(player.playSegment(PROJECT, id)).toBe(true);
    expect(clock.interval).toBe(PLAYER_TICK_MS);
    expect(player.playing()).toBe(true);
    expect(player.isActiveFor(PROJECT)).toBe(true);
    expect(player.isActiveFor(2)).toBe(false);
    expect(player.isCurrentSegment(id)).toBe(true);
    expect(player.isCurrentSegment('x')).toBe(false);
    const total = player.total();
    expect(total).toBeGreaterThan(0);
    player.tick();
    expect(player.elapsed()).toBeCloseTo(0.9);
    expect(player.percent()).toBeGreaterThan(0);
    expect(player.itemPercent()).toBeGreaterThan(0);
    player.advance(Math.ceil(total / 0.9) + 1);
    expect(player.current()).toBeNull();
    expect(player.playing()).toBe(false);
    expect(clock.stopped).toBe(1);
  });

  it('toggles the same single segment and restarts for another one', () => {
    const id = firstAudioId();
    player.playSegment(PROJECT, id);
    player.playSegment(PROJECT, id);
    expect(player.playing()).toBe(false);
    player.toggle();
    expect(player.playing()).toBe(true);
    const other =
      audiobook.contextOf(PROJECT)?.segments.filter((row) => row.record)[1]?.block.id ?? '';
    player.playSegment(PROJECT, other);
    expect(player.isCurrentSegment(other)).toBe(true);
    expect(player.state().index).toBe(0);
    player.stop();
    expect(player.current()).toBeNull();
    expect(player.total()).toBe(0);
    expect(player.percent()).toBe(0);
  });

  it('refuses segments without audio', () => {
    const missing =
      audiobook.contextOf(PROJECT)?.segments.find((row) => !row.record)?.block.id ?? '';
    expect(player.playSegment(PROJECT, missing)).toBe(false);
    expect(player.playSegment(PROJECT, 'zzz')).toBe(false);
    expect(player.playSegment(99, missing)).toBe(false);
    expect(player.state().queue).toEqual([]);
  });

  it('plays the chapter including pauses and moves through the queue', () => {
    expect(player.playChapter(99)).toBe(false);
    audiobook.selectUnit(PROJECT, audiobook.contextOf(PROJECT)?.rail[0].unit.id ?? '');
    expect(player.playChapter(PROJECT)).toBe(true);
    const queue = player.state().queue;
    expect(queue.length).toBeGreaterThan(1);
    expect(queue.every((item) => ['segment', 'pause'].includes(item.kind))).toBe(true);
    player.advance(5);
    expect(player.current()).not.toBeNull();
    player.advance(5000);
    expect(player.current()).toBeNull();
    player.playChapter(PROJECT);
    player.stop();
    audiobook.selectUnit(PROJECT, audiobook.contextOf(PROJECT)?.rail[5].unit.id ?? '');
    expect(player.playChapter(PROJECT)).toBe(false);
  });

  it('titles every kind of item', () => {
    player.playSegment(PROJECT, firstAudioId());
    const segment = player.current();
    expect(player.titleOf(segment ?? ({} as never))).toContain(' · ');
    expect(player.titleOf({ ...(segment as object), kind: 'pause' } as never)).toBe('Pauses');
    expect(
      player.titleOf({
        ...(segment as object),
        kind: 'preview',
        title: 'Narrator',
        voice: 'An',
      } as never),
    ).toBe('Preview · Narrator · An');
  });

  it('previews a speaker voice through the backend', async () => {
    expect(await player.preview(PROJECT, 'narr')).toBe('started');
    expect(ipc.called('audiobook_voice_preview')).toBe(1);
    expect(ipc.lastArgs('audiobook_voice_preview')).toMatchObject({
      projectId: PROJECT,
      voiceId: 1,
    });
    expect(player.current()).toMatchObject({ kind: 'preview', title: 'Narrator' });
    expect(player.current()?.dur).toBeGreaterThanOrEqual(2);
    expect(await player.preview(PROJECT, 'E16')).toBe('unavailable');
    expect(await player.preview(PROJECT, 'ghost')).toBe('unavailable');
    ipc.on('audiobook_voice_preview', undefined);
    await player.preview(PROJECT, 'narr');
    expect(player.current()?.dur).toBe(6);
    ipc.fail('audiobook_voice_preview', 'no engine');
    expect(await player.preview(PROJECT, 'narr')).toBe('failed');
  });

  it('keeps the default clock backed by setInterval', () => {
    vi.useFakeTimers();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const real = TestBed.inject(AUDIOBOOK_CLOCK);
    const spy = vi.fn();
    const handle = real.start(spy, 100);
    vi.advanceTimersByTime(250);
    expect(spy).toHaveBeenCalledTimes(2);
    real.stop(handle);
    vi.advanceTimersByTime(250);
    expect(spy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
