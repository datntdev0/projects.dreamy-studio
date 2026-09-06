import { computed, inject, Injectable, signal } from '@angular/core';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { replaceById, withoutIds, withoutKeys } from '@shared/utils/collection';
import { noop } from '@shared/utils/noop';

import { WorkspaceService } from '../workspace/workspace.service';
import { AssetCheck, AssetPatch, AssetUploadInput, LibraryError } from './library.models';
import { toLibraryError } from './library.rules';
import { LibraryService } from './library.service';
import { decodePeaks } from './library.sounds.audio';
import { LibrarySound } from './library.sounds.models';
import { LibrarySoundPlayer } from './library.sounds.player';
import { filterSounds } from './library.sounds.rules';
import { LibraryWorkspaceSync } from './library.workspace-sync';

@Injectable({ providedIn: 'root' })
export class LibrarySoundService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly workspace = inject(WorkspaceService);
  private readonly library = inject(LibraryService);
  private readonly player = inject(LibrarySoundPlayer);
  private readonly peakCache = signal<Record<number, Uint8Array>>({});
  private readonly pendingPeaks = new Set<number>();
  private uploadQueue: Promise<void> = Promise.resolve();
  private epoch = 0;

  readonly items = signal<LibrarySound[]>([]);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<LibraryError | null>(null);
  readonly selectedId = signal<number | null>(null);
  readonly query = signal('');
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

  async pick(): Promise<string[]> {
    return this.ipc.invoke<string[]>('library_sound_pick');
  }
  inspect(paths: string[]): Promise<AssetCheck[]> {
    return this.ipc.invoke<AssetCheck[]>('library_sound_inspect', { paths });
  }

  upload(path: string, input: AssetUploadInput): Promise<LibrarySound> {
    const task = this.uploadQueue.then(this.uploadOne.bind(this, path, input));
    this.uploadQueue = task.then(noop, noop);
    return task;
  }

  async update(id: number, patch: AssetPatch): Promise<LibrarySound> {
    const sound = await this.ipc.invoke<LibrarySound>('library_sound_update', { id, patch });
    this.items.set(replaceById(this.items(), sound));
    await this.library.refreshTaxonomy();
    return sound;
  }

  async remove(ids: number[]): Promise<number> {
    const count = await this.ipc.invoke<number>('library_sound_delete', { ids });
    const deleted = new Set(ids);
    this.items.set(withoutIds(this.items(), deleted));
    this.peakCache.set(withoutKeys(this.peakCache(), deleted));
    if (this.selectedId() !== null && deleted.has(this.selectedId() as number))
      this.selectedId.set(null);
    if (this.player.currentId() !== null && deleted.has(this.player.currentId() as number))
      this.player.stop();
    await this.library.refreshTaxonomy();
    return count;
  }

  peaks(id: number): Uint8Array | null {
    const value = this.peakCache()[id];
    if (value !== undefined) return value;
    if (!this.pendingPeaks.has(id)) {
      this.pendingPeaks.add(id);
      void this.fetchPeaks(id);
    }
    return null;
  }

  select(id: number | null): void {
    this.selectedId.set(id);
  }

  private async load(): Promise<void> {
    const epoch = this.epoch;
    this.loading.set(true);
    this.error.set(null);
    try {
      const sounds = await this.ipc.invoke<LibrarySound[]>('library_sound_list');
      if (epoch === this.epoch) {
        this.items.set(sounds);
        this.loaded.set(true);
      }
    } catch (cause) {
      if (epoch === this.epoch) this.error.set(toLibraryError(cause));
    } finally {
      if (epoch === this.epoch) this.loading.set(false);
    }
  }

  private async uploadOne(path: string, input: AssetUploadInput): Promise<LibrarySound> {
    const sound = await this.ipc.invoke<LibrarySound>('library_sound_upload', { path, input });
    this.items.set([sound, ...this.items()]);
    await this.library.refreshTaxonomy();
    return sound;
  }

  private async fetchPeaks(id: number): Promise<void> {
    const epoch = this.epoch;
    try {
      const encoded = await this.ipc.invoke<string>('library_sound_peaks', { id });
      if (epoch === this.epoch)
        this.peakCache.set({ ...this.peakCache(), [id]: decodePeaks(encoded) });
    } catch {
      return;
    } finally {
      this.pendingPeaks.delete(id);
    }
  }

  private reset(): void {
    this.epoch += 1;
    this.items.set([]);
    this.peakCache.set({});
    this.pendingPeaks.clear();
    this.selectedId.set(null);
    this.query.set('');
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(null);
    this.player.stop();
  }

  private findSelected(): LibrarySound | null {
    const id = this.selectedId();
    return id === null ? null : (this.items().find(this.hasId.bind(null, id)) ?? null);
  }

  private buildVisible(): LibrarySound[] {
    return filterSounds(this.items(), {
      query: this.query(),
      collection: this.library.filterCollection(),
      tags: this.library.filterTags(),
    });
  }

  private hasId(id: number, sound: LibrarySound): boolean {
    return sound.id === id;
  }
}
