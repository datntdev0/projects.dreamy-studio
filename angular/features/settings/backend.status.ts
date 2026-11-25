import { LanguageKey, LanguageParams } from '@shared/language/language.models';

import { BackendServer, BackendStatus } from './backend.models';
import { formatUptime } from './backend.rules';

export type Tone = 'default' | 'primary' | 'running' | 'success' | 'warning' | 'danger' | 'info';

export type BackendKind = 'local' | 'remote';

export interface BackendMessage {
  key: LanguageKey;
  tone: 'ok' | 'warn' | 'mute';
  busy: boolean;
  params?: LanguageParams;
}

export interface BackendCopy {
  tabs: LanguageKey;
  gpuNone: LanguageKey;
  deviceNoGpu: LanguageKey;
  cpuWarn: LanguageKey;
  modelsIntro: LanguageKey;
  modelsEmpty: LanguageKey;
  note: LanguageKey;
  folderHint: LanguageKey;
}

export const BACKEND_COPY: Record<BackendKind, BackendCopy> = {
  local: {
    tabs: 'settings.backend.tabs',
    gpuNone: 'settings.backend.gpu.none',
    deviceNoGpu: 'settings.backend.device.noGpu',
    cpuWarn: 'settings.backend.model.cpuWarn',
    modelsIntro: 'settings.backend.models.intro',
    modelsEmpty: 'settings.backend.models.empty',
    note: 'settings.backend.note',
    folderHint: 'settings.backend.folder.hint',
  },
  remote: {
    tabs: 'settings.remote.tabs',
    gpuNone: 'settings.remote.gpu.none',
    deviceNoGpu: 'settings.remote.device.noGpu',
    cpuWarn: 'settings.remote.model.cpuWarn',
    modelsIntro: 'settings.remote.models.intro',
    modelsEmpty: 'settings.remote.models.empty',
    note: 'settings.remote.note',
    folderHint: 'settings.remote.folder.hint',
  },
};

export const MISSING = '—';

const SERVER_TONES: Record<BackendStatus, Tone> = {
  running: 'success',
  starting: 'running',
  stopped: 'default',
  error: 'danger',
};

const SERVER_MODES: Record<BackendStatus, string> = {
  running: 'is-ready',
  starting: 'is-missing',
  stopped: 'is-missing',
  error: 'is-error',
};

export function message(
  key: LanguageKey,
  tone: BackendMessage['tone'],
  busy = false,
  params?: LanguageParams,
): BackendMessage {
  return { key, tone, busy, params };
}

export function orMissing(value: string): string {
  return value || MISSING;
}

export function serverTone(server: BackendServer): Tone {
  return SERVER_TONES[server.status];
}

export function serverMode(server: BackendServer): string {
  return SERVER_MODES[server.status];
}

export function serverUptime(server: BackendServer): string {
  return server.status === 'running' ? formatUptime(server.startedAt, Date.now()) : MISSING;
}

export function timeOf(checkedAt: string, locale: string): string {
  const time = Date.parse(checkedAt);
  return Number.isFinite(time) ? new Date(time).toLocaleTimeString(locale) : checkedAt;
}

export function healthMessage(server: BackendServer, locale: string): BackendMessage {
  return message('settings.backend.msg.ok', 'ok', false, {
    ms: server.latencyMs ?? 0,
    time: timeOf(server.checkedAt, locale),
  });
}
