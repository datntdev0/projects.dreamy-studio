import { inject, Injectable, signal } from '@angular/core';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { ipcErrorMessage } from '@shared/desktop/desktop-ipc-error';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { BackendDevice, BackendGpu, BackendServer, BackendView, TtsModel } from './backend.models';

const POLL_MS = 1000;

const NO_SERVER: BackendServer = {
  status: 'stopped',
  port: null,
  version: '',
  pythonVersion: '',
  startedAt: null,
  latencyMs: null,
  checkedAt: '',
  error: '',
};

const NO_GPU: BackendGpu = {
  found: false,
  name: '',
  vramMb: 0,
  driver: '',
  computeCapability: '',
  cudaSupported: false,
};

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toView(raw: Partial<BackendView> | null | undefined): BackendView {
  return {
    server: { ...NO_SERVER, ...raw?.server },
    gpu: { ...NO_GPU, ...raw?.gpu },
    device: raw?.device === 'cuda' ? 'cuda' : 'cpu',
    modelsDir: raw?.modelsDir ?? '',
  };
}

function toModels(raw: TtsModel[] | null | undefined): TtsModel[] {
  return Array.isArray(raw) ? raw : [];
}

@Injectable({ providedIn: 'root' })
export class BackendService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private polling = false;

  readonly server = signal<BackendServer>(NO_SERVER);
  readonly gpu = signal<BackendGpu>(NO_GPU);
  readonly device = signal<BackendDevice>('cpu');
  readonly modelsDir = signal('');
  readonly models = signal<TtsModel[]>([]);
  readonly checking = signal(false);

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

  async downloadModel(id: string): Promise<void> {
    this.patchModel(id, { state: 'downloading', receivedBytes: 0, error: '' });
    this.pollWhileBusy();
    await this.run('backend_model_download', { id });
  }

  async cancelModel(id: string): Promise<void> {
    await this.run('backend_model_cancel', { id });
  }

  async removeModel(id: string): Promise<void> {
    await this.run('backend_model_remove', { id });
  }

  private markStarting(): void {
    this.server.update((server) => ({ ...server, status: 'starting', error: '' }));
    this.pollWhileBusy();
  }

  private async run(command: string, args?: Record<string, unknown>): Promise<void> {
    try {
      await this.ipc.invoke<void>(command, args);
    } catch (error) {
      this.fail(error, 'settings.backend.failed');
    }
    await this.refresh();
  }

  private async open(command: string): Promise<void> {
    try {
      await this.ipc.invoke<void>(command);
    } catch {
      this.toasts.show(this.languageService.translate('settings.general.openFailed'), 'danger');
    }
  }

  private async refresh(): Promise<boolean> {
    const [status, models] = await Promise.all([this.refreshStatus(), this.refreshModels()]);
    return status && models;
  }

  private async refreshStatus(): Promise<boolean> {
    let succeeded = true;
    let raw: Partial<BackendView> | null | undefined;
    try {
      raw = await this.ipc.invoke<Partial<BackendView> | null | undefined>('backend_status');
    } catch {
      succeeded = false;
    }
    this.applyView(toView(raw));
    return succeeded;
  }

  private async refreshModels(): Promise<boolean> {
    try {
      this.models.set(toModels(await this.ipc.invoke<TtsModel[] | null>('backend_model_list')));
      return true;
    } catch {
      this.models.set([]);
      return false;
    }
  }

  private applyView(view: BackendView): void {
    this.server.set(view.server);
    this.gpu.set(view.gpu);
    this.device.set(view.device);
    this.modelsDir.set(view.modelsDir);
  }

  private patchModel(id: string, change: Partial<TtsModel>): void {
    this.models.update((models) =>
      models.map((model) => (model.id === id ? { ...model, ...change } : model)),
    );
  }

  private isBusy(): boolean {
    return (
      this.server().status === 'starting' ||
      this.models().some((model) => model.state === 'downloading')
    );
  }

  private pollWhileBusy(): void {
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

  private fail(error: unknown, fallback: LanguageKey): void {
    this.toasts.show(ipcErrorMessage(error) ?? this.languageService.translate(fallback), 'danger');
  }
}
