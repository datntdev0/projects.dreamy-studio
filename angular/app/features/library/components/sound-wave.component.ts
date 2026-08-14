import { Component, ElementRef, computed, effect, inject, input, viewChild } from "@angular/core";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { LibrarySound } from "../library.sounds.models";
import { LibrarySoundPlayer } from "../library.sounds.player";
import { LibrarySoundService } from "../library.sounds.service";
import { overviewLevel, pageStart, peakGain, peakLevel, slideStart } from "../library.sounds.audio";

interface WaveView { duration: number; window: number; start: number; position: number; active: boolean; }
interface WaveLayout { pad: number; step: number; barWidth: number; usable: number; count: number; offset: number; }

@Component({ selector: "app-library-sound-wave", standalone: true, imports: [I18nPipe], templateUrl: "./sound-wave.component.html", host: { "data-testid": "library-sound-wave" } })
export class LibrarySoundWave {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>("canvas");
  readonly sound = input.required<LibrarySound>();
  readonly window = input(5);
  readonly big = input(false);
  readonly paged = input(false);
  readonly overview = input(false);
  private readonly sounds = inject(LibrarySoundService);
  private readonly player = inject(LibrarySoundPlayer);
  private readonly peaks = computed(() => this.sounds.peaks(this.sound().id));
  private readonly gain = computed(this.buildGain.bind(this));
  constructor() { effect(this.paint.bind(this)); effect(this.observeSize.bind(this)); }
  seek(event: MouseEvent): void {
    if (this.overview()) return;
    const view = this.view();
    const layout = this.layout(this.canvas().nativeElement.clientWidth);
    const fraction = Math.max(0, Math.min(1, (event.offsetX - layout.pad) / layout.usable));
    void this.player.seek(this.sound(), (view.start + fraction * view.window) / view.duration);
  }
  private observeSize(onCleanup: (cleanup: () => void) => void): void {
    const observer = new ResizeObserver(this.paint.bind(this));
    observer.observe(this.canvas().nativeElement);
    onCleanup(observer.disconnect.bind(observer));
  }
  private paint(): void {
    const canvas = this.canvas().nativeElement;
    const view = this.view();
    const peaks = this.peaks();
    const gain = this.gain();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = globalThis.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const styles = getComputedStyle(canvas);
    const rest = styles.getPropertyValue("--hairline-strong").trim() || "#777";
    const played = styles.getPropertyValue("--primary-text").trim() || "#111";
    const layout = this.layout(width);
    const slice = view.window / layout.count;
    const overview = this.sound().overview;
    for (let index = 0; index < layout.count; index++) {
      const seconds = view.start + (index + .5) / layout.count * view.window;
      if (seconds > view.duration) break;
      const level = peaks?.length ? peakLevel(peaks, seconds, slice, gain) : overviewLevel(overview, view.duration, seconds);
      const barHeight = Math.max(2, level * (height - 6));
      context.fillStyle = view.active && seconds <= view.position ? played : rest;
      context.fillRect(layout.offset + index * layout.step, (height - barHeight) / 2, layout.barWidth, barHeight);
    }
    if (!view.active) return;
    const x = layout.pad + (view.position - view.start) / view.window * layout.usable;
    context.fillStyle = styles.getPropertyValue("--ink").trim() || played;
    context.fillRect(Math.round(x * ratio - .75 * ratio) / ratio, 0, 1.5, height);
  }
  private view(): WaveView {
    const sound = this.sound();
    const duration = Math.max(1, sound.durationMs / 1000);
    const active = !this.overview() && this.player.currentId() === sound.id;
    if (active) this.player.clock();
    const position = active ? this.player.currentTime() : 0;
    const window = this.overview() ? duration : Math.min(this.window(), duration);
    const start = this.overview() ? 0 : this.paged() ? pageStart(position, duration, window) : slideStart(position, duration, window);
    return { duration, window, start, position, active };
  }
  private layout(width: number): WaveLayout {
    const overview = this.overview();
    const step = overview ? 4 : 5;
    const pad = overview ? 0 : 6;
    const usable = width - pad * 2;
    const count = Math.max(1, Math.floor(usable / step));
    return { pad, step, barWidth: overview ? 2 : 3, usable, count, offset: pad + (usable - count * step) / 2 };
  }
  private buildGain(): number { const peaks = this.peaks(); return peaks?.length ? peakGain(peaks) : 1; }
}
