import { TestBed } from '@angular/core/testing';
import { FakeIpc, setupIpc } from '@testing/fake-ipc';

export function setupApp(): FakeIpc {
  localStorage.clear();
  const ipc = setupIpc();
  ipc.on('settings_get', { general: {}, layout: {}, dataDir: '', file: '' });
  ipc.on('llm_get', { providers: [], features: [] });
  return ipc;
}

export function flushEffects(): void {
  TestBed.tick();
}
