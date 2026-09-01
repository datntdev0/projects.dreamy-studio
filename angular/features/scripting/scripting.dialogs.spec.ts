import { signal, Type, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProjectService } from '@features/project/project.service';
import { LlmService } from '@features/settings/llm.service';
import { LlmProvider } from '@features/settings/settings.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { allById, byId, click } from '@testing/dom';
import { mount, Mounted, settle } from '@testing/exercise';
import { paragraphs, script, scriptBlock, scriptUnit } from '@testing/scripting';
import { setupApp } from '@testing/service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScriptingCheckDialog } from './components/check.dialog';
import { ScriptingDefaultDialog } from './components/default.dialog';
import { ScriptingDraftDialog } from './components/draft.dialog';
import { ScriptingResetDialog } from './components/reset.dialog';
import { ScriptingUnlockDialog } from './components/unlock.dialog';
import { buildContext } from './scripting.context';
import { ScriptingDialogsService } from './scripting.dialogs.service';
import { DraftOption, Script, ScriptContext, ScriptUnit } from './scripting.models';
import { emptyView } from './scripting.rules';
import { ScriptingService } from './scripting.service';

const PROJECT = 1;

const COMPLETE_BLOCKS = [
  scriptBlock({ id: 'B1', text: 'Title', type: 'heading' }),
  scriptBlock({ id: 'B2', text: 'Body.', ref: '1.1', snap: 'Body.' }),
];

function unitOf(id: number, overrides: Partial<ScriptUnit> = {}): ScriptUnit {
  return scriptUnit({ id: `U0${id}`, no: id, ch: id, title: `T${id}`, ...overrides });
}

function contextOf(units: ScriptUnit[], active: string, overrides: Partial<Script> = {}) {
  const chapters = { 1: paragraphs('Body.') };
  return buildContext({
    projectId: PROJECT,
    script: script(units, overrides),
    view: { ...emptyView(), unit: active },
    kb: null,
    hasNovel: false,
    chapters,
    novelChapters: 0,
    generating: [],
  });
}

function option(unit: ScriptUnit, reason: DraftOption['reason'] = null): DraftOption {
  return { unit, reason, hasContent: !!unit.blocks?.length };
}

function providerOf(id: string, name: string, found: boolean): LlmProvider {
  return {
    id,
    name,
    command: id,
    caps: [],
    profileEnv: null,
    profileDir: null,
    loginCommand: '',
    canLogout: false,
    canDetectLogin: false,
    path: '',
    found,
    resolvedPath: '',
    version: '',
    signedIn: true,
    account: '',
    signing: false,
    status: found ? 'ok' : 'none',
    error: '',
    latencyMs: 0,
    checkedAt: '',
  };
}

interface Harness {
  context: WritableSignal<ScriptContext | null>;
  audio: WritableSignal<'idle' | 'doing'>;
  scripting: ReturnType<typeof fakeScripting>;
  dialogs: ScriptingDialogsService;
  toasts: ToastService;
}

