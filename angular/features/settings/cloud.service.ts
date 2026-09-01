import { inject, Injectable, signal } from '@angular/core';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { ipcErrorMessage } from '@shared/desktop/desktop-ipc-error';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { CloudAccount, CloudCheckResult } from './cloud.models';
import {
  BackendCloudAccount,
  CLOUD_DISCONNECTED,
  DEFAULT_CLOUD_ACCOUNTS,
  mergeCloudCatalogue,
} from './cloud.providers';

const KEY_HINT_MASK = '••••';
const KEY_HINT_LENGTH = 4;

export function keyHintOf(key: string): string {
  return `${KEY_HINT_MASK}${key.slice(-KEY_HINT_LENGTH)}`;
}

@Injectable({ providedIn: 'root' })
export class CloudService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);

  readonly accounts = signal<CloudAccount[]>(DEFAULT_CLOUD_ACCOUNTS);

  async load(): Promise<void> {
    try {
      const list = await this.ipc.invoke<BackendCloudAccount[] | undefined>('cloud_account_list');
      this.accounts.set(mergeCloudCatalogue(Array.isArray(list) ? list : []));
    } catch {
      this.accounts.set(DEFAULT_CLOUD_ACCOUNTS);
    }
  }

  async saveKey(id: string, key: string): Promise<boolean> {
    const value = key.trim();
    if (!value || !this.find(id)?.requiresKey) {
      return false;
    }
    try {
      await this.ipc.invoke<unknown>('cloud_account_key_set', { id, key: value });
    } catch {
      this.toasts.show(this.languageService.translate('settings.cloud.saveFailed'), 'danger');
      return false;
    }
    this.patch(id, { ...CLOUD_DISCONNECTED, connected: true, keyHint: keyHintOf(value) });
    return true;
  }

  async removeKey(id: string): Promise<void> {
    if (!this.find(id)?.requiresKey) {
      return;
    }
    try {
      await this.ipc.invoke<unknown>('cloud_account_key_remove', { id });
    } catch {
      this.toasts.show(this.languageService.translate('settings.cloud.removeFailed'), 'danger');
      return;
    }
    this.patch(id, CLOUD_DISCONNECTED);
  }

  async check(id: string): Promise<void> {
    const account = this.find(id);
    if (!account?.connected || account.status === 'checking') {
      return;
    }
    this.patch(id, { status: 'checking', error: '' });
    try {
      const result = await this.ipc.invoke<CloudCheckResult | undefined>('cloud_account_check', {
        id,
      });
      this.patch(id, this.fromCheck(result));
    } catch (error) {
      this.patch(id, { status: 'error', error: this.describe(error) });
    }
  }

  private find(id: string): CloudAccount | undefined {
    return this.accounts().find((account) => account.id === id);
  }

  private patch(id: string, change: Partial<CloudAccount>): void {
    this.accounts.update((list) =>
      list.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );
  }

  private fromCheck(result: CloudCheckResult | undefined): Partial<CloudAccount> {
    if (!result) {
      return { status: 'error', error: this.describe(null) };
    }
    return {
      status: result.ok ? 'ok' : 'error',
      error: result.ok ? '' : result.error,
      checkedAt: this.timeOf(result.checkedAtMs),
    };
  }

  private timeOf(ms: number): string {
    const date = ms > 0 ? new Date(ms) : new Date();
    return date.toLocaleTimeString(this.languageService.locale());
  }

  private describe(error: unknown): string {
    return ipcErrorMessage(error) ?? this.languageService.translate('settings.cloud.unknownError');
  }
}
