import { Provider, signal } from '@angular/core';
import { SettingsSectionId } from '@features/settings/settings.models';
import { SettingsService } from '@features/settings/settings.service';
// prettier-ignore
import { AppInfo, CurrentWorkspace, LoadState, RecentWorkspace } from '@features/workspace/workspace.models';
import { WorkspaceService } from '@features/workspace/workspace.service';
import { LanguageService } from '@shared/language/language.service';
import { ThemeService } from '@shared/theme/theme.service';
import { applicationConfig, type Decorator } from '@storybook/angular-vite';

export function withProviders(providers: Provider[]): { decorators: Decorator[] } {
  return { decorators: [applicationConfig({ providers })] };
}

export const APP_INFO: AppInfo = { name: 'Dreamy Studio', version: '0.1.0' };

export const CURRENT_WORKSPACE: CurrentWorkspace = {
  name: 'Harrowmere',
  path: 'D:\\Dreamy\\Harrowmere',
};

export const RECENT_WORKSPACES: RecentWorkspace[] = [
  {
    path: 'D:\\Dreamy\\Harrowmere',
    name: 'Harrowmere',
    lastOpenedAt: '2026-06-02T09:30:00Z',
    status: 'ok',
    projectCount: 3,
  },
  {
    path: 'E:\\Works\\Dark Harbor',
    name: 'Dark Harbor',
    lastOpenedAt: '2026-05-20T20:10:00Z',
    status: 'ok',
    projectCount: 1,
  },
  {
    path: 'F:\\Old\\Pine Hill',
    name: 'Pine Hill',
    lastOpenedAt: '2026-03-11T08:00:00Z',
    status: 'not_found',
    reason: 'missing',
  },
];

export interface WorkspaceScenario {
  recent?: RecentWorkspace[];
  current?: CurrentWorkspace | null;
  notice?: string | null;
  state?: LoadState | null;
}

export function workspaceProvider(scenario: WorkspaceScenario = {}): Provider {
  const recent = scenario.recent ?? [];
  const mock: Partial<WorkspaceService> = {
    state: signal<LoadState | null>(scenario.state ?? null),
    notice: signal<string | null>(scenario.notice ?? null),
    switchNotice: signal<string | null>(null),
    current: signal<CurrentWorkspace | null>(scenario.current ?? null),
    appInfo: () => Promise.resolve(APP_INFO),
    recentList: () => Promise.resolve(recent),
    measure: () => Promise.resolve(48_234_496),
    workspaceDelete: () => Promise.resolve(),
    folderPick: () => Promise.resolve(null),
    start: () => Promise.resolve(),
    cancel: () => Promise.resolve(),
  };
  return { provide: WorkspaceService, useValue: mock };
}

export interface SettingsScenario {
  section?: SettingsSectionId;
  dataDir?: string;
}

function settingsMock(
  languageService: LanguageService,
  themes: ThemeService,
  scenario: SettingsScenario,
): Partial<SettingsService> {
  const section = signal<SettingsSectionId>(scenario.section ?? 'general');
  const maxPipelines = signal(1);
  const maxTasks = signal(5);
  return {
    open: signal(true),
    section,
    dataDir: signal(scenario.dataDir ?? 'C:\\Users\\dreamy\\AppData\\Roaming\\dreamy-studio'),
    file: signal('settings.json'),
    maxPipelines,
    maxTasks,
    setMaxPipelines: (value) => maxPipelines.set(value),
    setMaxTasks: (value) => maxTasks.set(value),
    closeDialog: () => undefined,
    selectSection: (id) => section.set(id),
    setLanguage: (language) => languageService.setLanguage(language),
    setTheme: (theme) => themes.setTheme(theme),
    openFolder: () => Promise.resolve(),
  };
}

export function settingsProvider(scenario: SettingsScenario = {}): Provider {
  return {
    provide: SettingsService,
    useFactory: (languageService: LanguageService, themes: ThemeService) =>
      settingsMock(languageService, themes, scenario),
    deps: [LanguageService, ThemeService],
  };
}
