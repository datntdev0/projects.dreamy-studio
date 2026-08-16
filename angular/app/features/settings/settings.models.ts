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
