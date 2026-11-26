import { Provider, signal, WritableSignal } from '@angular/core';
// prettier-ignore
import { BackendDevice, BackendDownload, BackendGpu, BackendServer, TtsModel } from '@features/settings/backend.models';
import { BackendService } from '@features/settings/backend.service';

const GIB = 1024 * 1024 * 1024;
const MIB = 1024 * 1024;
const STEP_MS = 400;
const STEP_RATIO = 0.07;
const RESTART_MS = 1600;

export interface BackendScenario {
  server?: Partial<BackendServer>;
  gpu?: Partial<BackendGpu>;
  device?: BackendDevice;
}

interface BackendMockState {
  server: WritableSignal<BackendServer>;
  gpu: WritableSignal<BackendGpu>;
  device: WritableSignal<BackendDevice>;
  models: WritableSignal<TtsModel[]>;
  timers: Map<string, ReturnType<typeof setInterval>>;
}

interface DownloadTarget {
  key: string;
  read: () => BackendDownload;
  patch: (change: Partial<BackendDownload>) => void;
}

const IDLE: BackendDownload = { state: 'none', receivedBytes: 0, totalBytes: 0, error: '' };

function runningServer(): BackendServer {
  return {
    status: 'running',
    port: 52814,
    version: '0.1.0',
    pythonVersion: '3.12',
    startedAt: new Date(Date.now() - 134 * 60_000).toISOString(),
    latencyMs: 18,
    checkedAt: new Date().toISOString(),
    error: '',
  };
}

function model(overrides: Partial<TtsModel> & Pick<TtsModel, 'id' | 'name' | 'source'>): TtsModel {
  return {
    ...IDLE,
    languages: ['vi'],
    cloning: true,
    gpuRecommended: false,
    sources: ['preset', 'clone'],
    presets: [],
    license: 'Apache-2.0',
    commercialUse: true,
    ...overrides,
  };
}

export const BACKEND_MODELS: TtsModel[] = [
  model({
    id: 'vieneu-turbo',
    name: 'VieNeu-TTS v3 Turbo',
    source: 'pnnbao-ump/VieNeu-TTS-v3-Turbo',
    languages: ['vi', 'en'],
    state: 'installed',
    totalBytes: Math.round(1.1 * GIB),
    receivedBytes: Math.round(1.1 * GIB),
  }),
  model({
    id: 'vieneu-nano',
    name: 'VieNeu-TTS v3 Nano',
    source: 'pnnbao-ump/VieNeu-TTS-v3-Nano',
    languages: ['vi', 'en'],
    totalBytes: 340 * MIB,
  }),
  model({
    id: 'omnivoice',
    name: 'OmniVoice',
    source: 'k2-fsa/OmniVoice',
    languages: ['mul'],
    gpuRecommended: true,
    totalBytes: Math.round(3.2 * GIB),
  }),
];

function createState(scenario: BackendScenario): BackendMockState {
  return {
    server: signal({ ...runningServer(), ...scenario.server }),
    gpu: signal({
      found: true,
      name: 'NVIDIA GeForce RTX 4070',
      vramMb: 12282,
      driver: '566.14',
      computeCapability: '8.9',
      cudaSupported: true,
      ...scenario.gpu,
    }),
    device: signal(scenario.device ?? 'cuda'),
    models: signal(BACKEND_MODELS),
    timers: new Map(),
  };
}

function patchModel(state: BackendMockState, id: string, change: Partial<TtsModel>): void {
  state.models.update((items) =>
    items.map((item) => (item.id === id ? { ...item, ...change } : item)),
  );
}

function readModel(state: BackendMockState, id: string): BackendDownload {
  return state.models().find((item) => item.id === id) ?? IDLE;
}

function modelTarget(state: BackendMockState, id: string): DownloadTarget {
  return {
    key: id,
    read: readModel.bind(null, state, id),
    patch: patchModel.bind(null, state, id),
  };
}

function stopTimer(state: BackendMockState, key: string): void {
  clearInterval(state.timers.get(key));
  state.timers.delete(key);
}

function stepDownload(state: BackendMockState, target: DownloadTarget): void {
  const download = target.read();
  const received = Math.round(download.receivedBytes + download.totalBytes * STEP_RATIO);
  if (received < download.totalBytes) {
    target.patch({ receivedBytes: received });
    return;
  }
  stopTimer(state, target.key);
  target.patch({ state: 'installed', receivedBytes: download.totalBytes });
}

function startDownload(state: BackendMockState, target: DownloadTarget): Promise<void> {
  if (target.read().state !== 'downloading') {
    target.patch({ state: 'downloading', receivedBytes: 0, error: '' });
    state.timers.set(target.key, setInterval(stepDownload.bind(null, state, target), STEP_MS));
  }
  return Promise.resolve();
}

function resetDownload(state: BackendMockState, target: DownloadTarget): Promise<void> {
  stopTimer(state, target.key);
  target.patch({ state: 'none', receivedBytes: 0 });
  return Promise.resolve();
}

function downloadModel(state: BackendMockState, id: string): Promise<void> {
  return startDownload(state, modelTarget(state, id));
}

function cancelModel(state: BackendMockState, id: string): Promise<void> {
  return resetDownload(state, modelTarget(state, id));
}

function removeModel(state: BackendMockState, id: string): Promise<void> {
  return resetDownload(state, modelTarget(state, id));
}

function finishRestart(state: BackendMockState): void {
  state.server.set(runningServer());
}

function restartServer(state: BackendMockState): Promise<void> {
  state.server.update((server) => ({ ...server, status: 'starting', error: '' }));
  setTimeout(finishRestart.bind(null, state), RESTART_MS);
  return Promise.resolve();
}

function checkServer(state: BackendMockState): Promise<void> {
  state.server.update((server) =>
    server.status === 'running'
      ? {
          ...server,
          latencyMs: 12 + Math.round(Math.random() * 20),
          checkedAt: new Date().toISOString(),
        }
      : server,
  );
  return Promise.resolve();
}

export function backendServiceProvider(scenario: BackendScenario = {}): Provider {
  const state = createState(scenario);
  const mock: Partial<BackendService> = {
    server: state.server,
    gpu: state.gpu,
    device: state.device,
    modelsDir: signal('C:\\Users\\dreamy\\AppData\\Roaming\\dreamy-studio\\models'),
    models: state.models,
    checking: signal(false),
    load: () => Promise.resolve(),
    check: checkServer.bind(null, state),
    restart: restartServer.bind(null, state),
    openLogs: () => Promise.resolve(),
    openModelsDir: () => Promise.resolve(),
    downloadModel: downloadModel.bind(null, state),
    cancelModel: cancelModel.bind(null, state),
    removeModel: removeModel.bind(null, state),
  };
  return { provide: BackendService, useValue: mock };
}
