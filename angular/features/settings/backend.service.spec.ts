import { TestBed } from '@angular/core/testing';
import { ToastService } from '@shared/toast/toast.service';
import { FakeIpc, setupIpc } from '@testing/fake-ipc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackendView, TtsModel } from './backend.models';
import { BackendService } from './backend.service';

function view(overrides: Partial<BackendView> = {}): BackendView {
  return {
    server: {
      status: 'running',
      port: 52814,
      version: '0.1.0',
      pythonVersion: '3.12',
      startedAt: '2026-01-01T00:00:00Z',
      latencyMs: 12,
      checkedAt: '2026-01-01T01:00:00Z',
      error: '',
    },
    gpu: { found: true, name: 'RTX 4070', vramMb: 12282, driver: '566.14' },
    cuda: { state: 'none', receivedBytes: 0, totalBytes: 100, error: '', version: '12.4' },
    device: 'cpu',
    modelsDir: '/models',
    ...overrides,
  };
}

function model(id: string, overrides: Partial<TtsModel> = {}): TtsModel {
  return {
    id,
    name: id,
    source: `hf/${id}`,
    languages: ['vi'],
    cloning: true,
    gpuRecommended: false,
    sources: ['preset', 'clone'],
    presets: [],
    license: 'Apache-2.0',
    commercialUse: true,
    state: 'none',
    receivedBytes: 0,
    totalBytes: 100,
    error: '',
    ...overrides,
  };
}

function dangerToasts(): number {
  return TestBed.inject(ToastService)
    .items()
    .filter((item) => item.tone === 'danger').length;
}

