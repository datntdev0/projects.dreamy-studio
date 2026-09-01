import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { engineSection } from '@features/library/library.voices.rules';
import { SettingsService } from '@features/settings/settings.service';
import { TabsService } from '@layout/tabs.service';
import { CoreModule } from '@shared/core.module';

import { AudiobookContext } from '../audiobook.models';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-inspector-voices',
  host: { 'data-testid': 'audiobook-inspector-voices' },
  imports: [Icon, CoreModule],
  templateUrl: './inspector-voices.component.html',
})
export class AudiobookInspectorVoices {
  private readonly settings = inject(SettingsService);
  private readonly tabs = inject(TabsService);

  readonly ctx = input.required<AudiobookContext>();

  openLocal(): void {
    this.settings.openDialog(engineSection('local'));
  }

  openCloud(): void {
    this.settings.openDialog(engineSection('cloud'));
  }

  openLibrary(): void {
    this.tabs.openVoices();
  }
}
