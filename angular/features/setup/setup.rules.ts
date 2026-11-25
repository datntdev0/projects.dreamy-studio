import { LanguageKey } from '@shared/language/language.models';

// prettier-ignore
import { SetupErrorCode, SetupGroup, SetupGroupId, SetupItem, SetupItemId, SetupItemState, SetupState, SetupStatus, StepItem, Translatable } from './setup.models';

const GROUP_ORDER: SetupGroupId[] = ['runtime', 'toolbox'];

const GROUP_KEYS: Record<SetupGroupId, LanguageKey> = {
  runtime: 'setup.group.runtime',
  toolbox: 'setup.group.toolbox',
};

const ITEM_ICONS: Record<SetupItemId, string> = {
  python: 'terminal',
  ffmpeg: 'film',
  codex: 'prompt',
  claude: 'spark',
  antigravity: 'globe',
};

const ITEM_NAME_KEYS: Record<SetupItemId, LanguageKey> = {
  python: 'setup.item.python',
  ffmpeg: 'setup.item.ffmpeg',
  codex: 'setup.item.codex',
  claude: 'setup.item.claude',
  antigravity: 'setup.item.antigravity',
};

const ITEM_ROLE_KEYS: Record<SetupItemId, LanguageKey> = {
  python: 'setup.role.python',
  ffmpeg: 'setup.role.ffmpeg',
  codex: 'setup.role.cli',
  claude: 'setup.role.cli',
  antigravity: 'setup.role.cli',
};

const STATE_ICONS: Record<SetupItemState, string> = {
  pending: 'clock',
  checking: 'search',
  downloading: 'download',
  verifying: 'shield',
  extracting: 'archive',
  ready: 'check-circle',
  missing: 'info',
  error: 'x-circle',
};

const STATE_KEYS: Record<SetupItemState, LanguageKey> = {
  pending: 'setup.state.pending',
  checking: 'setup.state.checking',
  downloading: 'setup.state.downloading',
  verifying: 'setup.state.verifying',
  extracting: 'setup.state.extracting',
  ready: 'setup.state.ready',
  missing: 'setup.state.missing',
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

export function downloadsOf(items: SetupItem[]): SetupItem[] {
  return items.filter((item) => item.kind === 'download');
}

export function missingOf(items: SetupItem[]): SetupItem[] {
  return items.filter((item) => item.state === 'missing');
}

export function receivedOf(item: SetupItem): number {
  return item.state === 'ready' ? item.total : Math.min(item.received, item.total);
}

export function totalBytes(items: SetupItem[]): number {
  return downloadsOf(items).reduce((sum, item) => sum + item.total, 0);
}

export function receivedBytes(items: SetupItem[]): number {
  return downloadsOf(items).reduce((sum, item) => sum + receivedOf(item), 0);
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
