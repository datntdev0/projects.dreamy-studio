import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { LibrarySound } from '../library.sounds.models';
import { LibrarySoundPlayer } from '../library.sounds.player';
import { LibrarySoundService } from '../library.sounds.service';

const BAR_COUNT = 64;
const IDLE_LEVEL = 0.14;
const LIVE_LEVEL = 0.08;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-sound-eq',
  templateUrl: './sound-eq.component.html',
  host: { 'data-testid': 'library-sound-eq' },
})
export class LibrarySoundEq {
  readonly sound = input.required<LibrarySound>();
  readonly player = inject(LibrarySoundPlayer);
  private readonly sounds = inject(LibrarySoundService);
  private readonly idleBars = computed(this.buildIdleBars.bind(this));
  live(): boolean {
    return this.player.currentId() === this.sound().id && this.player.playing();
  }
  bars(): number[] {
    if (!this.live()) return this.idleBars();
    this.player.clock();
    return this.player.spectrum(BAR_COUNT) ?? this.idleBars();
  }
  idle(index: number): string {
    return this.percent(this.idleBars()[index] ?? IDLE_LEVEL);
  }
  level(value: number): string {
    return this.percent(Math.max(LIVE_LEVEL, value));
  }
  private percent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }
  private buildIdleBars(): number[] {
    const peaks = this.sounds.peaks(this.sound().id);
    if (!peaks?.length) return Array.from({ length: BAR_COUNT }, () => IDLE_LEVEL);
    const levels = Array.from({ length: BAR_COUNT }, (_, index) => this.average(peaks, index));
    const maximum = Math.max(...levels) || 1;
    return levels.map((level) => Math.max(IDLE_LEVEL, Math.round((level / maximum) * 100) / 100));
  }
  private average(peaks: Uint8Array, index: number): number {
    const start = Math.floor((index * peaks.length) / BAR_COUNT);
    const end = Math.max(start + 1, Math.floor(((index + 1) * peaks.length) / BAR_COUNT));
    let total = 0;
    for (let offset = start; offset < end; offset++) total += peaks[offset] ?? 0;
    return total / (end - start) / 255;
  }
}
