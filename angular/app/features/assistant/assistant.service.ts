import { Injectable, computed, effect, inject, signal, untracked } from "@angular/core";
import { DesktopIpcService } from "@app/core/desktop/desktop-ipc.service";
import { DialogService } from "@app/core/dialog/dialog.service";
import { LanguageService } from "@app/core/language/language.service";
import { ToastService } from "@app/core/toast/toast.service";
import { NovelService } from "@app/features/novel/novel.service";
import { displayName, toNovelError } from "@app/features/novel/novel.rules";
import { WorkspaceService } from "@app/features/workspace/workspace.service";
import { LayoutService } from "@layout/layout.service";
import { TabsService } from "@layout/tabs.service";
import { AssistantContext, AssistantScope, AssistantSession, AssistantSessionSummary, AssistantView, ProposalResolution } from "./assistant.models";
import { RECENT_SESSIONS, WORKSPACE_SCOPE, compareRecentFirst, novelScope } from "./assistant.rules";

function summaryOf(session: AssistantSession): AssistantSessionSummary {
  return {
    id: session.id,
    title: session.title,
    scope: session.scope,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messageCount,
    preview: session.preview,
  };
}

@Injectable({ providedIn: "root" })
export class AssistantService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly dialogs = inject(DialogService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly novels = inject(NovelService);
  private readonly tabs = inject(TabsService);
  private readonly layout = inject(LayoutService);
  private readonly workspace = inject(WorkspaceService);
  private readonly items = signal<AssistantSessionSummary[]>([]);
  private epoch = 0;
  private workspacePath: string | null | undefined = undefined;

  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly view = signal<AssistantView>("start");
  readonly active = signal<AssistantSession | null>(null);
  readonly opening = signal(false);
  readonly sending = signal(false);
  readonly pendingText = signal<string | null>(null);
  readonly sendError = signal<string | null>(null);
  readonly resolving = signal<string | null>(null);
  readonly draft = signal("");
  readonly draftScope = signal<AssistantScope>(WORKSPACE_SCOPE);
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
      await this.novels.ensureLoaded();
      const rows = await this.ipc.invoke<AssistantSessionSummary[]>("assistant_session_list");
      if (epoch === this.epoch) {
        this.items.set(rows ?? []);
        this.loaded.set(true);
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
    const novelId = this.tabs.active().novelId ?? this.novels.selectedId();
    return novelId !== null && this.novels.novelById(novelId) ? novelScope(novelId) : WORKSPACE_SCOPE;
  }

  startNew(): void {
    this.active.set(null);
    this.sendError.set(null);
    this.draft.set("");
    this.draftScope.set(this.contextScope());
    this.view.set("start");
  }

  showSessions(): void {
    this.view.set("sessions");
  }

  back(): void {
    this.view.set(this.active() && this.view() === "sessions" ? "chat" : "start");
  }

  chooseScope(scope: AssistantScope): void {
    this.draftScope.set(scope);
  }

  async open(id: string): Promise<void> {
    if (this.active()?.id === id) {
      this.view.set("chat");
      return;
    }
    const epoch = this.epoch;
    this.opening.set(true);
    this.sendError.set(null);
    this.draft.set("");
    this.view.set("chat");
    try {
      const session = await this.ipc.invoke<AssistantSession>("assistant_session_get", { id });
      if (epoch === this.epoch) {
        this.active.set(session);
      }
    } catch (cause) {
      if (epoch === this.epoch) {
        this.active.set(null);
        this.view.set("sessions");
        this.toasts.show(this.languageService.translate("assistant.error.open", { detail: toNovelError(cause).detail }), "danger");
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
    this.draft.set("");
    this.draftScope.set(scope);
    return this.send(text, context);
  }

  async resolve(resolution: ProposalResolution): Promise<void> {
    const session = this.active();
    if (!session || this.resolving() !== null) {
      return;
    }
    const epoch = this.epoch;
    this.resolving.set(resolution.messageId);
    try {
      const next = await this.ipc.invoke<AssistantSession>("assistant_proposal_resolve", { sessionId: session.id, ...resolution });
      if (epoch === this.epoch && this.active()?.id === next.id) {
        this.active.set(next);
        this.upsert(summaryOf(next));
      }
      const key = resolution.status === "applied" ? "assistant.toast.applied" : "assistant.toast.rejected";
      this.toasts.show(this.languageService.translate(key, { count: resolution.itemIds.length }), resolution.status === "applied" ? "success" : "info");
    } catch (cause) {
      if (epoch === this.epoch) {
        this.toasts.show(this.languageService.translate("assistant.error.resolve", { detail: toNovelError(cause).detail }), "danger");
      }
    } finally {
      if (epoch === this.epoch) {
        this.resolving.set(null);
      }
    }
  }

  async send(text: string, context: AssistantContext | null = null): Promise<boolean> {
    const body = text.trim();
    if (body === "" || this.sending()) {
      return false;
    }
    const epoch = this.epoch;
    this.sending.set(true);
    this.sendError.set(null);
    this.pendingText.set(body);
    this.view.set("chat");
    try {
      const session = this.active() ?? (await this.create());
      const next = await this.ipc.invoke<AssistantSession>("assistant_message_send", { sessionId: session.id, text: body, context });
      if (epoch === this.epoch && this.active()?.id === next.id) {
        this.active.set(next);
        this.upsert(summaryOf(next));
      }
      return true;
    } catch (cause) {
      if (epoch === this.epoch) {
        this.sendError.set(toNovelError(cause).detail);
        if (this.active() === null) {
          this.view.set("start");
        }
      }
      return false;
    } finally {
      if (epoch === this.epoch) {
        this.sending.set(false);
        this.pendingText.set(null);
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
      title: this.languageService.translate("assistant.delete.title"),
      eyebrow: this.languageService.translate("assistant.cap"),
      closeLabel: this.languageService.translate("assistant.dialog.close"),
      items: [{ name: session.title, meta: this.languageService.translate("assistant.delete.meta", { scope: this.scopeLabel(session.scope), count: session.messageCount }), icon: "spark" }],
      warning: this.languageService.translate("assistant.delete.warn"),
      confirmLabel: this.languageService.translate("assistant.delete.confirm"),
      confirmIcon: "trash",
      onConfirm: this.remove.bind(this, session),
    });
  }

  scopeLabel(scope: AssistantScope): string {
    if (scope.kind === "workspace" || scope.novelId === null) {
      return this.languageService.translate("assistant.scope.workspace");
    }
    const novel = this.novels.novelById(scope.novelId);
    return novel ? displayName(novel) : `#${scope.novelId}`;
  }

  scopeIcon(scope: AssistantScope): string {
    return scope.kind === "novel" ? "book" : "globe";
  }

  reset(): void {
    this.epoch += 1;
    this.items.set([]);
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(null);
    this.active.set(null);
    this.opening.set(false);
    this.sending.set(false);
    this.pendingText.set(null);
    this.sendError.set(null);
    this.resolving.set(null);
    this.draft.set("");
    this.draftScope.set(WORKSPACE_SCOPE);
    this.view.set("start");
  }

  private async create(): Promise<AssistantSession> {
    const session = await this.ipc.invoke<AssistantSession>("assistant_session_create", { scope: this.draftScope() });
    this.active.set(session);
    this.upsert(summaryOf(session));
    return session;
  }

  private async remove(session: AssistantSessionSummary): Promise<void> {
    try {
      await this.ipc.invoke("assistant_session_delete", { id: session.id });
    } catch (cause) {
      throw new Error(this.languageService.translate("assistant.error.delete", { detail: toNovelError(cause).detail }));
    }
    this.items.set(this.items().filter((item) => item.id !== session.id));
    if (this.active()?.id === session.id) {
      this.active.set(null);
      this.view.set(this.items().length > 0 ? "sessions" : "start");
    }
    this.toasts.show(this.languageService.translate("assistant.toast.deleted", { title: session.title }));
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
