import {
  FakeAudio,
  FakeMedia,
  FakeMediaRecorder,
  installFakeMedia,
  setMediaDevices,
  uninstallFakeMedia,
} from '@testing/media';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VOICE_RECORDING_MAX_MS, VoiceRecorder } from './library.voices.recorder';

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe('VoiceRecorder', () => {
  let media: FakeMedia;
  let recorder: VoiceRecorder;

  beforeEach(() => {
    vi.useFakeTimers();
    media = installFakeMedia();
    recorder = new VoiceRecorder();
  });

  afterEach(() => {
    vi.useRealTimers();
    uninstallFakeMedia();
  });

  it('records, stops and exposes the clip', async () => {
    await recorder.start();
    expect(recorder.state()).toBe('recording');
    await vi.advanceTimersByTimeAsync(2000);
    expect(recorder.elapsedMs()).toBeGreaterThanOrEqual(2000);
    recorder.stop();
    await flush();
    expect(recorder.state()).toBe('recorded');
    expect(recorder.recording()).toMatchObject({ mime: 'audio/webm', data: 'YWJj' });
    expect(recorder.recording()?.durationMs).toBeGreaterThanOrEqual(2000);
    expect(media.stopTrack).toHaveBeenCalled();
  });

  it('stops by itself at the limit', async () => {
    await recorder.start();
    await vi.advanceTimersByTimeAsync(VOICE_RECORDING_MAX_MS + 500);
    expect(recorder.state()).toBe('recorded');
    expect(recorder.recording()?.durationMs).toBe(VOICE_RECORDING_MAX_MS);
  });

  it('reports a missing or denied microphone', async () => {
    media.getUserMedia.mockRejectedValueOnce(new Error('denied'));
    await recorder.start();
    expect(recorder.failed()).toBe(true);
    expect(recorder.state()).toBe('idle');
    setMediaDevices(undefined);
    await recorder.start();
    expect(recorder.failed()).toBe(true);
    setMediaDevices({ getUserMedia: media.getUserMedia });
    await recorder.start();
    expect(recorder.failed()).toBe(false);
  });

  it('releases the microphone when discarded while recording', async () => {
    await recorder.start();
    recorder.discard();
    expect(media.stopTrack).toHaveBeenCalled();
    expect(recorder.state()).toBe('idle');
    expect(FakeMediaRecorder.instances[0].state).toBe('inactive');
    await flush();
    expect(recorder.recording()).toBeNull();
  });

  it('closes a stream that arrives after discard', async () => {
    const pending = recorder.start();
    recorder.discard();
    await pending;
    expect(media.stopTrack).toHaveBeenCalled();
    expect(recorder.state()).toBe('idle');
  });

  it('previews the clip and revokes its url on discard', async () => {
    await recorder.start();
    recorder.stop();
    await flush();
    await recorder.togglePlayback();
    expect(recorder.playing()).toBe(true);
    expect(FakeAudio.instances[0].src).toBe('blob:voice');
    FakeAudio.instances[0].onended?.();
    expect(recorder.playing()).toBe(false);
    await recorder.togglePlayback();
    await recorder.togglePlayback();
    expect(recorder.playing()).toBe(false);
    recorder.discard();
    expect(media.revoke).toHaveBeenCalledWith('blob:voice');
    expect(recorder.recording()).toBeNull();
    await recorder.togglePlayback();
    expect(recorder.playing()).toBe(false);
  });
});
