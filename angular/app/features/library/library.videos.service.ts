import { Injectable, computed, effect, inject, signal, untracked } from "@angular/core";
import { DesktopIpcService } from "../../core/desktop/desktop-ipc.service";
import { WorkspaceService } from "../workspace/workspace.service";
import { AssetCheck, AssetPatch, AssetUploadInput, LibraryError } from "./library.models";
import { LibraryService } from "./library.service";
import { LibraryVideo, VIDEO_STREAM_SCHEME, VideoSort } from "./library.videos.models";
import { filterVideos } from "./library.videos.rules";
import { readGridRatio, readGridSize, writeStored } from "./library.grid.prefs";
import { toLibraryError } from "./library.rules";

const GRID_SIZE_STORAGE_KEY = "ds.lb.videos.grid-size";
const GRID_RATIO_STORAGE_KEY = "ds.lb.videos.grid-ratio";
const DEFAULT_GRID_SIZE = 176;
const DEFAULT_GRID_RATIO = "16/9";

function asVoid<T>(_value: T): void { return; }
function ignoreError(_error: unknown): void { return; }
function replaceVideo(items: LibraryVideo[], next: LibraryVideo): LibraryVideo[] { return items.map(replaceVideoItem.bind(null, next)); }
function replaceVideoItem(next: LibraryVideo, item: LibraryVideo): LibraryVideo { return item.id === next.id ? next : item; }
function withoutVideos(items: LibraryVideo[], ids: Set<number>): LibraryVideo[] { return items.filter(keptVideo.bind(null, ids)); }
function keptVideo(ids: Set<number>, video: LibraryVideo): boolean { return !ids.has(video.id); }
function withoutPosters(posters: Record<number, string>, ids: Set<number>): Record<number, string> { const next: Record<number, string> = {}; for (const key of Object.keys(posters)) { const id = Number(key); if (!ids.has(id)) next[id] = posters[id] as string; } return next; }

