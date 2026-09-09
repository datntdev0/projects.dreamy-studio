import { signal } from '@angular/core';
// prettier-ignore
import { SetupErrorCode, SetupItem, SetupState, StepItem, StepsView, Translatable } from '@features/setup/setup.models';
import { receivedBytes } from '@features/setup/setup.rules';
import { LanguageKey } from '@shared/language/language.models';

export const MB = 1024 * 1024;
export const TICK_MS = 200;
const SPEED = 9.4 * MB;
const CHECKING_TICKS = 8;
const STEP_TICKS = 4;

export type SetupFailure = 'network' | 'checksum' | 'offline' | null;

const DOWNLOADS: SetupItem[] = [
  {
    id: 'python',
    group: 'runtime',
    version: '3.12.11',
    state: 'pending',
    received: 0,
    total: 41.6 * MB,
  },
  {
    id: 'ffmpeg',
    group: 'toolbox',
    version: '7.1 LGPL',
    state: 'pending',
    received: 0,
    total: 128.3 * MB,
  },
];

function installed(item: SetupItem): SetupItem {
  return { ...item, state: 'ready', received: item.total };
}

function advanceItem(item: SetupItem, budget: number): SetupItem {
  if (item.state === 'pending' || item.state === 'downloading') {
    const received = Math.min(item.total, item.received + budget);
    return { ...item, received, state: received >= item.total ? 'verifying' : 'downloading' };
  }
  if (item.state === 'verifying') return { ...item, state: 'extracting' };
  if (item.state === 'extracting') return { ...item, state: 'ready' };
  return item;
}

function advanceDownloads(items: SetupItem[], budget: number): SetupItem[] {
  const index = items.findIndex((item) => item.state !== 'ready');
  if (index < 0) return items;
  return items.map((item, position) => (position === index ? advanceItem(item, budget) : item));
}

function breakItem(code: SetupErrorCode, item: SetupItem): SetupItem {
  if (code === 'checksum' && item.state === 'verifying')
    return { ...item, state: 'error', received: 0 };
  if (code === 'network' && item.state === 'downloading') return { ...item, state: 'error' };
  return item;
}

function reviveItem(item: SetupItem): SetupItem {
  return item.state === 'error' ? { ...item, state: 'downloading' } : item;
}

function isDone(item: SetupItem): boolean {
  return item.state === 'ready';
}

export interface SetupScenario {
  installed: boolean;
  failure: SetupFailure;
}

export class SetupSimulation {
  readonly state;
  private readonly scenario: SetupScenario;
  private ticks = 0;
  private failed = false;

  constructor(scenario: SetupScenario) {
    this.scenario = scenario;
    this.state = signal<SetupState>(this.initial());
  }

  tick(): void {
    this.ticks += 1;
    const current = this.state();
    if (current.status === 'checking') {
      if (this.ticks > CHECKING_TICKS) this.finishChecking(current);
      return;
    }
    if (current.status !== 'running') return;
    const failure = this.pendingFailure(current);
    if (failure) {
      this.fail(current, failure);
      return;
    }
    this.advance(current);
  }

  pause(): void {
    this.state.update((current) => ({ ...current, status: 'paused', speed: 0 }));
  }

  resume(): void {
    this.state.update((current) => ({
      ...current,
      status: 'running',
      speed: SPEED,
      error: null,
      items: current.items.map(reviveItem),
    }));
  }

  retry(): void {
    if (this.state().status === 'offline') {
      this.failed = true;
      this.recheck();
      return;
    }
    this.resume();
  }

  private recheck(): void {
    this.ticks = 0;
    this.state.set(this.initial());
  }

  private initial(): SetupState {
    const downloads = this.scenario.installed ? DOWNLOADS.map(installed) : DOWNLOADS;
    return {
      status: 'checking',
      appVersion: '0.1.0',
      items: downloads,
      speed: 0,
      error: null,
    };
  }

