import { LanguageKey } from '@shared/language/language.models';

// prettier-ignore
import { SetupErrorCode, SetupEvent, SetupFailure, SetupGroup, SetupGroupId, SetupItem, SetupItemId, SetupItemState, SetupState, SetupStatus, StartupErrorCode, StartupEvent, StartupStepId, StepItem, StepsView, Translatable } from './setup.models';

const GROUP_ORDER: SetupGroupId[] = ['runtime', 'toolbox'];

const GROUP_KEYS: Record<SetupGroupId, LanguageKey> = {
  runtime: 'setup.group.runtime',
  toolbox: 'setup.group.toolbox',
};

const ITEM_ICONS: Record<SetupItemId, string> = {
  python: 'terminal',
  ffmpeg: 'film',
};

const ITEM_NAME_KEYS: Record<SetupItemId, LanguageKey> = {
  python: 'setup.item.python',
  ffmpeg: 'setup.item.ffmpeg',
};

const ITEM_ROLE_KEYS: Record<SetupItemId, LanguageKey> = {
  python: 'setup.role.python',
  ffmpeg: 'setup.role.ffmpeg',
};

const STATE_ICONS: Record<SetupItemState, string> = {
  pending: 'clock',
  downloading: 'download',
  verifying: 'shield',
  extracting: 'archive',
  ready: 'check-circle',
  error: 'x-circle',
};

const STATE_KEYS: Record<SetupItemState, LanguageKey> = {
  pending: 'setup.state.pending',
  downloading: 'setup.state.downloading',
  verifying: 'setup.state.verifying',
  extracting: 'setup.state.extracting',
  ready: 'setup.state.ready',
  error: 'setup.state.error',
};

const TITLE_KEYS: Record<SetupStatus, LanguageKey> = {
  checking: 'setup.title.checking',
  running: 'setup.title.running',
  paused: 'setup.title.paused',
  failed: 'setup.title.failed',
  offline: 'setup.title.offline',
  ready: 'setup.title.ready',
};

const ERROR_KEYS: Record<SetupErrorCode, LanguageKey> = {
  network: 'setup.error.network',
  checksum: 'setup.error.checksum',
  disk_full: 'setup.error.disk_full',
  extract: 'setup.error.extract',
  io: 'setup.error.io',
};

const SECONDS_PER_MINUTE = 60;

export function groupKey(id: SetupGroupId): LanguageKey {
  return GROUP_KEYS[id];
}

export function itemIcon(id: SetupItemId): string {
  return ITEM_ICONS[id];
}

export function itemNameKey(id: SetupItemId): LanguageKey {
  return ITEM_NAME_KEYS[id];
}

export function itemRoleKey(id: SetupItemId): LanguageKey {
  return ITEM_ROLE_KEYS[id];
}

export function stateIcon(state: SetupItemState): string {
  return STATE_ICONS[state];
}

export function stateKey(state: SetupItemState): LanguageKey {
  return STATE_KEYS[state];
}

export function titleKey(status: SetupStatus): LanguageKey {
  return TITLE_KEYS[status];
}

export function errorKey(code: SetupErrorCode): LanguageKey {
  return ERROR_KEYS[code];
}

export function groupsOf(items: SetupItem[]): SetupGroup[] {
  return GROUP_ORDER.map((id) => ({ id, items: items.filter((item) => item.group === id) })).filter(
    (group) => group.items.length > 0,
  );
}

export function receivedOf(item: SetupItem): number {
  return item.state === 'ready' ? item.total : Math.min(item.received, item.total);
}

export function totalBytes(items: SetupItem[]): number {
  return items.reduce((sum, item) => sum + item.total, 0);
}

export function receivedBytes(items: SetupItem[]): number {
  return items.reduce((sum, item) => sum + receivedOf(item), 0);
}

export function ratioPercent(received: number, total: number): number {
  return total > 0 ? Math.floor((received / total) * 100) : 0;
}

export function itemPercent(item: SetupItem): number {
  return ratioPercent(receivedOf(item), item.total);
}

export function setupPercent(state: SetupState): number {
  if (state.status === 'ready') return 100;
  return ratioPercent(receivedBytes(state.items), totalBytes(state.items));
}

