import { Injectable, computed, effect, inject, signal, untracked } from "@angular/core";
import { DesktopIpcService } from "@app/core/desktop/desktop-ipc.service";
import { WorkspaceService } from "../workspace/workspace.service";
import { ChapterRow } from "./novel.models";
import { NovelError } from "./novel.models";
import { NovelScreen } from "./novel.models";
import { ParagraphRow } from "./novel.models";
import { ParagraphSaveResult } from "./novel.models";
import { ReaderLang } from "./novel.models";
import { ReaderLayout } from "./novel.models";
import { ReaderMode } from "./novel.models";
import { ReaderPrefs } from "./novel.models";
import { TargetLang } from "./novel.models";
import { ReaderView } from "./novel.models";
import { NovelService } from "./novel.service";
import { targetsOf } from "./novel.translation.rules";
import { NovelTranslationService } from "./novel.translation.service";
import { READER_PREF_DEFAULT } from "./novel.rules";
import { clampSeq } from "./novel.rules";
import { isChapterLocked } from "./novel.rules";
import { normalizeParagraphText } from "./novel.rules";
import { readerPageStyle } from "./novel.rules";
import { sanitizePrefs } from "./novel.rules";
import { toNovelError } from "./novel.rules";

const PREFS_STORAGE_KEY = "ds.rd.prefs";

const DEFAULT_VIEW: ReaderView = { lang: "src", layout: "single" };

function WRITE_TEXT_OF(row: ParagraphRow): string {
  return row.text;
}

function readPrefs(): ReaderPrefs {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    return sanitizePrefs(raw === null ? null : JSON.parse(raw));
  } catch {
    return { ...READER_PREF_DEFAULT };
  }
}

function storePrefs(prefs: ReaderPrefs): void {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    return;
  }
}

function findChapter(rows: ChapterRow[], seq: number): ChapterRow | null {
  for (const row of rows) {
    if (row.seq === seq) {
      return row;
    }
  }
  return null;
}

function findChapterById(rows: ChapterRow[], id: string | null): ChapterRow | null {
  for (const row of rows) {
    if (row.id === id) {
      return row;
    }
  }
  return null;
}

function findParagraph(rows: ParagraphRow[], n: number): ParagraphRow | null {
  for (const row of rows) {
    if (row.n === n) {
      return row;
    }
  }
  return null;
}

