import { Component, computed, inject } from "@angular/core";
import { SegmentOption, Segments } from "../../../../components/segments";
import { Icon } from "../../../../components/icon";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nService, isLanguage } from "../../../core/i18n/i18n.service";
import { ThemeService, isTheme } from "../../../core/theme/theme.service";
import { WorkspaceService } from "../../workspace/workspace.service";
import { SettingsFolderTarget } from "../settings.models";
import { SettingsService } from "../settings.service";

const LANGUAGE_OPTIONS: SegmentOption[] = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "English" },
];

@Component({
  selector: "app-settings-general",
  standalone: true,
  imports: [Icon, I18nPipe, Segments],
  templateUrl: "./general.component.html",
  host: { "data-testid": "settings-general" },
})
export class SettingsGeneralComponent {
  private readonly settings = inject(SettingsService);
  private readonly i18n = inject(I18nService);
  private readonly themes = inject(ThemeService);
  private readonly workspaces = inject(WorkspaceService);

  readonly language = this.i18n.language;
  readonly theme = this.themes.theme;
  readonly workspace = this.workspaces.current;
  readonly dataDir = this.settings.dataDir;
  readonly file = this.settings.file;
  readonly languageOptions = LANGUAGE_OPTIONS;
  readonly themeOptions = computed(this.buildThemeOptions.bind(this));

  onLanguage(value: string): void {
    if (isLanguage(value)) {
      this.settings.setLanguage(value);
    }
  }

  onTheme(value: string): void {
    if (isTheme(value)) {
      this.settings.setTheme(value);
    }
  }

  reset(): void {
    this.settings.resetGeneral();
  }

  openFolder(target: SettingsFolderTarget): void {
    void this.settings.openFolder(target);
  }

  private buildThemeOptions(): SegmentOption[] {
    return [
      { value: "dark", label: this.i18n.translate("settings.general.theme.dark") },
      { value: "light", label: this.i18n.translate("settings.general.theme.light") },
    ];
  }
}
