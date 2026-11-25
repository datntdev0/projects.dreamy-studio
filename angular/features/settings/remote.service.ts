import { computed, Injectable, signal } from '@angular/core';

import { BackendHost } from './backend.host';
// prettier-ignore
import { BackendCuda, BackendDevice, BackendGpu, BackendServer, TtsModel } from './backend.models';
import { NO_CUDA, NO_GPU, NO_SERVER } from './backend.service';
import { keyHintOf } from './cloud.service';

function done(): Promise<void> {
  return Promise.resolve();
}

@Injectable({ providedIn: 'root' })
export class RemoteBackendService implements BackendHost {
  readonly url = signal('');
  readonly keyHint = signal('');
  readonly active = signal(false);
  readonly server = signal<BackendServer>(NO_SERVER);
  readonly gpu = signal<BackendGpu>(NO_GPU);
  readonly cuda = signal<BackendCuda>(NO_CUDA);
  readonly device = signal<BackendDevice>('cpu');
  readonly modelsDir = signal('');
  readonly models = signal<TtsModel[]>([]);
  readonly checking = signal(false);
  readonly scanning = signal(false);
  readonly connected = computed(this.isConnected.bind(this));
  readonly gpuReady = computed(this.isGpuReady.bind(this));

  connect(url: string, key: string): Promise<void> {
    this.url.set(url.trim());
    this.keyHint.set(key ? keyHintOf(key) : '');
    return done();
  }

  disconnect(): Promise<void> {
    this.server.set(NO_SERVER);
    this.active.set(false);
    return done();
  }

  check(): Promise<void> {
    return done();
  }

  setActive(active: boolean): Promise<void> {
    this.active.set(active && this.connected());
    return done();
  }

  scanGpu(): Promise<void> {
    return done();
  }

  setDevice(device: BackendDevice): Promise<void> {
    this.device.set(device === 'cuda' && !this.gpuReady() ? 'cpu' : device);
    return done();
  }

  downloadCuda(): Promise<void> {
    return done();
  }

  cancelCuda(): Promise<void> {
    return done();
  }

  removeCuda(): Promise<void> {
    return done();
  }

  downloadModel(_id: string): Promise<void> {
    return done();
  }

  cancelModel(_id: string): Promise<void> {
    return done();
  }

  removeModel(_id: string): Promise<void> {
    return done();
  }

  private isConnected(): boolean {
    return this.server().status === 'running';
  }

  private isGpuReady(): boolean {
    return this.gpu().found && this.cuda().state === 'installed';
  }
}
