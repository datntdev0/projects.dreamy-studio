import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AudiobookService } from '@features/audiobook/audiobook.service';
import { KnowledgeLang } from '@features/novel/novel.knowledge.models';
import { NovelKnowledgeService } from '@features/novel/novel.knowledge.service';
import { TargetLang } from '@features/novel/novel.models';
import { NovelReaderService } from '@features/novel/novel.reader.service';
import { displayName, toNovelError } from '@features/novel/novel.rules';
import { NovelService } from '@features/novel/novel.service';
import { NovelTranslationService } from '@features/novel/novel.translation.service';
import { PipelineService } from '@features/pipeline/pipeline.service';
import { ProjectService } from '@features/project/project.service';
import { ScriptingService } from '@features/scripting/scripting.service';
import { WorkspaceService } from '@features/workspace/workspace.service';
import { LayoutService } from '@layout/layout.service';
import { TabsService } from '@layout/tabs.service';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { DialogService } from '@shared/dialog/dialog.service';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

// prettier-ignore
import { AssistantChange, AssistantContext, AssistantEvent, AssistantQuotaSnapshot, AssistantScope, AssistantSession, AssistantSessionSummary, AssistantView, PipelineRun, ProposalResolution, ScriptDraft } from './assistant.models';
import { overwritesAudio, runItemIds } from './assistant.proposals';
// prettier-ignore
import { compareRecentFirst, isProjectChange, NOVEL_SCOPES, novelScope, projectScope, RECENT_SESSIONS, WORKSPACE_SCOPE } from './assistant.rules';

const SCOPE_ICONS: Record<AssistantScope['kind'], string> = {
  workspace: 'globe',
  novel: 'book',
  project: 'folder',
};

function resolveToastKey(resolution: ProposalResolution): LanguageKey {
  if (resolution.status === 'rejected') {
    return 'assistant.toast.rejected';
  }
  return resolution.pipelineId === undefined
    ? 'assistant.toast.applied'
    : 'assistant.toast.pipelineStarted';
}

function resolveErrorKey(code: string, scriptDraft: boolean): LanguageKey {
  if (code !== 'conflict') {
    return 'assistant.error.resolve';
  }
  return scriptDraft ? 'assistant.error.draftConflict' : 'assistant.error.conflict';
}

function draftOf(session: AssistantSession, resolution: ProposalResolution): ScriptDraft | null {
  const message = session.messages.find((item) => item.id === resolution.messageId);
  for (const attachment of message?.attachments ?? []) {
    if (attachment.kind === 'script_draft' && resolution.itemIds.includes(attachment.id)) {
      return attachment;
    }
  }
  return null;
}

function summaryOf(session: AssistantSession): AssistantSessionSummary {
  return {
    id: session.id,
    title: session.title,
    scope: session.scope,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messageCount,
    preview: session.preview,
    editGranted: session.editGranted,
  };
}

