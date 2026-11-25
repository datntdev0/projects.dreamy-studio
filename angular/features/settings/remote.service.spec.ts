import { TestBed } from '@angular/core/testing';
import { ToastService } from '@shared/toast/toast.service';
import { FakeIpc, setupIpc } from '@testing/fake-ipc';
import { beforeEach, describe, expect, it } from 'vitest';

import { RemoteView } from './backend.models';
import { RemoteBackendService } from './remote.service';

const URL = 'https://quiet-river-sample.trycloudflare.com';

function remoteView(overrides: Partial<RemoteView> = {}): RemoteView {
  return {
    server: {
      status: 'running',
      port: null,
      version: '0.1.0',
      pythonVersion: '3.13.16',
      startedAt: '2026-01-01T00:00:00Z',
      latencyMs: 184,
      checkedAt: '2026-01-01T01:00:00Z',
      error: '',
    },
    gpu: { found: true, name: 'Tesla T4', vramMb: 15360, driver: '580.82.07' },
    cuda: { state: 'installed', receivedBytes: 0, totalBytes: 0, error: '', version: '12.8' },
    device: 'cuda',
    modelsDir: '/content/data/models',
    url: URL,
    keyHint: '••••9f2c',
    active: false,
    ...overrides,
  };
}

function dangerToasts(): string[] {
  return TestBed.inject(ToastService)
    .items()
    .filter((item) => item.tone === 'danger')
    .map((item) => item.message);
}

describe('RemoteBackendService', () => {
  let ipc: FakeIpc;
  let remote: RemoteBackendService;

  beforeEach(() => {
    ipc = setupIpc();
    ipc.on('backend_remote_status', remoteView());
    ipc.on('backend_remote_model_list', []);
    remote = TestBed.inject(RemoteBackendService);
  });

  it('loads the connection, hardware and remote models', async () => {
    await remote.load();
    expect(remote.connected()).toBe(true);
    expect(remote.url()).toBe(URL);
    expect(remote.keyHint()).toBe('••••9f2c');
    expect(remote.gpu().name).toBe('Tesla T4');
    expect(remote.device()).toBe('cuda');
    expect(remote.modelsDir()).toBe('/content/data/models');
  });

  it('starts disconnected when nothing is saved', async () => {
    ipc.on('backend_remote_status', undefined);
    await remote.load();
    expect(remote.connected()).toBe(false);
    expect(remote.url()).toBe('');
    expect(remote.active()).toBe(false);
  });

  it('connects with the address and API key', async () => {
    ipc.on('backend_remote_connect', remoteView());
    await expect(remote.connect(URL, 'secret')).resolves.toBe(true);
    expect(ipc.lastArgs('backend_remote_connect')).toEqual({ url: URL, apiKey: 'secret' });
    expect(remote.connected()).toBe(true);
  });

  it('reports a rejected connection', async () => {
    ipc.on('backend_remote_status', undefined);
    ipc.fail('backend_remote_connect', 'Missing or invalid API key');
    await expect(remote.connect(URL, 'wrong')).resolves.toBe(false);
    expect(remote.connected()).toBe(false);
    expect(dangerToasts()).toEqual(['Missing or invalid API key']);
  });

  it('routes speech only through a connected server', async () => {
    await remote.setActive(true);
    expect(ipc.called('backend_remote_active_set')).toBe(0);

    await remote.load();
    ipc.on('backend_remote_status', remoteView({ active: true }));
    await remote.setActive(true);
    expect(ipc.lastArgs('backend_remote_active_set')).toEqual({ active: true });
    expect(remote.active()).toBe(true);
  });

  it('uses the remote commands for hardware and models', async () => {
    await remote.load();
    await remote.setDevice('cpu');
    await remote.downloadCuda();
    await remote.downloadModel('omnivoice');
    await remote.disconnect();
    expect(ipc.lastArgs('backend_remote_device_set')).toEqual({ device: 'cpu' });
    expect(ipc.called('backend_remote_cuda_download')).toBe(1);
    expect(ipc.lastArgs('backend_remote_model_download')).toEqual({ id: 'omnivoice' });
    expect(ipc.called('backend_remote_disconnect')).toBe(1);
    expect(ipc.called('backend_status')).toBe(0);
  });
});