function fakeScripting(context: WritableSignal<ScriptContext | null>) {
  return {
    contextOf: () => context(),
    lockUnit: vi.fn(() => 'locked'),
    unlockUnit: vi.fn(() => true),
    resetUnits: vi.fn(() => 2),
    resettableUnitsOf: vi.fn((): ScriptUnit[] => []),
    applyDefault: vi.fn(() => true),
    gotoBlock: vi.fn(),
    gotoRef: vi.fn(),
    ensureSources: vi.fn(() => Promise.resolve()),
    draftOptionsOf: vi.fn((): DraftOption[] => []),
    draftEstimateOf: vi.fn(() => ({ tin: 494, tout: 281, cost: 0.0108 })),
    draftWordsOf: vi.fn(() => 107),
    generateDrafts: vi.fn((_project: number, ids: string[]) => Promise.resolve(ids.length)),
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
  let providers: LlmProvider[] = [];

  function prime(): void {
    TestBed.inject(LanguageService).setLanguage('en');
    TestBed.inject(LlmService).providers.set(providers);
    harness.dialogs = TestBed.inject(ScriptingDialogsService);
    harness.toasts = TestBed.inject(ToastService);
  }

  function start<T>(type: Type<T>): Promise<Mounted<T>> {
    return mount(type, {}, prime);
  }

  beforeEach(() => {
    setupApp();
    providers = [];
    const context = signal<ScriptContext | null>(null);
    const audio = signal<'idle' | 'doing'>('idle');
    const scripting = fakeScripting(context);
    TestBed.configureTestingModule({
      providers: [
        { provide: ScriptingService, useValue: scripting },
        {
          provide: ProjectService,
          useValue: {
            moduleStateOf: () => ({ state: audio() }),
            projectById: () => ({ id: PROJECT, name: 'Harrowmere' }),
          },
        },
      ],
    });
    harness = { context, audio, scripting, dialogs: null as never, toasts: null as never };
  });

  describe('check before locking', () => {
    it('lists the checks, locks the unit and reports it', async () => {
      const units = [unitOf(1, { blocks: COMPLETE_BLOCKS })];
      harness.context.set(contextOf(units, 'U01'));
      const mounted = await start(ScriptingCheckDialog);
      expect(byId(mounted.root, 'sc-check-modal')).toBeNull();
      await open(mounted, harness, (dialogs) => dialogs.openCheck(PROJECT));
      expect(byId(mounted.root, 'sc-check-modal')).not.toBeNull();
      expect(byId(mounted.root, 'dialog-title')?.textContent).toContain('Lock chapter 1');
      expect(allById(mounted.root, 'sc-checks')[0].children.length).toBeGreaterThan(3);
      expect(byId(mounted.root, 'scripting-check-banner')?.classList).toContain('is-ok');
      click(mounted.root, 'sc-check-lock-btn');
      await settle(mounted.fixture);
      expect(harness.scripting.lockUnit).toHaveBeenCalledWith(PROJECT);
      expect(harness.dialogs.request()).toBeNull();
      expect(toastTexts()).toContain('Locked chapter 1.');
    });

    it('disables locking while errors remain and jumps to the first issue', async () => {
      const units = [unitOf(1, { blocks: [scriptBlock({ id: 'B1', text: '', ref: '1.1' })] })];
      harness.context.set(contextOf(units, 'U01'));
      const mounted = await start(ScriptingCheckDialog);
      await open(mounted, harness, (dialogs) => dialogs.openCheck(PROJECT));
      expect(byId(mounted.root, 'scripting-check-banner')?.classList).toContain('is-err');
      const lock = byId(mounted.root, 'sc-check-lock-btn')?.querySelector('button');
      expect(lock?.disabled).toBe(true);
      click(mounted.root, 'sc-check-go-empty');
      expect(harness.scripting.gotoBlock).toHaveBeenCalledWith(PROJECT, 'B1');
      expect(harness.dialogs.request()).toBeNull();
    });

    it('cancels without locking and refuses a locked unit', async () => {
      const units = [unitOf(1, { blocks: COMPLETE_BLOCKS })];
      harness.context.set(contextOf(units, 'U01'));
      const mounted = await start(ScriptingCheckDialog);
      await open(mounted, harness, (dialogs) => dialogs.openCheck(PROJECT));
      click(mounted.root, 'sc-check-cancel-btn');
      await settle(mounted.fixture);
      expect(harness.scripting.lockUnit).not.toHaveBeenCalled();
      expect(harness.dialogs.request()).toBeNull();
      harness.context.set(contextOf([unitOf(1, { status: 'locked' })], 'U01'));
      await open(mounted, harness, (dialogs) => dialogs.openCheck(PROJECT));
      expect(byId(mounted.root, 'sc-check-modal')).toBeNull();
      expect(harness.dialogs.request()).toBeNull();
    });
  });

  describe('unlock', () => {
    it('confirms the unlock with a warning once audio exists', async () => {
      harness.context.set(contextOf([unitOf(1, { status: 'locked' })], 'U01'));
      const mounted = await start(ScriptingUnlockDialog);
      await open(mounted, harness, (dialogs) => dialogs.openUnlock(PROJECT));
      expect(byId(mounted.root, 'dialog-title')?.textContent).toContain('Unlock chapter 1?');
      expect(byId(mounted.root, 'scripting-unlock-banner')).toBeNull();
      harness.audio.set('doing');
      await settle(mounted.fixture);
      expect(byId(mounted.root, 'scripting-unlock-banner')).not.toBeNull();
      click(mounted.root, 'sc-unlock-ok-btn');
      await settle(mounted.fixture);
      expect(harness.scripting.unlockUnit).toHaveBeenCalledWith(PROJECT);
      expect(toastTexts()).toContain('Unlocked chapter 1.');
      expect(harness.toasts.items()[0].tone).toBe('warning');
    });

    it('closes on cancel and ignores an unlocked unit', async () => {
      harness.context.set(contextOf([unitOf(1, { status: 'locked' })], 'U01'));
      const mounted = await start(ScriptingUnlockDialog);
      await open(mounted, harness, (dialogs) => dialogs.openUnlock(PROJECT));
      click(mounted.root, 'sc-unlock-cancel-btn');
      await settle(mounted.fixture);
      expect(harness.scripting.unlockUnit).not.toHaveBeenCalled();
      harness.context.set(contextOf([unitOf(1)], 'U01'));
      await open(mounted, harness, (dialogs) => dialogs.openUnlock(PROJECT));
      expect(byId(mounted.root, 'sc-unlock-modal')).toBeNull();
    });
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

    it('resets every unlocked unit after switching the scope', async () => {
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

    it('warns when nothing could be reset and refuses a locked unit', async () => {
      harness.context.set(contextOf(units, 'U01'));
      harness.scripting.resetUnits.mockReturnValue(0);
      const mounted = await start(ScriptingResetDialog);
      await open(mounted, harness, (dialogs) => dialogs.openReset(PROJECT));
      click(mounted.root, 'sc-reset-go-btn');
      await settle(mounted.fixture);
      expect(toastTexts()).toContain('No source to reset from.');
      harness.context.set(contextOf([unitOf(1, { status: 'locked' })], 'U01'));
      await open(mounted, harness, (dialogs) => dialogs.openReset(PROJECT));
      expect(byId(mounted.root, 'sc-reset-modal')).toBeNull();
      expect(toastTexts()).toContain('Unlock the chapter before resetting.');
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

  describe('AI draft', () => {
    const units = [
      unitOf(1, { status: 'locked', blocks: COMPLETE_BLOCKS }),
      unitOf(2, { blocks: COMPLETE_BLOCKS }),
      unitOf(3),
    ];

    function prepare(): void {
      harness.context.set(contextOf(units, 'U02'));
      harness.scripting.draftOptionsOf.mockReturnValue([
        option(units[0], { key: 'scripting.draft.reason.locked', params: {} }),
        option(units[1]),
        option(units[2]),
      ]);
      providers = [providerOf('claude', 'Claude Code CLI', true), providerOf('x', 'Other', false)];
    }

    it('loads every source first and preselects the open unit', async () => {
      prepare();
      const mounted = await start(ScriptingDraftDialog);
      await open(mounted, harness, (dialogs) => dialogs.openDraft(PROJECT));
      expect(harness.scripting.ensureSources).toHaveBeenCalledWith(PROJECT, true);
      expect(byId(mounted.root, 'sc-draft-modal')).not.toBeNull();
      const checked = (id: string) =>
        (byId(mounted.root, `sc-ai-input-${id}`) as HTMLInputElement).checked;
      expect([checked('U01'), checked('U02'), checked('U03')]).toEqual([false, true, false]);
      expect((byId(mounted.root, 'sc-ai-input-U01') as HTMLInputElement).disabled).toBe(true);
      expect(byId(mounted.root, 'sc-ai-unit-U01')?.classList).toContain('is-off');
      expect(byId(mounted.root, 'sc-ai-unit-U01')?.textContent).toContain(
        'Locked, unlock to regenerate',
      );
      expect(byId(mounted.root, 'sc-ai-unit-U02')?.textContent).toContain(
        'Will overwrite the existing content',
      );
      expect(byId(mounted.root, 'sc-ai-unit-U03')?.textContent).toContain('No content yet');
    });

    it('shows the estimate and the overwrite warning for the selection', async () => {
      prepare();
      const mounted = await start(ScriptingDraftDialog);
      await open(mounted, harness, (dialogs) => dialogs.openDraft(PROJECT));
      const estimate = byId(mounted.root, 'sc-ai-estimate')?.textContent ?? '';
      expect(estimate).toContain('Will be sent to Claude Code CLI');
      expect(estimate).toContain('(107 words)');
      expect(estimate).toContain('494 input tokens, 281 output tokens, ≈ $0.01');
      expect(byId(mounted.root, 'scripting-draft-banner')?.textContent).toContain(
        '1 chapter that already has content will be replaced.',
      );
      click(mounted.root, 'sc-ai-input-U03');
      await settle(mounted.fixture);
      expect(harness.scripting.draftEstimateOf).toHaveBeenLastCalledWith(
        PROJECT,
        expect.arrayContaining(['U02', 'U03']),
      );
      expect(byId(mounted.root, 'sc-draft-go-btn')?.textContent).toContain('Generate 2 drafts');
    });

    it('disables generating without a selection and explains why', async () => {
      prepare();
      const mounted = await start(ScriptingDraftDialog);
      await open(mounted, harness, (dialogs) => dialogs.openDraft(PROJECT));
      click(mounted.root, 'sc-ai-input-U02');
      await settle(mounted.fixture);
      const go = byId(mounted.root, 'sc-draft-go-btn')?.querySelector('button');
      expect(go?.disabled).toBe(true);
      expect(byId(mounted.root, 'sc-ai-estimate')?.textContent).toContain(
        'Choose at least one chapter to see the estimate.',
      );
      expect(byId(mounted.root, 'scripting-draft-banner')).toBeNull();
    });

    it('marks missing providers, generates and reports the outcome', async () => {
      prepare();
      const mounted = await start(ScriptingDraftDialog);
      await open(mounted, harness, (dialogs) => dialogs.openDraft(PROJECT));
      const options = Array.from(
        byId(mounted.root, 'sc-ai-prov')?.querySelectorAll('option') ?? [],
      );
      expect(options.map((item) => item.textContent?.trim())).toEqual([
        'Claude Code CLI',
        'Other (not installed)',
      ]);
      expect(options[1].disabled).toBe(true);
      click(mounted.root, 'sc-ai-input-U03');
      await settle(mounted.fixture);
      click(mounted.root, 'sc-draft-go-btn');
      await settle(mounted.fixture);
      expect(harness.scripting.generateDrafts).toHaveBeenCalledWith(
        PROJECT,
        ['U02', 'U03'],
        'claude',
      );
      expect(harness.dialogs.request()).toBeNull();
      expect(toastTexts()).toEqual([
        'Started: Script · Harrowmere',
        'Completed: Script · Harrowmere',
      ]);
    });

    it('warns when only some drafts were generated and cancels cleanly', async () => {
      prepare();
      harness.scripting.generateDrafts.mockResolvedValue(0);
      const mounted = await start(ScriptingDraftDialog);
      await open(mounted, harness, (dialogs) => dialogs.openDraft(PROJECT));
      click(mounted.root, 'sc-draft-go-btn');
      await settle(mounted.fixture);
      expect(toastTexts()).toContain('Could not generate every draft for Harrowmere.');
      await open(mounted, harness, (dialogs) => dialogs.openDraft(PROJECT));
      click(mounted.root, 'sc-draft-cancel-btn');
      await settle(mounted.fixture);
      expect(harness.dialogs.request()).toBeNull();
    });

    it('lists the source chapters of film episodes', async () => {
      prepare();
      const film = [unitOf(1, { ch: null, chs: [1, 2] })];
      harness.context.set(contextOf(film, 'U01', { cfg: { ...script().cfg, preset: 'film' } }));
      harness.scripting.draftOptionsOf.mockReturnValue([option(film[0])]);
      const mounted = await start(ScriptingDraftDialog);
      await open(mounted, harness, (dialogs) => dialogs.openDraft(PROJECT));
      expect(byId(mounted.root, 'sc-ai-unit-U01')?.textContent).toContain('Ch.1–2');
      expect(byId(mounted.root, 'sc-ai-estimate')?.textContent).toContain(
        'Events, characters, places from the Knowledgebase',
      );
    });
  });
});
