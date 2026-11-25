import { Signal } from '@angular/core';

// prettier-ignore
import { BackendCuda, BackendDevice, BackendGpu, BackendServer, TtsModel } from './backend.models';

export abstract class BackendHost {
  abstract readonly server: Signal<BackendServer>;
  abstract readonly gpu: Signal<BackendGpu>;
  abstract readonly cuda: Signal<BackendCuda>;
  abstract readonly device: Signal<BackendDevice>;
  abstract readonly modelsDir: Signal<string>;
  abstract readonly models: Signal<TtsModel[]>;
  abstract readonly scanning: Signal<boolean>;
  abstract readonly gpuReady: Signal<boolean>;

  abstract scanGpu(): Promise<void>;
  abstract setDevice(device: BackendDevice): Promise<void>;
  abstract downloadCuda(): Promise<void>;
  abstract cancelCuda(): Promise<void>;
  abstract removeCuda(): Promise<void>;
  abstract downloadModel(id: string): Promise<void>;
  abstract cancelModel(id: string): Promise<void>;
  abstract removeModel(id: string): Promise<void>;
}
