import { computed, inject, signal } from '@angular/core';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { ipcErrorMessage } from '@shared/desktop/desktop-ipc-error';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { BackendHost } from './backend.host';
// prettier-ignore
import { BackendCuda, BackendDevice, BackendGpu, BackendServer, BackendView, TtsModel } from './backend.models';

const POLL_MS = 1000;

export const NO_SERVER: BackendServer = {
  status: 'stopped',
  port: null,
  version: '',
  pythonVersion: '',
  startedAt: null,
  latencyMs: null,
  checkedAt: '',
  error: '',
};

export const NO_GPU: BackendGpu = { found: false, name: '', vramMb: 0, driver: '' };

export const NO_CUDA: BackendCuda = {
  state: 'none',
  receivedBytes: 0,
  totalBytes: 0,
  error: '',
  version: '',
};

export interface BackendCommands {
  status: string;
  models: string;
  gpuScan: string;
  deviceSet: string;
  cudaDownload: string;
  cudaCancel: string;
  cudaRemove: string;
  modelDownload: string;
  modelCancel: string;
  modelRemove: string;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toView(raw: Partial<BackendView> | null | undefined): BackendView {
  return {
    server: { ...NO_SERVER, ...raw?.server },
    gpu: { ...NO_GPU, ...raw?.gpu },
    cuda: { ...NO_CUDA, ...raw?.cuda },
    device: raw?.device === 'cuda' ? 'cuda' : 'cpu',
    modelsDir: raw?.modelsDir ?? '',
  };
}

function toModels(raw: TtsModel[] | null | undefined): TtsModel[] {
  return Array.isArray(raw) ? raw : [];
}

export abstract class BackendStore<V extends BackendView = BackendView> implements BackendHost {
  protected readonly ipc = inject(DesktopIpcService);
  protected readonly languageService = inject(LanguageService);
  protected readonly toasts = inject(ToastService);
  protected abstract readonly commands: BackendCommands;
  private polling = false;

  readonly server = signal<BackendServer>(NO_SERVER);
  readonly gpu = signal<BackendGpu>(NO_GPU);
  readonly cuda = signal<BackendCuda>(NO_CUDA);
  readonly device = signal<BackendDevice>('cpu');
  readonly modelsDir = signal('');
  readonly models = signal<TtsModel[]>([]);
  readonly checking = signal(false);
  readonly scanning = signal(false);
  readonly gpuReady = computed(this.isGpuReady.bind(this));

  async load(): Promise<void> {
    await this.refresh();
    this.pollWhileBusy();
  }

  async check(): Promise<void> {
    if (this.checking() || this.server().status === 'starting') {
      return;
    }
    this.checking.set(true);
    await this.refreshStatus();
    this.checking.set(false);
  }

  async scanGpu(): Promise<void> {
    if (this.scanning()) {
      return;
    }
    this.scanning.set(true);
    await this.run(this.commands.gpuScan);
    this.scanning.set(false);
  }

  async setDevice(device: BackendDevice): Promise<void> {
    if (device === 'cuda' && !this.gpuReady()) {
      return;
    }
    this.device.set(device);
    await this.run(this.commands.deviceSet, { device });
  }

  async downloadCuda(): Promise<void> {
    this.cuda.update((cuda) => ({ ...cuda, state: 'downloading', receivedBytes: 0, error: '' }));
    this.pollWhileBusy();
    await this.run(this.commands.cudaDownload);
  }

  async cancelCuda(): Promise<void> {
    await this.run(this.commands.cudaCancel);
  }

  async removeCuda(): Promise<void> {
    await this.run(this.commands.cudaRemove);
  }

  async downloadModel(id: string): Promise<void> {
    this.patchModel(id, { state: 'downloading', receivedBytes: 0, error: '' });
    this.pollWhileBusy();
    await this.run(this.commands.modelDownload, { id });
  }

  async cancelModel(id: string): Promise<void> {
    await this.run(this.commands.modelCancel, { id });
  }

  async removeModel(id: string): Promise<void> {
    await this.run(this.commands.modelRemove, { id });
  }

  protected markStarting(): void {
    this.server.update((server) => ({ ...server, status: 'starting', error: '' }));
    this.pollWhileBusy();
  }

  protected async run(command: string, args?: Record<string, unknown>): Promise<boolean> {
    let succeeded = true;
    try {
      await this.ipc.invoke<void>(command, args);
    } catch (error) {
      succeeded = false;
      this.fail(error, 'settings.backend.failed');
    }
    await this.refresh();
    return succeeded;
  }

  protected applyView(view: V): void {
    this.server.set(view.server);
    this.gpu.set(view.gpu);
    this.cuda.set(view.cuda);
    this.device.set(view.device);
    this.modelsDir.set(view.modelsDir);
  }

  protected abstract toView(raw: Partial<V> | null | undefined): V;

  protected async refresh(): Promise<boolean> {
    const [status, models] = await Promise.all([this.refreshStatus(), this.refreshModels()]);
    return status && models;
  }

  protected fail(error: unknown, fallback: LanguageKey): void {
    this.toasts.show(ipcErrorMessage(error) ?? this.languageService.translate(fallback), 'danger');
  }

  private isGpuReady(): boolean {
    return this.gpu().found && this.cuda().state === 'installed';
  }

  private async refreshStatus(): Promise<boolean> {
    let succeeded = true;
    let raw: Partial<V> | null | undefined;
    try {
      raw = await this.ipc.invoke<Partial<V> | null | undefined>(this.commands.status);
    } catch {
      succeeded = false;
    }
    this.applyView(this.toView(raw));
    return succeeded;
  }

  private async refreshModels(): Promise<boolean> {
    try {
      this.models.set(toModels(await this.ipc.invoke<TtsModel[] | null>(this.commands.models)));
      return true;
    } catch {
      this.models.set([]);
      return false;
    }
  }

  private patchModel(id: string, change: Partial<TtsModel>): void {
    this.models.update((models) =>
      models.map((model) => (model.id === id ? { ...model, ...change } : model)),
    );
  }

  private isBusy(): boolean {
    return (
      this.server().status === 'starting' ||
      this.cuda().state === 'downloading' ||
      this.models().some((model) => model.state === 'downloading')
    );
  }

  protected pollWhileBusy(): void {
    if (this.polling || !this.isBusy()) {
      return;
    }
    this.polling = true;
    void this.pollLoop();
  }

  private async pollLoop(): Promise<void> {
    let healthy = true;
    while (healthy && this.isBusy()) {
      await pause(POLL_MS);
      healthy = await this.refresh();
    }
    this.polling = false;
  }
}
