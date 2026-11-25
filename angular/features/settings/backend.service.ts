import { Injectable } from '@angular/core';

import { BackendView } from './backend.models';
import { BackendCommands, BackendStore, toView } from './backend.store';

export { NO_GPU, NO_SERVER } from './backend.store';

const LOCAL_COMMANDS: BackendCommands = {
  status: 'backend_status',
  models: 'backend_model_list',
  modelDownload: 'backend_model_download',
  modelCancel: 'backend_model_cancel',
  modelRemove: 'backend_model_remove',
};

@Injectable({ providedIn: 'root' })
export class BackendService extends BackendStore {
  protected readonly commands = LOCAL_COMMANDS;

  async restart(): Promise<void> {
    if (this.server().status === 'starting') {
      return;
    }
    this.markStarting();
    await this.run('backend_restart');
  }

  async openLogs(): Promise<void> {
    await this.open('backend_logs_open');
  }

  async openModelsDir(): Promise<void> {
    await this.open('backend_models_open');
  }

  protected toView(raw: Partial<BackendView> | null | undefined): BackendView {
    return toView(raw);
  }

  private markStarting(): void {
    this.server.update((server) => ({ ...server, status: 'starting', error: '' }));
    this.pollWhileBusy();
  }

  private async open(command: string): Promise<void> {
    try {
      await this.ipc.invoke<void>(command);
    } catch {
      this.toasts.show(this.languageService.translate('settings.general.openFailed'), 'danger');
    }
  }
}