@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly dialogs = inject(DialogService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly novels = inject(NovelService);
  private readonly projects = inject(ProjectService);
  private readonly reader = inject(NovelReaderService);
  private readonly knowledge = inject(NovelKnowledgeService);
  private readonly translation = inject(NovelTranslationService);
  private readonly audiobook = inject(AudiobookService);
  private readonly scripting = inject(ScriptingService);
  private readonly pipelines = inject(PipelineService);
  private readonly tabs = inject(TabsService);
  private readonly layout = inject(LayoutService);
  private readonly workspace = inject(WorkspaceService);
  private readonly items = signal<AssistantSessionSummary[]>([]);
  private readonly launched = new Map<string, number>();
  private epoch = 0;
  private workspacePath: string | null | undefined = undefined;

  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly view = signal<AssistantView>('start');
  readonly active = signal<AssistantSession | null>(null);
  readonly opening = signal(false);
  readonly sending = signal(false);
  readonly pendingText = signal<string | null>(null);
  readonly liveActivities = signal<string[]>([]);
  readonly sendError = signal<string | null>(null);
  readonly resolving = signal<string | null>(null);
  readonly launching = signal<string | null>(null);
  readonly permitting = signal(false);
  readonly draft = signal('');
  readonly draftScope = signal<AssistantScope>(WORKSPACE_SCOPE);
  readonly quota = signal<AssistantQuotaSnapshot | null>(null);
  readonly sessions = computed(this.buildSessions.bind(this));
  readonly recent = computed(this.buildRecent.bind(this));

  constructor() {
    effect(this.syncWorkspace.bind(this));
  }

  async ensureLoaded(): Promise<void> {
    if (!this.loaded() && !this.loading()) {
      await this.load();
    }
  }

  async load(): Promise<void> {
    const epoch = this.epoch;
    this.loading.set(true);
    this.error.set(null);
    try {
      await Promise.all([this.novels.ensureLoaded(), this.projects.ensureLoaded()]);
      const rows = await this.ipc.invoke<AssistantSessionSummary[]>('assistant_session_list');
      if (epoch === this.epoch) {
        this.items.set(rows ?? []);
        this.loaded.set(true);
        void this.refreshQuota();
      }
    } catch (cause) {
      if (epoch === this.epoch) {
        this.error.set(toNovelError(cause).detail);
      }
    } finally {
      if (epoch === this.epoch) {
        this.loading.set(false);
      }
    }
  }

  contextScope(): AssistantScope {
    if (!NOVEL_SCOPES) {
      return WORKSPACE_SCOPE;
    }
    const tab = this.tabs.active();
    const novelId = tab.novelId ?? this.novels.selectedId();
    if (novelId !== null && this.novels.novelById(novelId)) {
      return novelScope(novelId);
    }
    return tab.projectId !== null && this.projects.projectById(tab.projectId)
      ? projectScope(tab.projectId)
      : WORKSPACE_SCOPE;
  }

  startNew(): void {
    this.active.set(null);
    this.sendError.set(null);
    this.draft.set('');
    this.draftScope.set(this.contextScope());
    this.view.set('start');
  }

  showSessions(): void {
    this.view.set('sessions');
  }

  back(): void {
    this.view.set(this.active() && this.view() === 'sessions' ? 'chat' : 'start');
  }

  chooseScope(scope: AssistantScope): void {
    this.draftScope.set(scope);
  }

  async open(id: string): Promise<void> {
    if (this.active()?.id === id) {
      this.view.set('chat');
      return;
    }
    const epoch = this.epoch;
    this.opening.set(true);
    this.sendError.set(null);
    this.draft.set('');
    this.view.set('chat');
    try {
      const session = await this.ipc.invoke<AssistantSession>('assistant_session_get', { id });
      if (epoch === this.epoch) {
        this.active.set(session);
      }
    } catch (cause) {
      if (epoch === this.epoch) {
        this.active.set(null);
        this.view.set('sessions');
        this.toasts.show(
          this.languageService.translate('assistant.error.open', {
            detail: toNovelError(cause).detail,
          }),
          'danger',
        );
      }
    } finally {
      if (epoch === this.epoch) {
        this.opening.set(false);
      }
    }
  }

  async ask(scope: AssistantScope, text: string, context: AssistantContext): Promise<boolean> {
    if (this.sending()) {
      return false;
    }
    if (!this.layout.assistantActive()) {
      this.layout.toggleAssistant();
    }
    await this.ensureLoaded();
    this.active.set(null);
    this.draft.set('');
    this.draftScope.set(scope);
    return this.send(text, context);
  }

  async resolve(resolution: ProposalResolution): Promise<void> {
    const session = this.active();
    if (!session || this.resolving() !== null) {
      return;
    }
    const epoch = this.epoch;
    const draft = draftOf(session, resolution);
    this.resolving.set(resolution.messageId);
    try {
      if (draft !== null && resolution.status === 'applied') {
        await this.scripting.flush(draft.projectId);
      }
      const next = await this.ipc.invoke<AssistantSession>('assistant_proposal_resolve', {
        sessionId: session.id,
        ...resolution,
      });
      if (epoch === this.epoch && this.active()?.id === next.id) {
        this.active.set(next);
        this.upsert(summaryOf(next));
      }
      if (resolution.status === 'applied') {
        void this.reloadReview(next, resolution.messageId).catch(this.ignoreReload.bind(this));
      }
      this.toasts.show(
        this.languageService.translate(resolveToastKey(resolution), {
          count: resolution.itemIds.length,
        }),
        resolution.status === 'applied' ? 'success' : 'info',
      );
    } catch (cause) {
      if (epoch === this.epoch) {
        this.showResolveError(cause, draft !== null);
      }
    } finally {
      if (epoch === this.epoch) {
        this.resolving.set(null);
      }
    }
  }

  async runPipelineRun(messageId: string, run: PipelineRun): Promise<void> {
    if (run.status !== 'pending' || this.launching() !== null || this.resolving() !== null) {
      return;
    }
    const key = `${messageId}:${run.id}`;
    this.launching.set(messageId);
    try {
      const pipelineId = this.launched.get(key) ?? (await this.startRun(key, run));
      if (pipelineId !== null) {
        await this.resolve({
          messageId,
          itemIds: [run.id],
          status: 'applied',
          pipelineId,
        });
      }
    } finally {
      this.launching.set(null);
    }
  }

  openPipeline(pipelineId: number): void {
    this.tabs.openPipelines();
    this.pipelines.select(pipelineId);
  }

  async setEdit(granted: boolean): Promise<void> {
    const session = this.active();
    if (!session || this.permitting() || session.editGranted === granted) {
      return;
    }
    if (granted) {
      await this.dialogs.ask({
        title: this.languageService.translate('assistant.edit.confirm.title'),
        eyebrow: this.languageService.translate('assistant.cap'),
        closeLabel: this.languageService.translate('assistant.dialog.close'),
        items: [{ name: session.title, meta: this.scopeLabel(session.scope), icon: 'pen' }],
        warning: this.languageService.translate('assistant.edit.confirm.warn'),
        confirmLabel: this.languageService.translate('assistant.edit.confirm.ok'),
        confirmIcon: 'pen',
        onConfirm: this.permit.bind(this, session.id, true),
      });
      return;
    }
    try {
      await this.permit(session.id, false);
    } catch (cause) {
      this.toasts.show(cause instanceof Error ? cause.message : String(cause), 'danger');
    }
  }

  async send(text: string, context: AssistantContext | null = null): Promise<boolean> {
    const body = text.trim();
    if (body === '' || this.sending()) {
      return false;
    }
    const epoch = this.epoch;
    this.sending.set(true);
    this.sendError.set(null);
    this.pendingText.set(body);
    this.liveActivities.set([]);
    this.view.set('chat');
    try {
      const session = this.active() ?? (await this.create());
      const next = await this.ipc.invoke<AssistantSession>('assistant_message_send', {
        sessionId: session.id,
        text: body,
        context,
        onEvent: this.ipc.channel<AssistantEvent>(this.onEvent.bind(this)),
      });
      if (epoch === this.epoch && this.active()?.id === next.id) {
        this.active.set(next);
        this.upsert(summaryOf(next));
      }
      void this.refreshQuota();
      return true;
    } catch (cause) {
      if (epoch === this.epoch) {
        this.sendError.set(toNovelError(cause).detail);
        if (this.active() === null) {
          this.view.set('start');
        }
      }
      return false;
    } finally {
      if (epoch === this.epoch) {
        this.sending.set(false);
        this.pendingText.set(null);
        this.liveActivities.set([]);
      }
    }
  }

  dismissError(): void {
    this.sendError.set(null);
  }

  confirmDelete(id: string): Promise<boolean> {
    const session = this.items().find((item) => item.id === id);
    if (!session) {
      return Promise.resolve(false);
    }
    return this.dialogs.ask({
      title: this.languageService.translate('assistant.delete.title'),
      eyebrow: this.languageService.translate('assistant.cap'),
      closeLabel: this.languageService.translate('assistant.dialog.close'),
      items: [
        {
          name: session.title,
          meta: this.languageService.translate('assistant.delete.meta', {
            scope: this.scopeLabel(session.scope),
            count: session.messageCount,
          }),
          icon: 'spark',
        },
      ],
      warning: this.languageService.translate('assistant.delete.warn'),
      confirmLabel: this.languageService.translate('assistant.delete.confirm'),
      confirmIcon: 'trash',
      onConfirm: this.remove.bind(this, session),
    });
  }

  scopeLabel(scope: AssistantScope): string {
    if (scope.kind === 'project' && scope.projectId !== null) {
      return this.projects.projectById(scope.projectId)?.name ?? `#${scope.projectId}`;
    }
    if (scope.kind === 'novel' && scope.novelId !== null) {
      const novel = this.novels.novelById(scope.novelId);
      return novel ? displayName(novel) : `#${scope.novelId}`;
    }
    return this.languageService.translate('assistant.scope.workspace');
  }

  scopeIcon(scope: AssistantScope): string {
    return SCOPE_ICONS[scope.kind];
  }

  reset(): void {
    this.epoch += 1;
    this.items.set([]);
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(null);
    this.active.set(null);
    this.quota.set(null);
    this.opening.set(false);
    this.sending.set(false);
    this.pendingText.set(null);
    this.liveActivities.set([]);
    this.sendError.set(null);
    this.resolving.set(null);
    this.launching.set(null);
    this.launched.clear();
    this.permitting.set(false);
    this.draft.set('');
    this.draftScope.set(WORKSPACE_SCOPE);
    this.view.set('start');
  }

  private onEvent(event: AssistantEvent): void {
    if (event.kind === 'activity') {
      this.liveActivities.update(this.withLabel.bind(this, event.label));
    } else {
      void this.refresh(event);
    }
  }

  private async refresh(change: AssistantChange): Promise<void> {
    if (isProjectChange(change.target)) {
      await this.refreshProject(change);
    } else if (change.novelId !== null) {
      await this.refreshNovel(change, change.novelId);
    }
  }

  private async refreshProject(change: AssistantChange): Promise<void> {
    const projectId = change.projectId;
    if (projectId === null) {
      return;
    }
    if (change.target === 'script') {
      await this.reloadScript(projectId);
    } else if (change.target === 'project') {
      await this.projects.load();
    } else {
      await this.reloadAudiobook(projectId, change.chapterId);
    }
  }

  private async reloadScript(projectId: number): Promise<void> {
    if (this.scripting.isLoaded(projectId)) {
      await this.scripting.load(projectId);
    }
  }

  private async reloadAudiobook(projectId: number, unitId: string | null): Promise<void> {
    if (!this.audiobook.isLoaded(projectId)) {
      return;
    }
    if (unitId === null) {
      await this.audiobook.load(projectId);
    } else {
      await this.audiobook.reloadUnit(projectId, unitId);
    }
  }

  private async refreshNovel(change: AssistantChange, novelId: number): Promise<void> {
    if (change.target === 'novel') {
      await this.novels.load();
    } else if (change.target === 'chapter') {
      await this.novels.loadChapters(novelId);
      if (change.chapterId !== null) {
        await this.reader.invalidate(novelId, change.chapterId);
      }
    } else if (change.target === 'translation') {
      if (change.translationTarget !== null) {
        await this.translation.load(novelId, change.translationTarget as TargetLang);
      }
    } else if (change.lang !== null) {
      await this.knowledge.load(novelId, change.lang as KnowledgeLang);
    }
  }

  private async startRun(key: string, run: PipelineRun): Promise<number | null> {
    const epoch = this.epoch;
    try {
      const pipelineId = await this.launchRun(run);
      if (pipelineId === null) {
        this.showPipelineFailure('assistant.error.pipelineEmpty', run.title);
      } else if (epoch === this.epoch) {
        this.launched.set(key, pipelineId);
      }
      return pipelineId;
    } catch (cause) {
      this.showPipelineFailure('assistant.error.pipelineStart', toNovelError(cause).detail);
      return null;
    }
  }

  private launchRun(run: PipelineRun): Promise<number | null> {
    const { novelId, projectId } = run.owner;
    const ids = runItemIds(run);
    if (run.job === 'synthesis' && projectId !== null) {
      return this.audiobook.startGeneration(projectId, ids, overwritesAudio(run));
    }
    if (run.job === 'analysis' && novelId !== null) {
      return this.translation.startAnalysis(novelId, run.target ?? 'src', ids);
    }
    if (run.job === 'translation' && novelId !== null && run.target !== null) {
      return this.translation.translate(novelId, ids, run.target as TargetLang);
    }
    return Promise.resolve(null);
  }

  private async refreshQuota(): Promise<void> {
    const epoch = this.epoch;
    try {
      const snapshot = await this.ipc.invoke<AssistantQuotaSnapshot | null>('assistant_quota_get');
      if (epoch === this.epoch) {
        this.quota.set(snapshot ?? null);
      }
    } catch {
      return;
    }
  }

  private showPipelineFailure(key: LanguageKey, detail: string): void {
    this.toasts.show(this.languageService.translate(key, { detail }), 'danger');
  }

  private showResolveError(cause: unknown, scriptDraft: boolean): void {
    const error = toNovelError(cause);
    this.toasts.show(
      this.languageService.translate(resolveErrorKey(error.code, scriptDraft), {
        detail: error.detail,
      }),
      'danger',
    );
  }

  private ignoreReload(): void {
    return;
  }

  private async reloadReview(session: AssistantSession, messageId: string): Promise<void> {
    const message = session.messages.find((item) => item.id === messageId);
    const review = message?.attachments?.find((item) => item.kind === 'translation_review');
    if (review?.kind === 'translation_review' && session.scope.novelId !== null) {
      await this.translation.load(session.scope.novelId, review.target as TargetLang);
    }
    const changes = message?.attachments?.find((item) => item.kind === 'knowledge_changes');
    if (changes?.kind === 'knowledge_changes' && changes.status === 'applied') {
      const novelId = changes.novelId ?? session.scope.novelId;
      if (novelId !== null && changes.lang !== undefined) {
        await this.knowledge.load(novelId, changes.lang as KnowledgeLang);
      }
    }
    const draft = message?.attachments?.find((item) => item.kind === 'script_draft');
    if (draft?.kind === 'script_draft' && draft.status === 'applied') {
      await this.reloadScript(draft.projectId);
    }
  }

  private async permit(id: string, granted: boolean): Promise<void> {
    const epoch = this.epoch;
    this.permitting.set(true);
    try {
      const next = await this.ipc.invoke<AssistantSession>('assistant_session_permit', {
        id,
        editGranted: granted,
      });
      if (epoch === this.epoch) {
        if (this.active()?.id === next.id) {
          this.active.set(next);
        }
        this.upsert(summaryOf(next));
      }
    } catch (cause) {
      throw new Error(
        this.languageService.translate('assistant.error.permit', {
          detail: toNovelError(cause).detail,
        }),
      );
    } finally {
      if (epoch === this.epoch) {
        this.permitting.set(false);
      }
    }
  }

  private withLabel(label: string, labels: string[]): string[] {
    return [...labels, label];
  }

  private async create(): Promise<AssistantSession> {
    const session = await this.ipc.invoke<AssistantSession>('assistant_session_create', {
      scope: this.draftScope(),
    });
    this.active.set(session);
    this.upsert(summaryOf(session));
    return session;
  }

  private async remove(session: AssistantSessionSummary): Promise<void> {
    try {
      await this.ipc.invoke('assistant_session_delete', { id: session.id });
    } catch (cause) {
      throw new Error(
        this.languageService.translate('assistant.error.delete', {
          detail: toNovelError(cause).detail,
        }),
      );
    }
    this.items.set(this.items().filter((item) => item.id !== session.id));
    if (this.active()?.id === session.id) {
      this.active.set(null);
      this.view.set(this.items().length > 0 ? 'sessions' : 'start');
    }
    this.toasts.show(
      this.languageService.translate('assistant.toast.deleted', { title: session.title }),
    );
  }

  private upsert(summary: AssistantSessionSummary): void {
    const rest = this.items().filter((item) => item.id !== summary.id);
    this.items.set([summary, ...rest]);
  }

  private buildSessions(): AssistantSessionSummary[] {
    return [...this.items()].sort(compareRecentFirst);
  }

  private buildRecent(): AssistantSessionSummary[] {
    return this.sessions().slice(0, RECENT_SESSIONS);
  }

  private syncWorkspace(): void {
    const path = this.workspace.current()?.path ?? null;
    untracked(this.applyWorkspace.bind(this, path));
  }

  private applyWorkspace(path: string | null): void {
    if (path === this.workspacePath) {
      return;
    }
    const known = this.workspacePath !== undefined;
    this.workspacePath = path;
    if (known) {
      this.reset();
    }
  }
}
