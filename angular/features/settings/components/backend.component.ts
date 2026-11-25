import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Badge } from '@components/badge';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

import { BackendStatus } from '../backend.models';
import { BackendService } from '../backend.service';
// prettier-ignore
import { BackendMessage, healthMessage, message, MISSING, orMissing, serverMode, serverTone, serverUptime, Tone } from '../backend.status';
import { BackendPanel } from './backend-panel.component';
import { BackendStatusLine } from './backend-status.component';

const SERVER_KEYS: Record<BackendStatus, LanguageKey> = {
  running: 'settings.backend.status.running',
  starting: 'settings.backend.status.starting',
  stopped: 'settings.backend.status.stopped',
  error: 'settings.backend.status.error',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-settings-backend',
  imports: [Badge, BackendPanel, BackendStatusLine, Icon, CoreModule],
  templateUrl: './backend.component.html',
  host: { 'data-testid': 'settings-backend' },
})
export class SettingsBackend {
  private readonly languageService = inject(LanguageService);

  readonly backend = inject(BackendService);
  readonly server = this.backend.server;
  readonly checking = this.backend.checking;
  readonly serverMode = computed(this.buildServerMode.bind(this));
  readonly serverTone = computed(this.buildServerTone.bind(this));
  readonly serverKey = computed(this.buildServerKey.bind(this));
  readonly serverMessage = computed(this.buildServerMessage.bind(this));
  readonly address = computed(this.buildAddress.bind(this));
  readonly uptime = computed(this.buildUptime.bind(this));

  check(): void {
    void this.backend.check();
  }

  restart(): void {
    void this.backend.restart();
  }

  openLogs(): void {
    void this.backend.openLogs();
  }

  openModelsDir(): void {
    void this.backend.openModelsDir();
  }

  canRestart(): boolean {
    return this.server().status !== 'starting';
  }

  canCheck(): boolean {
    return this.server().status !== 'starting' && !this.checking();
  }

  text(value: string): string {
    return orMissing(value);
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
    if (server.status === 'starting') {
      return message('settings.backend.msg.starting', 'mute', true);
    }
    if (server.status === 'stopped') {
      return message('settings.backend.msg.stopped', 'warn');
    }
    if (server.status === 'error') {
      return message('settings.backend.msg.failed', 'warn');
    }
    if (server.latencyMs === null) {
      return message('settings.backend.msg.running', 'mute');
    }
    return healthMessage(server, this.languageService.locale());
  }

  private buildAddress(): string {
    const port = this.server().port;
    return port === null ? MISSING : `http://127.0.0.1:${port}`;
  }

  private buildUptime(): string {
    return serverUptime(this.server());
  }
}
