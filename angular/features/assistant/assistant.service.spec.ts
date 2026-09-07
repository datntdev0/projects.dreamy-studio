import { TestBed } from '@angular/core/testing';
import { LayoutService } from '@layout/layout.service';
import { TabsService } from '@layout/tabs.service';
import { DialogService } from '@shared/dialog/dialog.service';
import { ToastService } from '@shared/toast/toast.service';
import { FakeIpc } from '@testing/fake-ipc';
import { chapter, novel, project, session } from '@testing/fixtures';
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
