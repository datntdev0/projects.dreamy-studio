import { Provider, signal, WritableSignal } from '@angular/core';
import { LlmService } from '@features/settings/llm.service';
// prettier-ignore
import { LlmCapability, LlmFeature, LlmFeatureSettings, LlmProvider, SettingsSectionId } from '@features/settings/settings.models';
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

export const LOADING_STATE: LoadState = {
  origin: 'splash',
  path: 'D:\\Dreamy\\Harrowmere',
  name: 'Harrowmere',
  mode: 'open',
  steps: [
    { id: 'application', state: 'done' },
    { id: 'backend', state: 'running' },
    { id: 'llm', state: 'pending' },
    { id: 'workspace', state: 'pending' },
  ],
  percent: 25,
  status: 'running',
};

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

export function llmProvider(
  overrides: Partial<LlmProvider> & Pick<LlmProvider, 'id' | 'name' | 'command'>,
): LlmProvider {
  return {
    caps: ['translation', 'knowledge', 'assistant'],
    profileEnv: null,
    profileDir: null,
    loginCommand: `${overrides.command} login`,
    canLogout: true,
    canDetectLogin: true,
    path: '',
    found: true,
    resolvedPath: `C:\\Tools\\${overrides.command}.cmd`,
    version: '1.0.0',
    signedIn: true,
    account: 'reader@example.com',
    signing: false,
    status: 'ok',
    error: '',
    latencyMs: 820,
    checkedAt: '09:30:00',
    ...overrides,
  };
}

const PROFILE_ROOT = 'C:\\Users\\dreamy\\AppData\\Roaming\\dreamy-studio\\llm';

export const LLM_PROVIDERS: LlmProvider[] = [
  llmProvider({
    id: 'claude',
    name: 'Claude Code CLI',
    command: 'claude',
    version: '2.1.0',
    profileEnv: 'CLAUDE_CONFIG_DIR',
    profileDir: `${PROFILE_ROOT}\\claude`,
  }),
  llmProvider({
    id: 'codex',
    name: 'Codex CLI',
    command: 'codex',
    version: '0.9.3',
    caps: ['knowledge', 'assistant'],
    profileEnv: 'CODEX_HOME',
    profileDir: `${PROFILE_ROOT}\\codex`,
    signedIn: false,
    account: '',
    status: 'none',
  }),
  llmProvider({
    id: 'antigravity',
    name: 'Antigravity',
    command: 'agy',
    profileEnv: null,
    profileDir: null,
    loginCommand: 'agy',
    canLogout: false,
    canDetectLogin: false,
    signedIn: null,
    account: '',
    status: 'error',
    error: 'Process exited with code 1',
  }),
  llmProvider({
    id: 'gemini',
    name: 'Gemini CLI',
    command: 'gemini',
    found: false,
    resolvedPath: '',
    version: '',
    signedIn: null,
    account: '',
    status: 'none',
  }),
];

export const LLM_FEATURES: LlmFeature[] = [
  { id: 'translation', provider: 'claude', model: 'sonnet', effort: 'medium', args: '' },
  { id: 'knowledge', provider: 'claude', model: 'opus', effort: 'high', args: '--max-turns 5' },
  { id: 'assistant', provider: null, model: '', effort: null, args: '' },
];

function updateFeature(
  list: WritableSignal<LlmFeature[]>,
  id: LlmCapability,
  change: Partial<LlmFeatureSettings>,
): Promise<void> {
  list.update((items) => items.map((item) => (item.id === id ? { ...item, ...change } : item)));
  return Promise.resolve();
}

export function llmServiceProvider(
  providers: LlmProvider[],
  features: LlmFeature[] = LLM_FEATURES,
): Provider {
  const list = signal(features);
  const mock: Partial<LlmService> = {
    providers: signal(providers),
    features: list,
    setFeature: updateFeature.bind(null, list),
    load: () => Promise.resolve(),
    check: () => Promise.resolve(),
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    setPath: () => Promise.resolve(),
    copyPath: () => Promise.resolve(),
    openProfile: () => Promise.resolve(),
  };
  return { provide: LlmService, useValue: mock };
}
