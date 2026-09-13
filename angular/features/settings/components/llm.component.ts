// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Badge } from '@components/badge';
import { Icon } from '@components/icon';
import { TabOption, Tabs } from '@components/tabs';
import { formatBytes } from '@features/library/library.rules';
import { CoreModule } from '@shared/core.module';
import { LanguageKey, LanguageParams } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

import { DownloadState } from '../backend.models';
import { downloadPercent } from '../backend.rules';
import { MODEL_SUGGESTIONS } from '../llm.providers';
import { isInstalled, LlmService } from '../llm.service';
// prettier-ignore
import { LlmCapability, LlmEffort, LlmFeature, LlmInstall, LlmProvider, LlmUsageWindow, LlmUsageWindowId } from '../settings.models';

type LlmTab = 'cli' | 'features';

const LLM_TABS: LlmTab[] = ['cli', 'features'];

const FEATURE_NAME_KEYS: Record<LlmCapability, LanguageKey> = {
  translation: 'settings.llm.feature.translation',
  knowledge: 'settings.llm.feature.knowledge',
  assistant: 'settings.llm.feature.assistant',
};

const FEATURE_HINT_KEYS: Record<LlmCapability, LanguageKey> = {
  translation: 'settings.llm.feature.translation.hint',
  knowledge: 'settings.llm.feature.knowledge.hint',
  assistant: 'settings.llm.feature.assistant.hint',
};

export interface EffortOption {
  value: LlmEffort | '';
  key: LanguageKey;
}

const EFFORT_OPTIONS: EffortOption[] = [
  { value: '', key: 'settings.llm.feature.effort.default' },
  { value: 'low', key: 'settings.llm.feature.effort.low' },
  { value: 'medium', key: 'settings.llm.feature.effort.medium' },
  { value: 'high', key: 'settings.llm.feature.effort.high' },
];

const INSTALL_STATUS: Record<Exclude<DownloadState, 'installed'>, [Tone, LanguageKey]> = {
  none: ['default', 'settings.llm.status.notInstalled'],
  downloading: ['running', 'settings.llm.status.installing'],
  error: ['danger', 'settings.llm.status.installFailed'],
};

function toEffort(value: string): LlmEffort | null {
  const option = EFFORT_OPTIONS.find((item) => item.value === value);
  return option && option.value !== '' ? option.value : null;
}

const USAGE_WINDOW_KEYS: Record<LlmUsageWindowId, LanguageKey> = {
  session: 'settings.llm.usage.session',
  weekly: 'settings.llm.usage.weekly',
};

const USAGE_WARNING_PERCENT = 75;
const USAGE_DANGER_PERCENT = 90;

const RESET_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
};

export type UsageTone = 'ok' | 'warning' | 'danger';

type Tone = 'default' | 'primary' | 'running' | 'success' | 'warning' | 'danger' | 'info';

export interface LlmMessage {
  key: LanguageKey;
  tone: 'ok' | 'warn' | 'mute';
  params?: Record<string, string | number>;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-settings-llm',
  imports: [Badge, Icon, CoreModule, Tabs],
  templateUrl: './llm.component.html',
  host: { 'data-testid': 'settings-llm' },
})
export class SettingsLlm implements OnInit {
  private readonly llm = inject(LlmService);
  private readonly languageService = inject(LanguageService);

  readonly providers = this.llm.providers;
  readonly features = this.llm.features;
  readonly efforts = EFFORT_OPTIONS;
  readonly tab = signal<LlmTab>('cli');
  readonly tabOptions = computed(this.buildTabOptions.bind(this));

  ngOnInit(): void {
    void this.llm.refreshUsage();
  }

  onTab(value: string): void {
    const tab = LLM_TABS.find((item) => item === value) ?? 'cli';
    this.tab.set(tab);
    if (tab === 'cli') {
      void this.llm.refreshUsage();
    }
  }

  usageWindowKey(window: LlmUsageWindow): LanguageKey {
    return USAGE_WINDOW_KEYS[window.window];
  }

  usagePercent(window: LlmUsageWindow): number | null {
    return window.usedPercent === null
      ? null
      : Math.min(100, Math.max(0, Math.round(window.usedPercent)));
  }

  usageTone(window: LlmUsageWindow): UsageTone {
    const percent = this.usagePercent(window) ?? 0;
    if (percent >= USAGE_DANGER_PERCENT) {
      return 'danger';
    }
    return percent >= USAGE_WARNING_PERCENT ? 'warning' : 'ok';
  }

  usageGroup(window: LlmUsageWindow): string {
    return window.group ?? '';
  }

  usageReset(window: LlmUsageWindow): string {
    const date = window.resetsAt === null ? window.resetsNote : this.resetDate(window.resetsAt);
    return date ? this.languageService.translate('settings.llm.usage.resets', { date }) : '';
  }

  private resetDate(resetsAt: string): string {
    return new Intl.DateTimeFormat(this.languageService.locale(), RESET_FORMAT).format(
      new Date(resetsAt),
    );
  }

