import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Icon } from '@components/icon';
import { SegmentOption, Segments } from '@components/segments';
import { Slider } from '@components/slider';
import { TabOption, Tabs } from '@components/tabs';
import { WorkspaceService } from '@features/workspace/workspace.service';
import { CoreModule } from '@shared/core.module';
import { isLanguage, LanguageService } from '@shared/language/language.service';
import { isTheme, ThemeService } from '@shared/theme/theme.service';

import { MAX_PIPELINES_LIMIT, MAX_TASKS_LIMIT, SettingsFolderTarget } from '../settings.models';
import { SettingsService } from '../settings.service';

type GeneralTab = 'interface' | 'pipelines' | 'storage';

const TABS: GeneralTab[] = ['interface', 'pipelines', 'storage'];

const LANGUAGE_OPTIONS: SegmentOption[] = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-settings-general',
  imports: [Icon, CoreModule, Segments, Slider, Tabs],
  templateUrl: './general.component.html',
  host: { 'data-testid': 'settings-general' },
})
export class SettingsGeneral {
  private readonly settings = inject(SettingsService);
  private readonly languageService = inject(LanguageService);
  private readonly themes = inject(ThemeService);
  private readonly workspaces = inject(WorkspaceService);

  readonly language = this.languageService.language;
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
  readonly tab = signal<GeneralTab>('interface');
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
    this.tab.set(TABS.find((tab) => tab === value) ?? 'interface');
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
      {
        value: 'interface',
        label: this.languageService.translate('settings.general.interface'),
        icon: 'eye',
      },
      {
        value: 'pipelines',
        label: this.languageService.translate('settings.general.pipelines'),
        icon: 'layers',
      },
      {
        value: 'storage',
        label: this.languageService.translate('settings.general.storage'),
        icon: 'hdd',
      },
    ];
  }

  private buildThemeOptions(): SegmentOption[] {
    return [
      { value: 'dark', label: this.languageService.translate('settings.general.theme.dark') },
      { value: 'light', label: this.languageService.translate('settings.general.theme.light') },
    ];
  }
}
