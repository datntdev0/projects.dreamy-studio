import { TestBed } from '@angular/core/testing';
import { BackendService } from '@features/settings/backend.service';
import { ToastService } from '@shared/toast/toast.service';
import { FakeIpc } from '@testing/fake-ipc';
import { libraryVoice } from '@testing/fixtures';
import { flushEffects, setupApp } from '@testing/service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryVoicePlayer } from './library.voices.player';
import { LibraryVoiceService } from './library.voices.service';

class FakeVoicePlayer {
  ended: (() => void) | null = null;
  readonly played: ArrayBuffer[] = [];
  readonly play = vi.fn(this.start.bind(this));
  readonly stop = vi.fn(this.halt.bind(this));
  durationMs = 2_500;

  private async start(data: ArrayBuffer, ended: () => void): Promise<number> {
    this.played.push(data);
    this.ended = ended;
    return this.durationMs;
  }

  private halt(): void {
    this.ended = null;
  }
}

function dangerToasts(): string[] {
  return TestBed.inject(ToastService)
    .items()
    .filter((item) => item.tone === 'danger')
    .map((item) => item.message);
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

const counts = { image: 0, sound: 0, video: 0, prompt: 0 };

describe('LibraryVoiceService', () => {
  let ipc: FakeIpc;
  let voices: LibraryVoiceService;
  let player: FakeVoicePlayer;

  beforeEach(async () => {
    ipc = setupApp();
    player = new FakeVoicePlayer();
    TestBed.overrideProvider(LibraryVoicePlayer, { useValue: player });
    ipc.on('library_collection_list', []);
    ipc.on('library_tag_list', []);
    ipc.on('library_summary', { assets: counts, unfiled: counts });
    ipc.on('library_voice_list', [
      libraryVoice({ id: 1, name: 'b', createdAt: '2026-01-01' }),
      libraryVoice({ id: 2, name: 'a', engineKind: 'cloud', createdAt: '2026-02-01' }),
    ]);
    voices = TestBed.inject(LibraryVoiceService);
    flushEffects();
    await voices.ensureLoaded();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads, filters and selects', async () => {
    await voices.ensureLoaded();
    expect(ipc.called('library_voice_list')).toBe(1);
    expect(voices.visible().map((item) => item.id)).toEqual([2, 1]);
    voices.sort.set('name');
    expect(voices.visible().map((item) => item.id)).toEqual([2, 1]);
    voices.query.set('b');
    expect(voices.visible().map((item) => item.id)).toEqual([1]);
    voices.query.set('');
    voices.engineFilter.set('cloud');
    expect(voices.visible().map((item) => item.id)).toEqual([2]);
    voices.select(2);
    expect(voices.selected()?.id).toBe(2);
    voices.select(null);
    expect(voices.selected()).toBeNull();
  });

  it('treats a missing or failing backend as an empty list', async () => {
    for (const prepare of [
      (fake: FakeIpc) => fake.on('library_voice_list', undefined),
      (fake: FakeIpc) => fake.fail('library_voice_list', 'unsupported'),
    ]) {
      TestBed.resetTestingModule();
      const fake = setupApp();
      fake.on('library_collection_list', []);
      fake.on('library_tag_list', []);
      fake.on('library_summary', { assets: counts, unfiled: counts });
      prepare(fake);
      const fresh = TestBed.inject(LibraryVoiceService);
      flushEffects();
      await fresh.ensureLoaded();
      expect(fresh.items()).toEqual([]);
      expect(fresh.loaded()).toBe(true);
    }
  });

  it('creates, updates, duplicates and removes', async () => {
    ipc.on('library_voice_create', libraryVoice({ id: 7, name: 'new' }));
    const input = {
      name: 'new',
      description: '',
      engine: 'a',
      engineKind: 'local' as const,
      source: 'preset' as const,
      language: 'vi',
      gender: 'female' as const,
      preset: 'narrator-warm',
      reference: null,
      prompt: '',
    };
    expect((await voices.create(input)).id).toBe(7);
    expect(voices.items()[0].id).toBe(7);
    ipc.on('library_voice_update', libraryVoice({ id: 7, name: 'z' }));
    await voices.update(7, { description: 'z' });
    expect(ipc.lastArgs('library_voice_update')).toMatchObject({
      id: 7,
      patch: { description: 'z' },
    });
    expect(voices.items().find((item) => item.id === 7)?.name).toBe('z');
    ipc.on('library_voice_duplicate', libraryVoice({ id: 8, name: 'z (bản sao)' }));
    const copy = await voices.duplicate(7);
    expect(copy.id).toBe(8);
    expect(voices.selectedId()).toBe(8);
    expect(voices.items()[0].id).toBe(8);
    expect(ipc.lastArgs('library_voice_duplicate')).toEqual({ id: 7, name: 'z (bản sao)' });
    await expect(voices.duplicate(99)).rejects.toThrow();
    ipc.on('library_voice_delete', 1);
    expect(await voices.remove(8)).toBe(1);
    expect(voices.selectedId()).toBeNull();
    ipc.on('library_voice_delete', undefined);
    expect(await voices.remove([1, 2])).toBe(2);
    expect(voices.items().map((item) => item.id)).toEqual([7]);
  });

  it('rejects writes that return nothing or fail', async () => {
    ipc.on('library_voice_create', undefined);
    await expect(voices.create({} as never)).rejects.toThrow();
    ipc.fail('library_voice_update', 'x');
    await expect(voices.update(1, { sampleText: 'q' })).rejects.toBe('x');
  });

  it('rejects a duplicate that returns nothing', async () => {
    ipc.on('library_voice_duplicate', undefined);
    await expect(voices.duplicate(1)).rejects.toThrow();
  });

  it('picks a reference file and inspects it quietly', async () => {
    ipc.on('library_sound_pick', ['C:/in/a.wav']);
    ipc.on('library_sound_inspect', [
      { path: 'C:/in/a.wav', name: 'a.wav', size: 2048, status: 'ok' },
    ]);
    expect(await voices.pickReferenceFile()).toEqual({
      path: 'C:/in/a.wav',
      name: 'a.wav',
      size: 2048,
    });
    ipc.on('library_sound_inspect', undefined);
    expect(await voices.pickReferenceFile()).toEqual({
      path: 'C:/in/a.wav',
      name: 'a.wav',
      size: null,
    });
    ipc.on('library_sound_inspect', [
      { path: 'C:/in/a.wav', name: 'a.wav', size: 1, status: 'error', code: 'unsupported' },
    ]);
    expect(await voices.pickReferenceFile()).toBeNull();
    ipc.on('library_sound_pick', []);
    expect(await voices.pickReferenceFile()).toBeNull();
    ipc.fail('library_sound_pick', 'x');
    expect(await voices.pickReferenceFile()).toBeNull();
  });

  it('generates the sample, plays it and stops when it ends', async () => {
    const sample = new ArrayBuffer(8);
    const pending = deferred<ArrayBuffer>();
    ipc.on('library_voice_preview', () => pending.promise);
    const preview = voices.togglePreview(1);
    expect(voices.preparingId()).toBe(1);
    expect(voices.isPreviewActive(1)).toBe(true);
    expect(ipc.lastArgs('library_voice_preview')).toEqual({ id: 1, text: 'Once upon a time.' });
    pending.resolve(sample);
    await preview;
    expect(voices.preparingId()).toBeNull();
    expect(voices.playingId()).toBe(1);
    expect(player.played).toEqual([sample]);
    expect(voices.items().find((item) => item.id === 1)?.sampleDurationMs).toBe(2_500);
    player.ended?.();
    expect(voices.playingId()).toBeNull();
  });

  it('plays one sample at a time and toggles the active one off', async () => {
    ipc.on('library_voice_preview', new ArrayBuffer(4));
    await voices.togglePreview(1);
    await voices.togglePreview(2, 'Một câu khác');
    expect(voices.playingId()).toBe(2);
    expect(ipc.lastArgs('library_voice_preview')).toEqual({ id: 2, text: 'Một câu khác' });
    expect(voices.items().find((item) => item.id === 2)?.sampleDurationMs).toBe(3000);
    await voices.togglePreview(2);
    expect(voices.playingId()).toBeNull();
    expect(player.stop).toHaveBeenCalled();
    await voices.togglePreview(99);
    expect(ipc.called('library_voice_preview')).toBe(2);
  });

  it('drops a sample that arrives after the preview was cancelled', async () => {
    const pending = deferred<ArrayBuffer>();
    ipc.on('library_voice_preview', () => pending.promise);
    const preview = voices.togglePreview(1);
    await voices.togglePreview(1);
    expect(voices.preparingId()).toBeNull();
    pending.resolve(new ArrayBuffer(4));
    await preview;
    expect(voices.playingId()).toBeNull();
    expect(player.played).toEqual([]);
  });

  it('reports synthesis failures', async () => {
    ipc.fail('library_voice_preview', {
      code: 'voice_synthesis_failed',
      detail: 'PROMPT_INVALID: sparkly',
    });
    await voices.togglePreview(1);
    expect(voices.playingId()).toBeNull();
    expect(voices.preparingId()).toBeNull();
    expect(dangerToasts()).toEqual(['Không tạo được giọng mẫu: PROMPT_INVALID: sparkly']);
    ipc.fail('library_voice_preview', { code: 'voice_backend_offline', detail: 'down' });
    await voices.togglePreview(2);
    expect(dangerToasts()).toContain('Local backend chưa chạy.');
  });

  it('stops the preview of a deleted voice', async () => {
    ipc.on('library_voice_preview', new ArrayBuffer(4));
    await voices.togglePreview(1);
    ipc.on('library_voice_delete', 1);
    await voices.remove(1);
    expect(voices.playingId()).toBeNull();
    expect(player.stop).toHaveBeenCalled();
  });

  it('resolves engines from settings and tolerates unknown ones', () => {
    const backend = TestBed.inject(BackendService);
    backend.models.set([
      {
        id: 'vieneu-turbo',
        name: 'VieNeu Turbo',
        state: 'installed',
        receivedBytes: 0,
        totalBytes: 0,
        error: '',
        source: '',
        languages: [],
        cloning: false,
        gpuRecommended: false,
        sources: ['preset'],
        presets: [],
        license: '',
        commercialUse: true,
      },
    ]);
    const known = voices.items()[1];
    expect(voices.engineName(known)).toBe('VieNeu Turbo');
    expect(voices.isReady(known)).toBe(true);
    const unknown = libraryVoice({ engine: 'ghost' });
    expect(voices.engineName(unknown)).toBe('ghost');
    expect(voices.isReady(unknown)).toBe(false);
    expect(voices.engines().some((engine) => engine.kind === 'cloud')).toBe(true);
  });
});