  usageChecked(provider: LlmProvider): string {
    const checkedAtMs = provider.usage?.checkedAtMs ?? 0;
    return checkedAtMs > 0
      ? new Date(checkedAtMs).toLocaleTimeString(this.languageService.locale())
      : '';
  }

  installed(provider: LlmProvider): boolean {
    return isInstalled(provider);
  }

  statusTone(provider: LlmProvider): Tone {
    const install = this.installStatus(provider);
    if (install) {
      return install[0];
    }
    if (provider.signedIn === false) {
      return 'warning';
    }
    const tones: Record<string, Tone> = {
      none: 'default',
      checking: 'running',
      ok: 'success',
      error: 'danger',
    };
    return tones[provider.status];
  }

  statusKey(provider: LlmProvider): LanguageKey {
    const install = this.installStatus(provider);
    if (install) {
      return install[1];
    }
    if (provider.signedIn === false) {
      return 'settings.llm.status.notSignedIn';
    }
    const keys: Record<string, LanguageKey> = {
      none: 'settings.llm.status.notChecked',
      checking: 'settings.llm.status.checking',
      ok: 'settings.llm.status.ready',
      error: 'settings.llm.status.error',
    };
    return keys[provider.status];
  }

  message(provider: LlmProvider): LlmMessage {
    if (provider.status === 'checking') {
      return { key: 'settings.llm.msg.checking', tone: 'mute' };
    }
    if (provider.signing) {
      return { key: 'settings.llm.msg.waiting', tone: 'mute' };
    }
    if (provider.signedIn === false) {
      return { key: 'settings.llm.msg.needSignIn', tone: 'warn' };
    }
    if (provider.status === 'ok') {
      return {
        key: 'settings.llm.msg.ok',
        tone: 'ok',
        params: { ms: provider.latencyMs, time: provider.checkedAt },
      };
    }
    if (provider.status === 'error') {
      return { key: 'settings.llm.msg.failed', tone: 'warn' };
    }
    return { key: 'settings.llm.msg.unchecked', tone: 'mute' };
  }

  installPercent(install: LlmInstall): number {
    return downloadPercent(install);
  }

  installProgress(install: LlmInstall): LanguageParams {
    return {
      received: formatBytes(install.receivedBytes),
      total: formatBytes(install.totalBytes),
      percent: downloadPercent(install),
    };
  }

  installSize(install: LlmInstall): string {
    return formatBytes(install.totalBytes);
  }

  install(provider: LlmProvider): void {
    void this.llm.install(provider.id);
  }

  cancelInstall(provider: LlmProvider): void {
    void this.llm.cancelInstall(provider.id);
  }

  check(provider: LlmProvider): void {
    void this.llm.check(provider.id);
  }

  login(provider: LlmProvider): void {
    void this.llm.login(provider.id);
  }

  logout(provider: LlmProvider): void {
    void this.llm.logout(provider.id);
  }

  featureNameKey(feature: LlmFeature): LanguageKey {
    return FEATURE_NAME_KEYS[feature.id];
  }

  featureHintKey(feature: LlmFeature): LanguageKey {
    return FEATURE_HINT_KEYS[feature.id];
  }

  providersFor(feature: LlmFeature): LlmProvider[] {
    return this.providers().filter((provider) => provider.caps.includes(feature.id));
  }

  modelsFor(feature: LlmFeature): string[] {
    return MODEL_SUGGESTIONS[feature.provider ?? ''] ?? [];
  }

  onFeatureProvider(feature: LlmFeature, value: string): void {
    const provider = value || null;
    if (provider !== feature.provider) {
      void this.llm.setFeature(feature.id, { provider, model: '' });
    }
  }

  onFeatureModel(feature: LlmFeature, value: string): void {
    if (value.trim() !== feature.model) {
      void this.llm.setFeature(feature.id, { model: value.trim() });
    }
  }

  onFeatureEffort(feature: LlmFeature, value: string): void {
    const effort = toEffort(value);
    if (effort !== feature.effort) {
      void this.llm.setFeature(feature.id, { effort });
    }
  }

  onFeatureArgs(feature: LlmFeature, value: string): void {
    if (value.trim() !== feature.args) {
      void this.llm.setFeature(feature.id, { args: value.trim() });
    }
  }

  canCheck(provider: LlmProvider): boolean {
    return provider.status !== 'checking';
  }

  private installStatus(provider: LlmProvider): [Tone, LanguageKey] | null {
    const state = provider.install.state;
    return state === 'installed' ? null : INSTALL_STATUS[state];
  }

  private buildTabOptions(): TabOption[] {
    return [
      { value: 'cli', label: this.languageService.translate('settings.llm.cli'), icon: 'terminal' },
      {
        value: 'features',
        label: this.languageService.translate('settings.llm.features'),
        icon: 'spark',
      },
    ];
  }
}