@Injectable({ providedIn: "root" })
export class LibraryVideoService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly workspace = inject(WorkspaceService);
  private readonly library = inject(LibraryService);
  private readonly workspacePath = computed(this.currentPath.bind(this));
  private readonly posters = signal<Record<number, string>>({});
  private readonly pendingPosters = new Set<number>();
  private uploadQueue: Promise<void> = Promise.resolve();
  private epoch = 0;
  private lastWorkspacePath: string | null | undefined;
  private lastRevision: number | undefined;

  readonly items = signal<LibraryVideo[]>([]);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<LibraryError | null>(null);
  readonly selectedId = signal<number | null>(null);
  readonly query = signal("");
  readonly sort = signal<VideoSort>("new");
  readonly gridSize = signal(readGridSize(GRID_SIZE_STORAGE_KEY, DEFAULT_GRID_SIZE));
  readonly gridRatio = signal(readGridRatio(GRID_RATIO_STORAGE_KEY, DEFAULT_GRID_RATIO));
  readonly selected = computed(this.findSelected.bind(this));
  readonly visible = computed(this.buildVisible.bind(this));

  constructor() {
    effect(this.syncWorkspace.bind(this));
    effect(this.syncRevision.bind(this));
  }

  async ensureLoaded(): Promise<void> {
    if (!this.loaded() && !this.loading()) await this.load();
  }

  pick(): Promise<string[]> { return this.ipc.invoke<string[]>("library_video_pick"); }
  inspect(paths: string[]): Promise<AssetCheck[]> { return this.ipc.invoke<AssetCheck[]>("library_video_inspect", { paths }); }

  upload(path: string, input: AssetUploadInput): Promise<LibraryVideo> {
    const task = this.uploadQueue.then(this.uploadOne.bind(this, path, input));
    this.uploadQueue = task.then(asVoid, ignoreError);
    return task;
  }

  async update(id: number, patch: AssetPatch): Promise<LibraryVideo> {
    const video = await this.ipc.invoke<LibraryVideo>("library_video_update", { id, patch });
    this.items.set(replaceVideo(this.items(), video));
    await this.library.refreshTaxonomy();
    return video;
  }

  async remove(ids: number[]): Promise<number> {
    const count = await this.ipc.invoke<number>("library_video_delete", { ids });
    const deleted = new Set(ids);
    this.items.set(withoutVideos(this.items(), deleted));
    this.posters.set(withoutPosters(this.posters(), deleted));
    const selected = this.selectedId();
    if (selected !== null && deleted.has(selected)) this.selectedId.set(null);
    await this.library.refreshTaxonomy();
    return count;
  }

  poster(id: number): string | null {
    const dataUrl = this.posters()[id];
    if (dataUrl !== undefined) return dataUrl;
    const video = this.items().find(this.hasId.bind(null, id));
    if (video?.hasPoster && !this.pendingPosters.has(id)) {
      this.pendingPosters.add(id);
      void this.fetchPoster(id);
    }
    return null;
  }

  source(id: number): string { return this.ipc.mediaUrl(VIDEO_STREAM_SCHEME, String(id)); }
  select(id: number | null): void { this.selectedId.set(id); }
  setGridSize(value: number): void { this.gridSize.set(value); writeStored(GRID_SIZE_STORAGE_KEY, String(value)); }
  setGridRatio(value: string): void { this.gridRatio.set(value); writeStored(GRID_RATIO_STORAGE_KEY, value); }

  private async load(): Promise<void> {
    const epoch = this.epoch;
    this.loading.set(true);
    this.error.set(null);
    try {
      const videos = await this.ipc.invoke<LibraryVideo[]>("library_video_list");
      if (epoch === this.epoch) {
        this.items.set(videos);
        this.loaded.set(true);
      }
    } catch (cause) {
      if (epoch === this.epoch) this.error.set(toLibraryError(cause));
    } finally {
      if (epoch === this.epoch) this.loading.set(false);
    }
  }

  private async uploadOne(path: string, input: AssetUploadInput): Promise<LibraryVideo> {
    const video = await this.ipc.invoke<LibraryVideo>("library_video_upload", { path, input });
    this.items.set([video, ...this.items()]);
    await this.library.refreshTaxonomy();
    return video;
  }

  private async fetchPoster(id: number): Promise<void> {
    const epoch = this.epoch;
    try {
      const dataUrl = await this.ipc.invoke<string | null>("library_video_poster", { id });
      if (epoch === this.epoch && dataUrl) this.posters.set({ ...this.posters(), [id]: dataUrl });
    } catch {
      return;
    } finally {
      this.pendingPosters.delete(id);
    }
  }

  private reset(): void {
    this.epoch += 1;
    this.items.set([]);
    this.posters.set({});
    this.pendingPosters.clear();
    this.selectedId.set(null);
    this.query.set("");
    this.sort.set("new");
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(null);
  }

  private findSelected(): LibraryVideo | null {
    const id = this.selectedId();
    return id === null ? null : this.items().find(this.hasId.bind(null, id)) ?? null;
  }

  private buildVisible(): LibraryVideo[] {
    return filterVideos(this.items(), { query: this.query(), sort: this.sort(), collection: this.library.filterCollection(), tags: this.library.filterTags() });
  }

  private hasId(id: number, video: LibraryVideo): boolean { return video.id === id; }
  private currentPath(): string | null { return this.workspace.current()?.path ?? null; }
  private syncWorkspace(): void { untracked(this.applyWorkspace.bind(this, this.workspacePath())); }
  private applyWorkspace(path: string | null): void { if (path === this.lastWorkspacePath) return; this.lastWorkspacePath = path; this.reset(); if (path !== null) void this.load(); }
  private syncRevision(): void { untracked(this.applyRevision.bind(this, this.library.revision())); }
  private applyRevision(revision: number): void { if (revision === this.lastRevision) return; this.lastRevision = revision; if (this.loaded()) void this.load(); }
}
