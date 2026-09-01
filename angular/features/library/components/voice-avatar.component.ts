import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { LibraryVoice } from '../library.voices.models';
import { voiceHue, voiceMonogram } from '../library.voices.rules';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-voice-avatar',
  templateUrl: './voice-avatar.component.html',
  host: { 'data-testid': 'library-voice-avatar' },
})
export class LibraryVoiceAvatar {
  readonly voice = input.required<LibraryVoice>();
  readonly size = input<'sm' | null>(null);
  monogram(): string {
    return voiceMonogram(this.voice().name);
  }
  hue(): number {
    return voiceHue(this.voice().id);
  }
}
