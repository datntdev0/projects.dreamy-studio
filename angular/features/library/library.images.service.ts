import { Injectable, computed, effect, inject, signal, untracked } from "@angular/core";
import { DesktopIpcService } from "@core/desktop/desktop-ipc.service";
import { WorkspaceService } from "../workspace/workspace.service";
import { LibraryService } from "./library.service";
import { ImageCheck, ImagePatch, ImageSort, ImageUploadInput, ImageViewMode, LibraryImage } from "./library.images.models";
import { LibraryError } from "./library.models";
import { toLibraryError } from "./library.rules";
import { filterImages } from "./library.images.rules";
import { readGridRatio, readGridSize, writeStored } from "./library.grid.prefs";

const GRID_SIZE_STORAGE_KEY = "ds.lb.images.grid-size";
const GRID_RATIO_STORAGE_KEY = "ds.lb.images.grid-ratio";
const DEFAULT_GRID_SIZE = 176;
const DEFAULT_GRID_RATIO = "16/9";

function replaceImage(items: LibraryImage[], next: LibraryImage): LibraryImage[] {
  const output: LibraryImage[] = [];
  for (const item of items) {
    output.push(item.id === next.id ? next : item);
  }
  return output;
}

function withoutImages(items: LibraryImage[], ids: Set<number>): LibraryImage[] {
  const output: LibraryImage[] = [];
  for (const item of items) {
    if (!ids.has(item.id)) {
      output.push(item);
    }
  }
  return output;
}

function clearedThumbnails(thumbnails: Record<number, string>, ids: Set<number>): Record<number, string> {
  const output: Record<number, string> = {};
  for (const key of Object.keys(thumbnails)) {
    const id = Number(key);
    if (!ids.has(id)) {
      output[id] = thumbnails[id] as string;
    }
  }
  return output;
}

function asVoid<T>(_value: T): void {
  return;
}

function ignoreError(_error: unknown): void {
  return;
}

