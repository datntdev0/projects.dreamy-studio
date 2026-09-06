import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LibraryVoiceSamples {
  readonly playingUrl = signal<string | null>(null);
  private audio: HTMLAudioElement | null = null;

  isPlaying(url: string): boolean {
    return this.playingUrl() === url;
  }

  async toggle(url: string): Promise<boolean> {
    const wasPlaying = this.isPlaying(url);
    this.stop();
    if (wasPlaying) return true;
    const audio = new Audio(url);
    audio.onended = this.finish.bind(this, audio);
    this.audio = audio;
    this.playingUrl.set(url);
    try {
      await audio.play();
      return true;
    } catch {
      this.finish(audio);
      return false;
    }
  }

  stop(): void {
    this.audio?.pause();
    this.audio = null;
    this.playingUrl.set(null);
  }

  private finish(audio: HTMLAudioElement): void {
    if (this.audio === audio) this.stop();
  }
}
