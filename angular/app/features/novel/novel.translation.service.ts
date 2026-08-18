import { Injectable, effect, inject, signal, untracked } from "@angular/core";
import { DesktopIpcService } from "@app/core/desktop/desktop-ipc.service";
import { I18nService } from "@app/core/i18n/i18n.service";
import { WorkspaceService } from "../workspace/workspace.service";
import { ChapterRow, NovelError, ParagraphSaveResult, TargetLang, TranslationStatus } from "./novel.models";
import { NovelService } from "./novel.service";
import { formatStamp, clampSeq, normalizeParagraphText, toNovelError } from "./novel.rules";
import { ChapterTranslation, DictChange, DictDraft, DictEntry, NovelTranslation, PassageTranslation, TranslatedChapter, TranslationStep, TranslationView, TranslationWarning, WarningKind, WarningState } from "./novel.translation.models";
import { EMPTY_VIEW, chapterStatus, emptyTranslation, flaggedPassages, targetsOf, nextEntryId, nextWarningId, openWarnings, replaceEntry, replaceWarning, reviewCount, translatedCount, withoutEntry } from "./novel.translation.rules";

const EMPTY = emptyTranslation();

function storeKey(novelId: number, target: TargetLang): string {
  return `${novelId}:${target}`;
}

function nowStamp(): string {
  return formatStamp(new Date().toISOString());
}

function withPassage(chapter: ChapterTranslation, n: number, passage: PassageTranslation): ChapterTranslation {
  return { ...chapter, passages: { ...chapter.passages, [n]: passage } };
}

function fromTranslated(run: TranslatedChapter, old: ChapterTranslation | undefined): ChapterTranslation {
  const passages: Record<number, PassageTranslation> = {};
  for (const row of run.passages) {
    passages[row.n] = { text: row.text, state: "draft", previous: "draft", note: old?.passages[row.n]?.note ?? null };
  }
  return { title: run.title, passages };
}

function settledPassage(passage: PassageTranslation, warnings: TranslationWarning[], n: number): PassageTranslation {
  const stillOpen = warnings.some((warning) => warning.state === "open" && warning.n === n);
  return passage.state === "review" && !stillOpen ? { ...passage, state: passage.previous } : passage;
}

function raised(passage: PassageTranslation): PassageTranslation {
  return passage.state === "review" ? passage : { ...passage, previous: passage.state, state: "review" };
}

