import { LanguageKey, LanguageParams } from '@shared/language/language.models';

export interface Translatable {
  key: LanguageKey;
  params?: LanguageParams;
}

export type SetupGroupId = 'runtime' | 'toolbox';

export type SetupItemId = 'python' | 'ffmpeg';

export type SetupItemState =
  'pending' | 'downloading' | 'verifying' | 'extracting' | 'ready' | 'error';

export type SetupStatus = 'checking' | 'running' | 'paused' | 'failed' | 'offline' | 'ready';

export type SetupErrorCode = 'network' | 'checksum' | 'disk_full' | 'extract' | 'io';

export type SetupFailureCode = SetupErrorCode | 'offline' | 'busy';

export interface SetupItem {
  id: SetupItemId;
  group: SetupGroupId;
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

export type SetupPhase = 'checking' | 'running';

export interface SetupSnapshotEvent {
  kind: 'snapshot';
  status: SetupPhase;
  items: SetupItem[];
}

export interface SetupPhaseEvent {
  kind: 'phase';
  status: SetupPhase;
}

export interface SetupItemEvent {
  kind: 'item';
  item: SetupItem;
}

export interface SetupProgressEvent {
  kind: 'progress';
  id: SetupItemId;
  received: number;
  total: number;
  speed: number;
}

export type SetupEvent = SetupSnapshotEvent | SetupPhaseEvent | SetupItemEvent | SetupProgressEvent;

export interface SetupOutcome {
  result: 'ready' | 'paused';
}

export interface SetupFailure {
  code: SetupFailureCode;
  detail: string;
}

export type StartupStepId = 'application' | 'backend';

export type StartupErrorCode =
  | 'db_corrupt'
  | 'db_newer_version'
  | 'db_migration_failed'
  | 'db_io'
  | 'logs_failed'
  | 'backend_missing'
  | 'backend_start_failed'
  | 'backend_timeout';

export interface StartupEvent {
  kind: 'step';
  id: StartupStepId;
  state: Exclude<StepState, 'pending'>;
  detail?: string;
}

export interface StartupFailure {
  step: StartupStepId;
  code: StartupErrorCode;
  detail: string;
}
