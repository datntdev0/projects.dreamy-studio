import { Component, computed, inject, signal } from "@angular/core";
import { Badge } from "../../../../components/badge";
import { Icon } from "../../../../components/icon";
import { TabOption, Tabs } from "../../../../components/tabs";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nService } from "../../../core/i18n/i18n.service";
import { CLOUD_PROVIDERS } from "../llm.providers";
import { LlmService, isReady } from "../llm.service";
import { LlmProvider } from "../settings.models";

type LlmTab = "cli" | "cloud";

const LLM_TABS: LlmTab[] = ["cli", "cloud"];

type Tone = "default" | "primary" | "running" | "success" | "warning" | "danger" | "info";

export interface LlmMessage {
  key: I18nKey;
  tone: "ok" | "warn" | "mute";
  params?: Record<string, string | number>;
}

@Component({
  selector: "app-settings-llm",
  standalone: true,
  imports: [Badge, Icon, I18nPipe, Tabs],
  templateUrl: "./llm.component.html",
  host: { "data-testid": "settings-llm" },
})
export class SettingsLlmComponent {
  private readonly llm = inject(LlmService);
  private readonly i18n = inject(I18nService);

  readonly providers = this.llm.providers;
  readonly scanning = this.llm.scanning;
  readonly cloud = CLOUD_PROVIDERS;
  readonly tab = signal<LlmTab>("cli");
  readonly tabOptions = computed(this.buildTabOptions.bind(this));

  constructor() {
    void this.llm.ensureLoaded();
  }

  onTab(value: string): void {
    const tab = LLM_TABS.find((item) => item === value);
    this.tab.set(tab ?? "cli");
  }

  mode(provider: LlmProvider): string {
    if (!provider.found) {
      return "is-missing";
    }
    if (provider.signedIn === false) {
      return "is-login";
    }
    if (provider.status === "error") {
      return "is-error";
    }
    return isReady(provider) ? "is-ready" : "";
  }

  statusTone(provider: LlmProvider): Tone {
    if (!provider.found || provider.signedIn === false) {
      return "warning";
    }
    const tones: Record<string, Tone> = { none: "default", checking: "running", ok: "success", error: "danger" };
    return tones[provider.status];
  }

  statusKey(provider: LlmProvider): I18nKey {
    if (!provider.found) {
      return provider.status === "checking" ? "settings.llm.status.checking" : "settings.llm.status.notInstalled";
    }
    if (provider.signedIn === false) {
      return "settings.llm.status.notSignedIn";
    }
    const keys: Record<string, I18nKey> = {
      none: "settings.llm.status.notChecked",
      checking: "settings.llm.status.checking",
      ok: "settings.llm.status.ready",
      error: "settings.llm.status.error",
    };
    return keys[provider.status];
  }

  message(provider: LlmProvider): LlmMessage {
    if (provider.status === "checking") {
      return { key: "settings.llm.msg.checking", tone: "mute" };
    }
    if (!provider.found) {
      return { key: "settings.llm.msg.notInstalled", tone: "mute" };
    }
    if (provider.signing) {
      return { key: "settings.llm.msg.waiting", tone: "mute" };
    }
    if (provider.signedIn === false) {
      return { key: "settings.llm.msg.needSignIn", tone: "warn" };
    }
    if (provider.status === "ok") {
      return { key: "settings.llm.msg.ok", tone: "ok", params: { ms: provider.latencyMs, time: provider.checkedAt } };
    }
    if (provider.status === "error") {
      return { key: "settings.llm.msg.failed", tone: "warn" };
    }
    return { key: "settings.llm.msg.unchecked", tone: "mute" };
  }

  scan(): void {
    void this.llm.scan();
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

  onPath(provider: LlmProvider, value: string): void {
    void this.llm.setPath(provider.id, value);
  }

  copyPath(provider: LlmProvider): void {
    void this.llm.copyPath(provider.id);
  }

  openProfile(provider: LlmProvider): void {
    void this.llm.openProfile(provider.id);
  }

  canCheck(provider: LlmProvider): boolean {
    return provider.status !== "checking";
  }

  private buildTabOptions(): TabOption[] {
    return [
      { value: "cli", label: this.i18n.translate("settings.llm.cli"), icon: "terminal" },
      { value: "cloud", label: this.i18n.translate("settings.llm.cloud"), icon: "cloud" },
    ];
  }
}
