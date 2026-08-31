import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';

import { WorkspaceService } from '../workspace/workspace.service';
// prettier-ignore
import { ChapterRow, CoverEntry, ExportSummary, InspectEvent, LangCount, NovelError, NovelFilters, NovelInput, NovelLang, NovelPatch, NovelSummary, NovelTotals, NovelViewMode, PackageSummary, ParagraphRow, TagAddResult, TagCount } from './novel.models';
// prettier-ignore
import { checkTag, compareNewestFirst, filterNovels, isDuplicateTitle, langCounts, normTag, novelTotals, pruneLangs, pruneTags, RECENT_LIMIT, recentNovels, tagCounts, toggled, toNovelError, withoutTag } from './novel.rules';

const VIEW_STORAGE_KEY = 'ds.nm.view';

function readViewMode(): NovelViewMode {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    return raw !== null && JSON.parse(raw) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function storeViewMode(mode: NovelViewMode): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(mode));
  } catch {
    return;
  }
}

function coverKey(novel: NovelSummary): string {
  return `${novel.id}:${novel.updatedAt}`;
}

function replaceById(list: NovelSummary[], next: NovelSummary): NovelSummary[] {
  const out: NovelSummary[] = [];
  for (const item of list) {
    out.push(item.id === next.id ? next : item);
  }
  return out;
}

function withoutIds(list: NovelSummary[], ids: Set<number>): NovelSummary[] {
  const out: NovelSummary[] = [];
  for (const item of list) {
    if (!ids.has(item.id)) {
      out.push(item);
    }
  }
  return out;
}

function omitKeys<T>(record: Record<number, T>, ids: Set<number>): Record<number, T> {
  const out: Record<number, T> = {};
  for (const key of Object.keys(record)) {
    const id = Number(key);
    if (!ids.has(id)) {
      out[id] = record[id] as T;
    }
  }
  return out;
}

function sumWords(rows: ChapterRow[]): number {
  let total = 0;
  for (const row of rows) {
    total += row.wordCount;
  }
  return total;
}

function countStatus(rows: ChapterRow[], key: 'translationStatus' | 'analysisStatus'): number {
  let total = 0;
  for (const row of rows) {
    if (row[key] !== 'none') {
      total += 1;
    }
  }
  return total;
}

function replaceChapter(rows: ChapterRow[], next: ChapterRow): ChapterRow[] {
  const out: ChapterRow[] = [];
  for (const row of rows) {
    out.push(row.id === next.id ? next : row);
  }
  return out;
}

