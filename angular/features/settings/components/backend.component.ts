import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Badge } from '@components/badge';
import { Icon } from '@components/icon';
import { SegmentOption, Segments } from '@components/segments';
import { TabOption, Tabs } from '@components/tabs';
import { formatBytes } from '@features/library/library.rules';
import { CoreModule } from '@shared/core.module';
import { LanguageKey, LanguageParams } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

import { modelNoteKey } from '../backend.catalog';
// prettier-ignore
import { BackendDevice, BackendDownload, BackendStatus, DownloadState, TtsModel } from '../backend.models';
import { downloadPercent, formatUptime, formatVram } from '../backend.rules';
import { BackendService } from '../backend.service';

type BackendTab = 'general' | 'models';

type Tone = 'default' | 'primary' | 'running' | 'success' | 'warning' | 'danger' | 'info';

const BACKEND_TABS: BackendTab[] = ['general', 'models'];

const DEVICES: BackendDevice[] = ['cpu', 'cuda'];

const SERVER_TONES: Record<BackendStatus, Tone> = {
  running: 'success',
  starting: 'running',
  stopped: 'default',
  error: 'danger',
};

const SERVER_MODES: Record<BackendStatus, string> = {
  running: 'is-ready',
  starting: 'is-missing',
  stopped: 'is-missing',
  error: 'is-error',
};

const SERVER_KEYS: Record<BackendStatus, LanguageKey> = {
  running: 'settings.backend.status.running',
  starting: 'settings.backend.status.starting',
  stopped: 'settings.backend.status.stopped',
  error: 'settings.backend.status.error',
};

const MODEL_TONES: Record<DownloadState, Tone> = {
  none: 'default',
  downloading: 'running',
  installed: 'success',
  error: 'danger',
};

const MODEL_MODES: Record<DownloadState, string> = {
  none: 'is-missing',
  downloading: 'is-missing',
  installed: 'is-ready',
  error: 'is-error',
};

const MODEL_KEYS: Record<DownloadState, LanguageKey> = {
  none: 'settings.backend.model.status.none',
  downloading: 'settings.backend.model.status.downloading',
  installed: 'settings.backend.model.status.installed',
  error: 'settings.backend.model.status.error',
};

export interface BackendMessage {
  key: LanguageKey;
  tone: 'ok' | 'warn' | 'mute';
  busy: boolean;
  params?: LanguageParams;
}

function message(
  key: LanguageKey,
  tone: BackendMessage['tone'],
  busy = false,
  params?: LanguageParams,
): BackendMessage {
  return { key, tone, busy, params };
}

const MODEL_MESSAGES: Record<DownloadState, BackendMessage> = {
  none: message('settings.backend.model.msg.none', 'mute'),
  downloading: message('settings.backend.model.msg.downloading', 'mute', true),
  installed: message('settings.backend.model.msg.installed', 'ok'),
  error: message('settings.backend.model.msg.error', 'warn'),
};

const LANGUAGE_KEYS: Record<string, LanguageKey> = {
  mul: 'settings.backend.model.lang.mul',
};

const MISSING = '—';

function orMissing(value: string): string {
  return value || MISSING;
}

function toDevice(value: string): BackendDevice {
  return DEVICES.find((device) => device === value) ?? 'cpu';
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-settings-backend',
  imports: [Badge, Icon, CoreModule, NgTemplateOutlet, Segments, Tabs],
  templateUrl: './backend.component.html',
  host: { 'data-testid': 'settings-backend' },
})
export class SettingsBackend {
  private readonly backend = inject(BackendService);
  private readonly languageService = inject(LanguageService);

  readonly server = this.backend.server;
  readonly gpu = this.backend.gpu;
  readonly cuda = this.backend.cuda;
  readonly device = this.backend.device;
  readonly modelsDir = this.backend.modelsDir;
  readonly models = this.backend.models;
  readonly checking = this.backend.checking;
  readonly scanning = this.backend.scanning;
  readonly gpuReady = this.backend.gpuReady;
  readonly tab = signal<BackendTab>('general');
  readonly tabOptions = computed(this.buildTabOptions.bind(this));
  readonly deviceOptions = computed(this.buildDeviceOptions.bind(this));
  readonly serverMode = computed(this.buildServerMode.bind(this));
  readonly serverTone = computed(this.buildServerTone.bind(this));
  readonly serverKey = computed(this.buildServerKey.bind(this));
  readonly serverMessage = computed(this.buildServerMessage.bind(this));
  readonly address = computed(this.buildAddress.bind(this));
  readonly uptime = computed(this.buildUptime.bind(this));
  readonly gpuHint = computed(this.buildGpuHint.bind(this));
  readonly cudaHint = computed(this.buildCudaHint.bind(this));
  readonly deviceHintKey = computed(this.buildDeviceHintKey.bind(this));

  onTab(value: string): void {
    this.tab.set(BACKEND_TABS.find((tab) => tab === value) ?? 'general');
  }

