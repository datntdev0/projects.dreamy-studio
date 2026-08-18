import { Injectable, computed, effect, inject, signal, untracked } from "@angular/core";
import { DesktopIpcService } from "@app/core/desktop/desktop-ipc.service";
import { WorkspaceService } from "../workspace/workspace.service";
import { AssetCheck, AssetUploadInput, LibraryError } from "./library.models";
import { PromptCreateInput, LibraryPrompt, PromptPatch, PromptSort } from "./library.prompts.models";
import { filterPrompts } from "./library.prompts.rules";
import { LibraryService } from "./library.service";
import { toLibraryError } from "./library.rules";

function replace(items: LibraryPrompt[], next: LibraryPrompt): LibraryPrompt[] { return items.map(item => item.id === next.id ? next : item); }
function kept(ids: Set<number>, item: LibraryPrompt): boolean { return !ids.has(item.id); }
function voidValue<T>(_value: T): void { return; }
function ignored(_cause: unknown): void { return; }
@Injectable({ providedIn: "root" })
export class LibraryPromptService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly workspace = inject(WorkspaceService);
  private readonly library = inject(LibraryService);
  private readonly workspacePath = computed(() => this.workspace.current()?.path ?? null);
  private queue: Promise<void> = Promise.resolve();
  private epoch = 0;
  private lastPath: string | null | undefined;
  private lastRevision: number | undefined;
  readonly items = signal<LibraryPrompt[]>([]);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<LibraryError | null>(null);
  readonly selectedId = signal<number | null>(null);
  readonly query = signal("");
  readonly sort = signal<PromptSort>("new");
  readonly selected = computed(() => this.items().find(item => item.id === this.selectedId()) ?? null);
  readonly visible = computed(() => filterPrompts(this.items(), { query: this.query(), sort: this.sort(), collection: this.library.filterCollection(), tags: this.library.filterTags() }));
  constructor() { effect(() => { const path = this.workspacePath(); untracked(() => this.syncPath(path)); }); effect(() => { const revision = this.library.revision(); untracked(() => this.syncRevision(revision)); }); }
  async ensureLoaded(): Promise<void> { if (!this.loaded() && !this.loading()) await this.load(); }
  pick(): Promise<string[]> { return this.ipc.invoke<string[]>("library_prompt_pick"); }
  inspect(paths: string[]): Promise<AssetCheck[]> { return this.ipc.invoke<AssetCheck[]>("library_prompt_inspect", { paths }); }
  upload(path: string, input: AssetUploadInput): Promise<LibraryPrompt> { const task = this.queue.then(() => this.uploadOne(path, input)); this.queue = task.then(voidValue, ignored); return task; }
  async create(input: PromptCreateInput): Promise<LibraryPrompt> { const prompt = await this.ipc.invoke<LibraryPrompt>("library_prompt_create", { input }); this.items.set([prompt, ...this.items()]); await this.library.refreshTaxonomy(); return prompt; }
  async update(id: number, patch: PromptPatch): Promise<LibraryPrompt> { const prompt = await this.ipc.invoke<LibraryPrompt>("library_prompt_update", { id, patch }); this.items.set(replace(this.items(), prompt)); await this.library.refreshTaxonomy(); return prompt; }
  async remove(ids: number[]): Promise<number> { const count = await this.ipc.invoke<number>("library_prompt_delete", { ids }); const deleted = new Set(ids); this.items.set(this.items().filter(kept.bind(null, deleted))); if (this.selectedId() !== null && deleted.has(this.selectedId() as number)) this.selectedId.set(null); await this.library.refreshTaxonomy(); return count; }
  select(id: number | null): void { this.selectedId.set(id); }
  async copy(id: number): Promise<boolean> { const prompt = this.items().find(item => item.id === id); if (!prompt) return false; try { await navigator.clipboard.writeText(prompt.text); return true; } catch { return false; } }
  private async load(): Promise<void> { const epoch = this.epoch; this.loading.set(true); this.error.set(null); try { const prompts = await this.ipc.invoke<LibraryPrompt[]>("library_prompt_list"); if (epoch === this.epoch) { this.items.set(prompts); this.loaded.set(true); } } catch (cause) { if (epoch === this.epoch) this.error.set(toLibraryError(cause)); } finally { if (epoch === this.epoch) this.loading.set(false); } }
  private async uploadOne(path: string, input: AssetUploadInput): Promise<LibraryPrompt> { const prompt = await this.ipc.invoke<LibraryPrompt>("library_prompt_upload", { path, input }); this.items.set([prompt, ...this.items()]); await this.library.refreshTaxonomy(); return prompt; }
  private syncPath(path: string | null): void { if (path === this.lastPath) return; this.lastPath = path; this.epoch += 1; this.items.set([]); this.selectedId.set(null); this.query.set(""); this.sort.set("new"); this.loaded.set(false); this.loading.set(false); this.error.set(null); if (path !== null) void this.load(); }
  private syncRevision(revision: number): void { if (revision === this.lastRevision) return; this.lastRevision = revision; if (this.loaded()) void this.load(); }
}
