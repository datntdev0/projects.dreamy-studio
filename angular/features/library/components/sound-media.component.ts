import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { LibrarySound } from '../library.sounds.models';
import { LibrarySoundTime } from './sound-time.component';
import { LibrarySoundWave } from './sound-wave.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-sound-media',
  imports: [LibrarySoundTime, LibrarySoundWave],
  templateUrl: './sound-media.component.html',
  host: { 'data-testid': 'library-sound-media' },
})
export class LibrarySoundMedia {
  readonly sound = input.required<LibrarySound>();
}
