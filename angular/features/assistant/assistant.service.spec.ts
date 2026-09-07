import { TestBed } from '@angular/core/testing';
import { AudiobookService } from '@features/audiobook/audiobook.service';
import { PipelineService } from '@features/pipeline/pipeline.service';
import { ScriptingService } from '@features/scripting/scripting.service';
import { LayoutService } from '@layout/layout.service';
import { TabsService } from '@layout/tabs.service';
import { DialogService } from '@shared/dialog/dialog.service';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { FakeIpc } from '@testing/fake-ipc';
import {
  chapter,
  novel,
  pipeline,
  pipelineRun,
  project,
  scriptDraft,
  session,
} from '@testing/fixtures';
import { flushEffects, setupApp } from '@testing/service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceService } from '../workspace/workspace.service';
import { AssistantEvent, AssistantMessage } from './assistant.models';
import { novelScope, projectScope, WORKSPACE_SCOPE } from './assistant.rules';
import { AssistantService } from './assistant.service';

describe('AssistantService', () => {
  let ipc: FakeIpc;
  let assistant: AssistantService;
  let toasts: ToastService;
  let emit: (event: AssistantEvent) => void = () => undefined;

  beforeEach(async () => {
    ipc = setupApp();
    ipc.on('novel_list', [novel({ id: 1, title: 'Alpha' })]);
    ipc.on('project_list', [
      project({ id: 5, name: 'Audio Five' }),
      project({ id: 6, name: 'Archived Six', archived: true }),
    ]);
    ipc.on('novel_chapters', [chapter()]);
    ipc.on('novel_chapter_read', []);
    ipc.on('assistant_session_list', [
      session({ id: 'a', updatedAt: '2026-01-01' }),
      session({ id: 'b', updatedAt: '2026-02-01' }),
    ]);
    ipc.on('assistant_session_create', session({ id: 'new', title: 'New' }));
    ipc.on('assistant_message_send', (args) => {
      emit = (args?.['onEvent'] as { onmessage: typeof emit }).onmessage;
      return session({ id: 'new', title: 'New', messageCount: 2, updatedAt: '2026-05-01' });
    });
    assistant = TestBed.inject(AssistantService);
    toasts = TestBed.inject(ToastService);
    flushEffects();
    await assistant.ensureLoaded();
  });

  it('loads sessions newest first', async () => {
    await assistant.ensureLoaded();
    expect(ipc.called('assistant_session_list')).toBe(1);
    expect(assistant.sessions().map((item) => item.id)).toEqual(['b', 'a']);
    expect(assistant.recent()).toHaveLength(2);
    ipc.fail('assistant_session_list', { code: 'x', detail: 'broken' });
    await assistant.load();
    expect(assistant.error()).toBe('broken');
    ipc.on('assistant_session_list', null);
    await assistant.load();
    expect(assistant.sessions()).toEqual([]);
  });

  it('resolves the context scope', () => {
    expect(assistant.contextScope()).toEqual(WORKSPACE_SCOPE);
    TestBed.inject(TabsService).openNovel(1, 'Alpha');
    expect(assistant.contextScope()).toEqual(novelScope(1));
    TestBed.inject(TabsService).openNovel(99, 'Missing');
    expect(assistant.contextScope()).toEqual(WORKSPACE_SCOPE);
  });

  it('resolves the project context scope from the active project tab', () => {
    const tabs = TestBed.inject(TabsService);
    tabs.openProject(5, 'Audio Five');
    expect(assistant.contextScope()).toEqual(projectScope(5));
    tabs.openProject(99, 'Missing');
    expect(assistant.contextScope()).toEqual(WORKSPACE_SCOPE);
  });

  it('loads the projects together with the sessions', () => {
    expect(ipc.called('project_list')).toBe(1);
  });

  it('navigates views', async () => {
    assistant.startNew();
    expect(assistant.view()).toBe('start');
    assistant.showSessions();
    expect(assistant.view()).toBe('sessions');
    assistant.back();
    expect(assistant.view()).toBe('start');
    assistant.chooseScope(novelScope(1));
    expect(assistant.draftScope()).toEqual(novelScope(1));
    ipc.on('assistant_session_get', session({ id: 'a', title: 'Opened' }));
    await assistant.open('a');
    expect(assistant.active()?.title).toBe('Opened');
    expect(assistant.view()).toBe('chat');
    assistant.showSessions();
    assistant.back();
    expect(assistant.view()).toBe('chat');
    assistant.showSessions();
    await assistant.open('a');
    expect(assistant.view()).toBe('chat');
  });

  it('reports open failures', async () => {
    ipc.fail('assistant_session_get', { code: 'x', detail: 'nope' });
    await assistant.open('zzz');
    expect(assistant.view()).toBe('sessions');
    expect(toasts.items()[0].tone).toBe('danger');
    expect(assistant.opening()).toBe(false);
  });

  it('creates a session when sending and tracks live activity', async () => {
    const sending = assistant.send('  hello  ');
    expect(assistant.pendingText()).toBe('hello');
    expect(await sending).toBe(true);
    emit({ kind: 'activity', label: 'thinking' });
    expect(assistant.sessions()[0].id).toBe('new');
    expect(assistant.active()?.id).toBe('new');
    expect(assistant.sending()).toBe(false);
    expect(await assistant.send('   ')).toBe(false);
  });

  it('refreshes data when the assistant changes things', async () => {
    await assistant.send('go');
    ipc.on('translation_get', { guidelines: '', dict: [], chapters: {}, warnings: [] });
    ipc.on('knowledge_get', {
      lang: 'src',
      ontology: { version: 1, yaml: '', types: [], predicates: [], rules: [] },
      items: [],
      analyzed: {},
    });
    const base = {
      kind: 'changed' as const,
      novelId: 1,
      projectId: null,
      chapterId: null,
      lang: null,
      translationTarget: null,
    };
    emit({ ...base, target: 'novel' });
    emit({ ...base, target: 'chapter', chapterId: 'c1' });
    emit({ ...base, target: 'chapter' });
    emit({ ...base, target: 'translation', translationTarget: 'VI' });
    emit({ ...base, target: 'translation' });
    emit({ ...base, target: 'knowledge', lang: 'src' });
    emit({ ...base, target: 'knowledge' });
    await vi.waitFor(() => expect(ipc.called('translation_get')).toBe(1));
    await vi.waitFor(() => expect(ipc.called('knowledge_get')).toBe(1));
  });

  it('reloads an open script when the assistant changes it', async () => {
    await assistant.send('go');
    const scripting = TestBed.inject(ScriptingService);
    const isLoaded = vi.spyOn(scripting, 'isLoaded').mockReturnValue(true);
    const load = vi.spyOn(scripting, 'load').mockResolvedValue();
    const base = {
      kind: 'changed' as const,
      target: 'script' as const,
      novelId: null,
      chapterId: 'c1',
      lang: null,
      translationTarget: null,
    };
    emit({ ...base, projectId: 5 });
    await vi.waitFor(() => expect(load).toHaveBeenCalledWith(5));
    isLoaded.mockReturnValue(false);
    emit({ ...base, projectId: 6 });
    emit({ ...base, projectId: null });
    await flushEffects();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('ignores novel changes that carry no novel id', async () => {
    await assistant.send('go');
    const base = {
      kind: 'changed' as const,
      novelId: null,
      projectId: 5,
      chapterId: 'c1',
      lang: 'src',
      translationTarget: 'VI',
    };
    emit({ ...base, target: 'novel' });
    emit({ ...base, target: 'chapter' });
    emit({ ...base, target: 'translation' });
    emit({ ...base, target: 'knowledge' });
    await flushEffects();
    expect(ipc.called('translation_get')).toBe(0);
    expect(ipc.called('knowledge_get')).toBe(0);
    expect(ipc.called('novel_chapters')).toBe(0);
  });

  it('surfaces send failures', async () => {
    ipc.fail('assistant_session_create', { code: 'x', detail: 'denied' });
    expect(await assistant.send('hi')).toBe(false);
    expect(assistant.sendError()).toBe('denied');
    expect(assistant.view()).toBe('start');
    ipc.on('assistant_session_create', session({ id: 'new' }));
    ipc.fail('assistant_message_send', { code: 'x', detail: 'later' });
    expect(await assistant.send('hi')).toBe(false);
    expect(assistant.view()).toBe('chat');
    assistant.dismissError();
    expect(assistant.sendError()).toBeNull();
  });

  it('ignores asks while sending and opens the assistant panel', async () => {
    const layout = TestBed.inject(LayoutService);
    layout.inspectorOpen.set(false);
    expect(
      await assistant.ask(novelScope(1), 'question', {
        kind: 'knowledge_review',
        lang: 'src',
        issueIds: [],
      }),
    ).toBe(true);
    expect(layout.assistantActive()).toBe(true);
    assistant.sending.set(true);
    expect(
      await assistant.ask(novelScope(1), 'again', {
        kind: 'translation_review',
        chapterId: 'c1',
        target: 'VI',
      }),
    ).toBe(false);
  });

  it('resolves proposals', async () => {
    const message: AssistantMessage = {
      id: 'm1',
      role: 'assistant',
      text: '',
      createdAt: '',
      activities: [],
      citations: [],
      attachments: [
        {
          kind: 'translation_review',
          chapter: 1,
          chapterTitle: '',
          target: 'VI',
          checked: 0,
          findings: [],
          dictionary: [],
        },
        {
          kind: 'knowledge_changes',
          id: 'k',
          title: '',
          edits: 0,
          validation: { ok: true, resolves: 0, introduces: [] },
          changes: [],
          status: 'applied',
          lang: 'src',
          novelId: 1,
        },
      ],
    };
    const resolved = session({ id: 'new', scope: novelScope(1), messages: [message] });
    ipc.on('assistant_proposal_resolve', resolved);
    ipc.on('translation_get', { guidelines: '', dict: [], chapters: {}, warnings: [] });
    ipc.on('knowledge_get', {
      lang: 'src',
      ontology: { version: 1, yaml: '', types: [], predicates: [], rules: [] },
      items: [],
      analyzed: {},
    });
    await assistant.send('go');
    await assistant.resolve({ messageId: 'm1', itemIds: ['a', 'b'], status: 'applied' });
    expect(assistant.active()?.messages).toHaveLength(1);
    expect(toasts.items().at(-1)?.tone).toBe('success');
    await vi.waitFor(() => expect(ipc.called('translation_get')).toBe(1));
    await assistant.resolve({ messageId: 'm1', itemIds: ['a'], status: 'rejected' });
    expect(toasts.items().at(-1)?.tone).toBe('info');
    ipc.fail('assistant_proposal_resolve', { code: 'conflict', detail: 'stale' });
    await assistant.resolve({ messageId: 'm1', itemIds: ['a'], status: 'applied' });
    expect(toasts.items().at(-1)?.tone).toBe('danger');
    ipc.fail('assistant_proposal_resolve', { code: 'other', detail: 'stale' });
    await assistant.resolve({ messageId: 'm1', itemIds: ['a'], status: 'applied' });
    assistant.active.set(null);
    await assistant.resolve({ messageId: 'm1', itemIds: ['a'], status: 'applied' });
    expect(assistant.resolving()).toBeNull();
  });

  describe('script drafts', () => {
    function draftMessage(status: 'pending' | 'applied'): AssistantMessage {
      return {
        id: 'm1',
        role: 'assistant',
        text: 'Rewritten.',
        createdAt: '2026-01-01T00:00:00Z',
        activities: [],
        citations: [],
        attachments: [scriptDraft({ status })],
      };
    }

    function withDraft(status: 'pending' | 'applied') {
      return session({ id: 'new', scope: projectScope(5), messages: [draftMessage(status)] });
    }

    it('flushes pending script writes, applies the draft and reloads the script', async () => {
      const scripting = TestBed.inject(ScriptingService);
      const order: string[] = [];
      vi.spyOn(scripting, 'flush').mockImplementation(() => {
        order.push('flush');
        return Promise.resolve();
      });
      vi.spyOn(scripting, 'isLoaded').mockReturnValue(true);
      const load = vi.spyOn(scripting, 'load').mockImplementation(() => {
        order.push('load');
        return Promise.resolve();
      });
      ipc.on('assistant_proposal_resolve', () => {
        order.push('resolve');
        return withDraft('applied');
      });
      assistant.active.set(withDraft('pending'));
      await assistant.resolve({ messageId: 'm1', itemIds: ['sd1'], status: 'applied' });
      await vi.waitFor(() => expect(load).toHaveBeenCalledWith(1));
      expect(order).toEqual(['flush', 'resolve', 'load']);
      expect(assistant.active()?.messages[0].attachments?.[0]).toMatchObject({
        status: 'applied',
      });
      expect(toasts.items().at(-1)?.tone).toBe('success');
    });

    it('does not reload a script that was never opened', async () => {
      const scripting = TestBed.inject(ScriptingService);
      vi.spyOn(scripting, 'isLoaded').mockReturnValue(false);
      const load = vi.spyOn(scripting, 'load').mockResolvedValue();
      ipc.on('assistant_proposal_resolve', withDraft('applied'));
      assistant.active.set(withDraft('pending'));
      await assistant.resolve({ messageId: 'm1', itemIds: ['sd1'], status: 'applied' });
      await flushEffects();
      expect(load).not.toHaveBeenCalled();
    });

    it('skips the flush and the reload when the draft is rejected', async () => {
      const scripting = TestBed.inject(ScriptingService);
      const flush = vi.spyOn(scripting, 'flush');
      const load = vi.spyOn(scripting, 'load').mockResolvedValue();
      ipc.on('assistant_proposal_resolve', withDraft('pending'));
      assistant.active.set(withDraft('pending'));
      await assistant.resolve({ messageId: 'm1', itemIds: ['sd1'], status: 'rejected' });
      expect(flush).not.toHaveBeenCalled();
      expect(load).not.toHaveBeenCalled();
      expect(toasts.items().at(-1)?.tone).toBe('info');
    });

    it('leaves the draft pending and advises asking again on a conflict', async () => {
      const scripting = TestBed.inject(ScriptingService);
      const load = vi.spyOn(scripting, 'load').mockResolvedValue();
      ipc.fail('assistant_proposal_resolve', { code: 'conflict', detail: 'unit moved on' });
      assistant.active.set(withDraft('pending'));
      await assistant.resolve({ messageId: 'm1', itemIds: ['sd1'], status: 'applied' });
      const toast = toasts.items().at(-1);
      expect(toast?.tone).toBe('danger');
      expect(toast?.message).toBe(
        TestBed.inject(LanguageService).translate('assistant.error.draftConflict', {
          detail: 'unit moved on',
        }),
      );
      expect(assistant.active()?.messages[0].attachments?.[0]).toMatchObject({
        status: 'pending',
      });
      expect(load).not.toHaveBeenCalled();
      expect(assistant.resolving()).toBeNull();
    });

    it('uses the plain conflict message for other proposals', async () => {
      ipc.fail('assistant_proposal_resolve', { code: 'conflict', detail: 'stale' });
      assistant.active.set(session({ id: 'new', messages: [] }));
      await assistant.resolve({ messageId: 'm1', itemIds: ['a'], status: 'applied' });
      expect(toasts.items().at(-1)?.message).toBe(
        TestBed.inject(LanguageService).translate('assistant.error.conflict', { detail: 'stale' }),
      );
    });
  });

  it('toggles edit permission', async () => {
    await assistant.setEdit(true);
    assistant.active.set(session({ id: 'new', editGranted: false }));
    const dialogs = TestBed.inject(DialogService);
    ipc.on('assistant_session_permit', session({ id: 'new', editGranted: true }));
    const asking = assistant.setEdit(true);
    expect(dialogs.current()?.options.confirmIcon).toBe('pen');
    await dialogs.accept();
    await asking;
    expect(assistant.active()?.editGranted).toBe(true);
    ipc.on('assistant_session_permit', session({ id: 'new', editGranted: false }));
    await assistant.setEdit(false);
    expect(assistant.active()?.editGranted).toBe(false);
    await assistant.setEdit(false);
    assistant.active.set(session({ id: 'new', editGranted: true }));
    ipc.fail('assistant_session_permit', { code: 'x', detail: 'no' });
    await assistant.setEdit(false);
    expect(toasts.items().at(-1)?.tone).toBe('danger');
  });

  it('confirms and performs deletion', async () => {
    expect(await assistant.confirmDelete('zzz')).toBe(false);
    const dialogs = TestBed.inject(DialogService);
    assistant.active.set(session({ id: 'b' }));
    const asking = assistant.confirmDelete('b');
    expect(dialogs.current()?.options.items?.[0].name).toBe('Session');
    ipc.on('assistant_session_delete', null);
    await dialogs.accept();
    expect(await asking).toBe(true);
    expect(assistant.sessions().map((item) => item.id)).toEqual(['a']);
    expect(assistant.view()).toBe('sessions');
    const failing = assistant.confirmDelete('a');
    ipc.fail('assistant_session_delete', { code: 'x', detail: 'locked' });
    await dialogs.accept();
    expect(dialogs.error()).toContain('locked');
    dialogs.cancel();
    await failing;
  });

  it('labels scopes', () => {
    expect(assistant.scopeLabel(WORKSPACE_SCOPE)).toBeTruthy();
    expect(assistant.scopeLabel(novelScope(1))).toBe('Alpha');
    expect(assistant.scopeLabel(novelScope(99))).toBe('#99');
    expect(assistant.scopeLabel(projectScope(5))).toBe('Audio Five');
    expect(assistant.scopeLabel(projectScope(99))).toBe('#99');
    expect(assistant.scopeIcon(novelScope(1))).toBe('book');
    expect(assistant.scopeIcon(projectScope(5))).toBe('folder');
    expect(assistant.scopeIcon(WORKSPACE_SCOPE)).toBe('globe');
  });

  it('sends the project scope when creating a session', async () => {
    assistant.chooseScope(projectScope(5));
    await assistant.send('hello');
    expect(ipc.lastArgs('assistant_session_create')?.['scope']).toEqual(projectScope(5));
  });

  describe('pipeline runs', () => {
    function startedToast(): string {
      return TestBed.inject(LanguageService).translate('assistant.toast.pipelineStarted');
    }

    beforeEach(async () => {
      ipc.on('pipeline_start', pipeline({ id: 9 }));
      ipc.on('assistant_proposal_resolve', session({ id: 'new' }));
      await assistant.send('go');
    });

    it('starts a translation with the card target and resolves it with the pipeline id', async () => {
      await assistant.runPipelineRun('m1', pipelineRun({ target: 'EN' }));
      expect(ipc.lastArgs('pipeline_start')).toMatchObject({
        novelId: 1,
        target: 'EN',
        tasks: [
          { chapterId: 'c1', passage: null },
          { chapterId: 'c2', passage: null },
        ],
      });
      expect(ipc.lastArgs('assistant_proposal_resolve')).toMatchObject({
        sessionId: 'new',
        messageId: 'm1',
        itemIds: ['pr1'],
        status: 'applied',
        pipelineId: 9,
      });
      expect(toasts.items().at(-1)).toMatchObject({ tone: 'success', message: startedToast() });
      expect(assistant.launching()).toBeNull();
      expect(assistant.resolving()).toBeNull();
    });

    it('starts an analysis in the card language and defaults to the source text', async () => {
      await assistant.runPipelineRun('m1', pipelineRun({ job: 'analysis', target: 'VI' }));
      expect(ipc.lastArgs('pipeline_start')).toMatchObject({ kind: 'analysis', lang: 'VI' });
      await assistant.runPipelineRun(
        'm1',
        pipelineRun({ id: 'pr2', job: 'analysis', target: null }),
      );
      expect(ipc.lastArgs('pipeline_start')).toMatchObject({ kind: 'analysis', lang: 'src' });
    });

    it('starts the synthesis of the card units and maps the mode to overwrite', async () => {
      const start = vi
        .spyOn(TestBed.inject(AudiobookService), 'startGeneration')
        .mockResolvedValue(77);
      const owner = { novelId: null, projectId: 5 };
      const items = [
        { id: 'u1', seq: 1, title: 'One', tasks: 3, note: null },
        { id: 'u2', seq: 2, title: 'Two', tasks: 2, note: null },
      ];
      const base = { job: 'synthesis' as const, owner, items, target: null };
      const modes = [
        { id: 'a', mode: 'all' },
        { id: 'b', mode: 'missing' },
        { id: 'c', mode: 'missing', overwrite: true },
      ];
      for (const mode of modes) {
        await assistant.runPipelineRun('m1', pipelineRun({ ...base, ...mode }));
      }
      expect(start.mock.calls).toEqual([
        [5, ['u1', 'u2'], true],
        [5, ['u1', 'u2'], false],
        [5, ['u1', 'u2'], true],
      ]);
      expect(ipc.lastArgs('assistant_proposal_resolve')).toMatchObject({ pipelineId: 77 });
    });

    it('keeps the card pending and reports a start failure', async () => {
      ipc.fail('pipeline_start', { code: 'pipeline_busy', detail: 'busy' });
      await assistant.runPipelineRun('m1', pipelineRun());
      expect(toasts.items().at(-1)?.tone).toBe('danger');
      expect(ipc.called('assistant_proposal_resolve')).toBe(0);
      expect(assistant.launching()).toBeNull();
      ipc.on('pipeline_start', pipeline({ id: 10 }));
      await assistant.runPipelineRun('m1', pipelineRun());
      expect(ipc.lastArgs('assistant_proposal_resolve')).toMatchObject({ pipelineId: 10 });
    });

    it('keeps the card pending when nothing can be started', async () => {
      vi.spyOn(TestBed.inject(AudiobookService), 'startGeneration').mockResolvedValue(null);
      const synthesis = pipelineRun({ job: 'synthesis', owner: { novelId: null, projectId: 5 } });
      await assistant.runPipelineRun('m1', synthesis);
      await assistant.runPipelineRun(
        'm1',
        pipelineRun({ owner: { novelId: null, projectId: null } }),
      );
      await assistant.runPipelineRun('m1', pipelineRun({ target: null }));
      expect(toasts.items().map((item) => item.tone)).toEqual(['danger', 'danger', 'danger']);
      expect(ipc.called('pipeline_start')).toBe(0);
      expect(ipc.called('assistant_proposal_resolve')).toBe(0);
    });

    it('does not start twice when only the resolve failed', async () => {
      ipc.fail('assistant_proposal_resolve', { code: 'other', detail: 'broken' });
      await assistant.runPipelineRun('m1', pipelineRun());
      expect(toasts.items().at(-1)?.tone).toBe('danger');
      ipc.on('assistant_proposal_resolve', session({ id: 'new' }));
      await assistant.runPipelineRun('m1', pipelineRun());
      expect(ipc.called('pipeline_start')).toBe(1);
      expect(ipc.called('assistant_proposal_resolve')).toBe(2);
      expect(ipc.lastArgs('assistant_proposal_resolve')).toMatchObject({ pipelineId: 9 });
    });

    it('ignores cards that are not pending and runs that overlap', async () => {
      await assistant.runPipelineRun('m1', pipelineRun({ status: 'applied', pipelineId: 3 }));
      await assistant.runPipelineRun('m1', pipelineRun({ status: 'rejected' }));
      expect(ipc.called('pipeline_start')).toBe(0);
      const first = assistant.runPipelineRun('m1', pipelineRun());
      const second = assistant.runPipelineRun('m1', pipelineRun());
      await Promise.all([first, second]);
      expect(ipc.called('pipeline_start')).toBe(1);
      expect(ipc.called('assistant_proposal_resolve')).toBe(1);
    });

    it('forgets the started runs when the assistant resets', async () => {
      ipc.fail('assistant_proposal_resolve', { code: 'other', detail: 'broken' });
      await assistant.runPipelineRun('m1', pipelineRun());
      assistant.reset();
      ipc.on('assistant_proposal_resolve', session({ id: 'new' }));
      await assistant.send('again');
      await assistant.runPipelineRun('m1', pipelineRun());
      expect(ipc.called('pipeline_start')).toBe(2);
    });

    it('opens the pipeline tab on the started pipeline', () => {
      assistant.openPipeline(9);
      expect(TestBed.inject(TabsService).active().id).toBe('pipelines');
      expect(TestBed.inject(PipelineService).selectedId()).toBe(9);
    });
  });

  it('resets when the workspace changes', async () => {
    ipc.on('workspace_current', { name: 'w', path: '/w' });
    await TestBed.inject(WorkspaceService).restoreCurrent();
    flushEffects();
    ipc.on('workspace_current', { name: 'x', path: '/x' });
    await TestBed.inject(WorkspaceService).restoreCurrent();
    flushEffects();
    expect(assistant.loaded()).toBe(false);
    assistant.reset();
  });
});
