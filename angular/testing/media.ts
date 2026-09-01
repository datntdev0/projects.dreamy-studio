import { vi } from 'vitest';

export class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor() {
    FakeMediaRecorder.instances.push(this);
  }

  start(): void {
    this.state = 'recording';
  }

  stop(): void {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['abc']) });
    this.onstop?.();
  }
}

export class FakeAudio {
  static instances: FakeAudio[] = [];
  onended: (() => void) | null = null;
  paused = false;

  constructor(readonly src: string) {
    FakeAudio.instances.push(this);
  }

  play(): Promise<void> {
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }
}

export interface FakeMedia {
  stopTrack: ReturnType<typeof vi.fn>;
  getUserMedia: ReturnType<typeof vi.fn>;
  revoke: ReturnType<typeof vi.fn>;
}

export function installFakeMedia(): FakeMedia {
  FakeMediaRecorder.instances = [];
  FakeAudio.instances = [];
  const stopTrack = vi.fn();
  const revoke = vi.fn();
  const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('Audio', FakeAudio);
  setMediaDevices({ getUserMedia });
  Object.assign(URL, { createObjectURL: () => 'blob:voice', revokeObjectURL: revoke });
  return { stopTrack, getUserMedia, revoke };
}

export function setMediaDevices(value: unknown): void {
  Object.defineProperty(navigator, 'mediaDevices', { value, configurable: true });
}

export function uninstallFakeMedia(): void {
  setMediaDevices(undefined);
  vi.unstubAllGlobals();
}
