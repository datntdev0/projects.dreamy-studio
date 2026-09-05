import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { LibraryVoice } from '../library.voices.models';
import { voiceMonogram, voiceTone } from '../library.voices.rules';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-voice-avatar',
  templateUrl: './voice-avatar.component.html',
  host: { 'data-testid': 'library-voice-avatar' },
})
export class LibraryVoiceAvatar {
  readonly voice = input.required<LibraryVoice>();
  monogram(): string {
    return voiceMonogram(this.voice().name);
  }
  tone(): number {
    return voiceTone(this.voice().name);
  }
}
