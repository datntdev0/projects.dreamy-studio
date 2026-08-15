import { Injectable, signal, inject } from "@angular/core";
import { DesktopIpcService } from "../../core/desktop/desktop-ipc.service";
import { ToastService } from "../../core/toast/toast.service";
import { LibrarySound } from "./library.sounds.models";
import { SOUND_STREAM_SCHEME } from "./library.sounds.models";
import { spectrumBands } from "./library.sounds.audio";

function roundedPosition(value: number): number { return Math.round(value * 10) / 10; }

@Injectable({ providedIn: "root" })
export class LibrarySoundPlayer {
  private readonly ipc = inject(DesktopIpcService);
  private readonly toasts = inject(ToastService);
  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private bins: Uint8Array | null = null;
  private frame = 0;

  readonly currentId = signal<number | null>(null);
  readonly playing = signal(false);
  readonly position = signal(0);
  readonly clock = signal(0);
  readonly analysing = signal(false);

  async toggle(sound: LibrarySound): Promise<void> {
    const audio = this.ensureAudio();
    if (this.currentId() === sound.id) {
      if (this.playing()) audio.pause(); else await this.play(sound);
      return;
    }
    audio.pause();
    this.currentId.set(sound.id);
    this.position.set(0);
    audio.src = this.ipc.mediaUrl(SOUND_STREAM_SCHEME, String(sound.id));
    await this.play(sound);
  }

  async seek(sound: LibrarySound, fraction: number): Promise<void> {
    const audio = this.ensureAudio();
    if (this.currentId() !== sound.id) {
      audio.pause();
      this.currentId.set(sound.id);
      audio.src = this.ipc.mediaUrl(SOUND_STREAM_SCHEME, String(sound.id));
    }
    const duration = audio.duration || sound.durationMs / 1000;
    audio.currentTime = Math.max(0, Math.min(duration, duration * fraction));
    this.position.set(roundedPosition(audio.currentTime));
    await this.play(sound);
  }

  stop(): void {
    if (this.audio) this.audio.pause();
    this.currentId.set(null);
    this.position.set(0);
    this.playing.set(false);
    this.stopClock();
  }

  currentTime(): number { return this.audio && this.playing() ? this.audio.currentTime : this.position(); }

  spectrum(count: number): number[] | null {
    if (!this.analyser || !this.context || !this.bins) return null;
    this.analyser.getByteFrequencyData(this.bins as Uint8Array<ArrayBuffer>);
    return spectrumBands(this.bins, count, this.context.sampleRate);
  }

  private ensureAudio(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.addEventListener("play", this.onPlay.bind(this));
    audio.addEventListener("pause", this.onPause.bind(this));
    audio.addEventListener("timeupdate", this.onTimeUpdate.bind(this));
    audio.addEventListener("ended", this.onEnded.bind(this));
    this.audio = audio;
    return audio;
  }

  private async play(sound: LibrarySound): Promise<void> {
    const audio = this.ensureAudio();
    this.connectAnalyser(audio);
    try { await audio.play(); } catch { this.playing.set(false); this.position.set(0); this.toasts.show("library.sound.toast.playFailed", "danger"); }
    void sound;
  }

  private connectAnalyser(audio: HTMLAudioElement): void {
    if (this.analyser || !globalThis.AudioContext) return;
    try {
      const context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.55;
      source.connect(analyser);
      analyser.connect(context.destination);
      this.context = context;
      this.analyser = analyser;
      this.bins = new Uint8Array(analyser.frequencyBinCount);
      this.analysing.set(true);
      void context.resume();
    } catch { this.analysing.set(false); }
  }

  private onPlay(): void { this.playing.set(true); this.startClock(); }
  private onPause(): void { this.playing.set(false); this.stopClock(); }
  private onTimeUpdate(): void { if (this.audio) this.position.set(roundedPosition(this.audio.currentTime)); }
  private onEnded(): void { this.position.set(0); this.playing.set(false); this.stopClock(); }
  private startClock(): void { if (!this.frame) this.frame = requestAnimationFrame(this.tick.bind(this)); }
  private stopClock(): void { if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; }
  private tick(): void { this.clock.update((value) => value + 1); this.frame = this.playing() ? requestAnimationFrame(this.tick.bind(this)) : 0; }
}
