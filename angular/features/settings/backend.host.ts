import { Signal } from '@angular/core';

import { BackendDevice, BackendGpu, BackendServer, TtsModel } from './backend.models';

export abstract class BackendHost {
  abstract readonly server: Signal<BackendServer>;
  abstract readonly gpu: Signal<BackendGpu>;
  abstract readonly device: Signal<BackendDevice>;
  abstract readonly modelsDir: Signal<string>;
  abstract readonly models: Signal<TtsModel[]>;

  abstract downloadModel(id: string): Promise<void>;
  abstract cancelModel(id: string): Promise<void>;
  abstract removeModel(id: string): Promise<void>;
}
