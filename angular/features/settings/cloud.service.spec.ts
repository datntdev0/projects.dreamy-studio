import { TestBed } from '@angular/core/testing';
import { ToastService } from '@shared/toast/toast.service';
import { FakeIpc, setupIpc } from '@testing/fake-ipc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CloudAccount } from './cloud.models';
import { DEFAULT_CLOUD_ACCOUNTS } from './cloud.providers';
import { CloudService, keyHintOf } from './cloud.service';

const KEYLESS_ID = 'edge-read-aloud';

function account(overrides: Partial<CloudAccount> = {}): CloudAccount {
  return { ...DEFAULT_CLOUD_ACCOUNTS[0], ...overrides };
}

function accountOf(id: string): CloudAccount | undefined {
  return DEFAULT_CLOUD_ACCOUNTS.find((item) => item.id === id);
}

describe('CloudService', () => {
  let ipc: FakeIpc;
  let cloud: CloudService;
  let toasts: ToastService;

  beforeEach(() => {
    ipc = setupIpc();
    cloud = TestBed.inject(CloudService);
    toasts = TestBed.inject(ToastService);
  });

  afterEach(() => vi.useRealTimers());

  it('masks all but the last characters of a key', () => {
    expect(keyHintOf('sk-abcdef3f9a')).toBe('••••3f9a');
    expect(keyHintOf('ab')).toBe('••••ab');
  });

  it('starts with the default catalogue', () => {
    expect(cloud.accounts().map((item) => item.id)).toEqual(['elevenlabs', KEYLESS_ID]);
    expect(cloud.accounts()[0]).toMatchObject({ requiresKey: true, connected: false });
    expect(cloud.accounts()[1]).toMatchObject({ requiresKey: false, connected: true });
  });

  it('adds the keyless account when the desktop list lacks it', async () => {
    ipc.on('cloud_account_list', [account({ connected: true, keyHint: '••••1234' })]);
    await cloud.load();
    expect(cloud.accounts().map((item) => item.id)).toEqual(['elevenlabs', KEYLESS_ID]);
    expect(cloud.accounts()[1]).toEqual(accountOf(KEYLESS_ID));
  });

  it('normalises accounts from the desktop that lack requiresKey', async () => {
    const stored = {
      ...accountOf(KEYLESS_ID),
      connected: false,
      requiresKey: undefined,
      status: 'ok',
    };
    const unknown = { ...account({ id: 'other', name: 'Other' }), requiresKey: undefined };
    ipc.on('cloud_account_list', [unknown, stored, { ...account(), requiresKey: undefined }]);
    await cloud.load();
    expect(cloud.accounts().map((item) => item.id)).toEqual(['elevenlabs', KEYLESS_ID, 'other']);
    expect(cloud.accounts()[0].requiresKey).toBe(true);
    expect(cloud.accounts()[1]).toMatchObject({
      requiresKey: false,
      connected: true,
      status: 'ok',
    });
    expect(cloud.accounts()[2].requiresKey).toBe(true);
  });

  it('keeps keyless accounts connected even when the desktop says otherwise', async () => {
    ipc.on('cloud_account_list', [{ ...accountOf(KEYLESS_ID), connected: false }]);
    await cloud.load();
    expect(cloud.accounts().find((item) => item.id === KEYLESS_ID)?.connected).toBe(true);
  });

  it('loads accounts from the desktop', async () => {
    ipc.on('cloud_account_list', [account({ connected: true, keyHint: '••••1234' })]);
    await cloud.load();
    expect(cloud.accounts()[0].keyHint).toBe('••••1234');
  });

  it('falls back to the default catalogue when the list is unavailable', async () => {
    ipc.on('cloud_account_list', []);
    await cloud.load();
    expect(cloud.accounts()).toEqual(DEFAULT_CLOUD_ACCOUNTS);
    ipc.on('cloud_account_list', undefined);
    await cloud.load();
    expect(cloud.accounts()).toEqual(DEFAULT_CLOUD_ACCOUNTS);
    ipc.fail('cloud_account_list', 'x');
    await cloud.load();
    expect(cloud.accounts()).toEqual(DEFAULT_CLOUD_ACCOUNTS);
    expect(toasts.items()).toHaveLength(0);
  });

  it('saves a trimmed key and keeps only its hint', async () => {
    expect(await cloud.saveKey('elevenlabs', '  sk-secret3f9a  ')).toBe(true);
    expect(ipc.lastArgs('cloud_account_key_set')).toEqual({
      id: 'elevenlabs',
      key: 'sk-secret3f9a',
    });
    expect(cloud.accounts()[0]).toMatchObject({
      connected: true,
      keyHint: '••••3f9a',
      status: 'none',
    });
    expect(JSON.stringify(cloud.accounts())).not.toContain('sk-secret');
  });

  it('ignores keys for keyless accounts', async () => {
    expect(await cloud.saveKey(KEYLESS_ID, 'abcd')).toBe(false);
    await cloud.removeKey(KEYLESS_ID);
    expect(ipc.called('cloud_account_key_set')).toBe(0);
    expect(ipc.called('cloud_account_key_remove')).toBe(0);
    expect(cloud.accounts()[1]).toEqual(accountOf(KEYLESS_ID));
  });

  it('rejects empty keys and unknown accounts', async () => {
    expect(await cloud.saveKey('elevenlabs', '   ')).toBe(false);
    expect(await cloud.saveKey('missing', 'abcd')).toBe(false);
    expect(ipc.called('cloud_account_key_set')).toBe(0);
  });

  it('warns when saving the key fails', async () => {
    ipc.fail('cloud_account_key_set', 'x');
    expect(await cloud.saveKey('elevenlabs', 'abcd')).toBe(false);
    expect(cloud.accounts()[0].connected).toBe(false);
    expect(toasts.items()[0].tone).toBe('danger');
  });

  it('removes the key and resets the account', async () => {
    await cloud.saveKey('elevenlabs', 'abcd');
    await cloud.removeKey('elevenlabs');
    expect(ipc.called('cloud_account_key_remove')).toBe(1);
    expect(cloud.accounts()[0]).toMatchObject({ connected: false, keyHint: '', status: 'none' });
    await cloud.removeKey('missing');
    expect(ipc.called('cloud_account_key_remove')).toBe(1);
  });

  it('keeps the key when removing fails', async () => {
    await cloud.saveKey('elevenlabs', 'abcd');
    ipc.fail('cloud_account_key_remove', 'x');
    await cloud.removeKey('elevenlabs');
    expect(cloud.accounts()[0].connected).toBe(true);
    expect(toasts.items()[0].tone).toBe('danger');
  });

  it('checks a connected account', async () => {
    await cloud.saveKey('elevenlabs', 'abcd');
    ipc.on('cloud_account_check', { ok: true, error: '', checkedAtMs: 1_700_000_000_000 });
    await cloud.check('elevenlabs');
    expect(cloud.accounts()[0].status).toBe('ok');
    expect(cloud.accounts()[0].checkedAt).not.toBe('');
    ipc.on('cloud_account_check', { ok: false, error: 'invalid key', checkedAtMs: 0 });
    await cloud.check('elevenlabs');
    expect(cloud.accounts()[0]).toMatchObject({ status: 'error', error: 'invalid key' });
  });

  it('checks a keyless account without a key', async () => {
    ipc.on('cloud_account_check', { ok: true, error: '', checkedAtMs: 1_700_000_000_000 });
    await cloud.check(KEYLESS_ID);
    expect(ipc.lastArgs('cloud_account_check')).toEqual({ id: KEYLESS_ID });
    expect(cloud.accounts()[1]).toMatchObject({ status: 'ok', connected: true });
    ipc.on('cloud_account_check', { ok: false, error: 'offline', checkedAtMs: 0 });
    await cloud.check(KEYLESS_ID);
    expect(cloud.accounts()[1]).toMatchObject({ status: 'error', error: 'offline' });
  });

  it('records a failed or empty check', async () => {
    await cloud.saveKey('elevenlabs', 'abcd');
    ipc.fail('cloud_account_check', 'offline');
    await cloud.check('elevenlabs');
    expect(cloud.accounts()[0]).toMatchObject({ status: 'error', error: 'offline' });
    ipc.fail('cloud_account_check', new Error('x'));
    await cloud.check('elevenlabs');
    expect(cloud.accounts()[0].error).not.toBe('');
    ipc.on('cloud_account_check', undefined);
    await cloud.check('elevenlabs');
    expect(cloud.accounts()[0].status).toBe('error');
    expect(cloud.accounts()[0].error).not.toBe('');
  });

  it('skips checks that are not applicable', async () => {
    await cloud.check('elevenlabs');
    await cloud.check('missing');
    await cloud.saveKey('elevenlabs', 'abcd');
    cloud.accounts.update((list) => list.map((item) => ({ ...item, status: 'checking' as const })));
    await cloud.check('elevenlabs');
    expect(ipc.called('cloud_account_check')).toBe(0);
  });
});
