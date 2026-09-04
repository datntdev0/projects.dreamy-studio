import { Injectable } from '@angular/core';

const WAVE_MIME = 'audio/wav';
const MILLISECONDS = 1000;

@Injectable({ providedIn: 'root' })
export class LibraryVoicePlayer {
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private ended: (() => void) | null = null;

  async play(data: ArrayBuffer, ended: () => void): Promise<number> {
    this.stop();
    const audio = this.ensureAudio();
    this.url = URL.createObjectURL(new Blob([data], { type: WAVE_MIME }));
    this.ended = ended;
    audio.src = this.url;
    await audio.play();
    return Number.isFinite(audio.duration) ? Math.round(audio.duration * MILLISECONDS) : 0;
  }

  stop(): void {
    this.ended = null;
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
    return this.audio;
  }

  private onEnded(): void {
    const ended = this.ended;
    this.stop();
    ended?.();
  }
}
