import { Provider, signal } from "@angular/core";
import { applicationConfig } from "@storybook/angular-vite";
import type { Decorator } from "@storybook/angular-vite";
import { I18nService } from "../../app/core/i18n/i18n.service";
import { ThemeService } from "../../app/core/theme/theme.service";
import { LlmService } from "../../app/features/settings/llm.service";
import { LlmProvider, SettingsSectionId } from "../../app/features/settings/settings.models";
import { SettingsService } from "../../app/features/settings/settings.service";
import { AppInfo, CurrentWorkspace, LoadState, RecentWorkspace } from "../../app/features/workspace/workspace.models";
import { WorkspaceService } from "../../app/features/workspace/workspace.service";

export function withProviders(providers: Provider[]): { decorators: Decorator[] } {
  return { decorators: [applicationConfig({ providers })] };
}

export const APP_INFO: AppInfo = { name: "Dreamy Studio", version: "0.1.0" };

export const CURRENT_WORKSPACE: CurrentWorkspace = { name: "Harrowmere", path: "D:\\Dreamy\\Harrowmere" };

export const RECENT_WORKSPACES: RecentWorkspace[] = [
  { path: "D:\\Dreamy\\Harrowmere", name: "Harrowmere", lastOpenedAt: "2026-06-02T09:30:00Z", status: "ok", projectCount: 3 },
  { path: "E:\\Works\\Dark Harbor", name: "Dark Harbor", lastOpenedAt: "2026-05-20T20:10:00Z", status: "ok", projectCount: 1 },
  { path: "F:\\Old\\Pine Hill", name: "Pine Hill", lastOpenedAt: "2026-03-11T08:00:00Z", status: "not_found", reason: "missing" },
];

export const LOADING_STATE: LoadState = {
  origin: "splash",
  path: "D:\\Dreamy\\Harrowmere",
  name: "Harrowmere",
  mode: "open",
  steps: [
    { id: "application", state: "done" },
    { id: "backend", state: "running" },
    { id: "workspace", state: "pending" },
  ],
  percent: 42,
  status: "running",
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

function settingsMock(i18n: I18nService, themes: ThemeService, scenario: SettingsScenario): Partial<SettingsService> {
  const section = signal<SettingsSectionId>(scenario.section ?? "general");
  return {
    open: signal(true),
    section,
    dataDir: signal(scenario.dataDir ?? "C:\\Users\\dreamy\\AppData\\Roaming\\dreamy-studio"),
    file: signal("settings.json"),
    closeDialog: () => undefined,
    selectSection: (id) => section.set(id),
    setLanguage: (language) => i18n.setLanguage(language),
    setTheme: (theme) => themes.setTheme(theme),
    openFolder: () => Promise.resolve(),
  };
}

export function settingsProvider(scenario: SettingsScenario = {}): Provider {
  return {
    provide: SettingsService,
    useFactory: (i18n: I18nService, themes: ThemeService) => settingsMock(i18n, themes, scenario),
    deps: [I18nService, ThemeService],
  };
}

export function llmProvider(overrides: Partial<LlmProvider> & Pick<LlmProvider, "id" | "name" | "command">): LlmProvider {
  return {
    caps: ["translation", "knowledge", "assistant"],
    profileEnv: null,
    profileDir: null,
    loginCommand: `${overrides.command} login`,
    canLogout: true,
    canDetectLogin: true,
    path: "",
    found: true,
    resolvedPath: `C:\\Tools\\${overrides.command}.cmd`,
    version: "1.0.0",
    signedIn: true,
    account: "reader@example.com",
    signing: false,
    status: "ok",
    error: "",
    latencyMs: 820,
    checkedAt: "09:30:00",
    ...overrides,
  };
}

export const LLM_PROVIDERS: LlmProvider[] = [
  llmProvider({ id: "claude", name: "Claude Code", command: "claude", version: "2.1.0" }),
  llmProvider({ id: "codex", name: "Codex CLI", command: "codex", version: "0.9.3", signedIn: false, account: "", status: "none" }),
  llmProvider({ id: "antigravity", name: "Antigravity", command: "antigravity", status: "error", error: "Process exited with code 1" }),
  llmProvider({ id: "gemini", name: "Gemini CLI", command: "gemini", found: false, resolvedPath: "", version: "", signedIn: null, account: "", status: "none" }),
];

export function llmServiceProvider(providers: LlmProvider[]): Provider {
  const mock: Partial<LlmService> = {
    providers: signal(providers),
    scanning: signal(false),
    ensureLoaded: () => Promise.resolve(),
    scan: () => Promise.resolve(),
    check: () => Promise.resolve(),
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    setPath: () => Promise.resolve(),
    copyPath: () => Promise.resolve(),
    openProfile: () => Promise.resolve(),
  };
  return { provide: LlmService, useValue: mock };
}
