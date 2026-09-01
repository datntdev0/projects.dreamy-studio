import { signal } from '@angular/core';

export type VoiceRecorderState = 'idle' | 'recording' | 'recorded';

export interface VoiceRecording {
  data: string;
  mime: string;
  durationMs: number;
}

export const VOICE_RECORDING_MAX_MS = 30_000;

const TICK_MS = 200;

function stopTrack(track: MediaStreamTrack): void {
  track.stop();
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach(stopTrack);
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export class VoiceRecorder {
  readonly state = signal<VoiceRecorderState>('idle');
  readonly elapsedMs = signal(0);
  readonly failed = signal(false);
  readonly playing = signal(false);
  readonly recording = signal<VoiceRecording | null>(null);
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private token = 0;

  async start(): Promise<void> {
    this.discard();
    const token = this.token;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (token === this.token) this.begin(stream, token);
      else stopStream(stream);
    } catch {
      this.failed.set(true);
    }
  }

  stop(): void {
    this.clearTimer();
    if (this.recorder?.state === 'recording') this.recorder.stop();
  }

  async togglePlayback(): Promise<void> {
    if (this.playing()) {
      this.stopPlayback();
      return;
    }
    if (this.url === null) return;
    this.audio = new Audio(this.url);
    this.audio.onended = this.stopPlayback.bind(this);
    this.playing.set(true);
    try {
      await this.audio.play();
    } catch {
      this.stopPlayback();
    }
  }

  discard(): void {
    this.token += 1;
    this.clearTimer();
    this.detachRecorder();
    stopStream(this.stream);
    this.stream = null;
    this.stopPlayback();
    this.revokeUrl();
    this.chunks = [];
    this.recording.set(null);
    this.elapsedMs.set(0);
    this.failed.set(false);
    this.state.set('idle');
  }

  private begin(stream: MediaStream, token: number): void {
    this.stream = stream;
    this.chunks = [];
    this.recorder = new MediaRecorder(stream);
    this.recorder.ondataavailable = this.collect.bind(this);
    this.recorder.onstop = this.finish.bind(this, token);
    this.recorder.start();
    this.startedAt = Date.now();
    this.state.set('recording');
    this.timer = setInterval(this.tick.bind(this), TICK_MS);
  }

  private collect(event: BlobEvent): void {
    if (event.data.size > 0) this.chunks.push(event.data);
  }

  private async finish(token: number): Promise<void> {
    const mime = this.recorder?.mimeType || 'audio/webm';
    const durationMs = Math.min(Date.now() - this.startedAt, VOICE_RECORDING_MAX_MS);
    const blob = new Blob(this.chunks, { type: mime });
    stopStream(this.stream);
    this.stream = null;
    const data = await toBase64(blob);
    if (token !== this.token) return;
    this.url = URL.createObjectURL(blob);
    this.elapsedMs.set(durationMs);
    this.recording.set({ data, mime, durationMs });
    this.state.set('recorded');
  }

  private tick(): void {
    const elapsed = Math.min(Date.now() - this.startedAt, VOICE_RECORDING_MAX_MS);
    this.elapsedMs.set(elapsed);
    if (elapsed >= VOICE_RECORDING_MAX_MS) this.stop();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private detachRecorder(): void {
    const recorder = this.recorder;
    this.recorder = null;
    if (!recorder) return;
    recorder.ondataavailable = null;
    recorder.onstop = null;
    if (recorder.state !== 'inactive') recorder.stop();
  }

  private stopPlayback(): void {
    if (this.audio) {
      this.audio.onended = null;
      this.audio.pause();
    }
    this.audio = null;
    this.playing.set(false);
  }

  private revokeUrl(): void {
    if (this.url !== null) URL.revokeObjectURL(this.url);
    this.url = null;
  }
}
