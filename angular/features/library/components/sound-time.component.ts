import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { LibrarySound } from '../library.sounds.models';
import { LibrarySoundPlayer } from '../library.sounds.player';
import { durationText } from '../library.sounds.rules';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-sound-time',
  templateUrl: './sound-time.component.html',
  host: { 'data-testid': 'library-sound-time' },
})
export class LibrarySoundTime {
  readonly sound = input.required<LibrarySound>();
  readonly player = inject(LibrarySoundPlayer);
  text(): string {
    const sound = this.sound();
    return this.player.currentId() === sound.id
      ? `${durationText(this.player.position() * 1000)} / ${durationText(sound.durationMs)}`
      : durationText(sound.durationMs);
  }
}