@Injectable({ providedIn: 'root' })
export class NovelService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly workspace = inject(WorkspaceService);
  private readonly items = signal<NovelSummary[]>([]);
  private readonly selectedNovelId = signal<number | null>(null);
  private readonly rawTags = signal<string[]>([]);
  private readonly rawLangs = signal<NovelLang[]>([]);
  private readonly covers = signal<Record<number, CoverEntry>>({});
  private readonly chapterCache = signal<Record<number, ChapterRow[]>>({});
  private readonly pendingCovers = new Set<string>();
  private epoch = 0;
  private workspacePath: string | null | undefined = undefined;

  readonly novels = this.items.asReadonly();
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<NovelError | null>(null);
  readonly view = signal<NovelViewMode>(readViewMode());
  readonly query = signal('');
  readonly chapterQuery = signal('');
  readonly collapsedIds = signal<number[]>([]);

  readonly byId = computed(this.buildIndex.bind(this));
  readonly allTags = computed(this.buildTagCounts.bind(this));
  readonly langCounts = computed(this.buildLangCounts.bind(this));
  readonly filters = computed(this.buildFilters.bind(this));
  readonly filterActive = computed(this.buildFilterActive.bind(this));
  readonly visible = computed(this.buildVisible.bind(this));
  readonly selectedId = computed(this.buildSelectedId.bind(this));
  readonly totals = computed(this.buildTotals.bind(this));
  readonly recent = computed(this.buildRecent.bind(this));
  readonly isEmpty = computed(this.buildIsEmpty.bind(this));

  constructor() {
    effect(this.syncWorkspace.bind(this));
  }

  async load(): Promise<void> {
    const epoch = this.epoch;
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await this.ipc.invoke<NovelSummary[]>('novel_list');
      if (epoch === this.epoch) {
        this.items.set([...rows].sort(compareNewestFirst));
        this.loaded.set(true);
      }
    } catch (cause) {
      if (epoch === this.epoch) {
        this.error.set(toNovelError(cause));
      }
    } finally {
      if (epoch === this.epoch) {
        this.loading.set(false);
      }
    }
  }

  async ensureLoaded(): Promise<void> {
    if (!this.loaded() && !this.loading()) {
      await this.load();
    }
  }

  novelById(id: number): NovelSummary | undefined {
    return this.byId().get(id);
  }

  async create(input: NovelInput): Promise<NovelSummary> {
    const created = await this.ipc.invoke<NovelSummary>('novel_create', { input });
    this.items.set([created, ...this.items()]);
    return created;
  }

  async update(id: number, patch: NovelPatch): Promise<NovelSummary> {
    const before = this.novelById(id);
    const next = await this.ipc.invoke<NovelSummary>('novel_update', { id, patch });
    this.items.set(replaceById(this.items(), next));
    if (before) {
      this.carryCover(before, next.updatedAt);
    }
    return next;
  }

  async remove(ids: number[]): Promise<number> {
    const count = await this.ipc.invoke<number>('novel_delete', { ids });
    this.dropNovels(ids);
    return count;
  }

  async addTag(id: number, raw: string): Promise<TagAddResult> {
    const novel = this.novelById(id);
    if (!novel) {
      return 'missing';
    }
    const tag = normTag(raw);
    const check = checkTag(novel.tags, tag);
    if (check !== 'ok') {
      return check;
    }
    await this.update(id, { tags: [...novel.tags, tag] });
    return 'added';
  }

  async removeTag(id: number, tag: string): Promise<void> {
    const novel = this.novelById(id);
    if (novel) {
      await this.update(id, { tags: withoutTag(novel.tags, tag) });
    }
  }

  isDuplicateTitle(title: string): boolean {
    return isDuplicateTitle(this.items(), title);
  }

  coverUrl(novel: NovelSummary): string | null {
    const entry = this.covers()[novel.id];
    return entry && entry.updatedAt === novel.updatedAt ? entry.url : null;
  }

  ensureCover(novel: NovelSummary): void {
    const entry = this.covers()[novel.id];
    if (entry && entry.updatedAt === novel.updatedAt) {
      return;
    }
    const key = coverKey(novel);
    if (!this.pendingCovers.has(key)) {
      this.pendingCovers.add(key);
      void this.fetchCover(novel, key);
    }
  }

  async setCover(id: number, dataUrl: string): Promise<NovelSummary> {
    const next = await this.ipc.invoke<NovelSummary>('novel_cover_set', { id, dataUrl });
    this.items.set(replaceById(this.items(), next));
    this.storeCover(next, dataUrl);
    return next;
  }

  async clearCover(id: number): Promise<NovelSummary> {
    const next = await this.ipc.invoke<NovelSummary>('novel_cover_clear', { id });
    this.items.set(replaceById(this.items(), next));
    this.storeCover(next, null);
    return next;
  }

  chaptersOf(novelId: number): ChapterRow[] {
    return this.chapterCache()[novelId] ?? [];
  }

  async loadChapters(novelId: number): Promise<ChapterRow[]> {
    const epoch = this.epoch;
    const rows = await this.ipc.invoke<ChapterRow[]>('novel_chapters', { novelId });
    if (epoch === this.epoch) {
      this.chapterCache.set({ ...this.chapterCache(), [novelId]: rows });
    }
    return rows;
  }

  applyChapterUpdate(row: ChapterRow): void {
    const rows = this.chaptersOf(row.novelId);
    const next = replaceChapter(rows, row);
    this.chapterCache.set({ ...this.chapterCache(), [row.novelId]: next });
    const novel = this.novelById(row.novelId);
    if (novel) {
      const touched = { ...novel, wordCount: sumWords(next), updatedAt: row.updatedAt };
      this.items.set(replaceById(this.items(), touched));
      this.carryCover(novel, touched.updatedAt);
    }
  }

  async addChapter(novelId: number, title: string): Promise<ChapterRow> {
    const row = await this.ipc.invoke<ChapterRow>('novel_chapter_add', { novelId, title });
    this.storeChapters(novelId, [...this.chaptersOf(novelId), row], row.updatedAt);
    return row;
  }

  async deleteChapter(novelId: number, chapterId: string): Promise<ChapterRow[]> {
    const rows = await this.ipc.invoke<ChapterRow[]>('novel_chapter_delete', {
      novelId,
      chapterId,
    });
    this.storeChapters(novelId, rows, new Date().toISOString());
    return rows;
  }

  async moveChapter(novelId: number, chapterId: string, toSeq: number): Promise<ChapterRow[]> {
    const rows = await this.ipc.invoke<ChapterRow[]>('novel_chapter_move', {
      novelId,
      chapterId,
      toSeq,
    });
    this.storeChapters(novelId, rows, new Date().toISOString());
    return rows;
  }

  readChapter(novelId: number, chapterId: string): Promise<ParagraphRow[]> {
    return this.ipc.invoke<ParagraphRow[]>('novel_chapter_read', { novelId, chapterId });
  }

  async paragraphCount(novelId: number, chapterId: string): Promise<number> {
    const rows = await this.readChapter(novelId, chapterId);
    return rows.length;
  }

  packagePick(): Promise<string | null> {
    return this.ipc.invoke<string | null>('novel_package_pick');
  }

  packageInspect(path: string, onEvent: (event: InspectEvent) => void): Promise<PackageSummary> {
    const channel = this.ipc.channel<InspectEvent>(onEvent);
    return this.ipc.invoke<PackageSummary>('novel_package_inspect', {
      path,
      onEvent: channel,
    });
  }

  async packageImport(path: string, meta: NovelInput): Promise<NovelSummary> {
    const created = await this.ipc.invoke<NovelSummary>('novel_package_import', {
      path,
      meta,
    });
    this.items.set([created, ...this.items()]);
    return created;
  }

  packageSavePick(fileName: string): Promise<string | null> {
    return this.ipc.invoke<string | null>('novel_package_save_pick', { fileName });
  }

  packageExport(id: number, path: string): Promise<ExportSummary> {
    return this.ipc.invoke<ExportSummary>('novel_package_export', { id, path });
  }

  setView(mode: NovelViewMode): void {
    this.view.set(mode);
    storeViewMode(mode);
  }

  setQuery(text: string): void {
    this.query.set(text);
  }

  setChapterQuery(text: string): void {
    this.chapterQuery.set(text);
  }

  toggleCollapsed(id: number): void {
    this.collapsedIds.set(toggled(this.collapsedIds(), id));
  }

  toggleTagFilter(tag: string): void {
    this.rawTags.set(toggled(this.filters().tags, tag));
  }

  toggleLangFilter(lang: NovelLang): void {
    this.rawLangs.set(toggled(this.filters().langs, lang));
  }

  clearFilters(): void {
    this.rawTags.set([]);
    this.rawLangs.set([]);
  }

  clearQueryAndFilters(): void {
    this.query.set('');
    this.clearFilters();
  }

  select(id: number | null): void {
    this.selectedNovelId.set(id);
  }

  reset(): void {
    this.epoch += 1;
    this.items.set([]);
    this.selectedNovelId.set(null);
    this.rawTags.set([]);
    this.rawLangs.set([]);
    this.covers.set({});
    this.chapterCache.set({});
    this.collapsedIds.set([]);
    this.pendingCovers.clear();
    this.query.set('');
    this.chapterQuery.set('');
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(null);
  }

  private syncWorkspace(): void {
    const path = this.workspace.current()?.path ?? null;
    untracked(this.applyWorkspace.bind(this, path));
  }

  private applyWorkspace(path: string | null): void {
    if (path === this.workspacePath) {
      return;
    }
    this.workspacePath = path;
    this.reset();
    if (path !== null) {
      void this.load();
    }
  }

  private async fetchCover(novel: NovelSummary, key: string): Promise<void> {
    const epoch = this.epoch;
    let url: string | null = null;
    try {
      url = await this.ipc.invoke<string | null>('novel_cover_get', { id: novel.id });
    } catch {
      url = null;
    }
    this.pendingCovers.delete(key);
    if (epoch === this.epoch) {
      this.storeCover(novel, url);
    }
  }

  private storeCover(novel: NovelSummary, url: string | null): void {
    const entry: CoverEntry = { updatedAt: novel.updatedAt, url };
    this.covers.set({ ...this.covers(), [novel.id]: entry });
  }

  private storeChapters(novelId: number, rows: ChapterRow[], stamp: string): void {
    this.chapterCache.set({ ...this.chapterCache(), [novelId]: rows });
    const novel = this.novelById(novelId);
    if (novel) {
      const touched = {
        ...novel,
        chapterCount: rows.length,
        wordCount: sumWords(rows),
        translatedCount: countStatus(rows, 'translationStatus'),
        analyzedCount: countStatus(rows, 'analysisStatus'),
        updatedAt: stamp,
      };
      this.items.set(replaceById(this.items(), touched));
      this.carryCover(novel, stamp);
    }
  }

  private carryCover(before: NovelSummary, updatedAt: string): void {
    const entry = this.covers()[before.id];
    if (entry && entry.updatedAt === before.updatedAt) {
      const carried: CoverEntry = { updatedAt, url: entry.url };
      this.covers.set({ ...this.covers(), [before.id]: carried });
    }
  }

  private dropNovels(ids: number[]): void {
    const gone = new Set(ids);
    this.items.set(withoutIds(this.items(), gone));
    this.covers.set(omitKeys(this.covers(), gone));
    this.chapterCache.set(omitKeys(this.chapterCache(), gone));
    if (!this.byId().has(this.selectedNovelId() ?? -1)) {
      this.selectedNovelId.set(null);
    }
  }

  private buildIndex(): Map<number, NovelSummary> {
    const index = new Map<number, NovelSummary>();
    for (const novel of this.items()) {
      index.set(novel.id, novel);
    }
    return index;
  }

  private buildTagCounts(): TagCount[] {
    return tagCounts(this.items());
  }

  private buildLangCounts(): LangCount[] {
    return langCounts(this.items());
  }

  private buildFilters(): NovelFilters {
    const known = new Set<string>();
    for (const entry of this.allTags()) {
      known.add(entry.tag);
    }
    return {
      tags: pruneTags(this.rawTags(), known),
      langs: pruneLangs(this.rawLangs(), this.items()),
    };
  }

  private buildFilterActive(): boolean {
    const filters = this.filters();
    return filters.tags.length + filters.langs.length > 0;
  }

  private buildVisible(): NovelSummary[] {
    return filterNovels(this.items(), this.filters(), this.query());
  }

  private buildSelectedId(): number | null {
    const id = this.selectedNovelId();
    return id !== null && this.byId().has(id) ? id : null;
  }

  private buildTotals(): NovelTotals {
    return novelTotals(this.items());
  }

  private buildRecent(): NovelSummary[] {
    return recentNovels(this.items(), RECENT_LIMIT);
  }

  private buildIsEmpty(): boolean {
    return this.loaded() && this.items().length === 0;
  }
}
