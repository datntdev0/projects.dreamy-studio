import { signal } from "@angular/core";
import { applicationConfig } from "@storybook/angular-vite";
import type { Meta, StoryObj } from "@storybook/angular-vite";
import { SplashPage } from "../../app/pages/splash/splash.page";
import { I18nService } from "../../app/core/i18n/i18n.service";
import { ThemeService } from "../../app/core/theme/theme.service";
import { SettingsService } from "../../app/features/settings/settings.service";
import { AppInfo, LoadState, RecentWorkspace } from "../../app/features/workspace/workspace.models";
import { WorkspaceService } from "../../app/features/workspace/workspace.service";

const APP_INFO: AppInfo = { name: "Dreamy Studio", version: "0.1.0" };

const RECENT: RecentWorkspace[] = [
  { path: "D:\Dreamy\Harrowmere", name: "Harrowmere", lastOpenedAt: "2026-06-02T09:30:00Z", status: "ok", projectCount: 3 },
  { path: "E:\Works\Dark Harbor", name: "Dark Harbor", lastOpenedAt: "2026-05-20T20:10:00Z", status: "ok", projectCount: 1 },
  { path: "F:\Old\Pine Hill", name: "Pine Hill", lastOpenedAt: "2026-03-11T08:00:00Z", status: "not_found", reason: "missing" },
];

const LOADING: LoadState = {
  origin: "splash",
  path: "D:\Dreamy\Harrowmere",
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

interface SplashScenario {
  recent: RecentWorkspace[];
  notice?: string | null;
  state?: LoadState | null;
}

function workspaceMock(scenario: SplashScenario): Partial<WorkspaceService> {
  return {
    state: signal<LoadState | null>(scenario.state ?? null),
    notice: signal<string | null>(scenario.notice ?? null),
    appInfo: () => Promise.resolve(APP_INFO),
    recentList: () => Promise.resolve(scenario.recent),
    measure: () => Promise.resolve(48_234_496),
    workspaceDelete: () => Promise.resolve(),
    folderPick: () => Promise.resolve(null),
    start: () => Promise.resolve(),
    cancel: () => Promise.resolve(),
  };
}

function settingsMock(i18n: I18nService, themes: ThemeService): Partial<SettingsService> {
  return {
    setLanguage: (language) => i18n.setLanguage(language),
    setTheme: (theme) => themes.setTheme(theme),
  };
}

function splash(scenario: SplashScenario): StoryObj<SplashPage> {
  return {
    decorators: [
      applicationConfig({
        providers: [
          { provide: WorkspaceService, useValue: workspaceMock(scenario) },
          { provide: SettingsService, useFactory: settingsMock, deps: [I18nService, ThemeService] },
        ],
      }),
    ],
  };
}

const meta: Meta<SplashPage> = {
  title: "Features/0 - Splash",
  component: SplashPage,
  parameters: { layout: "fullscreen" },
};

export default meta;

type Story = StoryObj<SplashPage>;

export const FirstRun: Story = splash({ recent: [] });

export const WithRecent: Story = splash({ recent: RECENT });

export const Loading: Story = splash({ recent: RECENT, state: LOADING });
