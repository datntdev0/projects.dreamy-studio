import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

import { LibrarySound } from '../library.sounds.models';
import { LibrarySoundPlayer } from '../library.sounds.player';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-sound-play',
  imports: [Icon, CoreModule],
  templateUrl: './sound-play.component.html',
  host: { 'data-testid': 'library-sound-play' },
})
export class LibrarySoundPlay {
  readonly sound = input.required<LibrarySound>();
  readonly size = input<'sm' | 'lg' | null>(null);
  readonly player = inject(LibrarySoundPlayer);
  isCurrent(): boolean {
    return this.player.currentId() === this.sound().id;
  }
  isPlaying(): boolean {
    return this.isCurrent() && this.player.playing();
  }
  label(): LanguageKey {
    return this.isPlaying() ? 'library.sound.pause' : 'library.sound.play';
  }
  toggle(event: Event): void {
    event.stopPropagation();
    void this.player.toggle(this.sound());
  }
}
