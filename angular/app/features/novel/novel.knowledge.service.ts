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
import { KnowledgeEdit, KnowledgeEditResult, KnowledgeIssue, KnowledgeLang, KnowledgeTab, KnowledgeView, KnowledgeVisibility, NovelKnowledge, WireKnowledge } from "./novel.knowledge.models";
import { EMPTY_KNOWLEDGE, checkKnowledge, emptyView, visibilityOf } from "./novel.knowledge.rules";
import { targetsOf } from "./novel.translation.rules";

function storeKey(novelId: number, lang: KnowledgeLang): string {
  return `${novelId}:${lang}`;
}

@Injectable({ providedIn: "root" })
export class NovelKnowledgeService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly novels = inject(NovelService);
  private readonly translation = inject(NovelTranslationService);
  private readonly workspace = inject(WorkspaceService);
  private readonly languageService = inject(LanguageService);
  private readonly dialogs = inject(DialogService);
  private readonly store = signal<Record<string, NovelKnowledge>>({});
  private readonly views = signal<Record<number, KnowledgeView>>({});
  private workspacePath: string | null | undefined = undefined;

  readonly loading = signal(false);
  readonly error = signal<NovelError | null>(null);

  constructor() {
    effect(this.syncWorkspace.bind(this));
    effect(this.syncFinished.bind(this));
  }

  defaultLangOf(novelId: number): KnowledgeLang {
    const lang = this.novels.novelById(novelId)?.lang;
    const targets = targetsOf(lang);
    if (lang === "VI") {
      return "src";
    }
    return targets.includes("VI") ? "VI" : (targets[0] ?? "src");
  }

  of(novelId: number, lang: KnowledgeLang = this.viewOf(novelId).lang): NovelKnowledge {
    return this.store()[storeKey(novelId, lang)] ?? EMPTY_KNOWLEDGE;
  }

  isLoaded(novelId: number, lang: KnowledgeLang = this.viewOf(novelId).lang): boolean {
    return this.store()[storeKey(novelId, lang)] !== undefined;
  }

  viewOf(novelId: number): KnowledgeView {
    return this.views()[novelId] ?? emptyView(this.defaultLangOf(novelId));
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

  setLang(novelId: number, lang: KnowledgeLang): void {
    this.patchView(novelId, { lang, sel: null });
    void this.ensure(novelId, lang);
  }

  select(novelId: number, id: string | null): void {
    this.patchView(novelId, { sel: id });
  }

  clearFilters(novelId: number): void {
    this.patchView(novelId, { q: "", type: "all", chapter: 0, onlyIssues: false });
  }

  async ensure(novelId: number, lang: KnowledgeLang = this.viewOf(novelId).lang): Promise<void> {
    if (!this.isLoaded(novelId, lang)) {
      await this.load(novelId, lang);
    }
  }

  async load(novelId: number, lang: KnowledgeLang = this.viewOf(novelId).lang): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const wire = await this.ipc.invoke<WireKnowledge>("knowledge_get", { novelId, lang });
      await this.novels.loadChapters(novelId);
      this.storeKnowledge(novelId, lang, wire);
    } catch (cause) {
      this.error.set(toNovelError(cause));
    } finally {
      this.loading.set(false);
    }
  }

  async apply(novelId: number, edits: KnowledgeEdit[]): Promise<KnowledgeEditResult> {
    const lang = this.viewOf(novelId).lang;
    const result = await this.ipc.invoke<KnowledgeEditResult>("knowledge_edit", { novelId, lang, edits });
    this.storeKnowledge(novelId, lang, result.knowledge);
    this.followRemap(novelId, lang, result);
    return result;
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

  async staleAccept(novelId: number, chapters: number[]): Promise<void> {
    const lang = this.viewOf(novelId).lang;
    const wire = await this.ipc.invoke<WireKnowledge>("knowledge_stale_accept", { novelId, lang, chapters });
    this.storeKnowledge(novelId, lang, wire);
  }

  async analyze(novelId: number, seqs: number[], lang: KnowledgeLang, _overwrite: boolean): Promise<void> {
    const chapterIds = this.novels.chaptersOf(novelId).filter((row) => seqs.includes(row.seq)).map((row) => row.id);
    await this.translation.startAnalysis(novelId, lang, chapterIds);
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

  private storeKnowledge(novelId: number, lang: KnowledgeLang, wire: WireKnowledge): void {
    this.store.set({ ...this.store(), [storeKey(novelId, lang)]: { lang, items: wire.items, analyzed: wire.analyzed } });
  }

  private followRemap(novelId: number, lang: KnowledgeLang, result: KnowledgeEditResult): void {
    const view = this.viewOf(novelId);
    if (view.lang !== lang || view.sel === null) {
      return;
    }
    const next = result.remap[view.sel] ?? view.sel;
    this.select(novelId, result.knowledge.items.some((item) => item.id === next) ? next : null);
  }

  private syncFinished(): void {
    const finished = this.translation.finished();
    if (finished && finished.kind === ANALYSIS_KIND) {
      untracked(this.load.bind(this, finished.novelId, finished.target as KnowledgeLang));
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
