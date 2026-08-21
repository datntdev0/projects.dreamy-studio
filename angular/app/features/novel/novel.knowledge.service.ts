import { Injectable, effect, inject, signal, untracked } from "@angular/core";
import { DesktopIpcService } from "@app/core/desktop/desktop-ipc.service";
import { DialogService } from "@app/core/dialog/dialog.service";
import { LanguageKey, LanguageParams } from "@app/core/language/language.models";
import { LanguageService } from "@app/core/language/language.service";
import { WorkspaceService } from "../workspace/workspace.service";
import { NovelError } from "./novel.models";
import { NovelService } from "./novel.service";
import { toNovelError } from "./novel.rules";
import { NovelTranslationService, ANALYSIS_KIND } from "./novel.translation.service";
import { applyEdits } from "./novel.knowledge.draft";
import { KnowledgeEdit, KnowledgeIssue, KnowledgeItem, KnowledgeLang, KnowledgeTab, KnowledgeView, KnowledgeVisibility, NovelKnowledge, WireKnowledge } from "./novel.knowledge.models";
import { EMPTY_KNOWLEDGE, applyChange, checkKnowledge, diffItems, emptyView, visibilityOf } from "./novel.knowledge.rules";

@Injectable({ providedIn: "root" })
export class NovelKnowledgeService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly novels = inject(NovelService);
  private readonly translation = inject(NovelTranslationService);
  private readonly workspace = inject(WorkspaceService);
  private readonly languageService = inject(LanguageService);
  private readonly dialogs = inject(DialogService);
  private readonly store = signal<Record<number, NovelKnowledge>>({});
  private readonly views = signal<Record<number, KnowledgeView>>({});
  private workspacePath: string | null | undefined = undefined;

  readonly loading = signal(false);
  readonly error = signal<NovelError | null>(null);

  constructor() {
    effect(this.syncWorkspace.bind(this));
    effect(this.syncFinished.bind(this));
  }

  of(novelId: number): NovelKnowledge {
    return this.store()[novelId] ?? EMPTY_KNOWLEDGE;
  }

  isLoaded(novelId: number): boolean {
    return this.store()[novelId] !== undefined;
  }

  viewOf(novelId: number): KnowledgeView {
    return this.views()[novelId] ?? emptyView();
  }

  isRunning(novelId: number): boolean {
    return this.translation.isAnalyzing(novelId);
  }

  analyzedCountOf(novelId: number): number {
    return Object.keys(this.of(novelId).analyzed).length;
  }

  issuesOf(novelId: number): KnowledgeIssue[] {
    return checkKnowledge(this.of(novelId).items, this.translate.bind(this));
  }

  visibleOf(novelId: number): KnowledgeVisibility {
    const view = this.viewOf(novelId);
    return visibilityOf(this.of(novelId).items, view.spoiler ? view.upTo : null);
  }

  patchView(novelId: number, patch: Partial<KnowledgeView>): void {
    this.views.set({ ...this.views(), [novelId]: { ...this.viewOf(novelId), ...patch } });
  }

  setTab(novelId: number, tab: KnowledgeTab): void {
    this.patchView(novelId, { tab });
  }

  select(novelId: number, id: string | null): void {
    this.patchView(novelId, { sel: id });
  }

  clearFilters(novelId: number): void {
    this.patchView(novelId, { q: "", type: "all", chapter: 0, onlyIssues: false });
  }

  async ensure(novelId: number): Promise<void> {
    if (!this.isLoaded(novelId)) {
      await this.load(novelId);
    }
  }

  async load(novelId: number): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const wire = await this.ipc.invoke<WireKnowledge>("knowledge_get", { novelId });
      await this.novels.loadChapters(novelId);
      this.store.set({ ...this.store(), [novelId]: { items: wire.items, analyzed: wire.analyzed } });
    } catch (cause) {
      this.error.set(toNovelError(cause));
    } finally {
      this.loading.set(false);
    }
  }

  async commit(novelId: number, next: KnowledgeItem[]): Promise<void> {
    const current = this.of(novelId);
    const change = diffItems(current.items, next);
    if (change.upsert.length === 0 && change.remove.length === 0) {
      return;
    }
    await this.ipc.invoke<void>("knowledge_save", { novelId, change });
    this.store.set({ ...this.store(), [novelId]: { ...current, items: applyChange(current.items, change) } });
  }

  async apply(novelId: number, edits: KnowledgeEdit[]): Promise<void> {
    await this.commit(novelId, applyEdits(this.of(novelId).items, edits));
  }

  async remove(novelId: number, ids: string[]): Promise<void> {
    await this.apply(novelId, ids.map((id) => ({ k: "del", id })));
  }

  async confirmRemove(novelId: number, ids: string[], name: string): Promise<void> {
    await this.dialogs.ask({
      title: this.translate("novel.knowledge.remove.title"),
      eyebrow: this.translate("novel.knowledge.edit.eyebrow"),
      message: this.translate("novel.knowledge.remove.message", { name }),
      warning: this.translate("novel.knowledge.remove.warning"),
      confirmLabel: this.translate("novel.knowledge.remove.confirm"),
      confirmIcon: "trash",
      cancelLabel: this.translate("common.cancel"),
      closeLabel: this.translate("novel.dialog.close"),
      tone: "danger",
      onConfirm: this.remove.bind(this, novelId, ids),
    });
  }

  async clearStale(novelId: number, ids: string[]): Promise<void> {
    const wanted = new Set(ids);
    await this.commit(novelId, this.of(novelId).items.map((item) => (wanted.has(item.id) ? { ...item, stale: null } : item)));
  }

  async analyze(novelId: number, seqs: number[], lang: KnowledgeLang, overwrite: boolean): Promise<void> {
    const chapterIds = this.novels.chaptersOf(novelId).filter((row) => seqs.includes(row.seq)).map((row) => row.id);
    await this.translation.startAnalysis(novelId, lang, overwrite, chapterIds);
  }

  reset(): void {
    this.store.set({});
    this.views.set({});
    this.loading.set(false);
    this.error.set(null);
  }

  private translate(key: LanguageKey, params?: LanguageParams): string {
    return this.languageService.translate(key, params);
  }

  private syncFinished(): void {
    const finished = this.translation.finished();
    if (finished && finished.kind === ANALYSIS_KIND) {
      untracked(this.load.bind(this, finished.novelId));
    }
  }

  private syncWorkspace(): void {
    const path = this.workspace.current()?.path ?? null;
    untracked(this.applyWorkspace.bind(this, path));
  }

  private applyWorkspace(path: string | null): void {
    if (path !== this.workspacePath) {
      this.workspacePath = path;
      this.reset();
    }
  }
}
