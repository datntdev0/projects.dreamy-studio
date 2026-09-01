import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';

import { LibraryVoice } from '../library.voices.models';
import { engineIcon } from '../library.voices.rules';
import { LibraryVoiceService } from '../library.voices.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-voice-engine',
  imports: [Icon, CoreModule],
  templateUrl: './voice-engine.component.html',
  host: { 'data-testid': 'library-voice-engine' },
})
export class LibraryVoiceEngine {
  readonly voice = input.required<LibraryVoice>();
  private readonly voices = inject(LibraryVoiceService);
  icon(): 'cpu' | 'cloud' {
    return engineIcon(this.voice().engineKind);
  }
  name(): string {
    return this.voices.engineName(this.voice());
  }
  ready(): boolean {
    return this.voices.isReady(this.voice());
  }
}
