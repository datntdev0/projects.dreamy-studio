import { EnvironmentProviders, inject, provideAppInitializer, Provider } from '@angular/core';
import { CloudAccount } from '@features/settings/cloud.models';
import { SettingsView } from '@features/settings/settings.models';
import { SettingsService } from '@features/settings/settings.service';
import { WorkspaceService } from '@features/workspace/workspace.service';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { LanguageService } from '@shared/language/language.service';
import { applicationConfig, type Decorator } from '@storybook/angular-vite';

import { APP_INFO, CURRENT_WORKSPACE } from '../features/mocks';
import { backendServiceProvider } from '../features/settings-backend.mocks';
import { cloudServiceProvider } from '../features/settings-cloud.mocks';
import { LLM_PROVIDERS, llmServiceProvider } from '../features/settings-llm.mocks';

export type IpcHandlers = Record<string, (args: Record<string, unknown>) => unknown>;

const SETTINGS: SettingsView = {
  dataDir: 'C:\\Users\\dreamy\\AppData\\Roaming\\dreamy-studio',
  file: 'settings.json',
  general: {},
  layout: { explorerOpen: true, inspectorOpen: true, bottomOpen: true, rightTab: 'inspector' },
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
    invoke: <TResult>(command: string, args: Record<string, unknown> = {}): Promise<TResult> =>
      Promise.resolve(
        (handlers[command]?.(args) ?? (command.endsWith('_list') ? [] : undefined)) as TResult,
      ),
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

export function screenProviders(
  handlers: IpcHandlers,
  accounts?: CloudAccount[],
): Array<Provider | EnvironmentProviders> {
  return [
    ipcProvider(handlers),
    llmServiceProvider(LLM_PROVIDERS),
    backendServiceProvider(),
    cloudServiceProvider(accounts),
    provideAppInitializer(startup),
  ];
}

export function withScreen(
  handlers: IpcHandlers,
  accounts?: CloudAccount[],
): { decorators: Decorator[] } {
  return { decorators: [applicationConfig({ providers: screenProviders(handlers, accounts) })] };
}
