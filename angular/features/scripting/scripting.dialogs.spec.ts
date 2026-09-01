import { signal, Type, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { byId, click } from '@testing/dom';
import { mount, Mounted, settle } from '@testing/exercise';
import { paragraphs, script, scriptBlock, scriptUnit } from '@testing/scripting';
import { setupApp } from '@testing/service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScriptingDefaultDialog } from './components/default.dialog';
import { ScriptingResetDialog } from './components/reset.dialog';
import { buildContext } from './scripting.context';
import { ScriptingDialogsService } from './scripting.dialogs.service';
import { ScriptContext, ScriptUnit } from './scripting.models';
import { emptyView } from './scripting.rules';
import { ScriptingService } from './scripting.service';

const PROJECT = 1;

const COMPLETE_BLOCKS = [
  scriptBlock({ id: 'B1', text: 'Title', type: 'heading' }),
  scriptBlock({ id: 'B2', text: 'Body.', ref: '1.1' }),
];

function unitOf(id: number, overrides: Partial<ScriptUnit> = {}): ScriptUnit {
  return scriptUnit({ id: `U0${id}`, no: id, ch: id, title: `T${id}`, ...overrides });
}

function contextOf(units: ScriptUnit[], active: string) {
  return buildContext({
    projectId: PROJECT,
    script: script(units),
    view: { ...emptyView(), unit: active },
    kb: null,
    hasNovel: false,
    chapters: { 1: paragraphs('Body.') },
    novelChapters: 0,
  });
}

interface Harness {
  context: WritableSignal<ScriptContext | null>;
  scripting: ReturnType<typeof fakeScripting>;
  dialogs: ScriptingDialogsService;
}

function fakeScripting(context: WritableSignal<ScriptContext | null>) {
  return {
    contextOf: () => context(),
    resetUnits: vi.fn(() => 2),
    resettableUnitsOf: vi.fn((): ScriptUnit[] => []),
    applyDefault: vi.fn(() => true),
  };
}

function toastTexts(): string[] {
  return TestBed.inject(ToastService)
    .items()
    .map((item) => item.message);
}

async function open<T>(
  mounted: Mounted<T>,
  harness: Harness,
  opener: (dialogs: ScriptingDialogsService) => void,
): Promise<void> {
  opener(harness.dialogs);
  await settle(mounted.fixture);
}

describe('scripting dialogs', () => {
  let harness: Harness;

  function prime(): void {
    TestBed.inject(LanguageService).setLanguage('en');
    harness.dialogs = TestBed.inject(ScriptingDialogsService);
  }

  function start<T>(type: Type<T>): Promise<Mounted<T>> {
    return mount(type, {}, prime);
  }

  beforeEach(() => {
    setupApp();
    const context = signal<ScriptContext | null>(null);
    const scripting = fakeScripting(context);
    TestBed.configureTestingModule({
      providers: [{ provide: ScriptingService, useValue: scripting }],
    });
    harness = { context, scripting, dialogs: null as never };
  });

  describe('reset to default', () => {
    const units = [unitOf(1, { blocks: COMPLETE_BLOCKS }), unitOf(2)];

    it('resets only the open unit when there is nothing else to reset', async () => {
      harness.context.set(contextOf(units, 'U01'));
      harness.scripting.resettableUnitsOf.mockReturnValue([units[0]]);
      harness.scripting.resetUnits.mockReturnValue(1);
      const mounted = await start(ScriptingResetDialog);
      await open(mounted, harness, (dialogs) => dialogs.openReset(PROJECT));
      const all = byId(mounted.root, 'sc-reset-scope-input-all') as HTMLInputElement;
      expect(all.disabled).toBe(true);
      expect(byId(mounted.root, 'sc-reset-scope-all')?.classList).toContain('is-off');
      expect(byId(mounted.root, 'sc-reset-scope-unit')?.textContent).toContain(
        '2 blocks currently',
      );
      click(mounted.root, 'sc-reset-go-btn');
      await settle(mounted.fixture);
      expect(harness.scripting.resetUnits).toHaveBeenCalledWith(PROJECT, 'unit');
      expect(toastTexts()).toContain('Reset 1 chapter to default.');
    });

    it('resets every unit that has a source after switching the scope', async () => {
      harness.context.set(contextOf(units, 'U01'));
      harness.scripting.resettableUnitsOf.mockReturnValue(units);
      const mounted = await start(ScriptingResetDialog);
      await open(mounted, harness, (dialogs) => dialogs.openReset(PROJECT));
      click(mounted.root, 'sc-reset-scope-input-all');
      await settle(mounted.fixture);
      expect(byId(mounted.root, 'sc-reset-scope-all')?.textContent).toContain('2 chapters');
      click(mounted.root, 'sc-reset-go-btn');
      await settle(mounted.fixture);
      expect(harness.scripting.resetUnits).toHaveBeenCalledWith(PROJECT, 'all');
      expect(toastTexts()).toContain('Reset 2 chapters to default.');
    });

    it('warns when nothing could be reset', async () => {
      harness.context.set(contextOf(units, 'U01'));
      harness.scripting.resetUnits.mockReturnValue(0);
      const mounted = await start(ScriptingResetDialog);
      await open(mounted, harness, (dialogs) => dialogs.openReset(PROJECT));
      click(mounted.root, 'sc-reset-go-btn');
      await settle(mounted.fixture);
      expect(toastTexts()).toContain('No source to reset from.');
    });

    it('closes without a unit to reset', async () => {
      harness.context.set(contextOf([], 'U01'));
      const mounted = await start(ScriptingResetDialog);
      await open(mounted, harness, (dialogs) => dialogs.openReset(PROJECT));
      expect(byId(mounted.root, 'sc-reset-modal')).toBeNull();
      expect(harness.dialogs.request()).toBeNull();
    });
  });

  describe('apply default', () => {
    it('creates the default script straight away', async () => {
      harness.context.set(contextOf([unitOf(1)], 'U01'));
      const mounted = await start(ScriptingDefaultDialog);
      await open(mounted, harness, (dialogs) => dialogs.openDefault(PROJECT));
      expect(harness.scripting.applyDefault).toHaveBeenCalledWith(PROJECT);
      expect(harness.dialogs.request()).toBeNull();
      expect(toastTexts()).toContain('Created the default script from the source paragraphs.');
    });

    it('stays silent when there is no source to build from', async () => {
      harness.scripting.applyDefault.mockReturnValue(false);
      const mounted = await start(ScriptingDefaultDialog);
      await open(mounted, harness, (dialogs) => dialogs.openDefault(PROJECT));
      expect(toastTexts()).toEqual([]);
    });
  });
});
