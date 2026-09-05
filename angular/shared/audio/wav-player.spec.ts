import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WavPlayer } from './wav-player';

class StubAudio {
  static last: StubAudio | null = null;
  readonly listeners = new Map<string, () => void>();
  src = '';
  duration = 1.5;
  currentTime = 0;
  paused = true;
  readonly play = vi.fn(this.start.bind(this));

  constructor() {
    StubAudio.last = this;
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  removeAttribute(): void {
    this.src = '';
  }

  pause(): void {
    this.paused = true;
  }

  fire(type: string): void {
    this.listeners.get(type)?.();
  }

  private async start(): Promise<void> {
    this.paused = false;
  }
}

describe('WavPlayer', () => {
  const revoke = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('Audio', StubAudio);
    Object.assign(URL, { createObjectURL: () => 'blob:wav', revokeObjectURL: revoke });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('plays, reports progress, pauses, resumes and ends', async () => {
    const player = new WavPlayer();
    const ended = vi.fn();
    const progress = vi.fn();
    expect(await player.play(new ArrayBuffer(4), ended, progress)).toBe(1500);
    const audio = StubAudio.last as StubAudio;
    expect(audio.src).toBe('blob:wav');
    audio.currentTime = 0.4;
    audio.fire('timeupdate');
    expect(progress).toHaveBeenCalledWith(0.4);
    player.pause();
    expect(audio.paused).toBe(true);
    await player.resume();
    expect(audio.paused).toBe(false);
    audio.fire('ended');
    expect(ended).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:wav');
    await player.resume();
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it('reports an unknown duration as zero and ignores events after stop', async () => {
    const player = new WavPlayer();
    const ended = vi.fn();
    const pending = player.play(new ArrayBuffer(4), ended);
    const audio = StubAudio.last as StubAudio;
    audio.duration = Number.NaN;
    expect(await pending).toBe(0);
    audio.fire('timeupdate');
    player.stop();
    audio.fire('ended');
    expect(ended).not.toHaveBeenCalled();
  });
});
