import { AssistantQuota, AssistantQuotaStatus } from './assistant.models';

export type UsageTone = 'ok' | 'warning' | 'danger';

export interface ResetDelay {
  hours: number;
  minutes: number;
}

const WARNING_PERCENT = 75;
const DANGER_PERCENT = 90;
const THOUSAND = 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MINUTES = 24 * 60;
const TONE_RANK: Record<UsageTone, number> = { ok: 0, warning: 1, danger: 2 };
const STATUS_TONES: Record<AssistantQuotaStatus, UsageTone> = {
  ok: 'ok',
  warning: 'warning',
  limited: 'danger',
};

export function usagePercent(used: number, max: number | null): number | null {
  if (max === null || max <= 0) {
    return null;
  }
  return Math.min(100, Math.round((used / max) * 100));
}

export function usageTone(percent: number | null): UsageTone {
  if (percent === null) {
    return 'ok';
  }
  if (percent >= DANGER_PERCENT) {
    return 'danger';
  }
  return percent >= WARNING_PERCENT ? 'warning' : 'ok';
}

export function worstTone(tones: UsageTone[]): UsageTone {
  return tones.reduce<UsageTone>(
    (worst, tone) => (TONE_RANK[tone] > TONE_RANK[worst] ? tone : worst),
    'ok',
  );
}

export function quotaPercent(quota: AssistantQuota): number | null {
  if (quota.usedPercent === null) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round(quota.usedPercent)));
}

export function quotaTone(quota: AssistantQuota): UsageTone {
  return worstTone([STATUS_TONES[quota.status], usageTone(quotaPercent(quota))]);
}

export function compactTokens(value: number, locale: string): string {
  if (value < THOUSAND) {
    return new Intl.NumberFormat(locale).format(value);
  }
  const digits = value < 100 * THOUSAND ? 1 : 0;
  const scaled = new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(
    value / THOUSAND,
  );
  return `${scaled}k`;
}

function delayOf(minutes: number): ResetDelay | null {
  if (minutes >= DAY_MINUTES) {
    return null;
  }
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

export function resetDelay(resetsAt: string, now: number): ResetDelay | null {
  return delayOf(Math.max(0, Math.ceil((Date.parse(resetsAt) - now) / MINUTE_MS)));
}

export function elapsedDelay(since: string, now: number): ResetDelay | null {
  return delayOf(Math.max(0, Math.floor((now - Date.parse(since)) / MINUTE_MS)));
}
