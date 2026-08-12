import { Injectable, computed, effect, inject, signal, untracked } from "@angular/core";
import { DesktopIpcService } from "../../core/desktop/desktop-ipc.service";
import { WorkspaceService } from "../workspace/workspace.service";
import { AssetCheck, AssetPatch, AssetUploadInput, LibraryError } from "./library.models";
import { LibraryService } from "./library.service";
import { decodePeaks } from "./library.sounds.audio";
import { LibrarySound, SoundSort } from "./library.sounds.models";
import { LibrarySoundPlayer } from "./library.sounds.player";
import { filterSounds } from "./library.sounds.rules";
import { toLibraryError } from "./library.rules";

function asVoid<T>(_value: T): void { return; }
function ignoreError(_error: unknown): void { return; }
function replaceSound(items: LibrarySound[], next: LibrarySound): LibrarySound[] { return items.map(replaceSoundItem.bind(null, next)); }
function replaceSoundItem(next: LibrarySound, item: LibrarySound): LibrarySound { return item.id === next.id ? next : item; }
function withoutSounds(items: LibrarySound[], ids: Set<number>): LibrarySound[] { return items.filter(keptSound.bind(null, ids)); }
function keptSound(ids: Set<number>, sound: LibrarySound): boolean { return !ids.has(sound.id); }
function removePeaks(peaks: Record<number, Uint8Array>, ids: Set<number>): Record<number, Uint8Array> { const output: Record<number, Uint8Array> = {}; for (const key of Object.keys(peaks)) { const id = Number(key); if (!ids.has(id)) output[id] = peaks[id] as Uint8Array; } return output; }

@Injectable({ providedIn: "root" })
export class LibrarySoundService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly workspace = inject(WorkspaceService);
  private readonly library = inject(LibraryService);
  private readonly player = inject(LibrarySoundPlayer);
  private readonly workspacePath = computed(this.currentPath.bind(this));
  private readonly peakCache = signal<Record<number, Uint8Array>>({});
  private readonly pendingPeaks = new Set<number>();
  private uploadQueue: Promise<void> = Promise.resolve();
  private epoch = 0;
  private lastWorkspacePath: string | null | undefined = undefined;
  private lastRevision: number | undefined = undefined;

  readonly items = signal<LibrarySound[]>([]);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<LibraryError | null>(null);
  readonly selectedId = signal<number | null>(null);
  readonly query = signal("");
  readonly sort = signal<SoundSort>("new");
  readonly selected = computed(this.findSelected.bind(this));
  readonly visible = computed(this.buildVisible.bind(this));

  constructor() {
    effect(this.syncWorkspace.bind(this));
    effect(this.syncRevision.bind(this));
  }

  async ensureLoaded(): Promise<void> {
    if (!this.loaded() && !this.loading()) await this.load();
  }

  async pick(): Promise<string[]> { return this.ipc.invoke<string[]>("library_sound_pick"); }
  inspect(paths: string[]): Promise<AssetCheck[]> { return this.ipc.invoke<AssetCheck[]>("library_sound_inspect", { paths }); }

  upload(path: string, input: AssetUploadInput): Promise<LibrarySound> {
    const task = this.uploadQueue.then(this.uploadOne.bind(this, path, input));
    this.uploadQueue = task.then(asVoid, ignoreError);
    return task;
  }

  async update(id: number, patch: AssetPatch): Promise<LibrarySound> {
    const sound = await this.ipc.invoke<LibrarySound>("library_sound_update", { id, patch });
    this.items.set(replaceSound(this.items(), sound));
    await this.library.refreshTaxonomy();
    return sound;
  }

  async remove(ids: number[]): Promise<number> {
    const count = await this.ipc.invoke<number>("library_sound_delete", { ids });
    const deleted = new Set(ids);
    this.items.set(withoutSounds(this.items(), deleted));
    this.peakCache.set(removePeaks(this.peakCache(), deleted));
    if (this.selectedId() !== null && deleted.has(this.selectedId() as number)) this.selectedId.set(null);
    if (this.player.currentId() !== null && deleted.has(this.player.currentId() as number)) this.player.stop();
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

  select(id: number | null): void { this.selectedId.set(id); }

  private async load(): Promise<void> {
    const epoch = this.epoch;
    this.loading.set(true);
    this.error.set(null);
    try {
      const sounds = await this.ipc.invoke<LibrarySound[]>("library_sound_list");
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
    const sound = await this.ipc.invoke<LibrarySound>("library_sound_upload", { path, input });
    this.items.set([sound, ...this.items()]);
    await this.library.refreshTaxonomy();
    return sound;
  }

  private async fetchPeaks(id: number): Promise<void> {
    const epoch = this.epoch;
    try {
      const encoded = await this.ipc.invoke<string>("library_sound_peaks", { id });
      if (epoch === this.epoch) this.peakCache.set({ ...this.peakCache(), [id]: decodePeaks(encoded) });
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
    this.query.set("");
    this.sort.set("new");
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(null);
    this.player.stop();
  }

  private findSelected(): LibrarySound | null {
    const id = this.selectedId();
    return id === null ? null : this.items().find(this.hasId.bind(null, id)) ?? null;
  }

  private buildVisible(): LibrarySound[] {
    return filterSounds(this.items(), { query: this.query(), sort: this.sort(), collection: this.library.filterCollection(), tags: this.library.filterTags() });
  }

  private hasId(id: number, sound: LibrarySound): boolean { return sound.id === id; }
  private currentPath(): string | null { return this.workspace.current()?.path ?? null; }
  private syncWorkspace(): void { untracked(this.applyWorkspace.bind(this, this.workspacePath())); }
  private applyWorkspace(path: string | null): void { if (path === this.lastWorkspacePath) return; this.lastWorkspacePath = path; this.reset(); if (path !== null) void this.load(); }
  private syncRevision(): void { untracked(this.applyRevision.bind(this, this.library.revision())); }
  private applyRevision(revision: number): void { if (revision === this.lastRevision) return; this.lastRevision = revision; if (this.loaded()) void this.load(); }
}
