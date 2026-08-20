import { Component, inject, input } from "@angular/core";
import { Icon } from "@components/icon";
import { LanguageKey } from "@app/core/language/language.models";
import { LanguagePipe } from "@app/core/language/language.pipe";
import { LibrarySound } from "../library.sounds.models";
import { LibrarySoundPlayer } from "../library.sounds.player";

@Component({ selector: "app-library-sound-play", standalone: true, imports: [Icon, LanguagePipe], templateUrl: "./sound-play.component.html", host: { "data-testid": "library-sound-play" } })
export class LibrarySoundPlay {
  readonly sound = input.required<LibrarySound>();
  readonly size = input<"sm" | "lg" | null>(null);
  readonly player = inject(LibrarySoundPlayer);
  isCurrent(): boolean { return this.player.currentId() === this.sound().id; }
  isPlaying(): boolean { return this.isCurrent() && this.player.playing(); }
  label(): LanguageKey { return this.isPlaying() ? "library.sound.pause" : "library.sound.play"; }
  toggle(event: Event): void { event.stopPropagation(); void this.player.toggle(this.sound()); }
}
