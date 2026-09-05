import { TestBed } from '@angular/core/testing';
import { LanguageService } from '@shared/language/language.service';
import { FakeAudioOutput, installAudiobookBackend, prepareEngines } from '@testing/audiobook';
import { FakeIpc } from '@testing/fake-ipc';
import { flushEffects, setupApp } from '@testing/service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUDIOBOOK_AUDIO, AudiobookPlayerService } from './audiobook.player.service';
import { AudiobookService } from './audiobook.service';

const PROJECT = 1;

describe('AudiobookPlayerService', () => {
  let ipc: FakeIpc;
  let audiobook: AudiobookService;
  let player: AudiobookPlayerService;
  let output: FakeAudioOutput;

  beforeEach(async () => {
    ipc = setupApp();
    output = installAudiobookBackend(ipc).output;
    prepareEngines();
    TestBed.inject(LanguageService).init();
    audiobook = TestBed.inject(AudiobookService);
    player = TestBed.inject(AudiobookPlayerService);
    flushEffects();
    await audiobook.load(PROJECT);
  });

  function audioIds(): string[] {
    const segments = audiobook.contextOf(PROJECT)?.segments ?? [];
    return segments.filter((row) => row.record).map((row) => row.block.id);
  }

  async function started(count: number): Promise<void> {
    await vi.waitFor(() => expect(output.played.length).toBe(count));
  }

  it('plays the real segment audio and stops when it ends', async () => {
    const id = audioIds()[0];
    expect(player.playSegment(PROJECT, id)).toBe(true);
    await started(1);
    expect(ipc.lastArgs('audiobook_segment_audio')).toMatchObject({
      projectId: PROJECT,
      blockId: id,
    });
    expect(player.playing()).toBe(true);
    expect(player.isActiveFor(PROJECT)).toBe(true);
    expect(player.isActiveFor(2)).toBe(false);
    expect(player.isCurrentSegment(id)).toBe(true);
    expect(player.isCurrentSegment('x')).toBe(false);
    expect(player.total()).toBe(2);
    output.progress?.(0.5);
    expect(player.elapsed()).toBe(0.5);
    expect(player.percent()).toBe(25);
    expect(player.itemPercent()).toBe(25);
    output.finish();
    expect(player.current()).toBeNull();
    expect(player.playing()).toBe(false);
  });

  it('toggles the same single segment and switches to another one', async () => {
    const [id, other] = audioIds();
    player.playSegment(PROJECT, id);
    await started(1);
    player.playSegment(PROJECT, id);
    expect(player.playing()).toBe(false);
    expect(output.paused).toBe(true);
    player.toggle();
    expect(player.playing()).toBe(true);
    expect(output.paused).toBe(false);
    player.playSegment(PROJECT, other);
    await started(2);
    expect(player.isCurrentSegment(other)).toBe(true);
    expect(player.state().index).toBe(0);
    player.stop();
    expect(player.current()).toBeNull();
    expect(player.total()).toBe(0);
    expect(player.percent()).toBe(0);
    player.toggle();
    expect(player.playing()).toBe(false);
  });

  it('refuses segments without audio and stops when audio cannot load', async () => {
    const missing =
      audiobook.contextOf(PROJECT)?.segments.find((row) => !row.record)?.block.id ?? '';
    expect(player.playSegment(PROJECT, missing)).toBe(false);
    expect(player.playSegment(PROJECT, 'zzz')).toBe(false);
    expect(player.playSegment(99, missing)).toBe(false);
    expect(player.state().queue).toEqual([]);
    ipc.fail('audiobook_segment_audio', { code: 'not_found', detail: 'gone' });
    player.playSegment(PROJECT, audioIds()[0]);
    await vi.waitFor(() => expect(player.current()).toBeNull());
  });

  it('plays the chapter with pauses as silence and moves through the queue', async () => {
    expect(player.playChapter(99)).toBe(false);
    audiobook.selectUnit(PROJECT, audiobook.contextOf(PROJECT)?.rail[0].unit.id ?? '');
    expect(player.playChapter(PROJECT)).toBe(true);
    const queue = player.state().queue;
    expect(queue.length).toBeGreaterThan(1);
    expect(queue.some((item) => item.kind === 'pause')).toBe(true);
    for (let index = 0; index < queue.length; index += 1) {
      await started(index + 1);
      output.finish();
    }
    expect(player.current()).toBeNull();
    const segments = queue.filter((item) => item.kind === 'segment').length;
    expect(ipc.called('audiobook_segment_audio')).toBe(segments);
    player.playChapter(PROJECT);
    player.stop();
    audiobook.selectUnit(PROJECT, audiobook.contextOf(PROJECT)?.rail[5].unit.id ?? '');
    expect(player.playChapter(PROJECT)).toBe(false);
  });

  it('titles every kind of item', () => {
    player.playSegment(PROJECT, audioIds()[0]);
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

  it('previews a speaker voice from the returned audio', async () => {
    expect(await player.preview(PROJECT, 'narr')).toBe('started');
    expect(ipc.called('audiobook_voice_preview')).toBe(1);
    expect(ipc.lastArgs('audiobook_voice_preview')).toMatchObject({
      projectId: PROJECT,
      voiceId: 1,
    });
    expect(player.current()).toMatchObject({ kind: 'preview', title: 'Narrator', dur: 2 });
    expect(output.played).toHaveLength(1);
    expect(await player.preview(PROJECT, 'E16')).toBe('unavailable');
    expect(await player.preview(PROJECT, 'ghost')).toBe('unavailable');
    ipc.fail('audiobook_voice_preview', 'no engine');
    expect(await player.preview(PROJECT, 'narr')).toBe('failed');
    expect(player.current()).toBeNull();
    ipc.on('audiobook_voice_preview', new ArrayBuffer(8));
    output.failure = new Error('blocked');
    expect(await player.preview(PROJECT, 'narr')).toBe('failed');
  });

  it('uses a real wav player by default', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const real = TestBed.inject(AUDIOBOOK_AUDIO);
    expect(typeof real.play).toBe('function');
    expect(typeof real.resume).toBe('function');
  });
});
