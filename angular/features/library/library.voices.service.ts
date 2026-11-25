import { computed, inject, Injectable, signal } from '@angular/core';
import { BackendService } from '@features/settings/backend.service';
import { CloudService } from '@features/settings/cloud.service';
import { RemoteBackendService } from '@features/settings/remote.service';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { replaceById, withoutIds } from '@shared/utils/collection';

import { WorkspaceService } from '../workspace/workspace.service';
import { fileNameOf, libraryErrorKey, toLibraryError } from './library.rules';
import { LibraryService } from './library.service';
import { LibrarySoundService } from './library.sounds.service';
import {
  LibraryVoice,
  VoiceEngine,
  VoiceInput,
  VoicePatch,
  VoiceReferenceFile,
} from './library.voices.models';
import { LibraryVoicePlayer } from './library.voices.player';
import {
  buildVoiceEngines,
  engineName,
  engineReady,
  filterVoices,
  voiceById,
} from './library.voices.rules';
import { LibraryWorkspaceSync } from './library.workspace-sync';

function requireVoice(voice: LibraryVoice | null | undefined): LibraryVoice {
  if (!voice) throw new Error('voice_unavailable');
  return voice;
}

function isDeleted(deleted: Set<number>, id: number | null): boolean {
  return id !== null && deleted.has(id);
}

function touchesTaxonomy(patch: VoicePatch): boolean {
  return patch.tags !== undefined || patch.collectionId !== undefined;
}

@Injectable({ providedIn: 'root' })
export class LibraryVoiceService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly workspace = inject(WorkspaceService);
  private readonly library = inject(LibraryService);
  private readonly sounds = inject(LibrarySoundService);
  private readonly backend = inject(BackendService);
  private readonly remote = inject(RemoteBackendService);
  private readonly cloud = inject(CloudService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly player = inject(LibraryVoicePlayer);
  private previewToken = 0;
  private epoch = 0;

  readonly items = signal<LibraryVoice[]>([]);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly selectedId = signal<number | null>(null);
  readonly playingId = signal<number | null>(null);
  readonly preparingId = signal<number | null>(null);
  readonly query = signal('');
  readonly engines = computed(this.buildEngines.bind(this));
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

  select(id: number | null): void {
    this.selectedId.set(id);
  }

  engineName(voice: LibraryVoice): string {
    return engineName(this.engines(), voice.engine);
  }

  isReady(voice: LibraryVoice): boolean {
    return engineReady(this.engines(), voice.engine);
  }

  async create(input: VoiceInput): Promise<LibraryVoice> {
    const voice = requireVoice(
      await this.ipc.invoke<LibraryVoice>('library_voice_create', { input }),
    );
    this.items.set([voice, ...this.items()]);
    return voice;
  }

  async pickReferenceFile(): Promise<VoiceReferenceFile | null> {
    try {
      const path = (await this.sounds.pick())?.[0];
      if (!path) return null;
      const check = (await this.sounds.inspect([path]))?.[0];
      if (check?.status === 'error') return null;
      return { path, name: check?.name ?? fileNameOf(path), size: check?.size ?? null };
    } catch {
      return null;
    }
  }

  async update(id: number, patch: VoicePatch): Promise<LibraryVoice> {
    const voice = requireVoice(
      await this.ipc.invoke<LibraryVoice>('library_voice_update', { id, patch }),
    );
    this.items.set(replaceById(this.items(), voice));
    if (touchesTaxonomy(patch)) await this.library.refreshTaxonomy();
    return voice;
  }

  async duplicate(id: number): Promise<LibraryVoice> {
    const source = voiceById(this.items(), id);
    if (!source) throw new Error('voice_unavailable');
    const name = this.languageService.translate('library.voice.copyName', { name: source.name });
    const copy = requireVoice(
      await this.ipc.invoke<LibraryVoice>('library_voice_duplicate', { id, name }),
    );
    this.items.set([copy, ...this.items()]);
    this.select(copy.id);
    await this.library.refreshTaxonomy();
    return copy;
  }

  async remove(ids: number | number[]): Promise<number> {
    const list = Array.isArray(ids) ? ids : [ids];
    const count = await this.ipc.invoke<number>('library_voice_delete', { ids: list });
    const deleted = new Set(list);
    this.items.set(withoutIds(this.items(), deleted));
    if (this.selectedId() !== null && deleted.has(this.selectedId() as number)) {
      this.selectedId.set(null);
    }
    if ([this.playingId(), this.preparingId()].some(isDeleted.bind(null, deleted))) {
      this.stopPreview();
    }
    await this.library.refreshTaxonomy();
    return count ?? list.length;
  }

  isPreviewActive(id: number): boolean {
    return this.playingId() === id || this.preparingId() === id;
  }

  async togglePreview(id: number): Promise<void> {
    const voice = voiceById(this.items(), id);
    const wasActive = this.isPreviewActive(id);
    this.stopPreview();
    if (!voice || wasActive) return;
    const token = this.previewToken;
    this.preparingId.set(id);
    try {
      const data = await this.ipc.invoke<ArrayBuffer>('library_voice_preview', { id });
      if (token !== this.previewToken) return;
      this.preparingId.set(null);
      this.playingId.set(id);
      await this.player.play(data, this.endPreview.bind(this, token));
    } catch (error) {
      if (token !== this.previewToken) return;
      this.stopPreview();
      this.toasts.show(this.previewErrorText(error), 'danger');
    }
  }

  private endPreview(token: number): void {
    if (token === this.previewToken) this.stopPreview();
  }

  private previewErrorText(error: unknown): string {
    const key = libraryErrorKey(error) as LanguageKey;
    return this.languageService.translate(key, { detail: toLibraryError(error).detail });
  }

  stopPreview(): void {
    this.previewToken += 1;
    this.player.stop();
    this.preparingId.set(null);
    this.playingId.set(null);
  }

  private async load(): Promise<void> {
    const epoch = this.epoch;
    this.loading.set(true);
    let voices: LibraryVoice[] = [];
    try {
      voices = (await this.ipc.invoke<LibraryVoice[] | undefined>('library_voice_list')) ?? [];
    } catch {
      voices = [];
    }
    if (epoch === this.epoch) {
      this.items.set(voices);
      this.loaded.set(true);
      this.loading.set(false);
    }
  }

  private reset(): void {
    this.epoch += 1;
    this.stopPreview();
    this.items.set([]);
    this.selectedId.set(null);
    this.query.set('');
    this.loaded.set(false);
    this.loading.set(false);
  }

  private buildEngines(): VoiceEngine[] {
    const models = this.remote.active() ? this.remote.models() : this.backend.models();
    return buildVoiceEngines(models, this.cloud.accounts());
  }

  private findSelected(): LibraryVoice | null {
    const id = this.selectedId();
    return id === null ? null : voiceById(this.items(), id);
  }

  private buildVisible(): LibraryVoice[] {
    return filterVoices(this.items(), {
      query: this.query(),
      collection: this.library.filterCollection(),
      tags: this.library.filterTags(),
    });
  }
}
