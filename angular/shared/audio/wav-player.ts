const WAVE_MIME = 'audio/wav';
const MILLISECONDS = 1000;

export type WavProgress = (seconds: number) => void;

export class WavPlayer {
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private ended: (() => void) | null = null;
  private progress: WavProgress | null = null;

  async play(data: ArrayBuffer, ended: () => void, progress?: WavProgress): Promise<number> {
    this.stop();
    const audio = this.ensureAudio();
    this.url = URL.createObjectURL(new Blob([data], { type: WAVE_MIME }));
    this.ended = ended;
    this.progress = progress ?? null;
    audio.src = this.url;
    await audio.play();
    return Number.isFinite(audio.duration) ? Math.round(audio.duration * MILLISECONDS) : 0;
  }

  pause(): void {
    this.audio?.pause();
  }

  async resume(): Promise<void> {
    if (this.audio && this.url) await this.audio.play();
  }

  stop(): void {
    this.ended = null;
    this.progress = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  private ensureAudio(): HTMLAudioElement {
    if (this.audio) return this.audio;
    this.audio = new Audio();
    this.audio.addEventListener('ended', this.onEnded.bind(this));
    this.audio.addEventListener('timeupdate', this.onTimeUpdate.bind(this));
    return this.audio;
  }

  private onTimeUpdate(): void {
    if (this.audio) this.progress?.(this.audio.currentTime);
  }

  private onEnded(): void {
    const ended = this.ended;
    this.stop();
    ended?.();
  }
}
