import { Component, inject, input } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { LibrarySound } from "../library.sounds.models";
import { LibrarySoundPlayer } from "../library.sounds.player";

@Component({ selector: "app-library-sound-play", standalone: true, imports: [Icon, I18nPipe], templateUrl: "./sound-play.component.html", host: { "data-testid": "library-sound-play" } })
export class LibrarySoundPlay {
  readonly sound = input.required<LibrarySound>();
  readonly size = input<"sm" | "lg" | null>(null);
  readonly player = inject(LibrarySoundPlayer);
  isCurrent(): boolean { return this.player.currentId() === this.sound().id; }
  isPlaying(): boolean { return this.isCurrent() && this.player.playing(); }
  label(): I18nKey { return this.isPlaying() ? "library.sound.pause" : "library.sound.play"; }
  toggle(event: Event): void { event.stopPropagation(); void this.player.toggle(this.sound()); }
}