@Injectable({ providedIn: "root" })
export class LibraryImageService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly workspace = inject(WorkspaceService);
  private readonly library = inject(LibraryService);
  private readonly workspacePath = computed(this.currentPath.bind(this));
  private readonly thumbnails = signal<Record<number, string>>({});
  private readonly pendingThumbnails = new Set<number>();
  private uploadQueue: Promise<void> = Promise.resolve();
  private epoch = 0;
  private lastWorkspacePath: string | null | undefined = undefined;
  private lastRevision: number | undefined = undefined;

  readonly items = signal<LibraryImage[]>([]);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<LibraryError | null>(null);
  readonly selectedId = signal<number | null>(null);
  readonly query = signal("");
  readonly sort = signal<ImageSort>("new");
  readonly viewMode = this.library.viewMode;
  readonly gridSize = signal(readGridSize(GRID_SIZE_STORAGE_KEY, DEFAULT_GRID_SIZE));
  readonly gridRatio = signal(readGridRatio(GRID_RATIO_STORAGE_KEY, DEFAULT_GRID_RATIO));
  readonly selected = computed(this.findSelected.bind(this));
  readonly visible = computed(this.buildVisible.bind(this));

  constructor() {
    effect(this.syncWorkspace.bind(this));
    effect(this.syncRevision.bind(this));
  }

  async ensureLoaded(): Promise<void> {
    if (!this.loaded() && !this.loading()) {
      await this.load();
    }
  }

  async pick(): Promise<string[]> {
    return this.ipc.invoke<string[]>("library_image_pick");
  }

  inspect(paths: string[]): Promise<ImageCheck[]> {
    return this.ipc.invoke<ImageCheck[]>("library_image_inspect", { paths });
  }

  upload(path: string, input: ImageUploadInput): Promise<LibraryImage> {
    const task = this.uploadQueue.then(this.uploadOne.bind(this, path, input));
    this.uploadQueue = task.then(asVoid, ignoreError);
    return task;
  }

  async update(id: number, patch: ImagePatch): Promise<LibraryImage> {
    const image = await this.ipc.invoke<LibraryImage>("library_image_update", { id, patch });
    this.items.set(replaceImage(this.items(), image));
    await this.library.refreshTaxonomy();
    return image;
  }

  async remove(ids: number[]): Promise<number> {
    const count = await this.ipc.invoke<number>("library_image_delete", { ids });
    const deleted = new Set(ids);
    this.items.set(withoutImages(this.items(), deleted));
    this.thumbnails.set(clearedThumbnails(this.thumbnails(), deleted));
    const selected = this.selectedId();
    if (selected !== null && deleted.has(selected)) {
      this.selectedId.set(null);
    }
    await this.library.refreshTaxonomy();
    return count;
  }

  thumb(id: number): string | null {
    const value = this.thumbnails()[id];
    if (value !== undefined) {
      return value;
    }
    if (!this.pendingThumbnails.has(id)) {
      this.pendingThumbnails.add(id);
      void this.fetchThumbnail(id);
    }
    return null;
  }

  read(id: number): Promise<string> {
    return this.ipc.invoke<string>("library_image_read", { id });
  }

  select(id: number | null): void {
    this.selectedId.set(id);
  }

  setViewMode(value: ImageViewMode): void {
    this.library.setViewMode(value);
  }

  setGridSize(value: number): void {
    this.gridSize.set(value);
    writeStored(GRID_SIZE_STORAGE_KEY, String(value));
  }

  setGridRatio(value: string): void {
    this.gridRatio.set(value);
    writeStored(GRID_RATIO_STORAGE_KEY, value);
  }

  private async load(): Promise<void> {
    const epoch = this.epoch;
    this.loading.set(true);
    this.error.set(null);
    try {
      const images = await this.ipc.invoke<LibraryImage[]>("library_image_list");
      if (epoch === this.epoch) {
        this.items.set(images);
        this.loaded.set(true);
      }
    } catch (cause) {
      if (epoch === this.epoch) {
        this.error.set(toLibraryError(cause));
      }
    } finally {
      if (epoch === this.epoch) {
        this.loading.set(false);
      }
    }
  }

  private async uploadOne(path: string, input: ImageUploadInput): Promise<LibraryImage> {
    const image = await this.ipc.invoke<LibraryImage>("library_image_upload", { path, input });
    this.items.set([image, ...this.items()]);
    await this.library.refreshTaxonomy();
    return image;
  }

  private async fetchThumbnail(id: number): Promise<void> {
    const epoch = this.epoch;
    try {
      const dataUrl = await this.ipc.invoke<string>("library_image_thumb", { id });
      if (epoch === this.epoch) {
        this.thumbnails.set({ ...this.thumbnails(), [id]: dataUrl });
      }
    } catch {
      return;
    } finally {
      this.pendingThumbnails.delete(id);
    }
  }

  private reset(): void {
    this.epoch += 1;
    this.items.set([]);
    this.thumbnails.set({});
    this.pendingThumbnails.clear();
    this.selectedId.set(null);
    this.query.set("");
    this.sort.set("new");
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(null);
  }

  private findSelected(): LibraryImage | null {
    const id = this.selectedId();
    return id === null ? null : this.items().find(this.hasId.bind(null, id)) ?? null;
  }

  private buildVisible(): LibraryImage[] {
    return filterImages(this.items(), {
      query: this.query(),
      sort: this.sort(),
      collection: this.library.filterCollection(),
      tags: this.library.filterTags(),
    });
  }

  private hasId(id: number, image: LibraryImage): boolean {
    return image.id === id;
  }

  private currentPath(): string | null {
    return this.workspace.current()?.path ?? null;
  }

  private syncWorkspace(): void {
    untracked(this.applyWorkspace.bind(this, this.workspacePath()));
  }

  private applyWorkspace(path: string | null): void {
    if (path === this.lastWorkspacePath) {
      return;
    }
    this.lastWorkspacePath = path;
    this.reset();
    if (path !== null) {
      void this.load();
    }
  }

  private syncRevision(): void {
    untracked(this.applyRevision.bind(this, this.library.revision()));
  }

  private applyRevision(revision: number): void {
    if (revision === this.lastRevision) {
      return;
    }
    this.lastRevision = revision;
    if (this.loaded()) {
      void this.load();
    }
  }
}
