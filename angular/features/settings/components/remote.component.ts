import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Badge } from '@components/badge';
import { Icon } from '@components/icon';
import { SegmentOption, Segments } from '@components/segments';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

import { BackendStatus } from '../backend.models';
import { isBackendUrl } from '../backend.rules';
// prettier-ignore
import { BackendMessage, healthMessage, message, orMissing, serverMode, serverTone, serverUptime, Tone } from '../backend.status';
import { RemoteBackendService } from '../remote.service';
import { BackendPanel } from './backend-panel.component';
import { BackendStatusLine } from './backend-status.component';

type RemoteUsage = 'local' | 'remote';

const SERVER_KEYS: Record<BackendStatus, LanguageKey> = {
  running: 'settings.remote.status.connected',
  starting: 'settings.remote.status.connecting',
  stopped: 'settings.remote.status.disconnected',
  error: 'settings.remote.status.error',
};

const SERVER_MESSAGES: Record<Exclude<BackendStatus, 'running'>, BackendMessage> = {
  starting: message('settings.remote.msg.connecting', 'mute', true),
  stopped: message('settings.remote.msg.disconnected', 'warn'),
  error: message('settings.remote.msg.failed', 'warn'),
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-settings-remote',
  imports: [Badge, BackendPanel, BackendStatusLine, Icon, CoreModule, Segments],
  templateUrl: './remote.component.html',
  host: { 'data-testid': 'settings-remote' },
})
export class SettingsRemote {
  private readonly languageService = inject(LanguageService);

  readonly remote = inject(RemoteBackendService);
  readonly server = this.remote.server;
  readonly url = this.remote.url;
  readonly keyHint = this.remote.keyHint;
  readonly checking = this.remote.checking;
  readonly draftUrl = signal('');
  readonly draftKey = signal('');
  readonly revealed = signal(false);
  readonly changing = signal(false);
  readonly editing = computed(this.isEditing.bind(this));
  readonly urlInvalid = computed(this.isUrlInvalid.bind(this));
  readonly serverMode = computed(this.buildServerMode.bind(this));
  readonly serverTone = computed(this.buildServerTone.bind(this));
  readonly serverKey = computed(this.buildServerKey.bind(this));
  readonly serverMessage = computed(this.buildServerMessage.bind(this));
  readonly uptime = computed(this.buildUptime.bind(this));
  readonly usage = computed(this.buildUsage.bind(this));
  readonly usageOptions = computed(this.buildUsageOptions.bind(this));
  readonly usageHintKey = computed(this.buildUsageHintKey.bind(this));

  onUrl(value: string): void {
    this.draftUrl.set(value);
  }

  onKey(value: string): void {
    this.draftKey.set(value);
  }

  toggleReveal(): void {
    this.revealed.update((revealed) => !revealed);
  }

  startEdit(): void {
    this.draftUrl.set(this.url());
    this.draftKey.set('');
    this.changing.set(true);
  }

  cancelEdit(): void {
    this.resetDraft();
  }

  connect(): void {
    if (!this.canConnect()) {
      return;
    }
    void this.remote.connect(this.draftUrl(), this.draftKey());
    this.resetDraft();
  }

  disconnect(): void {
    void this.remote.disconnect();
  }

  check(): void {
    void this.remote.check();
  }

  onUsage(value: string): void {
    void this.remote.setActive(value === 'remote');
  }

  canConnect(): boolean {
    return isBackendUrl(this.draftUrl()) && this.server().status !== 'starting';
  }

  canCheck(): boolean {
    return this.server().status !== 'starting' && !this.checking();
  }

  text(value: string): string {
    return orMissing(value);
  }

  private resetDraft(): void {
    this.draftUrl.set('');
    this.draftKey.set('');
    this.revealed.set(false);
    this.changing.set(false);
  }

  private isEditing(): boolean {
    return this.changing() || !this.url();
  }

  private isUrlInvalid(): boolean {
    const draft = this.draftUrl();
    return draft.trim() !== '' && !isBackendUrl(draft);
  }

  private buildServerMode(): string {
    return serverMode(this.server());
  }

  private buildServerTone(): Tone {
    return serverTone(this.server());
  }

  private buildServerKey(): LanguageKey {
    return SERVER_KEYS[this.server().status];
  }

  private buildServerMessage(): BackendMessage {
    const server = this.server();
    if (server.status !== 'running') {
      return SERVER_MESSAGES[server.status];
    }
    return healthMessage(server, this.languageService.locale());
  }

  private buildUptime(): string {
    return serverUptime(this.server());
  }

  private buildUsage(): RemoteUsage {
    return this.remote.active() ? 'remote' : 'local';
  }

  private buildUsageOptions(): SegmentOption[] {
    return [
      { value: 'local', label: this.languageService.translate('settings.remote.usage.local') },
      {
        value: 'remote',
        label: this.languageService.translate('settings.remote.usage.remote'),
        disabled: !this.remote.connected(),
      },
    ];
  }

  private buildUsageHintKey(): LanguageKey {
    if (!this.remote.connected()) {
      return 'settings.remote.usage.needConnection';
    }
    return this.remote.active()
      ? 'settings.remote.usage.onRemote'
      : 'settings.remote.usage.onLocal';
  }
}
