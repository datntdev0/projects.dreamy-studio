import { AfterViewInit, Component, ElementRef, HostListener, ViewChild, effect, inject, input } from "@angular/core";
import { LibrarySound } from "../library.sounds.models";
import { LibrarySoundPlayer } from "../library.sounds.player";
import { LibrarySoundService } from "../library.sounds.service";
import { peakAt } from "../library.sounds.audio";

@Component({ selector: "app-library-sound-wave", standalone: true, templateUrl: "./sound-wave.component.html", host: { "data-testid": "library-sound-wave" } })
export class LibrarySoundWave implements AfterViewInit {
  @ViewChild("canvas") private canvas?: ElementRef<HTMLCanvasElement>;
  readonly sound = input.required<LibrarySound>();
  readonly window = input(5);
  readonly big = input(false);
  private readonly sounds = inject(LibrarySoundService);
  private readonly player = inject(LibrarySoundPlayer);
  constructor() { effect(this.paint.bind(this)); }
  ngAfterViewInit(): void { this.paint(); }
  @HostListener("window:resize") onResize(): void { this.paint(); }
  seek(event: MouseEvent): void { const canvas = this.canvas?.nativeElement; if (!canvas) return; const sound = this.sound(); const duration = sound.durationMs / 1000; const width = canvas.getBoundingClientRect().width; const position = Math.max(0, Math.min(1, event.offsetX / width)); const start = this.startTime(duration); void this.player.seek(sound, (start + position * Math.min(this.window(), duration)) / duration); }
  private paint(): void { const canvas = this.canvas?.nativeElement; const sound = this.sound(); this.player.clock(); this.player.currentId(); const peaks = this.sounds.peaks(sound.id); if (!canvas) return; const rect = canvas.getBoundingClientRect(); const ratio = globalThis.devicePixelRatio || 1; canvas.width = Math.max(1, Math.floor(rect.width * ratio)); canvas.height = Math.max(1, Math.floor(rect.height * ratio)); const context = canvas.getContext("2d"); if (!context) return; context.scale(ratio, ratio); const styles = getComputedStyle(canvas); const idle = styles.getPropertyValue("--hairline-strong").trim() || "#777"; const active = styles.getPropertyValue("--primary-text").trim() || "#111"; const played = styles.getPropertyValue("--ink").trim() || active; const duration = sound.durationMs / 1000; const window = Math.min(this.window(), duration); const start = this.startTime(duration); const current = this.player.currentId() === sound.id ? this.player.position() : -1; for (let x = 0; x < rect.width; x += 5) { const seconds = start + (x / rect.width) * window; const level = peaks ? peakAt(peaks, seconds) : 0; const height = peaks ? Math.max(2, level * rect.height) : 2; context.fillStyle = current >= seconds ? played : current >= 0 ? active : idle; context.fillRect(x, (rect.height - height) / 2, 3, height); } }
  private startTime(duration: number): number { const window = Math.min(this.window(), duration); const position = this.player.currentId() === this.sound().id ? this.player.position() : 0; return Math.max(0, Math.min(Math.max(0, duration - window), position - window / 2)); }
}
