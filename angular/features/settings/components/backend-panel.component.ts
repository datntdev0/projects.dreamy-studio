import { NgTemplateOutlet } from '@angular/common';
// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, contentChild, inject, input, output, signal, TemplateRef } from '@angular/core';
import { Badge } from '@components/badge';
import { Icon } from '@components/icon';
import { SegmentOption, Segments } from '@components/segments';
import { TabOption, Tabs } from '@components/tabs';
import { formatBytes } from '@features/library/library.rules';
import { CoreModule } from '@shared/core.module';
import { LanguageKey, LanguageParams } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

import { modelNoteKey } from '../backend.catalog';
import { BackendHost } from '../backend.host';
// prettier-ignore
import { BackendCuda, BackendDevice, BackendDownload, BackendGpu, DownloadState, TtsModel } from '../backend.models';
import { downloadPercent, formatVram } from '../backend.rules';
// prettier-ignore
import { BACKEND_COPY, BackendCopy, BackendKind, BackendMessage, message, MISSING, orMissing, Tone } from '../backend.status';
import { BackendStatusLine } from './backend-status.component';

type BackendTab = 'general' | 'models';

const BACKEND_TABS: BackendTab[] = ['general', 'models'];

const DEVICES: BackendDevice[] = ['cpu', 'cuda'];

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

const MODEL_MESSAGES: Record<DownloadState, BackendMessage> = {
  none: message('settings.backend.model.msg.none', 'mute'),
  downloading: message('settings.backend.model.msg.downloading', 'mute', true),
  installed: message('settings.backend.model.msg.installed', 'ok'),
  error: message('settings.backend.model.msg.error', 'warn'),
};

const LANGUAGE_KEYS: Record<string, LanguageKey> = {
  mul: 'settings.backend.model.lang.mul',
};

function toDevice(value: string): BackendDevice {
  return DEVICES.find((device) => device === value) ?? 'cpu';
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-backend-panel',
  imports: [Badge, BackendStatusLine, Icon, CoreModule, NgTemplateOutlet, Segments, Tabs],
  templateUrl: './backend-panel.component.html',
  host: { class: 'st' },
})
export class BackendPanel {
  private readonly languageService = inject(LanguageService);

  readonly host = input.required<BackendHost>();
  readonly kind = input<BackendKind>('local');
  readonly prefix = input('settings-backend');
  readonly serverCard = contentChild.required<TemplateRef<unknown>>('serverCard');
  readonly openFolder = output();

  readonly tab = signal<BackendTab>('general');
  readonly modelsDir = computed(this.readModelsDir.bind(this));
  readonly folder = computed(this.buildFolder.bind(this));
  readonly copy = computed(this.buildCopy.bind(this));
  readonly tabsLabel = computed(this.buildTabsLabel.bind(this));
  readonly gpu = computed(this.readGpu.bind(this));
  readonly cuda = computed(this.readCuda.bind(this));
  readonly device = computed(this.readDevice.bind(this));
  readonly models = computed(this.readModels.bind(this));
  readonly tabOptions = computed(this.buildTabOptions.bind(this));
  readonly deviceOptions = computed(this.buildDeviceOptions.bind(this));
  readonly gpuHint = computed(this.buildGpuHint.bind(this));
  readonly cudaHint = computed(this.buildCudaHint.bind(this));
  readonly deviceHintKey = computed(this.buildDeviceHintKey.bind(this));

  onTab(value: string): void {
    this.tab.set(BACKEND_TABS.find((tab) => tab === value) ?? 'general');
  }

  onDevice(value: string): void {
    void this.host().setDevice(toDevice(value));
  }

  scanGpu(): void {
    void this.host().scanGpu();
  }

  downloadCuda(): void {
    void this.host().downloadCuda();
  }

  cancelCuda(): void {
    void this.host().cancelCuda();
  }

  removeCuda(): void {
    void this.host().removeCuda();
  }

  downloadModel(model: TtsModel): void {
    void this.host().downloadModel(model.id);
  }

  cancelModel(model: TtsModel): void {
    void this.host().cancelModel(model.id);
  }

  removeModel(model: TtsModel): void {
    void this.host().removeModel(model.id);
  }

  canScan(): boolean {
    const host = this.host();
    return host.server().status !== 'starting' && !host.scanning();
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

  private buildCopy(): BackendCopy {
    return BACKEND_COPY[this.kind()];
  }

  private buildTabsLabel(): LanguageKey {
    return this.copy().tabs;
  }

  private readGpu(): BackendGpu {
    return this.host().gpu();
  }

  private readCuda(): BackendCuda {
    return this.host().cuda();
  }

  private readDevice(): BackendDevice {
    return this.host().device();
  }

  private readModels(): TtsModel[] {
    return this.host().models();
  }

  private readModelsDir(): string {
    return this.host().modelsDir();
  }

  private buildFolder(): string {
    return orMissing(this.modelsDir());
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
        disabled: !this.host().gpuReady(),
      },
    ];
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
    if (!cuda.version) {
      return this.languageService.translate('settings.backend.cuda.hint', { size });
    }
    const key =
      cuda.totalBytes > 0
        ? 'settings.backend.cuda.hintVersion'
        : 'settings.backend.cuda.hintBundled';
    return this.languageService.translate(key, { version: cuda.version, size });
  }

  private buildDeviceHintKey(): LanguageKey {
    if (!this.gpu().found) {
      return this.copy().gpuNone;
    }
    return this.cuda().state === 'installed'
      ? 'settings.backend.device.hint'
      : 'settings.backend.device.needCuda';
  }
}
