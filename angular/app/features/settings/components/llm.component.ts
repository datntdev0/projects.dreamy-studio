import { Component, inject } from "@angular/core";
import { Badge } from "../../../../components/badge";
import { Icon } from "../../../../components/icon";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { CLOUD_PROVIDERS } from "../llm.providers";
import { LlmService, isReady } from "../llm.service";
import { LlmProvider } from "../settings.models";

type Tone = "default" | "primary" | "running" | "success" | "warning" | "danger" | "info";

export interface LlmMessage {
  key: I18nKey;
  tone: "ok" | "warn" | "mute";
  params?: Record<string, string | number>;
}

@Component({
  selector: "app-settings-llm",
  standalone: true,
  imports: [Badge, Icon, I18nPipe],
  templateUrl: "./llm.component.html",
  host: { "data-testid": "settings-llm" },
})
export class SettingsLlmComponent {
  private readonly llm = inject(LlmService);

  readonly providers = this.llm.providers;
  readonly defaultId = this.llm.defaultId;
  readonly ready = this.llm.ready;
  readonly scanning = this.llm.scanning;
  readonly cloud = CLOUD_PROVIDERS;

  constructor() {
    void this.llm.ensureLoaded();
  }

  isDefault(provider: LlmProvider): boolean {
    return provider.id === this.defaultId();
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
    if (!provider.enabled) {
      return "default";
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
    if (!provider.enabled) {
      return "settings.llm.status.disabled";
    }
    const keys: Record<string, I18nKey> = {
      none: "settings.llm.status.notChecked",
      checking: "settings.llm.status.checking",
      ok: "settings.llm.status.ready",
      error: "settings.llm.status.error",
    };
    return keys[provider.status];
  }

  capKey(cap: string): I18nKey {
    return `settings.llm.cap.${cap}` as I18nKey;
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

  makeDefault(provider: LlmProvider): void {
    void this.llm.setDefault(provider.id);
  }

  onDefault(id: string): void {
    if (id) {
      void this.llm.setDefault(id);
    }
  }

  onEnable(provider: LlmProvider, enabled: boolean): void {
    void this.llm.setEnabled(provider.id, enabled);
  }

  onPath(provider: LlmProvider, value: string): void {
    void this.llm.setPath(provider.id, value);
  }

  onArgs(provider: LlmProvider, value: string): void {
    void this.llm.setArgs(provider.id, value);
  }

  copyPath(provider: LlmProvider): void {
    void this.llm.copyPath(provider.id);
  }

  openProfile(provider: LlmProvider): void {
    void this.llm.openProfile(provider.id);
  }

  canCheck(provider: LlmProvider): boolean {
    return provider.enabled && provider.status !== "checking";
  }

  canDefault(provider: LlmProvider): boolean {
    return isReady(provider) && !this.isDefault(provider);
  }
}
