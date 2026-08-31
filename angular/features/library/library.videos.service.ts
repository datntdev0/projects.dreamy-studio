import { computed, inject, Injectable, signal } from '@angular/core';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { replaceById, withoutIds, withoutKeys } from '@shared/utils/collection';
import { noop } from '@shared/utils/noop';

import { WorkspaceService } from '../workspace/workspace.service';
import { LibraryGrid } from './library.grid';
import { AssetCheck, AssetPatch, AssetUploadInput, LibraryError } from './library.models';
import { toLibraryError } from './library.rules';
import { LibraryService } from './library.service';
import { LibraryVideo, VIDEO_STREAM_SCHEME, VideoSort } from './library.videos.models';
import { filterVideos } from './library.videos.rules';
import { LibraryWorkspaceSync } from './library.workspace-sync';

const GRID_SIZE_STORAGE_KEY = 'ds.lb.videos.grid-size';
const GRID_RATIO_STORAGE_KEY = 'ds.lb.videos.grid-ratio';

@Injectable({ providedIn: 'root' })
export class LibraryVideoService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly workspace = inject(WorkspaceService);
  private readonly library = inject(LibraryService);
  private readonly grid = new LibraryGrid(GRID_SIZE_STORAGE_KEY, GRID_RATIO_STORAGE_KEY);
  private readonly posters = signal<Record<number, string>>({});
  private readonly pendingPosters = new Set<number>();
  private uploadQueue: Promise<void> = Promise.resolve();
  private epoch = 0;

  readonly items = signal<LibraryVideo[]>([]);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<LibraryError | null>(null);
  readonly selectedId = signal<number | null>(null);
  readonly query = signal('');
  readonly sort = signal<VideoSort>('new');
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
    if (!this.loaded() && !this.loading()) await this.load();
  }

  pick(): Promise<string[]> {
    return this.ipc.invoke<string[]>('library_video_pick');
  }
  inspect(paths: string[]): Promise<AssetCheck[]> {
    return this.ipc.invoke<AssetCheck[]>('library_video_inspect', { paths });
  }

  upload(path: string, input: AssetUploadInput): Promise<LibraryVideo> {
    const task = this.uploadQueue.then(this.uploadOne.bind(this, path, input));
    this.uploadQueue = task.then(noop, noop);
    return task;
  }

  async update(id: number, patch: AssetPatch): Promise<LibraryVideo> {
    const video = await this.ipc.invoke<LibraryVideo>('library_video_update', { id, patch });
    this.items.set(replaceById(this.items(), video));
    await this.library.refreshTaxonomy();
    return video;
  }

  async remove(ids: number[]): Promise<number> {
    const count = await this.ipc.invoke<number>('library_video_delete', { ids });
    const deleted = new Set(ids);
    this.items.set(withoutIds(this.items(), deleted));
    this.posters.set(withoutKeys(this.posters(), deleted));
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

  source(id: number): string {
    return this.ipc.mediaUrl(VIDEO_STREAM_SCHEME, String(id));
  }
  select(id: number | null): void {
    this.selectedId.set(id);
  }
  setGridSize(value: number): void {
    this.grid.setSize(value);
  }
  setGridRatio(value: string): void {
    this.grid.setRatio(value);
  }

  private async load(): Promise<void> {
    const epoch = this.epoch;
    this.loading.set(true);
    this.error.set(null);
    try {
      const videos = await this.ipc.invoke<LibraryVideo[]>('library_video_list');
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
    const video = await this.ipc.invoke<LibraryVideo>('library_video_upload', { path, input });
    this.items.set([video, ...this.items()]);
    await this.library.refreshTaxonomy();
    return video;
  }

  private async fetchPoster(id: number): Promise<void> {
    const epoch = this.epoch;
    try {
      const dataUrl = await this.ipc.invoke<string | null>('library_video_poster', { id });
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
    this.query.set('');
    this.sort.set('new');
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(null);
  }

  private findSelected(): LibraryVideo | null {
    const id = this.selectedId();
    return id === null ? null : (this.items().find(this.hasId.bind(null, id)) ?? null);
  }

  private buildVisible(): LibraryVideo[] {
    return filterVideos(this.items(), {
      query: this.query(),
      sort: this.sort(),
      collection: this.library.filterCollection(),
      tags: this.library.filterTags(),
    });
  }

  private hasId(id: number, video: LibraryVideo): boolean {
    return video.id === id;
  }
}
