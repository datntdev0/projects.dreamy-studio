import { describe, expect, it } from 'vitest';

import { SetupItem, SetupState, StepItem } from './setup.models';
// prettier-ignore
import { durationText, groupsOf, itemPercent, missingOf, receivedBytes, remainingSeconds, setupPercent, stepsPercent, totalBytes } from './setup.rules';

function item(overrides: Partial<SetupItem> = {}): SetupItem {
  return {
    id: 'python',
    group: 'runtime',
    kind: 'download',
    version: '3.12.11',
    state: 'downloading',
    received: 0,
    total: 100,
    ...overrides,
  };
}

function cli(overrides: Partial<SetupItem> = {}): SetupItem {
  return item({
    id: 'codex',
    group: 'toolbox',
    kind: 'detect',
    total: 0,
    state: 'ready',
    ...overrides,
  });
}

function state(overrides: Partial<SetupState> = {}): SetupState {
  return {
    status: 'running',
    appVersion: '0.1.0',
    items: [
      item({ received: 50 }),
      item({ id: 'ffmpeg', group: 'toolbox', state: 'pending', total: 300 }),
      cli(),
    ],
    speed: 10,
    error: null,
    ...overrides,
  };
}

describe('setup.rules', () => {
  it('counts bytes of downloads only', () => {
    const items = [item({ state: 'ready' }), item({ received: 150 }), cli({ total: 999 })];
    expect(totalBytes(items)).toBe(200);
    expect(receivedBytes(items)).toBe(200);
  });

  it('computes item and overall percent', () => {
    expect(itemPercent(item({ received: 33 }))).toBe(33);
    expect(itemPercent(item({ total: 0 }))).toBe(0);
    expect(setupPercent(state())).toBe(12);
    expect(setupPercent(state({ status: 'ready' }))).toBe(100);
  });

  it('estimates remaining seconds only while running', () => {
    expect(remainingSeconds(state())).toBe(35);
    expect(remainingSeconds(state({ status: 'paused' }))).toBeNull();
    expect(remainingSeconds(state({ speed: 0 }))).toBeNull();
  });

  it('formats durations in seconds or minutes', () => {
    expect(durationText(42)).toEqual({ key: 'setup.eta.seconds', params: { count: 42 } });
    expect(durationText(61)).toEqual({ key: 'setup.eta.minutes', params: { count: 2 } });
  });

  it('groups items as runtime then toolbox and lists missing tools', () => {
    const items = [cli({ state: 'missing' }), item()];
    expect(groupsOf(items).map((group) => group.id)).toEqual(['runtime', 'toolbox']);
    expect(missingOf(items).map((entry) => entry.id)).toEqual(['codex']);
  });

  it('computes steps percent from done steps', () => {
    const steps: StepItem[] = [
      { id: 'a', label: 'loading.step.application', state: 'done' },
      { id: 'b', label: 'loading.step.backend', state: 'running' },
    ];
    expect(stepsPercent(steps)).toBe(50);
  });
});
