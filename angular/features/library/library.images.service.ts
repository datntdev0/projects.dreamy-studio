import { computed, inject, Injectable, signal } from '@angular/core';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { replaceById, withoutIds, withoutKeys } from '@shared/utils/collection';
import { noop } from '@shared/utils/noop';

import { WorkspaceService } from '../workspace/workspace.service';
import { LibraryGrid } from './library.grid';
// prettier-ignore
import { ImageCheck, ImagePatch, ImageUploadInput, ImageViewMode, LibraryImage } from './library.images.models';
import { filterImages } from './library.images.rules';
import { LibraryError } from './library.models';
import { toLibraryError } from './library.rules';
import { LibraryService } from './library.service';
import { LibraryWorkspaceSync } from './library.workspace-sync';

const GRID_SIZE_STORAGE_KEY = 'ds.lb.images.grid-size';
const GRID_RATIO_STORAGE_KEY = 'ds.lb.images.grid-ratio';

@Injectable({ providedIn: 'root' })
export class LibraryImageService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly workspace = inject(WorkspaceService);
  private readonly library = inject(LibraryService);
  private readonly grid = new LibraryGrid(GRID_SIZE_STORAGE_KEY, GRID_RATIO_STORAGE_KEY);
  private readonly thumbnails = signal<Record<number, string>>({});
  private readonly pendingThumbnails = new Set<number>();
  private uploadQueue: Promise<void> = Promise.resolve();
  private epoch = 0;

  readonly items = signal<LibraryImage[]>([]);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<LibraryError | null>(null);
  readonly selectedId = signal<number | null>(null);
  readonly query = signal('');
  readonly viewMode = this.library.viewMode;
  readonly gridSize = this.grid.size;
  readonly gridRatio = this.grid.ratio;
  readonly selected = computed(this.findSelected.bind(this));
  readonly visible = computed(this.buildVisible.bind(this));

  constructor() {
    new LibraryWorkspaceSync({
      workspace: this.workspace,
      library: this.library,
      reset: this.reset.bind(this),
      load: this.load.bind(this),
      isLoaded: this.loaded,
    }).start();
  }

  async ensureLoaded(): Promise<void> {
    if (!this.loaded() && !this.loading()) {
      await this.load();
    }
  }

  async pick(): Promise<string[]> {
    return this.ipc.invoke<string[]>('library_image_pick');
  }

  inspect(paths: string[]): Promise<ImageCheck[]> {
    return this.ipc.invoke<ImageCheck[]>('library_image_inspect', { paths });
  }

  upload(path: string, input: ImageUploadInput): Promise<LibraryImage> {
    const task = this.uploadQueue.then(this.uploadOne.bind(this, path, input));
    this.uploadQueue = task.then(noop, noop);
    return task;
  }

  async update(id: number, patch: ImagePatch): Promise<LibraryImage> {
    const image = await this.ipc.invoke<LibraryImage>('library_image_update', { id, patch });
    this.items.set(replaceById(this.items(), image));
    await this.library.refreshTaxonomy();
    return image;
  }

  async remove(ids: number[]): Promise<number> {
    const count = await this.ipc.invoke<number>('library_image_delete', { ids });
    const deleted = new Set(ids);
    this.items.set(withoutIds(this.items(), deleted));
    this.thumbnails.set(withoutKeys(this.thumbnails(), deleted));
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
    return this.ipc.invoke<string>('library_image_read', { id });
  }

  select(id: number | null): void {
    this.selectedId.set(id);
  }

  setViewMode(value: ImageViewMode): void {
    this.library.setViewMode(value);
  }

  setGridSize(value: number): void {
    this.grid.setSize(value);
  }

  setGridRatio(value: string): void {
    this.grid.setRatio(value);
  }

  async load(): Promise<void> {
    const epoch = this.epoch;
    this.loading.set(true);
    this.error.set(null);
    try {
      const images = await this.ipc.invoke<LibraryImage[]>('library_image_list');
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
    const image = await this.ipc.invoke<LibraryImage>('library_image_upload', { path, input });
    this.items.set([image, ...this.items()]);
    await this.library.refreshTaxonomy();
    return image;
  }

  private async fetchThumbnail(id: number): Promise<void> {
    const epoch = this.epoch;
    try {
      const dataUrl = await this.ipc.invoke<string>('library_image_thumb', { id });
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
    this.query.set('');
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(null);
  }

  private findSelected(): LibraryImage | null {
    const id = this.selectedId();
    return id === null ? null : (this.items().find(this.hasId.bind(null, id)) ?? null);
  }

  private buildVisible(): LibraryImage[] {
    return filterImages(this.items(), {
      query: this.query(),
      collection: this.library.filterCollection(),
      tags: this.library.filterTags(),
    });
  }

  private hasId(id: number, image: LibraryImage): boolean {
    return image.id === id;
  }
}