@Injectable({ providedIn: "root" })
export class NovelReaderService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly novels = inject(NovelService);
  private readonly workspace = inject(WorkspaceService);
  private readonly translation = inject(NovelTranslationService);
  private readonly views = signal<Record<number, ReaderView>>({});
  private readonly screens = signal<Record<number, NovelScreen>>({});
  private readonly positions = signal<Record<number, number>>({});
  private token = 0;
  private workspacePath: string | null | undefined = undefined;

  readonly novelId = signal<number | null>(null);
  readonly seq = signal(1);
  readonly mode = signal<ReaderMode>("read");
  readonly editing = signal<number | null>(null);
  readonly focus = signal<number | null>(null);
  readonly paragraphs = signal<ParagraphRow[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<NovelError | null>(null);
  readonly prefs = signal<ReaderPrefs>(readPrefs());

  readonly chapters = computed(this.buildChapters.bind(this));
  readonly total = computed(this.buildTotal.bind(this));
  readonly current = computed(this.buildCurrent.bind(this));
  readonly nextChapter = computed(this.buildNextChapter.bind(this));
  readonly hasPrev = computed(this.buildHasPrev.bind(this));
  readonly hasNext = computed(this.buildHasNext.bind(this));
  readonly view = computed(this.buildView.bind(this));
  readonly showSource = computed(this.buildShowSource.bind(this));
  readonly canEdit = computed(this.buildCanEdit.bind(this));
  readonly writing = computed(this.buildWriting.bind(this));
  readonly fullText = computed(this.buildFullText.bind(this));
  readonly canAdd = computed(this.buildCanAdd.bind(this));
  readonly adding = computed(this.buildAdding.bind(this));
  readonly pageStyle = computed(this.buildPageStyle.bind(this));

  constructor() {
    effect(this.syncWorkspace.bind(this));
  }

  screenOf(novelId: number): NovelScreen {
    return this.screens()[novelId] ?? "chapters";
  }

  viewOf(novelId: number): ReaderView {
    return this.views()[novelId] ?? DEFAULT_VIEW;
  }

  setLang(novelId: number, lang: ReaderLang): void {
    this.patchView(novelId, { lang });
  }

  setLayout(novelId: number, layout: ReaderLayout): void {
    this.patchView(novelId, { layout });
  }

  titleOf(novelId: number, chapter: ChapterRow): string {
    if (this.viewOf(novelId).lang === "src") {
      return chapter.title;
    }
    return this.translation.titleOf(novelId, chapter.id, this.readerTarget(novelId)) ?? chapter.title;
  }

  readerTarget(novelId: number): TargetLang {
    const lang = this.viewOf(novelId).lang;
    return lang === "src" ? (targetsOf(this.novels.novelById(novelId)?.lang)[0] ?? "VI") : lang;
  }

  resumeSeq(novelId: number): number {
    return this.positions()[novelId] ?? 1;
  }

  async openNovel(novelId: number): Promise<void> {
    this.activate(novelId);
    this.setScreen(novelId, "chapters");
    this.editing.set(null);
    await this.novels.loadChapters(novelId);
  }

  async openReader(novelId: number, seq?: number, paragraph?: number): Promise<void> {
    const token = this.activate(novelId);
    this.setScreen(novelId, "reading");
    this.editing.set(null);
    this.focus.set(paragraph ?? null);
    const rows = await this.novels.loadChapters(novelId);
    if (token === this.token) {
      await this.showChapter(novelId, seq ?? this.resumeSeq(novelId), rows.length);
    }
  }

  backToChapters(novelId: number): void {
    this.editing.set(null);
    this.setScreen(novelId, "chapters");
  }

  async gotoChapter(seq: number): Promise<void> {
    const novelId = this.novelId();
    if (novelId !== null) {
      this.editing.set(null);
      this.focus.set(null);
      await this.showChapter(novelId, seq, this.total());
    }
  }

  async prev(): Promise<void> {
    await this.gotoChapter(this.seq() - 1);
  }

  async next(): Promise<void> {
    await this.gotoChapter(this.seq() + 1);
  }

  setMode(mode: ReaderMode): void {
    this.mode.set(mode);
    this.editing.set(null);
  }

  startEdit(n: number): void {
    if (this.canEdit()) {
      this.editing.set(n);
    }
  }

  cancelEdit(): void {
    this.editing.set(null);
  }

  startAddPassage(): void {
    if (this.canAdd()) {
      this.editing.set(this.paragraphs().length + 1);
    }
  }

  async renameChapter(title: string): Promise<ParagraphSaveResult> {
    const novelId = this.novelId();
    const chapter = this.current();
    const value = title.trim();
    if (novelId === null || chapter === null) {
      return "idle";
    }
    if (!value) {
      return "empty";
    }
    if (value === chapter.title) {
      return "unchanged";
    }
    const row = await this.ipc.invoke<ChapterRow>("novel_chapter_rename", {
      novelId,
      chapterId: chapter.id,
      title: value,
    });
    this.novels.applyChapterUpdate(row);
    return "saved";
  }

  async moveChapter(novelId: number, chapterId: string, toSeq: number): Promise<void> {
    const resume = this.resumeChapterId(novelId);
    const rows = await this.novels.moveChapter(novelId, chapterId, toSeq);
    this.followChapter(novelId, resume, rows);
  }

  async deleteChapter(novelId: number, chapterId: string): Promise<void> {
    const resume = this.resumeChapterId(novelId);
    const seq = this.resumeSeq(novelId);
    const rows = await this.novels.deleteChapter(novelId, chapterId);
    const kept = resume === chapterId ? null : resume;
    this.followChapter(novelId, kept, rows, seq);
    if (this.novelId() === novelId) {
      await this.syncOpenChapter(novelId, rows.length);
    }
  }

  async invalidate(novelId: number, chapterId: string): Promise<void> {
    if (this.novelId() === novelId && this.current()?.id === chapterId) {
      await this.readParagraphs(novelId, chapterId);
    }
  }

  consumeFocus(): number | null {
    const target = this.focus();
    this.focus.set(null);
    return target;
  }

  async saveParagraph(text: string): Promise<ParagraphSaveResult> {
    const n = this.editing();
    const novelId = this.novelId();
    const chapter = this.current();
    if (n === null || novelId === null || chapter === null) {
      return "idle";
    }
    const value = normalizeParagraphText(text);
    if (!value) {
      return "empty";
    }
    if (this.adding()) {
      await this.appendParagraph(novelId, chapter.id, value);
      return "saved";
    }
    if (findParagraph(this.paragraphs(), n)?.text === value) {
      this.editing.set(null);
      return "unchanged";
    }
    await this.writeParagraph(novelId, chapter.id, n, value);
    return "saved";
  }

  async saveChapter(text: string): Promise<ParagraphSaveResult> {
    const novelId = this.novelId();
    const chapter = this.current();
    if (novelId === null || chapter === null || !this.writing()) {
      return "idle";
    }
    if (!text.trim()) {
      return "empty";
    }
    if (text === this.fullText()) {
      return "unchanged";
    }
    this.saving.set(true);
    try {
      const row = await this.ipc.invoke<ChapterRow>("novel_chapter_write", {
        novelId,
        chapterId: chapter.id,
        text,
      });
      this.novels.applyChapterUpdate(row);
      await this.readParagraphs(novelId, chapter.id);
    } finally {
      this.saving.set(false);
    }
    return "saved";
  }

  setPref<K extends keyof ReaderPrefs>(key: K, value: ReaderPrefs[K]): void {
    this.prefs.set({ ...this.prefs(), [key]: value });
    storePrefs(this.prefs());
  }

  resetPrefs(): void {
    this.prefs.set({ ...READER_PREF_DEFAULT });
    storePrefs(this.prefs());
  }

  closeNovels(ids: number[]): void {
    const open = this.novelId();
    if (open !== null && ids.includes(open)) {
      this.clearOpen();
    }
    const screens = { ...this.screens() };
    const positions = { ...this.positions() };
    const views = { ...this.views() };
    for (const id of ids) {
      delete screens[id];
      delete positions[id];
      delete views[id];
    }
    this.screens.set(screens);
    this.positions.set(positions);
    this.views.set(views);
  }

  reset(): void {
    this.clearOpen();
    this.screens.set({});
    this.positions.set({});
    this.views.set({});
    this.mode.set("read");
  }

  private patchView(novelId: number, patch: Partial<ReaderView>): void {
    const next = { ...this.viewOf(novelId), ...patch };
    if (next.lang === "src") {
      next.layout = "single";
    }
    this.views.set({ ...this.views(), [novelId]: next });
    if (next.lang !== "src" || next.layout === "parallel") {
      void this.translation.ensure(novelId, this.readerTarget(novelId));
    }
    if (this.novelId() === novelId && !this.buildShowSource()) {
      this.editing.set(null);
    }
  }

  private activate(novelId: number): number {
    this.token += 1;
    if (this.novelId() !== novelId) {
      this.paragraphs.set([]);
      this.error.set(null);
    }
    this.novelId.set(novelId);
    return this.token;
  }

  private clearOpen(): void {
    this.token += 1;
    this.novelId.set(null);
    this.seq.set(1);
    this.editing.set(null);
    this.focus.set(null);
    this.paragraphs.set([]);
    this.loading.set(false);
    this.saving.set(false);
    this.error.set(null);
  }

  private setScreen(novelId: number, screen: NovelScreen): void {
    this.screens.set({ ...this.screens(), [novelId]: screen });
  }

  private async showChapter(novelId: number, seq: number, total: number): Promise<void> {
    const next = clampSeq(seq, total);
    this.seq.set(next);
    this.positions.set({ ...this.positions(), [novelId]: next });
    const chapter = findChapter(this.novels.chaptersOf(novelId), next);
    if (chapter) {
      await this.readParagraphs(novelId, chapter.id);
      return;
    }
    this.paragraphs.set([]);
  }

  private async readParagraphs(novelId: number, chapterId: string): Promise<void> {
    const token = ++this.token;
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await this.ipc.invoke<ParagraphRow[]>("novel_chapter_read", {
        novelId,
        chapterId,
      });
      if (token === this.token) {
        this.paragraphs.set(rows);
      }
    } catch (cause) {
      if (token === this.token) {
        this.paragraphs.set([]);
        this.error.set(toNovelError(cause));
      }
    } finally {
      if (token === this.token) {
        this.loading.set(false);
      }
    }
  }

  private resumeChapterId(novelId: number): string | null {
    return findChapter(this.novels.chaptersOf(novelId), this.resumeSeq(novelId))?.id ?? null;
  }

  private followChapter(novelId: number, id: string | null, rows: ChapterRow[], fallback = 1): void {
    const moved = findChapterById(rows, id);
    const seq = moved ? moved.seq : clampSeq(fallback, rows.length);
    this.positions.set({ ...this.positions(), [novelId]: seq });
  }

  private async syncOpenChapter(novelId: number, total: number): Promise<void> {
    this.editing.set(null);
    if (total === 0) {
      this.setScreen(novelId, "chapters");
      this.paragraphs.set([]);
      return;
    }
    await this.showChapter(novelId, this.resumeSeq(novelId), total);
  }

  private async appendParagraph(novelId: number, chapterId: string, text: string): Promise<void> {
    this.saving.set(true);
    try {
      const row = await this.ipc.invoke<ChapterRow>("novel_paragraph_add", {
        novelId,
        chapterId,
        text,
      });
      this.novels.applyChapterUpdate(row);
      this.editing.set(null);
      await this.readParagraphs(novelId, chapterId);
    } finally {
      this.saving.set(false);
    }
  }

  private async writeParagraph(
    novelId: number,
    chapterId: string,
    n: number,
    text: string,
  ): Promise<void> {
    this.saving.set(true);
    try {
      const row = await this.ipc.invoke<ChapterRow>("novel_paragraph_update", {
        novelId,
        chapterId,
        n,
        text,
      });
      this.novels.applyChapterUpdate(row);
      this.editing.set(null);
      await this.readParagraphs(novelId, chapterId);
    } finally {
      this.saving.set(false);
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

  private buildChapters(): ChapterRow[] {
    const novelId = this.novelId();
    return novelId === null ? [] : this.novels.chaptersOf(novelId);
  }

  private buildTotal(): number {
    return this.chapters().length;
  }

  private buildCurrent(): ChapterRow | null {
    return findChapter(this.chapters(), this.seq());
  }

  private buildNextChapter(): ChapterRow | null {
    return findChapter(this.chapters(), this.seq() + 1);
  }

  private buildHasPrev(): boolean {
    return this.seq() > 1;
  }

  private buildHasNext(): boolean {
    return this.seq() < this.total();
  }

  private buildView(): ReaderView {
    const novelId = this.novelId();
    return novelId === null ? DEFAULT_VIEW : this.viewOf(novelId);
  }

  private buildShowSource(): boolean {
    return this.view().lang === "src";
  }

  private buildCanEdit(): boolean {
    return this.mode() === "edit" && this.showSource();
  }

  private buildWriting(): boolean {
    const chapter = this.current();
    return this.mode() === "write" && this.showSource() && chapter !== null && !this.loading();
  }

  private buildFullText(): string {
    return this.paragraphs().map(WRITE_TEXT_OF).join("\n\n");
  }

  private buildCanAdd(): boolean {
    const chapter = this.current();
    return this.canEdit() && chapter !== null && !isChapterLocked(chapter);
  }

  private buildAdding(): boolean {
    const n = this.editing();
    return n !== null && n === this.paragraphs().length + 1;
  }

  private buildPageStyle(): string {
    return readerPageStyle(this.prefs());
  }
}
