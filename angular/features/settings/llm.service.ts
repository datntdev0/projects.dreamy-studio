import { inject, Injectable, signal } from '@angular/core';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { ipcErrorMessage } from '@shared/desktop/desktop-ipc-error';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

// prettier-ignore
import { LlmCapability, LlmCliView, LlmFeature, LlmFeatureSettings, LlmInstall, LlmInstallProgress, LlmProbe, LlmProvider, LlmUsage, LlmView } from './settings.models';

const SIGN_IN_POLL_MS = 3000;
const SIGN_IN_POLL_LIMIT = 100;

export function isInstalled(provider: LlmProvider): boolean {
  return provider.install.state === 'installed';
}

export function isReady(provider: LlmProvider): boolean {
  return isInstalled(provider) && provider.status === 'ok' && provider.signedIn !== false;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fresh(view: Omit<LlmCliView, 'probe'>): LlmProvider {
  return {
    ...view,
    version: '',
    signedIn: null,
    account: '',
    signing: false,
    status: 'none',
    error: '',
    latencyMs: 0,
    checkedAt: '',
    usage: null,
    usageLoading: false,
    usageError: '',
  };
}

@Injectable({ providedIn: 'root' })
export class LlmService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);

  readonly providers = signal<LlmProvider[]>([]);
  readonly features = signal<LlmFeature[]>([]);

  async load(): Promise<void> {
    try {
      this.apply(await this.ipc.invoke<LlmView>('llm_get'));
    } catch {
      this.toasts.show(this.languageService.translate('settings.llm.loadFailed'), 'danger');
    }
  }

  async check(id: string): Promise<void> {
    const provider = this.find(id);
    if (!provider || provider.status === 'checking') {
      return;
    }
    await this.probeProvider(provider);
  }

  async refreshUsage(): Promise<void> {
    const targets = this.providers().filter(
      (provider) => isInstalled(provider) && !provider.usageLoading,
    );
    await Promise.all(targets.map((provider) => this.loadUsage(provider.id)));
  }

  async install(id: string): Promise<void> {
    const provider = this.find(id);
    if (!provider || provider.install.state === 'downloading') {
      return;
    }
    this.patchInstall(id, { state: 'downloading', receivedBytes: 0, error: '' });
    const channel = this.ipc.channel<LlmInstallProgress>(this.onInstallProgress.bind(this, id));
    try {
      const install = await this.ipc.invoke<LlmInstall>('llm_install', { id, channel });
      this.patchInstall(id, install);
    } catch (error) {
      this.patchInstall(id, { state: 'error', error: this.describe(error) });
      return;
    }
    if (this.find(id)?.install.state === 'installed') {
      await this.check(id);
    }
  }

  async cancelInstall(id: string): Promise<void> {
    try {
      await this.ipc.invoke<void>('llm_install_cancel', { id });
    } catch (error) {
      this.fail(error);
    }
  }

  async setFeature(id: LlmCapability, change: Partial<LlmFeatureSettings>): Promise<void> {
    const previous = this.features();
    const current = previous.find((feature) => feature.id === id);
    if (!current) {
      return;
    }
    const next: LlmFeature = { ...current, ...change };
    this.features.set(previous.map((feature) => (feature.id === id ? next : feature)));
    const config: LlmFeatureSettings = {
      provider: next.provider,
      model: next.model,
      effort: next.effort,
      args: next.args,
    };
    try {
      await this.ipc.invoke<LlmView>('llm_feature_save', { feature: id, config });
    } catch {
      this.features.set(previous);
      this.toasts.show(this.languageService.translate('settings.general.saveFailed'), 'danger');
    }
  }

  async login(id: string): Promise<void> {
    const provider = this.find(id);
    if (!provider || provider.signing) {
      return;
    }
    try {
      await this.ipc.invoke<void>('llm_login', { id });
    } catch (error) {
      this.fail(error);
      return;
    }
    if (provider.canDetectLogin) {
      this.patch(id, { signing: true, signedIn: false, status: 'none', error: '' });
      await this.awaitSignIn(id);
    }
  }

  async logout(id: string): Promise<void> {
    const provider = this.find(id);
    if (!provider) {
      return;
    }
    this.patch(id, { signing: false });
    try {
      await this.ipc.invoke<void>('llm_logout', { id });
    } catch (error) {
      this.fail(error);
    }
    await this.check(id);
  }

  async openProfile(id: string): Promise<void> {
    try {
      await this.ipc.invoke<void>('llm_profile_open', { id });
    } catch {
      this.toasts.show(this.languageService.translate('settings.general.openFailed'), 'danger');
    }
  }

  private find(id: string): LlmProvider | undefined {
    return this.providers().find((provider) => provider.id === id);
  }

  private apply(view: LlmView): void {
    this.providers.set(view.providers.map(this.toProvider.bind(this)));
    this.features.set(view.features);
  }

  private toProvider(view: LlmCliView): LlmProvider {
    const { probe, ...rest } = view;
    const provider = fresh(rest);
    return probe ? { ...provider, ...this.fromProbe(probe) } : provider;
  }

  private timeOf(ms: number): string {
    const date = ms > 0 ? new Date(ms) : new Date();
    return date.toLocaleTimeString(this.languageService.locale());
  }

  private patch(id: string, change: Partial<LlmProvider>): void {
    this.providers.update((list) =>
      list.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );
  }

  private patchInstall(id: string, change: Partial<LlmInstall>): void {
    this.providers.update((list) =>
      list.map((item) =>
        item.id === id ? { ...item, install: { ...item.install, ...change } } : item,
      ),
    );
  }

  private async loadUsage(id: string): Promise<void> {
    this.patch(id, { usageLoading: true, usageError: '' });
    try {
      const usage = await this.ipc.invoke<LlmUsage | null>('llm_usage', { id });
      this.patch(id, { usage: usage ?? null, usageLoading: false });
    } catch (error) {
      this.patch(id, { usageLoading: false, usageError: this.describe(error) });
    }
  }

  private onInstallProgress(id: string, progress: LlmInstallProgress): void {
    if (this.find(id)?.install.state === 'downloading') {
      this.patchInstall(id, progress);
    }
  }

  private async probeProvider(provider: LlmProvider): Promise<void> {
    this.patch(provider.id, { status: 'checking', error: '' });
    try {
      const probe = await this.ipc.invoke<LlmProbe>('llm_probe', { id: provider.id });
      this.patch(provider.id, this.fromProbe(probe));
    } catch (error) {
      this.patch(provider.id, { status: 'error', error: this.describe(error) });
    }
  }

  private fromProbe(probe: LlmProbe): Partial<LlmProvider> {
    return {
      version: probe.version,
      signedIn: probe.ok ? probe.signedIn : null,
      account: probe.account,
      status: probe.ok ? 'ok' : 'error',
      error: probe.error,
      latencyMs: probe.latencyMs,
      checkedAt: this.timeOf(probe.checkedAtMs),
    };
  }

  private async awaitSignIn(id: string): Promise<void> {
    for (let attempt = 0; attempt < SIGN_IN_POLL_LIMIT; attempt++) {
      await pause(SIGN_IN_POLL_MS);
      const provider = this.find(id);
      if (!provider?.signing) {
        return;
      }
      if (await this.pollSignedIn(provider)) {
        return;
      }
    }
    this.patch(id, { signing: false });
  }

  private async pollSignedIn(provider: LlmProvider): Promise<boolean> {
    try {
      const probe = await this.ipc.invoke<LlmProbe>('llm_probe', { id: provider.id });
      if (!probe.ok || probe.signedIn !== true) {
        return false;
      }
      this.patch(provider.id, { ...this.fromProbe(probe), signing: false });
      return true;
    } catch {
      return false;
    }
  }

  private fail(error: unknown): void {
    this.toasts.show(this.describe(error), 'danger');
  }

  private describe(error: unknown): string {
    return ipcErrorMessage(error) ?? this.languageService.translate('settings.llm.unknownError');
  }
}
