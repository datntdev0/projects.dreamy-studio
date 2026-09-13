import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { replaceById, withoutIds } from '@shared/utils/collection';

import { WorkspaceService } from '../workspace/workspace.service';
import { LibraryError } from './library.models';
// prettier-ignore
import { LibraryPrompt, PromptCreateInput, PromptPatch } from './library.prompts.models';
import { filterPrompts } from './library.prompts.rules';
import { toLibraryError } from './library.rules';
import { LibraryService } from './library.service';

@Injectable({ providedIn: 'root' })
export class LibraryPromptService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly workspace = inject(WorkspaceService);
  private readonly library = inject(LibraryService);
  private readonly workspacePath = computed(() => this.workspace.current()?.path ?? null);
  private epoch = 0;
  private lastPath: string | null | undefined;
  private lastRevision: number | undefined;
  readonly items = signal<LibraryPrompt[]>([]);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<LibraryError | null>(null);
  readonly selectedId = signal<number | null>(null);
  readonly query = signal('');
  readonly selected = computed(
    () => this.items().find((item) => item.id === this.selectedId()) ?? null,
  );
  readonly visible = computed(() =>
    filterPrompts(this.items(), {
      query: this.query(),
      collection: this.library.filterCollection(),
      tags: this.library.filterTags(),
    }),
  );
  constructor() {
    effect(this.trackWorkspacePath.bind(this));
    effect(this.trackRevision.bind(this));
  }
  async ensureLoaded(): Promise<void> {
    if (!this.loaded() && !this.loading()) await this.load();
  }
  async create(input: PromptCreateInput): Promise<LibraryPrompt> {
    const prompt = await this.ipc.invoke<LibraryPrompt>('library_prompt_create', { input });
    this.items.set([prompt, ...this.items()]);
    await this.library.refreshTaxonomy();
    return prompt;
  }
  async update(id: number, patch: PromptPatch): Promise<LibraryPrompt> {
    const prompt = await this.ipc.invoke<LibraryPrompt>('library_prompt_update', { id, patch });
    this.items.set(replaceById(this.items(), prompt));
    await this.library.refreshTaxonomy();
    return prompt;
  }
  async remove(ids: number[]): Promise<number> {
    const count = await this.ipc.invoke<number>('library_prompt_delete', { ids });
    const deleted = new Set(ids);
    this.items.set(withoutIds(this.items(), deleted));
    if (this.selectedId() !== null && deleted.has(this.selectedId() as number))
      this.selectedId.set(null);
    await this.library.refreshTaxonomy();
    return count;
  }
  select(id: number | null): void {
    this.selectedId.set(id);
  }
  async copy(id: number): Promise<boolean> {
    const prompt = this.items().find((item) => item.id === id);
    if (!prompt) return false;
    try {
      await navigator.clipboard.writeText(prompt.text);
      return true;
    } catch {
      return false;
    }
  }
  async load(): Promise<void> {
    const epoch = this.epoch;
    this.loading.set(true);
    this.error.set(null);
    try {
      const prompts = await this.ipc.invoke<LibraryPrompt[]>('library_prompt_list');
      if (epoch === this.epoch) {
        this.items.set(prompts);
        this.loaded.set(true);
      }
    } catch (cause) {
      if (epoch === this.epoch) this.error.set(toLibraryError(cause));
    } finally {
      if (epoch === this.epoch) this.loading.set(false);
    }
  }
  private trackWorkspacePath(): void {
    const path = this.workspacePath();
    untracked(this.syncPath.bind(this, path));
  }

  private trackRevision(): void {
    const revision = this.library.revision();
    untracked(this.syncRevision.bind(this, revision));
  }

  private syncPath(path: string | null): void {
    if (path === this.lastPath) return;
    this.lastPath = path;
    this.epoch += 1;
    this.items.set([]);
    this.selectedId.set(null);
    this.query.set('');
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(null);
    if (path !== null) void this.load();
  }
  private syncRevision(revision: number): void {
    if (revision === this.lastRevision) return;
    this.lastRevision = revision;
    if (this.loaded()) void this.load();
  }
}
