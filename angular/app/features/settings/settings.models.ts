import { Language } from "../../core/i18n/i18n.models";
import { I18nKey } from "../../core/i18n/i18n.models";
import { Theme } from "../../core/theme/theme.models";

export type SettingsSectionId = "general" | "llm" | "backend" | "analysis" | "tts" | "speech";

export type SettingsFolderTarget = "workspace" | "appData";

export interface SettingsSection {
  id: SettingsSectionId;
  icon: string;
  labelKey: I18nKey;
}

export interface GeneralSettings {
  language?: Language;
  theme?: Theme;
}

export interface LayoutSettings {
  explorerOpen?: boolean;
  inspectorOpen?: boolean;
  bottomOpen?: boolean;
  rightTab?: "inspector" | "assistant";
  explorerSize?: number;
  inspectorSize?: number;
  bottomSize?: number;
}

export interface SettingsView {
  general: GeneralSettings;
  layout: LayoutSettings;
  dataDir: string;
  file: string;
}

export type LlmCapability = "translation" | "knowledge" | "assistant";

export type LlmCheckStatus = "none" | "checking" | "ok" | "error";

export interface LlmCliView {
  id: string;
  name: string;
  command: string;
  caps: LlmCapability[];
  profileEnv: string | null;
  profileDir: string | null;
  loginCommand: string;
  canLogout: boolean;
  canDetectLogin: boolean;
  path: string;
}

export interface LlmView {
  providers: LlmCliView[];
}

export interface LlmCliSettings {
  path: string;
}

export interface LlmProbe {
  id: string;
  found: boolean;
  path: string;
  version: string;
  ok: boolean;
  signedIn: boolean | null;
  account: string;
  error: string;
  latencyMs: number;
}

export interface LlmProvider extends LlmCliView {
  found: boolean;
  resolvedPath: string;
  version: string;
  signedIn: boolean | null;
  account: string;
  signing: boolean;
  status: LlmCheckStatus;
  error: string;
  latencyMs: number;
  checkedAt: string;
}

export interface CloudProvider {
  id: string;
  name: string;
  site: string;
  note: I18nKey;
  baseUrl: string | null;
}
