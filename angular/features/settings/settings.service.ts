import { inject, Injectable, signal } from '@angular/core';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { Language } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { Theme } from '@shared/theme/theme.models';
import { ThemeService } from '@shared/theme/theme.service';
import { ToastService } from '@shared/toast/toast.service';

import { BackendService } from './backend.service';
import { CloudService } from './cloud.service';
import { LlmService } from './llm.service';
import { RemoteBackendService } from './remote.service';
// prettier-ignore
import { GeneralSettings, KeyStoreView, LayoutSettings, MAX_PIPELINES_LIMIT, MAX_TASKS_LIMIT, SettingsFolderTarget, SettingsSectionId, SettingsView } from './settings.models';

const DEFAULT_MAX_PIPELINES = 1;
const DEFAULT_MAX_TASKS = 5;
const DEFAULT_KEY_STORE: KeyStoreView = { secure: true, portable: false };

function clampLimit(value: number | undefined, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(1, Math.round(value)));
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly languageService = inject(LanguageService);
  private readonly themes = inject(ThemeService);
  private readonly toasts = inject(ToastService);
  private readonly llm = inject(LlmService);
  private readonly backend = inject(BackendService);
  private readonly remote = inject(RemoteBackendService);
  private readonly cloud = inject(CloudService);
  private writes: Promise<void> = Promise.resolve();

  readonly open = signal(false);
  readonly section = signal<SettingsSectionId>('general');
  readonly dataDir = signal('');
  readonly file = signal('');
  readonly layout = signal<LayoutSettings>({});
  readonly keyStore = signal<KeyStoreView>(DEFAULT_KEY_STORE);
  readonly maxPipelines = signal(DEFAULT_MAX_PIPELINES);
  readonly maxTasks = signal(DEFAULT_MAX_TASKS);

  async load(): Promise<void> {
    await this.writes;
    await Promise.all([
      this.loadGeneral(),
      this.llm.load(),
      this.backend.load(),
      this.remote.load(),
      this.cloud.load(),
    ]);
  }

  private async loadGeneral(): Promise<void> {
    try {
      const view = await this.ipc.invoke<SettingsView>('settings_get');
      this.dataDir.set(view.dataDir);
      this.file.set(view.file);
      this.layout.set(view.layout ?? {});
      this.keyStore.set(view.keyStore ?? DEFAULT_KEY_STORE);
      this.applyGeneral(view.general);
      await this.syncBackground();
    } catch {
      return;
    }
  }

  openDialog(section: SettingsSectionId = 'general'): void {
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
      await this.ipc.invoke<void>('settings_folder_open', { target });
    } catch {
      this.toasts.show(this.languageService.translate('settings.general.openFailed'), 'danger');
    }
  }

  private applyGeneral(general: GeneralSettings): void {
    if (general.language) {
      this.languageService.setLanguage(general.language);
    }
    if (general.theme) {
      this.themes.setTheme(general.theme);
    }
    this.maxPipelines.set(
      clampLimit(general.pipelines?.maxPipelines, MAX_PIPELINES_LIMIT, DEFAULT_MAX_PIPELINES),
    );
    this.maxTasks.set(clampLimit(general.pipelines?.maxTasks, MAX_TASKS_LIMIT, DEFAULT_MAX_TASKS));
  }

  private async syncBackground(): Promise<void> {
    try {
      await this.ipc.invoke<void>('window_background_set', { theme: this.themes.theme() });
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
      await this.ipc.invoke<LayoutSettings>('settings_layout_save', { layout });
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
      await this.ipc.invoke<GeneralSettings>('settings_general_save', { general });
    } catch {
      this.toasts.show(this.languageService.translate('settings.general.saveFailed'), 'danger');
    }
  }
}
