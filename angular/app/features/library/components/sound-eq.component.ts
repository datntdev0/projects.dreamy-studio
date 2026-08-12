import { Component, inject, input } from "@angular/core";
import { LibrarySound } from "../library.sounds.models";
import { LibrarySoundPlayer } from "../library.sounds.player";
import { overviewBars } from "../library.sounds.audio";

@Component({ selector: "app-library-sound-eq", standalone: true, templateUrl: "./sound-eq.component.html", host: { "data-testid": "library-sound-eq" } })
export class LibrarySoundEq {
  readonly sound = input.required<LibrarySound>();
  readonly player = inject(LibrarySoundPlayer);
  bars(): number[] { this.player.clock(); const sound = this.sound(); return this.player.currentId() === sound.id && this.player.analysing() ? this.player.spectrum(32) ?? overviewBars(sound.overview).map(this.toFraction) : overviewBars(sound.overview).map(this.toFraction); }
  isLive(): boolean { return this.player.currentId() === this.sound().id && this.player.analysing(); }
  height(value: number): string { return `${Math.round(value * 100)}%`; }
  idle(index: number): string { return this.height(Math.max(0.14, (this.sound().overview[index] ?? 0) / 255)); }
  private toFraction(value: number): number { return value / 100; }
}
