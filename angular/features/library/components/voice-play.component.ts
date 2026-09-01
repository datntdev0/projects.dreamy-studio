import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

import { LibraryVoice } from '../library.voices.models';
import { LibraryVoiceService } from '../library.voices.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-voice-play',
  imports: [Icon, CoreModule],
  templateUrl: './voice-play.component.html',
  host: { 'data-testid': 'library-voice-play' },
})
export class LibraryVoicePlay {
  readonly voice = input.required<LibraryVoice>();
  readonly size = input<'sm' | 'lg' | null>(null);
  readonly disabled = input(false);
  readonly hint = input<string | null>(null);
  private readonly voices = inject(LibraryVoiceService);
  isPlaying(): boolean {
    return this.voices.playingId() === this.voice().id;
  }
  label(): LanguageKey {
    return this.isPlaying() ? 'library.voice.stop' : 'library.voice.play';
  }
  iconSize(): number {
    if (this.size() === 'lg') return 18;
    return this.size() === 'sm' ? 11 : 14;
  }
  isolate(event: Event): void {
    event.stopPropagation();
  }
  toggle(event: Event): void {
    event.stopPropagation();
    this.voices.select(this.voice().id);
    this.voices.togglePreview(this.voice().id);
  }
}
