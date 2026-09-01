import { Provider, signal, WritableSignal } from '@angular/core';
import { CloudAccount } from '@features/settings/cloud.models';
import { CLOUD_DISCONNECTED, DEFAULT_CLOUD_ACCOUNTS } from '@features/settings/cloud.providers';
import { CloudService, keyHintOf } from '@features/settings/cloud.service';

const CHECK_DELAY_MS = 1200;

function patchAccount(
  list: WritableSignal<CloudAccount[]>,
  id: string,
  change: Partial<CloudAccount>,
): void {
  list.update((items) => items.map((item) => (item.id === id ? { ...item, ...change } : item)));
}

function requiresKey(list: WritableSignal<CloudAccount[]>, id: string): boolean {
  return list().find((item) => item.id === id)?.requiresKey === true;
}

function saveAccountKey(
  list: WritableSignal<CloudAccount[]>,
  id: string,
  key: string,
): Promise<boolean> {
  const value = key.trim();
  const applicable = value !== '' && requiresKey(list, id);
  if (applicable) {
    patchAccount(list, id, {
      ...CLOUD_DISCONNECTED,
      connected: true,
      keyHint: keyHintOf(value),
    });
  }
  return Promise.resolve(applicable);
}

function removeAccountKey(list: WritableSignal<CloudAccount[]>, id: string): Promise<void> {
  if (requiresKey(list, id)) {
    patchAccount(list, id, CLOUD_DISCONNECTED);
  }
  return Promise.resolve();
}

function finishCheck(list: WritableSignal<CloudAccount[]>, id: string): void {
  patchAccount(list, id, { status: 'ok', checkedAt: new Date().toLocaleTimeString() });
}

function checkAccount(list: WritableSignal<CloudAccount[]>, id: string): Promise<void> {
  patchAccount(list, id, { status: 'checking', error: '' });
  setTimeout(finishCheck.bind(null, list, id), CHECK_DELAY_MS);
  return Promise.resolve();
}

export function cloudServiceProvider(accounts: CloudAccount[] = DEFAULT_CLOUD_ACCOUNTS): Provider {
  const list = signal(accounts);
  const mock: Partial<CloudService> = {
    accounts: list,
    load: () => Promise.resolve(),
    saveKey: saveAccountKey.bind(null, list),
    removeKey: removeAccountKey.bind(null, list),
    check: checkAccount.bind(null, list),
  };
  return { provide: CloudService, useValue: mock };
}
