import { describe, expect, it } from 'vitest';

import { AssistantQuota } from './assistant.models';
// prettier-ignore
import { compactTokens, elapsedDelay, quotaPercent, quotaTone, resetDelay, usagePercent, usageTone, worstTone } from './assistant.usage';

const quota = (status: AssistantQuota['status'], usedPercent: number | null): AssistantQuota => ({
  window: 'session',
  status,
  usedPercent,
  resetsAt: null,
});

describe('assistant.usage', () => {
  it('measures the context percent only when the limit is known', () => {
    expect(usagePercent(84200, 200000)).toBe(42);
    expect(usagePercent(300, 200)).toBe(100);
    expect(usagePercent(10, 0)).toBeNull();
    expect(usagePercent(10, null)).toBeNull();
  });

  it('picks the tone of a percent and the worst of several tones', () => {
    expect(usageTone(null)).toBe('ok');
    expect(usageTone(40)).toBe('ok');
    expect(usageTone(75)).toBe('warning');
    expect(usageTone(90)).toBe('danger');
    expect(worstTone([])).toBe('ok');
    expect(worstTone(['ok', 'danger', 'warning'])).toBe('danger');
  });

  it('reads a quota from its percent or its status', () => {
    expect(quotaPercent(quota('ok', 31.4))).toBe(31);
    expect(quotaPercent(quota('ok', 140))).toBe(100);
    expect(quotaPercent(quota('warning', null))).toBeNull();
    expect(quotaTone(quota('ok', 82))).toBe('warning');
    expect(quotaTone(quota('warning', null))).toBe('warning');
    expect(quotaTone(quota('limited', null))).toBe('danger');
    expect(quotaTone(quota('ok', null))).toBe('ok');
  });

  it('formats token counts compactly', () => {
    expect(compactTokens(950, 'en-US')).toBe('950');
    expect(compactTokens(84200, 'en-US')).toBe('84.2k');
    expect(compactTokens(200000, 'en-US')).toBe('200k');
  });

  it('measures the delay until a reset within a day', () => {
    const now = Date.parse('2026-11-24T08:00:00Z');
    expect(resetDelay('2026-11-24T10:14:00Z', now)).toEqual({ hours: 2, minutes: 14 });
    expect(resetDelay('2026-11-24T07:00:00Z', now)).toEqual({ hours: 0, minutes: 0 });
    expect(resetDelay('2026-11-26T08:00:00Z', now)).toBeNull();
    expect(elapsedDelay('2026-11-24T07:47:30Z', now)).toEqual({ hours: 0, minutes: 12 });
    expect(elapsedDelay('2026-11-22T08:00:00Z', now)).toBeNull();
  });
});
