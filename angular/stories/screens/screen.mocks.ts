import { EnvironmentProviders, Provider, inject, provideAppInitializer } from "@angular/core";
import { applicationConfig } from "@storybook/angular-vite";
import type { Decorator } from "@storybook/angular-vite";
import { DesktopIpcService } from "@core/desktop/desktop-ipc.service";
import { LanguageService } from "@core/language/language.service";
import { SettingsService } from "@features/settings/settings.service";
import { SettingsView } from "@features/settings/settings.models";
import { WorkspaceService } from "@features/workspace/workspace.service";
import { APP_INFO, CURRENT_WORKSPACE, LLM_PROVIDERS, llmServiceProvider } from "../features/mocks";

export type IpcHandlers = Record<string, (args: Record<string, unknown>) => unknown>;

const SETTINGS: SettingsView = {
  dataDir: "C:\Users\dreamy\AppData\Roaming\dreamy-studio",
  file: "settings.json",
  general: {},
  layout: { explorerOpen: true, inspectorOpen: true, bottomOpen: true, rightTab: "inspector" },
};

export function baseHandlers(): IpcHandlers {
  return {
    app_info: () => APP_INFO,
    workspace_current: () => CURRENT_WORKSPACE,
    settings_get: () => SETTINGS,
  };
}

function ipcProvider(handlers: IpcHandlers): Provider {
  const mock: Partial<DesktopIpcService> = {
    invoke: <TResult>(command: string, args: Record<string, unknown> = {}): Promise<TResult> => Promise.resolve((handlers[command]?.(args) ?? (command.endsWith("_list") ? [] : undefined)) as TResult),
    channel: <TMessage>(onMessage: (message: TMessage) => void) => ({ emit: onMessage }) as never,
  };
  return { provide: DesktopIpcService, useValue: mock };
}

async function startup(): Promise<void> {
  const settings = inject(SettingsService);
  const workspace = inject(WorkspaceService);
  inject(LanguageService).init();
  await settings.load();
  await workspace.restoreCurrent();
}

export function screenProviders(handlers: IpcHandlers): Array<Provider | EnvironmentProviders> {
  return [ipcProvider(handlers), llmServiceProvider(LLM_PROVIDERS), provideAppInitializer(startup)];
}

export function withScreen(handlers: IpcHandlers): { decorators: Decorator[] } {
  return { decorators: [applicationConfig({ providers: screenProviders(handlers) })] };
}
