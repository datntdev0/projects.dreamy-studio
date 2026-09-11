import { NgTemplateOutlet } from '@angular/common';
// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, contentChild, inject, input, output, signal, TemplateRef } from '@angular/core';
import { Badge } from '@components/badge';
import { Icon } from '@components/icon';
import { TabOption, Tabs } from '@components/tabs';
import { formatBytes } from '@features/library/library.rules';
import { CoreModule } from '@shared/core.module';
import { LanguageKey, LanguageParams } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

import { modelNoteKey } from '../backend.catalog';
import { BackendHost } from '../backend.host';
// prettier-ignore
import { BackendDevice, BackendDownload, BackendGpu, DownloadState, TtsModel } from '../backend.models';
import { downloadPercent, formatVram } from '../backend.rules';
// prettier-ignore
import { BACKEND_COPY, BackendCopy, BackendKind, BackendMessage, message, MISSING, orMissing, Tone } from '../backend.status';
import { BackendStatusLine } from './backend-status.component';

type BackendTab = 'general' | 'models';

const BACKEND_TABS: BackendTab[] = ['general', 'models'];

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

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-backend-panel',
  imports: [Badge, BackendStatusLine, Icon, CoreModule, NgTemplateOutlet, Tabs],
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
  readonly device = computed(this.readDevice.bind(this));
  readonly models = computed(this.readModels.bind(this));
  readonly tabOptions = computed(this.buildTabOptions.bind(this));
  readonly gpuHint = computed(this.buildGpuHint.bind(this));
  readonly gpuTone = computed(this.buildGpuTone.bind(this));
  readonly gpuKey = computed(this.buildGpuKey.bind(this));
  readonly deviceTone = computed(this.buildDeviceTone.bind(this));
  readonly deviceKey = computed(this.buildDeviceKey.bind(this));
  readonly deviceHint = computed(this.buildDeviceHint.bind(this));

  onTab(value: string): void {
    this.tab.set(BACKEND_TABS.find((tab) => tab === value) ?? 'general');
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

  private buildGpuHint(): string {
    const gpu = this.gpu();
    return this.languageService.translate('settings.backend.gpu.found', {
      name: orMissing(gpu.name),
      vram: gpu.vramMb > 0 ? formatVram(gpu.vramMb) : MISSING,
      driver: orMissing(gpu.driver),
      compute: orMissing(gpu.computeCapability),
    });
  }

  private buildGpuTone(): Tone {
    const gpu = this.gpu();
    if (!gpu.found) {
      return 'default';
    }
    return gpu.cudaSupported ? 'success' : 'warning';
  }

  private buildGpuKey(): LanguageKey {
    const gpu = this.gpu();
    if (!gpu.found) {
      return 'settings.backend.gpu.notFound';
    }
    return gpu.cudaSupported
      ? 'settings.backend.gpu.supported'
      : 'settings.backend.gpu.unsupported';
  }

  private buildDeviceTone(): Tone {
    return this.device() === 'cuda' ? 'success' : 'default';
  }

  private buildDeviceKey(): LanguageKey {
    return this.device() === 'cuda' ? 'settings.backend.device.gpu' : 'settings.backend.device.cpu';
  }

  private buildDeviceHint(): string {
    const gpu = this.gpu();
    const name = orMissing(gpu.name);
    if (this.device() === 'cuda') {
      return this.languageService.translate('settings.backend.device.onGpu', { name });
    }
    if (!gpu.found) {
      return this.languageService.translate(this.copy().deviceNoGpu);
    }
    if (!gpu.cudaSupported) {
      return this.languageService.translate('settings.backend.device.unsupported', {
        name,
        compute: orMissing(gpu.computeCapability),
      });
    }
    return this.languageService.translate('settings.backend.device.auto', { name });
  }
}