describe('BackendService', () => {
  let ipc: FakeIpc;
  let backend: BackendService;

  beforeEach(() => {
    ipc = setupIpc();
    ipc.on('backend_status', view());
    ipc.on('backend_model_list', [model('a'), model('b', { state: 'installed' })]);
    backend = TestBed.inject(BackendService);
  });

  afterEach(() => vi.useRealTimers());

  it('loads the server, hardware and models', async () => {
    await backend.load();
    expect(backend.server().status).toBe('running');
    expect(backend.server().port).toBe(52814);
    expect(backend.gpu().name).toBe('RTX 4070');
    expect(backend.cuda().version).toBe('12.4');
    expect(backend.device()).toBe('cpu');
    expect(backend.modelsDir()).toBe('/models');
    expect(backend.models().map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('falls back to a safe state when the commands reject', async () => {
    ipc.fail('backend_status', 'x');
    ipc.fail('backend_model_list', 'x');
    await expect(backend.load()).resolves.toBeUndefined();
    expect(backend.server().status).toBe('stopped');
    expect(backend.gpu().found).toBe(false);
    expect(backend.cuda().state).toBe('none');
    expect(backend.models()).toEqual([]);
    expect(dangerToasts()).toBe(0);
  });

  it('falls back to a safe state when the commands return nothing', async () => {
    ipc.on('backend_status', undefined);
    ipc.on('backend_model_list', undefined);
    await backend.load();
    expect(backend.server().status).toBe('stopped');
    expect(backend.server().port).toBeNull();
    expect(backend.models()).toEqual([]);
  });

  it('fills missing fields of a partial status', async () => {
    ipc.on('backend_status', { server: { status: 'running', port: 1 }, device: 'cuda' });
    await backend.load();
    expect(backend.server().port).toBe(1);
    expect(backend.server().version).toBe('');
    expect(backend.gpu().found).toBe(false);
    expect(backend.device()).toBe('cuda');
  });

  it('checks the server once at a time', async () => {
    await backend.load();
    const pending = backend.check();
    expect(backend.checking()).toBe(true);
    await backend.check();
    await pending;
    expect(backend.checking()).toBe(false);
    expect(ipc.called('backend_status')).toBe(2);
  });

  it('restarts the server and reports failures', async () => {
    await backend.load();
    const pending = backend.restart();
    expect(backend.server().status).toBe('starting');
    await pending;
    expect(ipc.called('backend_restart')).toBe(1);
    expect(backend.server().status).toBe('running');
    ipc.fail('backend_restart', 'port busy');
    await backend.restart();
    expect(dangerToasts()).toBe(1);
  });

  it('ignores a restart and a check while the server is starting', async () => {
    ipc.on('backend_status', view({ server: { ...view().server, status: 'starting' } }));
    ipc.on('backend_model_list', []);
    vi.useFakeTimers();
    await backend.load();
    const calls = ipc.called('backend_status');
    await backend.restart();
    await backend.check();
    expect(ipc.called('backend_restart')).toBe(0);
    expect(ipc.called('backend_status')).toBe(calls);
  });

  it('rescans the GPU', async () => {
    await backend.scanGpu();
    expect(ipc.called('backend_gpu_scan')).toBe(1);
    expect(backend.scanning()).toBe(false);
  });

  it('only switches to CUDA when the GPU and runtime are ready', async () => {
    await backend.load();
    expect(backend.gpuReady()).toBe(false);
    await backend.setDevice('cuda');
    expect(ipc.called('backend_device_set')).toBe(0);
    ipc.on(
      'backend_status',
      view({ cuda: { ...view().cuda, state: 'installed' }, device: 'cuda' }),
    );
    await backend.load();
    expect(backend.gpuReady()).toBe(true);
    await backend.setDevice('cuda');
    expect(ipc.lastArgs('backend_device_set')).toEqual({ device: 'cuda' });
    expect(backend.device()).toBe('cuda');
    await backend.setDevice('cpu');
    expect(ipc.lastArgs('backend_device_set')).toEqual({ device: 'cpu' });
  });

  it('shows the server as starting while a device change restarts it', async () => {
    await backend.load();
    const pending = backend.setDevice('cpu');
    expect(backend.server().status).toBe('starting');
    await pending;
    expect(backend.server().status).toBe('running');
    ipc.on('backend_status', view({ server: { ...view().server, status: 'stopped' } }));
    await backend.load();
    const idle = backend.setDevice('cpu');
    expect(backend.server().status).toBe('stopped');
    await idle;
  });

  it('manages the CUDA runtime', async () => {
    await backend.load();
    await backend.downloadCuda();
    await backend.cancelCuda();
    await backend.removeCuda();
    expect(ipc.called('backend_cuda_download')).toBe(1);
    expect(ipc.called('backend_cuda_cancel')).toBe(1);
    expect(ipc.called('backend_cuda_remove')).toBe(1);
  });

  it('tracks a model download until it is installed', async () => {
    vi.useFakeTimers();
    await backend.load();
    ipc.on('backend_model_list', () => [
      model('a', { state: 'downloading', receivedBytes: 40 }),
      model('b'),
    ]);
    await backend.downloadModel('a');
    expect(ipc.lastArgs('backend_model_download')).toEqual({ id: 'a' });
    expect(backend.models()[0].state).toBe('downloading');
    ipc.on('backend_model_list', () => [
      model('a', { state: 'installed', receivedBytes: 100 }),
      model('b'),
    ]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(backend.models()[0].state).toBe('installed');
    const calls = ipc.called('backend_model_list');
    await vi.advanceTimersByTimeAsync(5000);
    expect(ipc.called('backend_model_list')).toBe(calls);
  });

  it('resets a failed download and reports it', async () => {
    await backend.load();
    ipc.fail('backend_model_download', 'no space');
    await backend.downloadModel('a');
    expect(backend.models()[0].state).toBe('none');
    expect(dangerToasts()).toBe(1);
  });

  it('cancels and removes models', async () => {
    await backend.load();
    await backend.cancelModel('a');
    await backend.removeModel('b');
    expect(ipc.lastArgs('backend_model_cancel')).toEqual({ id: 'a' });
    expect(ipc.lastArgs('backend_model_remove')).toEqual({ id: 'b' });
  });

  it('opens the logs and models folder and warns on failure', async () => {
    await backend.openLogs();
    await backend.openModelsDir();
    expect(ipc.called('backend_logs_open')).toBe(1);
    expect(ipc.called('backend_models_open')).toBe(1);
    expect(dangerToasts()).toBe(0);
    ipc.fail('backend_logs_open', 'x');
    await backend.openLogs();
    expect(dangerToasts()).toBe(1);
  });
});