export function remainingSeconds(state: SetupState): number | null {
  if (state.status !== 'running' || state.speed <= 0) return null;
  const remaining = totalBytes(state.items) - receivedBytes(state.items);
  return remaining > 0 ? Math.ceil(remaining / state.speed) : null;
}

export function durationText(seconds: number): Translatable {
  if (seconds < SECONDS_PER_MINUTE) return { key: 'setup.eta.seconds', params: { count: seconds } };
  return { key: 'setup.eta.minutes', params: { count: Math.ceil(seconds / SECONDS_PER_MINUTE) } };
}

export function isBusy(status: SetupStatus): boolean {
  return status === 'checking' || status === 'running';
}

export function stepsPercent(steps: StepItem[]): number {
  const done = steps.filter((step) => step.state === 'done').length;
  return ratioPercent(done, steps.length);
}

const STARTUP_STEP_KEYS: Record<StartupStepId, LanguageKey> = {
  application: 'loading.step.application',
  backend: 'loading.step.backend',
};

const STARTUP_CAUSE_KEYS: Record<StartupErrorCode, LanguageKey> = {
  db_corrupt: 'loading.cause.db_corrupt',
  db_newer_version: 'loading.cause.db_newer_version',
  db_migration_failed: 'loading.cause.db_migration_failed',
  db_io: 'loading.cause.db_io',
  logs_failed: 'loading.cause.logs_failed',
  backend_missing: 'loading.cause.backend_missing',
  backend_start_failed: 'loading.cause.backend_start_failed',
  backend_timeout: 'loading.cause.backend_timeout',
};

const STARTUP_ORDER: StartupStepId[] = ['application', 'backend'];

export function initialSetupState(appVersion: string): SetupState {
  return { status: 'checking', appVersion, items: [], speed: 0, error: null };
}

function replaceItem(items: SetupItem[], item: SetupItem): SetupItem[] {
  return items.map((current) => (current.id === item.id ? item : current));
}

function progressItem(items: SetupItem[], id: SetupItemId, received: number): SetupItem[] {
  return items.map((item) => (item.id === id ? { ...item, state: 'downloading', received } : item));
}

export function applySetupEvent(state: SetupState, event: SetupEvent): SetupState {
  switch (event.kind) {
    case 'snapshot':
      return { ...state, status: event.status, items: event.items, speed: 0, error: null };
    case 'phase':
      return { ...state, status: event.status };
    case 'item':
      return { ...state, items: replaceItem(state.items, event.item) };
    case 'progress':
      return {
        ...state,
        speed: event.speed,
        items: progressItem(state.items, event.id, event.received),
      };
  }
}

export function failedSetupState(state: SetupState, failure: SetupFailure): SetupState {
  if (failure.code === 'offline') {
    return { ...state, status: 'offline', speed: 0, error: null };
  }
  const error: SetupErrorCode = failure.code === 'busy' ? 'io' : failure.code;
  return { ...state, status: 'failed', speed: 0, error };
}

export function isSetupFailure(value: unknown): value is SetupFailure {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate['code'] === 'string' && typeof candidate['detail'] === 'string';
}

export function canContinue(state: SetupState): boolean {
  return state.status === 'ready';
}

export function initialStartupView(): StepsView {
  return {
    eyebrow: 'startup.eyebrow',
    title: '',
    titleKey: 'startup.title',
    path: null,
    steps: STARTUP_ORDER.map((id) => ({ id, label: STARTUP_STEP_KEYS[id], state: 'pending' })),
    status: 'running',
    error: null,
  };
}

export function applyStartupEvent(view: StepsView, event: StartupEvent): StepsView {
  return {
    ...view,
    steps: view.steps.map((step) =>
      step.id === event.id ? { ...step, state: event.state } : step,
    ),
  };
}

export function failedStartupView(view: StepsView, code: StartupErrorCode | null): StepsView {
  return {
    ...view,
    titleKey: 'startup.titleFailed',
    status: 'failed',
    error: { key: code ? STARTUP_CAUSE_KEYS[code] : 'loading.cause.backend_start_failed' },
  };
}

export function isStartupFailure(value: unknown): value is { code: StartupErrorCode } {
  if (typeof value !== 'object' || value === null) return false;
  const code = (value as Record<string, unknown>)['code'];
  return typeof code === 'string' && code in STARTUP_CAUSE_KEYS;
}
