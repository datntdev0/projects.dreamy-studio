import { Injectable, inject, signal } from "@angular/core";
import { DesktopIpcService } from "@app/core/desktop/desktop-ipc.service";
import { Language } from "@app/core/language/language.models";
import { LanguageService } from "@app/core/language/language.service";
import { Theme } from "@app/core/theme/theme.models";
import { ThemeService } from "@app/core/theme/theme.service";
import { ToastService } from "@app/core/toast/toast.service";
import { GeneralSettings, LayoutSettings, MAX_PIPELINES_LIMIT, MAX_TASKS_LIMIT, SettingsFolderTarget, SettingsSectionId, SettingsView } from "./settings.models";

const DEFAULT_MAX_PIPELINES = 1;
const DEFAULT_MAX_TASKS = 5;

function clampLimit(value: number | undefined, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(1, Math.round(value)));
}

@Injectable({ providedIn: "root" })
export class SettingsService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly languageService = inject(LanguageService);
  private readonly themes = inject(ThemeService);
  private readonly toasts = inject(ToastService);
  private writes: Promise<void> = Promise.resolve();

  readonly open = signal(false);
  readonly section = signal<SettingsSectionId>("general");
  readonly dataDir = signal("");
  readonly file = signal("");
  readonly layout = signal<LayoutSettings>({});
  readonly maxPipelines = signal(DEFAULT_MAX_PIPELINES);
  readonly maxTasks = signal(DEFAULT_MAX_TASKS);

  async load(): Promise<void> {
    try {
      const view = await this.ipc.invoke<SettingsView>("settings_get");
      this.dataDir.set(view.dataDir);
      this.file.set(view.file);
      this.layout.set(view.layout ?? {});
      this.applyGeneral(view.general);
      await this.syncBackground();
    } catch {
      return;
    }
  }

  openDialog(section: SettingsSectionId = "general"): void {
    this.section.set(section);
    this.open.set(true);
  }

  closeDialog(): void {
    this.open.set(false);
  }

  selectSection(section: SettingsSectionId): void {
    this.section.set(section);
  }

  setLanguage(language: Language): void {
    this.languageService.setLanguage(language);
    this.persistGeneral();
  }

  setTheme(theme: Theme): void {
    this.themes.setTheme(theme);
    this.persistGeneral();
  }

  setMaxPipelines(value: number): void {
    this.maxPipelines.set(clampLimit(value, MAX_PIPELINES_LIMIT, DEFAULT_MAX_PIPELINES));
    this.persistGeneral();
  }

  setMaxTasks(value: number): void {
    this.maxTasks.set(clampLimit(value, MAX_TASKS_LIMIT, DEFAULT_MAX_TASKS));
    this.persistGeneral();
  }

  saveLayout(layout: LayoutSettings): void {
    this.layout.set(layout);
    this.writes = this.writes.then(this.writeLayout.bind(this, layout));
  }

  async openFolder(target: SettingsFolderTarget): Promise<void> {
    try {
      await this.ipc.invoke<void>("settings_folder_open", { target });
    } catch {
      this.toasts.show(this.languageService.translate("settings.general.openFailed"), "danger");
    }
  }

  private applyGeneral(general: GeneralSettings): void {
    if (general.language) {
      this.languageService.setLanguage(general.language);
    }
    if (general.theme) {
      this.themes.setTheme(general.theme);
    }
    this.maxPipelines.set(clampLimit(general.pipelines?.maxPipelines, MAX_PIPELINES_LIMIT, DEFAULT_MAX_PIPELINES));
    this.maxTasks.set(clampLimit(general.pipelines?.maxTasks, MAX_TASKS_LIMIT, DEFAULT_MAX_TASKS));
  }

  private async syncBackground(): Promise<void> {
    try {
      await this.ipc.invoke<void>("window_background_set", { theme: this.themes.theme() });
    } catch {
      return;
    }
  }

  private persistGeneral(): void {
    void this.syncBackground();
    this.writes = this.writes.then(this.writeGeneral.bind(this));
  }

  private async writeLayout(layout: LayoutSettings): Promise<void> {
    try {
      await this.ipc.invoke<LayoutSettings>("settings_layout_save", { layout });
    } catch {
      return;
    }
  }

  private async writeGeneral(): Promise<void> {
    const general: GeneralSettings = {
      language: this.languageService.language(),
      theme: this.themes.theme(),
      pipelines: { maxPipelines: this.maxPipelines(), maxTasks: this.maxTasks() },
    };
    try {
      await this.ipc.invoke<GeneralSettings>("settings_general_save", { general });
    } catch {
      this.toasts.show(this.languageService.translate("settings.general.saveFailed"), "danger");
    }
  }
}
