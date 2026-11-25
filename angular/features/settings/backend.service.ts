import { Injectable } from '@angular/core';

import { BackendDevice, BackendView } from './backend.models';
import { BackendCommands, BackendStore, toView } from './backend.store';

export { NO_CUDA, NO_GPU, NO_SERVER } from './backend.store';

const LOCAL_COMMANDS: BackendCommands = {
  status: 'backend_status',
  models: 'backend_model_list',
  gpuScan: 'backend_gpu_scan',
  deviceSet: 'backend_device_set',
  cudaDownload: 'backend_cuda_download',
  cudaCancel: 'backend_cuda_cancel',
  cudaRemove: 'backend_cuda_remove',
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

  override async setDevice(device: BackendDevice): Promise<void> {
    if (device === 'cuda' && !this.gpuReady()) {
      return;
    }
    if (this.server().status === 'running') {
      this.markStarting();
    }
    await super.setDevice(device);
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

  private async open(command: string): Promise<void> {
    try {
      await this.ipc.invoke<void>(command);
    } catch {
      this.toasts.show(this.languageService.translate('settings.general.openFailed'), 'danger');
    }
  }
}
