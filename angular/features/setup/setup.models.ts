import { LanguageKey, LanguageParams } from '@shared/language/language.models';

export interface Translatable {
  key: LanguageKey;
  params?: LanguageParams;
}

export type SetupGroupId = 'runtime' | 'toolbox';

export type SetupItemId = 'python' | 'ffmpeg' | 'codex' | 'claude' | 'antigravity';

export type SetupItemKind = 'download' | 'detect';

export type SetupItemState =
  | 'pending'
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'ready'
  | 'missing'
  | 'error';

export type SetupStatus = 'checking' | 'running' | 'paused' | 'failed' | 'offline' | 'ready';

export type SetupErrorCode = 'network' | 'checksum' | 'disk_full' | 'extract';

export interface SetupItem {
  id: SetupItemId;
  group: SetupGroupId;
  kind: SetupItemKind;
  version: string | null;
  state: SetupItemState;
  received: number;
  total: number;
}

export interface SetupState {
  status: SetupStatus;
  appVersion: string;
  items: SetupItem[];
  speed: number;
  error: SetupErrorCode | null;
}

export interface SetupGroup {
  id: SetupGroupId;
  items: SetupItem[];
}

export type StepState = 'pending' | 'running' | 'done' | 'error';

export type StepsStatus = 'running' | 'failed' | 'done';

export interface StepItem {
  id: string;
  label: LanguageKey;
  state: StepState;
}

export interface StepsView {
  eyebrow: LanguageKey;
  title: string;
  titleKey: LanguageKey | null;
  path: string | null;
  steps: StepItem[];
  status: StepsStatus;
  error: Translatable | null;
}
