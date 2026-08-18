import { Injectable, inject, signal } from "@angular/core";
import { DesktopIpcService } from "../../core/desktop/desktop-ipc.service";
import { I18nService } from "../../core/i18n/i18n.service";
import { ToastService } from "../../core/toast/toast.service";
import { LlmCapability, LlmCliSettings, LlmCliView, LlmFeature, LlmFeatureSettings, LlmProbe, LlmProvider, LlmView } from "./settings.models";

const SIGN_IN_POLL_MS = 3000;
const SIGN_IN_POLL_LIMIT = 100;

export function isReady(provider: LlmProvider): boolean {
  return provider.found && provider.status === "ok" && provider.signedIn !== false;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fresh(view: LlmCliView): LlmProvider {
  return {
    ...view,
    found: false,
    resolvedPath: "",
    version: "",
    signedIn: null,
    account: "",
    signing: false,
    status: "none",
    error: "",
    latencyMs: 0,
    checkedAt: "",
  };
}

@Injectable({ providedIn: "root" })
export class LlmService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly i18n = inject(I18nService);
  private readonly toasts = inject(ToastService);
  private loaded = false;

  readonly providers = signal<LlmProvider[]>([]);
  readonly features = signal<LlmFeature[]>([]);
  readonly scanning = signal(false);

  async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    try {
      this.apply(await this.ipc.invoke<LlmView>("llm_get"));
    } catch {
      this.loaded = false;
      this.toasts.show(this.i18n.translate("settings.llm.loadFailed"), "danger");
      return;
    }
    await this.scan();
  }

  async scan(): Promise<void> {
    if (this.scanning()) {
      return;
    }
    this.scanning.set(true);
    try {
      await Promise.all(this.providers().map(this.probeProvider.bind(this)));
    } finally {
      this.scanning.set(false);
    }
  }

  async check(id: string): Promise<void> {
    const provider = this.find(id);
    if (!provider || provider.status === "checking") {
      return;
    }
    await this.probeProvider(provider);
  }

  async setPath(id: string, path: string): Promise<void> {
    const provider = this.find(id);
    if (!provider) {
      return;
    }
    const typed = path.trim();
    const value = typed === provider.resolvedPath && !provider.path ? "" : typed;
    if (value === provider.path) {
      return;
    }
    this.patch(id, { path: value, status: "none", error: "" });
    if (await this.saveProvider(id)) {
      await this.check(id);
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
    const config: LlmFeatureSettings = { provider: next.provider, model: next.model, effort: next.effort, args: next.args };
    try {
      await this.ipc.invoke<LlmView>("llm_feature_save", { feature: id, config });
    } catch {
      this.features.set(previous);
      this.toasts.show(this.i18n.translate("settings.general.saveFailed"), "danger");
    }
  }

  async login(id: string): Promise<void> {
    const provider = this.find(id);
    if (!provider || provider.signing) {
      return;
    }
    try {
      await this.ipc.invoke<void>("llm_login", { id });
    } catch (error) {
      this.fail(error);
      return;
    }
    if (provider.canDetectLogin) {
      this.patch(id, { signing: true, signedIn: false, status: "none", error: "" });
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
      await this.ipc.invoke<void>("llm_logout", { id });
    } catch (error) {
      this.fail(error);
    }
    await this.check(id);
  }

  async openProfile(id: string): Promise<void> {
    try {
      await this.ipc.invoke<void>("llm_profile_open", { id });
    } catch {
      this.toasts.show(this.i18n.translate("settings.general.openFailed"), "danger");
    }
  }

  async copyPath(id: string): Promise<void> {
    const provider = this.find(id);
    if (!provider) {
      return;
    }
    try {
      await navigator.clipboard.writeText(provider.resolvedPath);
      this.toasts.show(this.i18n.translate("settings.llm.copied"));
    } catch {
      this.toasts.show(this.i18n.translate("settings.llm.copyFailed"), "warning");
    }
  }

  private find(id: string): LlmProvider | undefined {
    return this.providers().find((provider) => provider.id === id);
  }

  private apply(view: LlmView): void {
    this.providers.set(view.providers.map(fresh));
    this.features.set(view.features);
  }

  private patch(id: string, change: Partial<LlmProvider>): void {
    this.providers.update((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)));
  }

  private async probeProvider(provider: LlmProvider): Promise<void> {
    this.patch(provider.id, { status: "checking", error: "" });
    try {
      const probe = await this.ipc.invoke<LlmProbe>("llm_probe", { id: provider.id });
      this.patch(provider.id, this.fromProbe(probe));
    } catch (error) {
      this.patch(provider.id, { status: "error", error: this.describe(error) });
    }
  }

  private fromProbe(probe: LlmProbe): Partial<LlmProvider> {
    const status = !probe.found ? "none" : probe.ok ? "ok" : "error";
    return {
      found: probe.found,
      resolvedPath: probe.path,
      version: probe.version,
      signedIn: probe.found && probe.ok ? probe.signedIn : null,
      account: probe.account,
      status,
      error: probe.error,
      latencyMs: probe.latencyMs,
      checkedAt: new Date().toLocaleTimeString(this.i18n.locale()),
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
      const probe = await this.ipc.invoke<LlmProbe>("llm_probe", { id: provider.id });
      if (!probe.ok || probe.signedIn !== true) {
        return false;
      }
      this.patch(provider.id, { ...this.fromProbe(probe), signing: false });
      return true;
    } catch {
      return false;
    }
  }

  private async saveProvider(id: string): Promise<boolean> {
    const provider = this.find(id);
    if (!provider) {
      return false;
    }
    const settings: LlmCliSettings = { path: provider.path };
    try {
      await this.ipc.invoke<LlmView>("llm_provider_save", { id, provider: settings });
      return true;
    } catch {
      this.toasts.show(this.i18n.translate("settings.general.saveFailed"), "danger");
      return false;
    }
  }

  private fail(error: unknown): void {
    this.toasts.show(this.describe(error), "danger");
  }

  private describe(error: unknown): string {
    const cause = error instanceof Error ? (error as { cause?: unknown }).cause : error;
    return typeof cause === "string" ? cause : this.i18n.translate("settings.llm.unknownError");
  }
}
