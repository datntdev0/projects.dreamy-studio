import { Component, computed, inject, signal } from "@angular/core";
import { SegmentOption, Segments } from "@components/segments";
import { Slider } from "@components/slider";
import { TabOption, Tabs } from "@components/tabs";
import { Icon } from "@components/icon";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { I18nService, isLanguage } from "@app/core/i18n/i18n.service";
import { ThemeService, isTheme } from "@app/core/theme/theme.service";
import { WorkspaceService } from "@app/features/workspace/workspace.service";
import { MAX_PIPELINES_LIMIT, MAX_TASKS_LIMIT, SettingsFolderTarget } from "../settings.models";
import { SettingsService } from "../settings.service";

type GeneralTab = "interface" | "pipelines" | "storage";

const TABS: GeneralTab[] = ["interface", "pipelines", "storage"];

const LANGUAGE_OPTIONS: SegmentOption[] = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "English" },
];

@Component({
  selector: "app-settings-general",
  standalone: true,
  imports: [Icon, I18nPipe, Segments, Slider, Tabs],
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
  readonly maxPipelines = this.settings.maxPipelines;
  readonly maxTasks = this.settings.maxTasks;
  readonly maxPipelinesLimit = MAX_PIPELINES_LIMIT;
  readonly maxTasksLimit = MAX_TASKS_LIMIT;
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
    this.tab.set(TABS.find((tab) => tab === value) ?? "interface");
  }

  onMaxPipelines(value: number): void {
    this.settings.setMaxPipelines(value);
  }

  onMaxTasks(value: number): void {
    this.settings.setMaxTasks(value);
  }

  openFolder(target: SettingsFolderTarget): void {
    void this.settings.openFolder(target);
  }

  private buildTabOptions(): TabOption[] {
    return [
      { value: "interface", label: this.i18n.translate("settings.general.interface"), icon: "eye" },
      { value: "pipelines", label: this.i18n.translate("settings.general.pipelines"), icon: "layers" },
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