  private finishChecking(current: SetupState): void {
    if (current.items.every(isDone)) {
      this.state.set({ ...current, status: 'ready' });
      return;
    }
    const offline = this.scenario.failure === 'offline' && !this.failed;
    this.state.set({
      ...current,
      status: offline ? 'offline' : 'running',
      speed: offline ? 0 : SPEED,
    });
  }

  private pendingFailure(current: SetupState): SetupErrorCode | null {
    if (this.failed) return null;
    if (this.scenario.failure === 'network' && receivedBytes(current.items) >= 90 * MB)
      return 'network';
    if (
      this.scenario.failure === 'checksum' &&
      current.items.some((item) => item.state === 'verifying')
    ) {
      return 'checksum';
    }
    return null;
  }

  private fail(current: SetupState, code: SetupErrorCode): void {
    this.failed = true;
    this.state.set({
      ...current,
      status: 'failed',
      speed: 0,
      error: code,
      items: current.items.map(breakItem.bind(null, code)),
    });
  }

  private advance(current: SetupState): void {
    const items = advanceDownloads(current.items, (SPEED * TICK_MS) / 1000);
    const done = items.every(isDone);
    this.state.set({
      ...current,
      items,
      status: done ? 'ready' : 'running',
      speed: done ? 0 : SPEED,
    });
  }
}

export interface StepDefinition {
  id: string;
  label: LanguageKey;
}

export interface StepsScenario {
  eyebrow: LanguageKey;
  title: string;
  titleKey: LanguageKey | null;
  failedTitleKey: LanguageKey | null;
  path: string | null;
  steps: StepDefinition[];
  failAt: string | null;
  failure: Translatable;
}

function pendingStep(definition: StepDefinition): StepItem {
  return { ...definition, state: 'pending' };
}

function stepWith(steps: StepItem[], index: number, state: StepItem['state']): StepItem[] {
  return steps.map((step, position) => (position === index ? { ...step, state } : step));
}

export class StepsSimulation {
  readonly view;
  private readonly scenario: StepsScenario;
  private ticks = 0;
  private failed = false;

  constructor(scenario: StepsScenario) {
    this.scenario = scenario;
    this.view = signal<StepsView>(this.initial());
  }

  tick(): void {
    const view = this.view();
    if (view.status !== 'running') return;
    this.ticks += 1;
    if (this.ticks % STEP_TICKS !== 0) return;
    const running = view.steps.findIndex((step) => step.state === 'running');
    if (running >= 0) {
      this.finish(view, running);
      return;
    }
    const next = view.steps.findIndex((step) => step.state === 'pending');
    if (next < 0) {
      this.view.set({ ...view, status: 'done' });
      return;
    }
    this.view.set({ ...view, steps: stepWith(view.steps, next, 'running') });
  }

  retry(): void {
    this.failed = true;
    this.ticks = 0;
    this.view.update((view) => ({
      ...view,
      titleKey: this.scenario.titleKey,
      status: 'running',
      error: null,
      steps: view.steps.map((step) =>
        step.state === 'error' ? { ...step, state: 'pending' } : step,
      ),
    }));
  }

  private initial(): StepsView {
    return {
      eyebrow: this.scenario.eyebrow,
      title: this.scenario.title,
      titleKey: this.scenario.titleKey,
      path: this.scenario.path,
      steps: this.scenario.steps.map(pendingStep),
      status: 'running',
      error: null,
    };
  }

  private finish(view: StepsView, index: number): void {
    if (!this.failed && view.steps[index].id === this.scenario.failAt) {
      this.view.set({
        ...view,
        titleKey: this.scenario.failedTitleKey ?? this.scenario.titleKey,
        status: 'failed',
        error: this.scenario.failure,
        steps: stepWith(view.steps, index, 'error'),
      });
      return;
    }
    this.view.set({ ...view, steps: stepWith(view.steps, index, 'done') });
  }
}
