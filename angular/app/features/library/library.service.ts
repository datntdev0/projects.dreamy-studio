import { Injectable, computed, effect, inject, signal, untracked } from "@angular/core";
import { DesktopIpcService } from "@app/core/desktop/desktop-ipc.service";
import { WorkspaceService } from "../workspace/workspace.service";
import { TabsService } from "@layout/tabs.service";
import { KindCounts, LibraryCollection, LibraryError, LibraryKind, LibrarySummary, LibraryTag, TaxonomySelection } from "./library.models";
import { hasCollectionName, searchTags, sortTags, toLibraryError } from "./library.rules";

const EMPTY_COUNTS: KindCounts = { image: 0, sound: 0, video: 0, prompt: 0 };
const EMPTY_SUMMARY: LibrarySummary = { assets: EMPTY_COUNTS, unfiled: EMPTY_COUNTS };
const VIEW_STORAGE_KEY = "ds.lb.view";

function readViewMode(): "grid" | "list" {
  try { return localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "grid"; } catch { return "grid"; }
}

function storeViewMode(value: "grid" | "list"): void {
  try { localStorage.setItem(VIEW_STORAGE_KEY, value); } catch { return; }
}

function replaceCollection(items: LibraryCollection[], id: number, next: LibraryCollection): LibraryCollection[] {
  const rows: LibraryCollection[] = [];
  for (const item of items) {
    rows.push(item.id === id ? next : item);
  }
  return rows;
}

function withoutCollection(items: LibraryCollection[], id: number): LibraryCollection[] {
  const rows: LibraryCollection[] = [];
  for (const item of items) {
    if (item.id !== id) {
      rows.push(item);
    }
  }
  return rows;
}

function increment(value: number): number {
  return value + 1;
}

function withoutFilterTag(tag: string, item: string): boolean {
  return item !== tag;
}

function isKnownTag(known: Set<string>, tag: string): boolean {
  return known.has(tag);
}

