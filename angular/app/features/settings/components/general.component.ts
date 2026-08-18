import { Component, computed, inject, signal } from "@angular/core";
import { SegmentOption, Segments } from "../../../../components/segments";
import { TabOption, Tabs } from "../../../../components/tabs";
import { Icon } from "../../../../components/icon";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nService, isLanguage } from "../../../core/i18n/i18n.service";
import { ThemeService, isTheme } from "../../../core/theme/theme.service";
import { WorkspaceService } from "../../workspace/workspace.service";
import { SettingsFolderTarget } from "../settings.models";
import { SettingsService } from "../settings.service";

type GeneralTab = "interface" | "storage";

const LANGUAGE_OPTIONS: SegmentOption[] = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "English" },
];

@Component({
  selector: "app-settings-general",
  standalone: true,
  imports: [Icon, I18nPipe, Segments, Tabs],
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
  readonly tab = signal<GeneralTab>("interface");
  readonly tabOptions = computed(this.buildTabOptions.bind(this));

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

  onTab(value: string): void {
    this.tab.set(value === "storage" ? "storage" : "interface");
  }

  openFolder(target: SettingsFolderTarget): void {
    void this.settings.openFolder(target);
  }

  private buildTabOptions(): TabOption[] {
    return [
      { value: "interface", label: this.i18n.translate("settings.general.interface"), icon: "eye" },
      { value: "storage", label: this.i18n.translate("settings.general.storage"), icon: "hdd" },
    ];
  }

  private buildThemeOptions(): SegmentOption[] {
    return [
      { value: "dark", label: this.i18n.translate("settings.general.theme.dark") },
      { value: "light", label: this.i18n.translate("settings.general.theme.light") },
    ];
  }
}
