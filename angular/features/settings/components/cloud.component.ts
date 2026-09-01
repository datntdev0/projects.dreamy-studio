import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Badge } from '@components/badge';
import { Icon } from '@components/icon';
import { TabOption, Tabs } from '@components/tabs';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

import { CloudAccount, CloudServiceKind } from '../cloud.models';
import { CLOUD_NOTE_KEYS, CLOUD_SERVICE_KINDS } from '../cloud.providers';
import { CloudService } from '../cloud.service';

type Tone = 'default' | 'primary' | 'running' | 'success' | 'warning' | 'danger' | 'info';

export interface CloudMessage {
  key: LanguageKey;
  tone: 'ok' | 'warn' | 'mute';
  params?: Record<string, string | number>;
}

const TAB_LABEL_KEYS: Record<CloudServiceKind, LanguageKey> = {
  speech: 'settings.cloud.speech',
  image: 'settings.cloud.image',
};

const TAB_ICONS: Record<CloudServiceKind, string> = {
  speech: 'voice',
  image: 'image',
};

const STATUS_TONES: Record<string, Tone> = {
  none: 'default',
  checking: 'running',
  ok: 'success',
  error: 'danger',
};

const STATUS_KEYS: Record<string, LanguageKey> = {
  none: 'settings.cloud.status.notChecked',
  checking: 'settings.cloud.status.checking',
  ok: 'settings.cloud.status.connected',
  error: 'settings.cloud.status.error',
};

const KEYLESS_TONES: Record<string, Tone> = {
  none: 'info',
  checking: 'running',
  ok: 'success',
  error: 'danger',
};

const KEYLESS_STATUS_KEYS: Record<string, LanguageKey> = {
  none: 'settings.cloud.status.noKey',
  checking: 'settings.cloud.status.checking',
  ok: 'settings.cloud.status.available',
  error: 'settings.cloud.status.error',
};

function keyedMessage(account: CloudAccount): CloudMessage {
  if (!account.connected) {
    return { key: 'settings.cloud.msg.enterKey', tone: 'mute' };
  }
  const messages: Record<string, CloudMessage> = {
    none: { key: 'settings.cloud.msg.unchecked', tone: 'mute' },
    checking: { key: 'settings.cloud.msg.checking', tone: 'mute' },
    ok: { key: 'settings.cloud.msg.ok', tone: 'ok', params: { time: account.checkedAt } },
    error: { key: 'settings.cloud.msg.failed', tone: 'warn' },
  };
  return messages[account.status];
}

function keylessMessage(account: CloudAccount): CloudMessage {
  const messages: Record<string, CloudMessage> = {
    none: { key: 'settings.cloud.msg.keyless.ready', tone: 'mute' },
    checking: { key: 'settings.cloud.msg.keyless.checking', tone: 'mute' },
    ok: { key: 'settings.cloud.msg.keyless.ok', tone: 'ok', params: { time: account.checkedAt } },
    error: { key: 'settings.cloud.msg.failed', tone: 'warn' },
  };
  return messages[account.status];
}

function withoutId(ids: string[], id: string): string[] {
  return ids.filter((item) => item !== id);
}

function toggled(ids: string[], id: string): string[] {
  return ids.includes(id) ? withoutId(ids, id) : [...ids, id];
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-settings-cloud',
  imports: [Badge, Icon, CoreModule, Tabs],
  templateUrl: './cloud.component.html',
  host: { 'data-testid': 'settings-cloud' },
})
export class SettingsCloud {
  private readonly cloud = inject(CloudService);
  private readonly languageService = inject(LanguageService);

  readonly tab = signal<CloudServiceKind>('speech');
  readonly tabOptions = computed(this.buildTabOptions.bind(this));
  readonly visible = computed(this.buildVisible.bind(this));
  readonly drafts = signal<Record<string, string>>({});
  readonly revealed = signal<string[]>([]);
  readonly replacing = signal<string[]>([]);

  onTab(value: string): void {
    this.tab.set(CLOUD_SERVICE_KINDS.find((kind) => kind === value) ?? 'speech');
  }

  draft(account: CloudAccount): string {
    return this.drafts()[account.id] ?? '';
  }

  canSave(account: CloudAccount): boolean {
    return this.draft(account).trim() !== '';
  }

  isEntering(account: CloudAccount): boolean {
    return !account.connected || this.replacing().includes(account.id);
  }

  isRevealed(account: CloudAccount): boolean {
    return this.revealed().includes(account.id);
  }

  isReplacing(account: CloudAccount): boolean {
    return this.replacing().includes(account.id);
  }

  onDraft(account: CloudAccount, value: string): void {
    this.drafts.update((drafts) => ({ ...drafts, [account.id]: value }));
  }

  toggleReveal(account: CloudAccount): void {
    this.revealed.update((ids) => toggled(ids, account.id));
  }

  startReplace(account: CloudAccount): void {
    this.replacing.update((ids) => [...withoutId(ids, account.id), account.id]);
  }

  cancelReplace(account: CloudAccount): void {
    this.onDraft(account, '');
    this.replacing.update((ids) => withoutId(ids, account.id));
  }

  async save(account: CloudAccount): Promise<void> {
    if (!this.canSave(account)) {
      return;
    }
    if (await this.cloud.saveKey(account.id, this.draft(account))) {
      this.cancelReplace(account);
    }
  }

  remove(account: CloudAccount): void {
    void this.cloud.removeKey(account.id);
  }

  check(account: CloudAccount): void {
    void this.cloud.check(account.id);
  }

  canCheck(account: CloudAccount): boolean {
    return account.connected && account.status !== 'checking';
  }

  isShared(account: CloudAccount): boolean {
    return account.services.length > 1;
  }

  noteKey(kind: CloudServiceKind, account: CloudAccount): LanguageKey | null {
    return CLOUD_NOTE_KEYS[kind][account.id] ?? null;
  }

  mode(account: CloudAccount): string {
    if (!account.connected) {
      return 'is-login';
    }
    const modes: Record<string, string> = { ok: 'is-ready', error: 'is-error' };
    return modes[account.status] ?? '';
  }

  isKeyless(account: CloudAccount): boolean {
    return !account.requiresKey;
  }

  statusTone(account: CloudAccount): Tone {
    if (this.isKeyless(account)) {
      return KEYLESS_TONES[account.status];
    }
    return account.connected ? STATUS_TONES[account.status] : 'warning';
  }

  statusKey(account: CloudAccount): LanguageKey {
    if (this.isKeyless(account)) {
      return KEYLESS_STATUS_KEYS[account.status];
    }
    return account.connected ? STATUS_KEYS[account.status] : 'settings.cloud.status.notConnected';
  }

  message(account: CloudAccount): CloudMessage {
    return this.isKeyless(account) ? keylessMessage(account) : keyedMessage(account);
  }

  private buildVisible(): CloudAccount[] {
    const kind = this.tab();
    return this.cloud.accounts().filter((account) => account.services.includes(kind));
  }

  private buildTabOptions(): TabOption[] {
    return CLOUD_SERVICE_KINDS.map(this.toTabOption.bind(this));
  }

  private toTabOption(kind: CloudServiceKind): TabOption {
    return {
      value: kind,
      label: this.languageService.translate(TAB_LABEL_KEYS[kind]),
      icon: TAB_ICONS[kind],
    };
  }
}