@Injectable({ providedIn: "root" })
export class LibraryService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly workspace = inject(WorkspaceService);
  private readonly tabs = inject(TabsService);
  private readonly workspacePath = computed(this.currentPath.bind(this));
  private epoch = 0;
  readonly collections = signal<LibraryCollection[]>([]);
  readonly tags = signal<LibraryTag[]>([]);
  readonly summary = signal<LibrarySummary>(EMPTY_SUMMARY);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<LibraryError | null>(null);
  readonly taxonomySelection = signal<TaxonomySelection | null>(null);
  readonly taxonomyQuery = signal("");
  readonly revision = signal(0);
  readonly viewMode = signal<"grid" | "list">(readViewMode());
  readonly filterCollection = signal<number | "none" | null>(null);
  readonly filterTags = signal<string[]>([]);
  readonly visibleTags = computed(this.buildVisibleTags.bind(this));
  readonly filtersActive = computed(this.buildFiltersActive.bind(this));

  constructor() { effect(this.syncWorkspace.bind(this)); }

  async ensureLoaded(): Promise<void> { if (!this.loaded() && !this.loading()) await this.load(); }
  async load(): Promise<void> {
    const epoch = this.epoch;
    this.loading.set(true);
    this.error.set(null);
    try {
      const [collections, tags, summary] = await Promise.all([
        this.ipc.invoke<LibraryCollection[]>("library_collection_list"),
        this.ipc.invoke<LibraryTag[]>("library_tag_list"),
        this.ipc.invoke<LibrarySummary>("library_summary"),
      ]);
      if (epoch === this.epoch) { this.collections.set(collections); this.tags.set(sortTags(tags)); this.summary.set(summary); this.loaded.set(true); this.pruneSelection(); this.pruneFilters(); }
    } catch (cause) { if (epoch === this.epoch) this.error.set(toLibraryError(cause)); }
    finally { if (epoch === this.epoch) this.loading.set(false); }
  }
  async createCollection(input: { name: string; description?: string }): Promise<LibraryCollection> {
    const created = await this.ipc.invoke<LibraryCollection>("library_collection_create", { input });
    this.collections.set([...this.collections(), created]);
    this.summary.set(await this.ipc.invoke<LibrarySummary>("library_summary"));
    return created;
  }
  async updateCollection(id: number, patch: { name?: string; description?: string }): Promise<LibraryCollection> {
    const updated = await this.ipc.invoke<LibraryCollection>("library_collection_update", { id, patch });
    this.collections.set(replaceCollection(this.collections(), id, updated));
    return updated;
  }
  async deleteCollection(id: number): Promise<number> {
    const count = await this.ipc.invoke<number>("library_collection_delete", { id });
    this.collections.set(withoutCollection(this.collections(), id));
    if (this.taxonomySelection()?.kind === "col" && this.taxonomySelection()?.id === id) this.taxonomySelection.set(null);
    await this.refreshSummary();
    this.pruneFilters();
    this.revision.update(increment);
    return count;
  }
  async renameTag(from: string, to: string): Promise<LibraryTag> { const result = await this.ipc.invoke<LibraryTag>("library_tag_rename", { from, to }); await this.loadTags(); this.taxonomySelection.set({ kind: "tag", id: result.tag }); this.revision.update(increment); return result; }
  async mergeTag(from: string, into: string): Promise<LibraryTag> { const result = await this.ipc.invoke<LibraryTag>("library_tag_merge", { from, into }); await this.loadTags(); this.taxonomySelection.set({ kind: "tag", id: result.tag }); this.revision.update(increment); return result; }
  async deleteTag(tag: string): Promise<number> { const count = await this.ipc.invoke<number>("library_tag_delete", { tag }); await this.loadTags(); this.taxonomySelection.set(null); this.revision.update(increment); return count; }
  collectionById(id: number): LibraryCollection | undefined { return this.collections().find(this.hasId.bind(null, id)); }
  select(selection: TaxonomySelection | null): void { this.taxonomySelection.set(selection); }
  selectCollection(id: number): void { this.select({ kind: "col", id }); }
  selectTag(tag: string): void { this.select({ kind: "tag", id: tag }); }
  setTaxonomyQuery(query: string): void { this.taxonomyQuery.set(query); }
  isDuplicateCollection(name: string, exceptId?: number): boolean { return hasCollectionName(this.collections(), name, exceptId); }
  async refreshSummary(): Promise<void> { this.summary.set(await this.ipc.invoke<LibrarySummary>("library_summary")); }
  async refreshTaxonomy(): Promise<void> { await this.load(); }
  toggleFilterTag(tag: string): void { this.filterTags.set(this.filterTags().includes(tag) ? this.filterTags().filter(withoutFilterTag.bind(null, tag)) : [...this.filterTags(), tag]); }
  setFilterCollection(value: number | "none" | null): void { this.filterCollection.set(value); }
  setViewMode(value: "grid" | "list"): void { this.viewMode.set(value); storeViewMode(value); }
  clearFilters(): void { this.filterCollection.set(null); this.filterTags.set([]); }
  viewTag(kind: LibraryKind, tag: string): void { this.filterTags.set([tag]); if (kind === "sound") this.tabs.openSounds(); else if (kind === "video") this.tabs.openVideos(); else if (kind === "prompt") this.tabs.openPrompts(); else this.tabs.openImages(); }
  reset(): void { this.epoch += 1; this.collections.set([]); this.tags.set([]); this.summary.set(EMPTY_SUMMARY); this.loaded.set(false); this.loading.set(false); this.error.set(null); this.taxonomySelection.set(null); this.taxonomyQuery.set(""); this.clearFilters(); }
  private async loadTags(): Promise<void> { this.tags.set(sortTags(await this.ipc.invoke<LibraryTag[]>("library_tag_list"))); await this.refreshSummary(); this.pruneSelection(); this.pruneFilters(); }
  private buildVisibleTags(): LibraryTag[] { return searchTags(this.tags(), this.taxonomyQuery()); }
  private hasId(id: number, collection: LibraryCollection): boolean { return collection.id === id; }
  private pruneSelection(): void { const selected = this.taxonomySelection(); if (!selected) return; const exists = selected.kind === "col" ? this.collections().some(this.hasId.bind(this, Number(selected.id))) : this.tags().some(this.hasTag.bind(null, String(selected.id))); if (!exists) this.taxonomySelection.set(null); }
  private pruneFilters(): void { const collection = this.filterCollection(); if (typeof collection === "number" && !this.collections().some(this.hasId.bind(this, collection))) this.filterCollection.set(null); const known = new Set(this.tags().map(this.tagName)); this.filterTags.set(this.filterTags().filter(isKnownTag.bind(null, known))); }
  private buildFiltersActive(): boolean { return this.filterCollection() !== null || this.filterTags().length > 0; }
  private tagName(item: LibraryTag): string { return item.tag; }
  private hasTag(tag: string, item: LibraryTag): boolean { return item.tag === tag; }
  private currentPath(): string | null { return this.workspace.current()?.path ?? null; }
  private syncWorkspace(): void { const path = this.workspacePath(); untracked(this.applyWorkspace.bind(this, path)); }
  private applyWorkspace(path: string | null): void { if (path === this.lastWorkspacePath) return; this.lastWorkspacePath = path; this.reset(); if (path) void this.ensureLoaded(); }
  private lastWorkspacePath: string | null | undefined = undefined;
}
