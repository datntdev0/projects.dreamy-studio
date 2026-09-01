import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Icon } from '@components/icon';
import { SettingsService } from '@features/settings/settings.service';
import { CoreModule } from '@shared/core.module';

import { engineSection } from '../library.voices.rules';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-voice-notice',
  imports: [Icon, CoreModule],
  templateUrl: './voice-notice.component.html',
  host: { 'data-testid': 'library-voice-notice' },
})
export class LibraryVoiceNotice {
  private readonly settings = inject(SettingsService);
  openLocal(): void {
    this.settings.openDialog(engineSection('local'));
  }
  openCloud(): void {
    this.settings.openDialog(engineSection('cloud'));
  }
}