@Injectable({ providedIn: "root" })
export class NovelTranslationService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly novels = inject(NovelService);
  private readonly workspace = inject(WorkspaceService);
  private readonly i18n = inject(I18nService);
  private readonly store = signal<Record<string, NovelTranslation>>({});
  private readonly views = signal<Record<number, TranslationView>>({});
  private readonly runs = signal<Record<string, Record<string, number>>>({});
  private workspacePath: string | null | undefined = undefined;

  readonly loading = signal(false);
  readonly error = signal<NovelError | null>(null);

  constructor() {
    effect(this.syncWorkspace.bind(this));
  }

  targetOf(novelId: number): TargetLang {
    const targets = targetsOf(this.novels.novelById(novelId)?.lang);
    const wanted = this.viewOf(novelId).target;
    return wanted !== null && targets.includes(wanted) ? wanted : (targets[0] ?? "VI");
  }

  of(novelId: number, target: TargetLang = this.targetOf(novelId)): NovelTranslation {
    return this.store()[storeKey(novelId, target)] ?? EMPTY;
  }

  viewOf(novelId: number): TranslationView {
    return this.views()[novelId] ?? EMPTY_VIEW;
  }

  progressOf(novelId: number, target: TargetLang = this.targetOf(novelId)): Record<string, number> {
    return this.runs()[storeKey(novelId, target)] ?? {};
  }

  isTranslating(novelId: number): boolean {
    return Object.keys(this.progressOf(novelId)).length > 0;
  }

  statusOf(novelId: number, chapterId: string): TranslationStatus {
    return chapterStatus(this.of(novelId), chapterId, Object.keys(this.progressOf(novelId)));
  }

  reviewCountOf(novelId: number): number {
    return reviewCount(this.of(novelId));
  }

  translatedCountOf(novelId: number): number {
    return translatedCount(this.of(novelId));
  }

  openWarningsOf(novelId: number): TranslationWarning[] {
    return openWarnings(this.of(novelId).warnings);
  }

  async ensure(novelId: number, target: TargetLang = this.targetOf(novelId)): Promise<void> {
    if (!this.store()[storeKey(novelId, target)]) {
      await this.load(novelId, target);
    }
  }

  titleOf(novelId: number, chapterId: string, target: TargetLang = this.targetOf(novelId)): string | null {
    return this.of(novelId, target).chapters[chapterId]?.title || null;
  }

  setTarget(novelId: number, target: TargetLang): void {
    this.patchView(novelId, { target, picks: [], seq: 1 });
    void this.ensure(novelId, target);
  }

  async load(novelId: number, target: TargetLang = this.targetOf(novelId)): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const translation = await this.ipc.invoke<NovelTranslation>("novel_translation_get", { novelId, target });
      this.store.set({ ...this.store(), [storeKey(novelId, target)]: translation });
      await this.novels.loadChapters(novelId);
    } catch (cause) {
      this.error.set(toNovelError(cause));
    } finally {
      this.loading.set(false);
    }
  }

  setStep(novelId: number, step: TranslationStep): void {
    this.patchView(novelId, { step });
  }

  setSeq(novelId: number, seq: number): void {
    this.patchView(novelId, { seq: clampSeq(seq, this.novels.chaptersOf(novelId).length) });
  }

  setPicks(novelId: number, picks: string[]): void {
    this.patchView(novelId, { picks });
  }

  pickChapter(novelId: number, chapterId: string, on: boolean): void {
    const rest = this.viewOf(novelId).picks.filter((id) => id !== chapterId);
    this.setPicks(novelId, on ? [...rest, chapterId] : rest);
  }

  goTranslate(novelId: number, chapter: ChapterRow): void {
    const picks = this.viewOf(novelId).picks.filter((id) => id !== chapter.id);
    this.patchView(novelId, { step: "trans", seq: chapter.seq, picks: [...picks, chapter.id] });
  }

  focusPassage(novelId: number, seq: number, n: number | null): void {
    this.patchView(novelId, { step: "result", seq, focus: n });
  }

  consumeFocus(novelId: number): number | null {
    const target = this.viewOf(novelId).focus;
    this.patchView(novelId, { focus: null });
    return target;
  }

  startEntry(novelId: number): void {
    this.patchView(novelId, { step: "dict", newEntry: true });
  }

  consumeEntry(novelId: number): boolean {
    const wanted = this.viewOf(novelId).newEntry;
    this.patchView(novelId, { newEntry: false });
    return wanted;
  }

  async saveGuidelines(novelId: number, text: string): Promise<boolean> {
    const target = this.targetOf(novelId);
    const current = this.of(novelId, target);
    const guidelines = text.trim();
    if (guidelines === current.guidelines) {
      return false;
    }
    const reason = this.i18n.translate("novel.translation.warn.reason.guideline");
    let next: NovelTranslation = { ...current, guidelines };
    for (const chapterId of Object.keys(current.chapters)) {
      next = this.withWarning(next, novelId, "guideline", chapterId, null, reason);
    }
    await this.commit(novelId, target, next);
    return true;
  }

  async addEntry(novelId: number, draft: DictDraft): Promise<DictChange> {
    const target = this.targetOf(novelId);
    const current = this.of(novelId, target);
    const entry: DictEntry = { id: nextEntryId(current.dict), src: draft.src.trim(), dst: draft.dst.trim(), type: draft.type, note: draft.note.trim() };
    return this.flagEntry(novelId, target, { ...current, dict: [...current.dict, entry] }, entry);
  }

  async updateEntry(novelId: number, id: string, patch: Partial<DictDraft>): Promise<DictChange | null> {
    const target = this.targetOf(novelId);
    const current = this.of(novelId, target);
    const before = current.dict.find((entry) => entry.id === id);
    if (!before) {
      return null;
    }
    const entry: DictEntry = { ...before, ...patch };
    return this.flagEntry(novelId, target, { ...current, dict: replaceEntry(current.dict, entry) }, entry);
  }

  async removeEntry(novelId: number, id: string): Promise<void> {
    const target = this.targetOf(novelId);
    const current = this.of(novelId, target);
    await this.commit(novelId, target, { ...current, dict: withoutEntry(current.dict, id) });
  }

  async translate(novelId: number, chapterIds: string[]): Promise<void> {
    const target = this.targetOf(novelId);
    this.setPicks(novelId, []);
    for (const chapterId of chapterIds) {
      await this.translateChapter(novelId, target, chapterId, null);
    }
  }

  async retranslate(novelId: number, warningId: string): Promise<void> {
    const target = this.targetOf(novelId);
    const warning = this.of(novelId, target).warnings.find((item) => item.id === warningId);
    if (warning) {
      const by = this.i18n.translate(warning.n === null ? "novel.translation.warn.by.retranslateChapter" : "novel.translation.warn.by.retranslatePassage");
      await this.translateChapter(novelId, target, warning.chapterId, warning.n);
      await this.settle(novelId, warningId, "resolved", by, target);
    }
  }

  async saveParagraph(novelId: number, chapterId: string, n: number, text: string): Promise<ParagraphSaveResult> {
    const target = this.targetOf(novelId);
    const current = this.of(novelId, target);
    const passage = current.chapters[chapterId]?.passages[n];
    const value = normalizeParagraphText(text);
    if (!passage) {
      return "idle";
    }
    if (!value) {
      return "empty";
    }
    if (value === passage.text) {
      return "unchanged";
    }
    const edited: PassageTranslation = { ...passage, text: value };
    const chapters = { ...current.chapters, [chapterId]: withPassage(current.chapters[chapterId], n, edited) };
    const by = this.i18n.translate("novel.translation.warn.by.edit");
    await this.commit(novelId, target, this.settled({ ...current, chapters }, chapterId, n, by));
    return "saved";
  }

  async setNote(novelId: number, chapterId: string, n: number, text: string): Promise<void> {
    const value = text.trim();
    const target = this.targetOf(novelId);
    const current = this.of(novelId, target);
    const passage = current.chapters[chapterId]?.passages[n];
    if (passage && value !== (passage.note?.text ?? "")) {
      const noted: PassageTranslation = { ...passage, note: value ? { text: value, date: nowStamp() } : null };
      await this.commit(novelId, target, { ...current, chapters: { ...current.chapters, [chapterId]: withPassage(current.chapters[chapterId], n, noted) } });
    }
  }

  async settle(novelId: number, warningId: string, state: WarningState, by: string, target: TargetLang = this.targetOf(novelId)): Promise<void> {
    const current = this.of(novelId, target);
    const warning = current.warnings.find((item) => item.id === warningId);
    if (!warning) {
      return;
    }
    const warnings = replaceWarning(current.warnings, { ...warning, state, by });
    let next: NovelTranslation = { ...current, warnings };
    if (warning.n !== null) {
      next = this.withSettledPassage(next, warning.chapterId, warning.n);
    }
    await this.commit(novelId, target, next);
  }

  async reopen(novelId: number, warningId: string): Promise<void> {
    const target = this.targetOf(novelId);
    const current = this.of(novelId, target);
    const warning = current.warnings.find((item) => item.id === warningId);
    if (warning) {
      await this.commit(novelId, target, { ...current, warnings: replaceWarning(current.warnings, { ...warning, state: "open", by: "" }) });
    }
  }

  reset(): void {
    this.store.set({});
    this.views.set({});
    this.runs.set({});
    this.loading.set(false);
    this.error.set(null);
  }

  private async translateChapter(novelId: number, target: TargetLang, chapterId: string, passage: number | null): Promise<void> {
    this.setProgress(novelId, target, chapterId, 0);
    try {
      const channel = this.ipc.channel<number>(this.setProgress.bind(this, novelId, target, chapterId));
      const run = await this.ipc.invoke<TranslatedChapter>("novel_translation_run", { novelId, target, chapterId, passage, onEvent: channel });
      await this.applyRun(novelId, target, chapterId, passage, run);
    } finally {
      this.clearProgress(novelId, target, chapterId);
    }
  }

  private async applyRun(novelId: number, target: TargetLang, chapterId: string, passage: number | null, run: TranslatedChapter): Promise<void> {
    const current = this.of(novelId, target);
    const old = current.chapters[chapterId];
    const fresh = fromTranslated(run, old);
    let chapter = fresh;
    if (passage !== null && old) {
      chapter = { title: old.title, passages: { ...old.passages, ...fresh.passages } };
    }
    const by = this.i18n.translate("novel.translation.warn.by.retranslateChapter");
    const next: NovelTranslation = { ...current, chapters: { ...current.chapters, [chapterId]: chapter } };
    await this.commit(novelId, target, passage === null ? this.settledChapter(next, chapterId, by) : next);
  }

  private settledChapter(translation: NovelTranslation, chapterId: string, by: string): NovelTranslation {
    const warnings: TranslationWarning[] = [];
    for (const warning of translation.warnings) {
      const hit = warning.chapterId === chapterId && warning.state === "open";
      warnings.push(hit ? { ...warning, state: "resolved", by } : warning);
    }
    return { ...translation, warnings };
  }

  private settled(translation: NovelTranslation, chapterId: string, n: number, by: string): NovelTranslation {
    const warnings: TranslationWarning[] = [];
    for (const warning of translation.warnings) {
      const hit = warning.chapterId === chapterId && warning.n === n && warning.state === "open";
      warnings.push(hit ? { ...warning, state: "resolved", by } : warning);
    }
    return this.withSettledPassage({ ...translation, warnings }, chapterId, n);
  }

  private withSettledPassage(translation: NovelTranslation, chapterId: string, n: number): NovelTranslation {
    const chapter = translation.chapters[chapterId];
    const passage = chapter?.passages[n];
    if (!chapter || !passage) {
      return translation;
    }
    const next = settledPassage(passage, translation.warnings, n);
    return { ...translation, chapters: { ...translation.chapters, [chapterId]: withPassage(chapter, n, next) } };
  }

  private async flagEntry(novelId: number, target: TargetLang, base: NovelTranslation, entry: DictEntry): Promise<DictChange> {
    let next = base;
    let flagged = 0;
    for (const chapterId of Object.keys(base.chapters)) {
      const source = await this.novels.readChapter(novelId, chapterId);
      const hits = flaggedPassages(entry, source, next.chapters[chapterId]);
      flagged += hits.length;
      next = this.flagPassages(next, novelId, chapterId, entry, hits);
    }
    await this.commit(novelId, target, next);
    return { entry, flagged };
  }

  private flagPassages(translation: NovelTranslation, novelId: number, chapterId: string, entry: DictEntry, hits: number[]): NovelTranslation {
    let next = translation;
    for (const n of hits) {
      const chapter = next.chapters[chapterId];
      const passage = chapter.passages[n];
      const reason = this.i18n.translate("novel.translation.warn.reason.dict", { src: entry.src, dst: entry.dst });
      next = { ...next, chapters: { ...next.chapters, [chapterId]: withPassage(chapter, n, raised(passage)) } };
      next = this.withWarning(next, novelId, "dict", chapterId, n, reason);
    }
    return next;
  }

  private withWarning(translation: NovelTranslation, novelId: number, kind: WarningKind, chapterId: string, n: number | null, reason: string): NovelTranslation {
    const seq = this.novels.chaptersOf(novelId).find((chapter) => chapter.id === chapterId)?.seq ?? 0;
    const open = translation.warnings.find((warning) => warning.state === "open" && warning.kind === kind && warning.chapterId === chapterId && warning.n === n);
    const base = { kind, chapterId, seq, n, reason, state: "open" as WarningState, by: "", date: nowStamp() };
    if (open) {
      return { ...translation, warnings: replaceWarning(translation.warnings, { ...base, id: open.id }) };
    }
    return { ...translation, warnings: [...translation.warnings, { ...base, id: nextWarningId(translation.warnings) }] };
  }

  private async commit(novelId: number, target: TargetLang, next: NovelTranslation): Promise<void> {
    this.store.set({ ...this.store(), [storeKey(novelId, target)]: next });
    await this.ipc.invoke<void>("novel_translation_save", { novelId, target, translation: next });
  }

  private patchView(novelId: number, patch: Partial<TranslationView>): void {
    this.views.set({ ...this.views(), [novelId]: { ...this.viewOf(novelId), ...patch } });
  }

  private setProgress(novelId: number, target: TargetLang, chapterId: string, percent: number): void {
    this.runs.set({ ...this.runs(), [storeKey(novelId, target)]: { ...this.progressOf(novelId, target), [chapterId]: percent } });
  }

  private clearProgress(novelId: number, target: TargetLang, chapterId: string): void {
    const rest = { ...this.progressOf(novelId, target) };
    delete rest[chapterId];
    this.runs.set({ ...this.runs(), [storeKey(novelId, target)]: rest });
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
