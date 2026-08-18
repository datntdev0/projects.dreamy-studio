import { Injectable, inject, signal } from "@angular/core";
import { DesktopIpcService } from "@app/core/desktop/desktop-ipc.service";
import { Language } from "@app/core/i18n/i18n.models";
import { I18nService } from "@app/core/i18n/i18n.service";
import { Theme } from "@app/core/theme/theme.models";
import { ThemeService } from "@app/core/theme/theme.service";
import { ToastService } from "@app/core/toast/toast.service";
import { GeneralSettings, LayoutSettings, SettingsFolderTarget, SettingsSectionId, SettingsView } from "./settings.models";

@Injectable({ providedIn: "root" })
export class SettingsService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly i18n = inject(I18nService);
  private readonly themes = inject(ThemeService);
  private readonly toasts = inject(ToastService);
  private writes: Promise<void> = Promise.resolve();

  readonly open = signal(false);
  readonly section = signal<SettingsSectionId>("general");
  readonly dataDir = signal("");
  readonly file = signal("");
  readonly layout = signal<LayoutSettings>({});

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
    this.i18n.setLanguage(language);
    this.persistGeneral();
  }

  setTheme(theme: Theme): void {
    this.themes.setTheme(theme);
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
      this.toasts.show(this.i18n.translate("settings.general.openFailed"), "danger");
    }
  }

  private applyGeneral(general: GeneralSettings): void {
    if (general.language) {
      this.i18n.setLanguage(general.language);
    }
    if (general.theme) {
      this.themes.setTheme(general.theme);
    }
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
    const general: GeneralSettings = { language: this.i18n.language(), theme: this.themes.theme() };
    try {
      await this.ipc.invoke<GeneralSettings>("settings_general_save", { general });
    } catch {
      this.toasts.show(this.i18n.translate("settings.general.saveFailed"), "danger");
    }
  }
}
