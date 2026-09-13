import { Language, LanguageKey } from '@shared/language/language.models';
import { Theme } from '@shared/theme/theme.models';

import { BackendDownload } from './backend.models';

export type SettingsSectionId = 'general' | 'llm' | 'backend' | 'remote' | 'cloud';

export type SettingsFolderTarget = 'workspace' | 'appData';

export interface SettingsSection {
  id: SettingsSectionId;
  icon: string;
  labelKey: LanguageKey;
}

export const MAX_PIPELINES_LIMIT = 5;
export const MAX_TASKS_LIMIT = 10;

export interface PipelineSettings {
  maxPipelines?: number;
  maxTasks?: number;
}

export interface GeneralSettings {
  language?: Language;
  theme?: Theme;
  pipelines?: PipelineSettings;
}

export interface LayoutSettings {
  explorerOpen?: boolean;
  inspectorOpen?: boolean;
  bottomOpen?: boolean;
  rightTab?: 'inspector' | 'assistant';
  explorerSize?: number;
  inspectorSize?: number;
  bottomSize?: number;
}

export interface KeyStoreView {
  secure: boolean;
  portable: boolean;
}

export interface SettingsView {
  general: GeneralSettings;
  layout: LayoutSettings;
  dataDir: string;
  file: string;
  keyStore: KeyStoreView;
}

export type LlmCapability = 'translation' | 'knowledge' | 'assistant';

export type LlmCheckStatus = 'none' | 'checking' | 'ok' | 'error';

export interface LlmInstall extends BackendDownload {
  version: string;
}

export type LlmUsageWindowId = 'session' | 'weekly';

export interface LlmUsageWindow {
  window: LlmUsageWindowId;
  group: string | null;
  usedPercent: number | null;
  resetsAt: string | null;
  resetsNote: string | null;
}

export interface LlmUsage {
  plan: string | null;
  windows: LlmUsageWindow[];
  checkedAtMs: number;
}

export interface LlmInstallProgress {
  receivedBytes: number;
  totalBytes: number;
}

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
  install: LlmInstall;
  probe: LlmProbe | null;
}

export type LlmEffort = 'low' | 'medium' | 'high';

export interface LlmFeatureSettings {
  provider: string | null;
  model: string;
  effort: LlmEffort | null;
  args: string;
}

export interface LlmFeature extends LlmFeatureSettings {
  id: LlmCapability;
}

export interface LlmView {
  providers: LlmCliView[];
  features: LlmFeature[];
}

export interface LlmProbe {
  id: string;
  version: string;
  ok: boolean;
  signedIn: boolean | null;
  account: string;
  error: string;
  latencyMs: number;
  checkedAtMs: number;
}

export interface LlmProvider extends Omit<LlmCliView, 'probe'> {
  version: string;
  signedIn: boolean | null;
  account: string;
  signing: boolean;
  status: LlmCheckStatus;
  error: string;
  latencyMs: number;
  checkedAt: string;
  usage: LlmUsage | null;
  usageLoading: boolean;
  usageError: string;
}

export interface CloudProvider {
  id: string;
  name: string;
  site: string;
  note: LanguageKey;
  baseUrl: string | null;
}
