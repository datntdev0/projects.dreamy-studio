import { Component, computed, inject } from "@angular/core";
import { Icon } from "@components/icon";
import { CoreModule } from "@app/core/core.module";
import { SettingsSection, SettingsSectionId } from "../settings.models";
import { SETTINGS_SECTIONS } from "../settings.sections";
import { SettingsService } from "../settings.service";
import { SettingsGeneralComponent } from "./general.component";
import { SettingsLlmComponent } from "./llm.component";

@Component({
  selector: "app-settings-dialog",
  standalone: true,
  imports: [Icon, CoreModule, SettingsGeneralComponent, SettingsLlmComponent],
  templateUrl: "./settings.dialog.html",
  host: { "data-testid": "settings-dialog" },
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
