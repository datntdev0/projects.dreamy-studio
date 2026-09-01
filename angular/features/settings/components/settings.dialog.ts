import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';

import { SettingsSection, SettingsSectionId } from '../settings.models';
import { SETTINGS_SECTIONS } from '../settings.sections';
import { SettingsService } from '../settings.service';
import { SettingsBackend } from './backend.component';
import { SettingsCloud } from './cloud.component';
import { SettingsGeneral } from './general.component';
import { SettingsLlm } from './llm.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-settings-dialog',
  imports: [Icon, CoreModule, SettingsBackend, SettingsCloud, SettingsGeneral, SettingsLlm],
  templateUrl: './settings.dialog.html',
  host: { 'data-testid': 'settings-dialog' },
})
export class SettingsDialog {
  private readonly settings = inject(SettingsService);

  readonly open = this.settings.open;
  readonly section = this.settings.section;
  readonly sections = SETTINGS_SECTIONS;
  readonly current = computed(this.currentSection.bind(this));

  close(): void {
    this.settings.closeDialog();
  }

  select(id: SettingsSectionId): void {
    this.settings.selectSection(id);
  }

  private currentSection(): SettingsSection {
    const id = this.section();
    return this.sections.find((item) => item.id === id) ?? this.sections[0];
  }
}