  onDevice(value: string): void {
    void this.backend.setDevice(toDevice(value));
  }

  check(): void {
    void this.backend.check();
  }

  restart(): void {
    void this.backend.restart();
  }

  openLogs(): void {
    void this.backend.openLogs();
  }

  scanGpu(): void {
    void this.backend.scanGpu();
  }

  downloadCuda(): void {
    void this.backend.downloadCuda();
  }

  cancelCuda(): void {
    void this.backend.cancelCuda();
  }

  removeCuda(): void {
    void this.backend.removeCuda();
  }

  openModelsDir(): void {
    void this.backend.openModelsDir();
  }

  downloadModel(model: TtsModel): void {
    void this.backend.downloadModel(model.id);
  }

  cancelModel(model: TtsModel): void {
    void this.backend.cancelModel(model.id);
  }

  removeModel(model: TtsModel): void {
    void this.backend.removeModel(model.id);
  }

  canRestart(): boolean {
    return this.server().status !== 'starting';
  }

  canCheck(): boolean {
    return this.server().status !== 'starting' && !this.checking();
  }

  canScan(): boolean {
    return this.server().status !== 'starting' && !this.scanning();
  }

  text(value: string): string {
    return orMissing(value);
  }

  percent(download: BackendDownload): number {
    return downloadPercent(download);
  }

  progress(download: BackendDownload): LanguageParams {
    return {
      received: formatBytes(download.receivedBytes),
      total: formatBytes(download.totalBytes),
      percent: downloadPercent(download),
    };
  }

  size(download: BackendDownload): string {
    return download.totalBytes > 0 ? formatBytes(download.totalBytes) : MISSING;
  }

  languageLabel(language: string): string {
    const key = LANGUAGE_KEYS[language];
    return key ? this.languageService.translate(key) : language;
  }

  modelMode(model: TtsModel): string {
    return MODEL_MODES[model.state];
  }

  modelTone(model: TtsModel): Tone {
    return MODEL_TONES[model.state];
  }

  modelKey(model: TtsModel): LanguageKey {
    return MODEL_KEYS[model.state];
  }

  modelNote(model: TtsModel): LanguageKey | null {
    return modelNoteKey(model.id);
  }

  modelMessage(model: TtsModel): BackendMessage {
    return MODEL_MESSAGES[model.state];
  }

  warnsCpu(model: TtsModel): boolean {
    return model.gpuRecommended && this.device() !== 'cuda';
  }

  private buildTabOptions(): TabOption[] {
    return [
      {
        value: 'general',
        label: this.languageService.translate('settings.backend.general'),
        icon: 'server',
      },
      {
        value: 'models',
        label: this.languageService.translate('settings.backend.models'),
        icon: 'voice',
      },
    ];
  }

  private buildDeviceOptions(): SegmentOption[] {
    return [
      { value: 'cpu', label: this.languageService.translate('settings.backend.device.cpu') },
      {
        value: 'cuda',
        label: this.languageService.translate('settings.backend.device.gpu'),
        disabled: !this.gpuReady(),
      },
    ];
  }

  private buildServerMode(): string {
    return SERVER_MODES[this.server().status];
  }

  private buildServerTone(): Tone {
    return SERVER_TONES[this.server().status];
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
    return message('settings.backend.msg.ok', 'ok', false, {
      ms: server.latencyMs,
      time: this.timeOf(server.checkedAt),
    });
  }

  private buildAddress(): string {
    const port = this.server().port;
    return port === null ? MISSING : `http://127.0.0.1:${port}`;
  }

  private buildUptime(): string {
    const server = this.server();
    return server.status === 'running' ? formatUptime(server.startedAt, Date.now()) : MISSING;
  }

  private buildGpuHint(): string {
    const gpu = this.gpu();
    return this.languageService.translate('settings.backend.gpu.found', {
      name: orMissing(gpu.name),
      vram: gpu.vramMb > 0 ? formatVram(gpu.vramMb) : MISSING,
      driver: orMissing(gpu.driver),
    });
  }

  private buildCudaHint(): string {
    const cuda = this.cuda();
    const size = this.size(cuda);
    return cuda.version
      ? this.languageService.translate('settings.backend.cuda.hintVersion', {
          version: cuda.version,
          size,
        })
      : this.languageService.translate('settings.backend.cuda.hint', { size });
  }

  private buildDeviceHintKey(): LanguageKey {
    if (!this.gpu().found) {
      return 'settings.backend.gpu.none';
    }
    return this.cuda().state === 'installed'
      ? 'settings.backend.device.hint'
      : 'settings.backend.device.needCuda';
  }

  private timeOf(checkedAt: string): string {
    const time = Date.parse(checkedAt);
    return Number.isFinite(time)
      ? new Date(time).toLocaleTimeString(this.languageService.locale())
      : checkedAt;
  }
}
