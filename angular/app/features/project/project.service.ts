import { Injectable, computed, effect, inject, signal, untracked } from "@angular/core";
import { DesktopIpcService } from "../../core/desktop/desktop-ipc.service";
import { WorkspaceService } from "../workspace/workspace.service";
import { DirEntry } from "./project.models";
import { ProjectError } from "./project.models";
import { ProjectFilters } from "./project.models";
import { ProjectInput } from "./project.models";
import { ProjectPatch } from "./project.models";
import { ProjectSort } from "./project.models";
import { ProjectStatus } from "./project.models";
import { ProjectStatusCount } from "./project.models";
import { ProjectSummary } from "./project.models";
import { ProjectTemplateCount } from "./project.models";
import { ProjectTemplateId } from "./project.models";
import { ProjectTotals } from "./project.models";
import { ProjectViewMode } from "./project.models";
import { PROJECT_TEMPLATES } from "./project.rules";
import { filterProjects } from "./project.rules";
import { sortDirEntries } from "./project.rules";
import { sortProjects } from "./project.rules";
import { toProjectError } from "./project.rules";
import { toggled } from "./project.rules";
import { treeKey } from "./project.rules";

const VIEW_STORAGE_KEY = "ds.pj.view";

function readViewMode(): ProjectViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === '"list"' ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function storeViewMode(mode: ProjectViewMode): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(mode));
  } catch {
    return;
  }
}

function findProject(projects: ProjectSummary[], id: number): ProjectSummary | undefined {
  for (const project of projects) {
    if (project.id === id) {
      return project;
    }
  }
  return undefined;
}

function replaceProject(projects: ProjectSummary[], id: number, next: ProjectSummary): ProjectSummary[] {
  const rows: ProjectSummary[] = [];
  for (const project of projects) {
    rows.push(project.id === id ? next : project);
  }
  return rows;
}

function archiveProjects(projects: ProjectSummary[], ids: Set<number>, archived: boolean): ProjectSummary[] {
  const rows: ProjectSummary[] = [];
  for (const project of projects) {
    rows.push(ids.has(project.id) ? { ...project, archived } : project);
  }
  return rows;
}

function withoutProjects(projects: ProjectSummary[], ids: Set<number>): ProjectSummary[] {
  const rows: ProjectSummary[] = [];
  for (const project of projects) {
    if (!ids.has(project.id)) {
      rows.push(project);
    }
  }
  return rows;
}

function withoutCovers(covers: Record<number, string | null>, removed: Set<number>): Record<number, string | null> {
  const next: Record<number, string | null> = {};
  for (const key of Object.keys(covers)) {
    if (!removed.has(Number(key))) {
      next[Number(key)] = covers[Number(key)];
    }
  }
  return next;
}

function matchesName(project: ProjectSummary, needle: string, exceptId: number | undefined): boolean {
  return project.id !== exceptId && project.name.trim().toLocaleLowerCase() === needle;
}

function idOf(project: ProjectSummary): number {
  return project.id;
}

function templateOf(project: ProjectSummary): ProjectTemplateId {
  return project.template;
}

function statusOf(project: ProjectSummary): ProjectStatus {
  return project.archived ? "archived" : "active";
}

function compareOpenedAt(a: ProjectSummary, b: ProjectSummary): number {
  return b.openedAt.localeCompare(a.openedAt);
}

function isKnownTemplate(known: Set<ProjectTemplateId>, template: ProjectTemplateId): boolean {
  return known.has(template);
}

function isKnownStatus(known: Set<ProjectStatus>, status: ProjectStatus): boolean {
  return known.has(status);
}

function hasTreePrefix(prefix: string, key: string): boolean {
  return key.startsWith(prefix);
}

@Injectable({ providedIn: "root" })
export class ProjectService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly workspace = inject(WorkspaceService);
  private readonly items = signal<ProjectSummary[]>([]);
  private readonly selected = signal<number | null>(null);
  private readonly rawTemplates = signal<ProjectTemplateId[]>([]);
  private readonly rawStatuses = signal<ProjectStatus[]>([]);
  private readonly directoryCache = signal<Record<string, DirEntry[]>>({});
  private readonly loadedDirectories = signal<Record<string, true>>({});
  private readonly pendingDirectories = new Map<string, Promise<DirEntry[]>>();
  private readonly expanded = signal<string[]>([]);
  private readonly covers = signal<Record<number, string | null>>({});
  private readonly pendingCovers = new Set<number>();
  private epoch = 0;
  private treeEpoch = 0;
  private workspacePath: string | null | undefined = undefined;

  readonly projects = this.items.asReadonly();
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<ProjectError | null>(null);
  readonly view = signal<ProjectViewMode>(readViewMode());
  readonly query = signal("");
  readonly sort = signal<ProjectSort>("updated");
  readonly filters = computed(this.buildFilters.bind(this));
  readonly filterActive = computed(this.buildFilterActive.bind(this));
  readonly visible = computed(this.buildVisible.bind(this));
  readonly selectedId = computed(this.buildSelectedId.bind(this));
  readonly totals = computed(this.buildTotals.bind(this));
  readonly recent = computed(this.buildRecent.bind(this));
  readonly isEmpty = computed(this.buildIsEmpty.bind(this));
  readonly templateCounts = computed(this.buildTemplateCounts.bind(this));
  readonly statusCounts = computed(this.buildStatusCounts.bind(this));
  readonly expandedKeys = this.expanded.asReadonly();

  constructor() {
    effect(this.syncWorkspace.bind(this));
  }

  async load(): Promise<void> {
    const epoch = this.epoch;
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await this.ipc.invoke<ProjectSummary[]>("project_list");
      if (epoch === this.epoch) {
        this.items.set(rows);
        this.loaded.set(true);
        this.pruneSelection();
      }
    } catch (cause) {
      if (epoch === this.epoch) {
        this.error.set(toProjectError(cause));
      }
    } finally {
      if (epoch === this.epoch) {
        this.loading.set(false);
      }
    }
  }

  async ensureLoaded(): Promise<void> {
    if (!this.loaded() && !this.loading()) {
      await this.load();
    }
  }

  projectById(id: number): ProjectSummary | undefined {
    return findProject(this.items(), id);
  }

  async create(input: ProjectInput): Promise<ProjectSummary> {
    const created = await this.ipc.invoke<ProjectSummary>("project_create", { input });
    this.items.set([created, ...this.items()]);
    return created;
  }

  async update(id: number, patch: ProjectPatch): Promise<ProjectSummary> {
    const next = await this.ipc.invoke<ProjectSummary>("project_update", { id, patch });
    this.items.set(replaceProject(this.items(), id, next));
    return next;
  }

  async setArchived(ids: number[], archived: boolean): Promise<void> {
    await this.ipc.invoke<void>("project_archive", { ids, archived });
    const selectedIds = new Set(ids);
    this.items.set(archiveProjects(this.items(), selectedIds, archived));
  }

  async remove(ids: number[]): Promise<number> {
    const count = await this.ipc.invoke<number>("project_delete", { ids });
    const removed = new Set(ids);
    this.items.set(withoutProjects(this.items(), removed));
    this.selected.set(this.selectionAfterRemoval(removed));
    this.covers.set(withoutCovers(this.covers(), removed));
    this.refreshTreeForIds(ids);
    return count;
  }

  coverUrl(id: number): string | null {
    return this.covers()[id] ?? null;
  }

  ensureCover(id: number): void {
    if (this.covers()[id] !== undefined || this.pendingCovers.has(id)) {
      return;
    }
    this.pendingCovers.add(id);
    void this.fetchCover(id);
  }

  async setCover(id: number, dataUrl: string): Promise<ProjectSummary> {
    const next = await this.ipc.invoke<ProjectSummary>("project_cover_set", { id, dataUrl });
    this.items.set(replaceProject(this.items(), id, next));
    this.covers.set({ ...this.covers(), [id]: dataUrl });
    return next;
  }

  async clearCover(id: number): Promise<ProjectSummary> {
    const next = await this.ipc.invoke<ProjectSummary>("project_cover_clear", { id });
    this.items.set(replaceProject(this.items(), id, next));
    this.covers.set({ ...this.covers(), [id]: null });
    return next;
  }

  async open(id: number): Promise<ProjectSummary> {
    const opened = await this.ipc.invoke<ProjectSummary>("project_open", { id });
    this.items.set(replaceProject(this.items(), id, opened));
    return opened;
  }

  folderOpen(id: number): Promise<void> {
    return this.ipc.invoke<void>("project_folder_open", { id });
  }

  isDuplicateName(name: string, exceptId?: number): boolean {
    const needle = name.trim().toLocaleLowerCase();
    if (!needle) {
      return false;
    }
    for (const project of this.items()) {
      if (matchesName(project, needle, exceptId)) {
        return true;
      }
    }
    return false;
  }

  setView(mode: ProjectViewMode): void {
    this.view.set(mode);
    storeViewMode(mode);
  }

  setQuery(value: string): void {
    this.query.set(value);
  }

  setSort(value: ProjectSort): void {
    this.sort.set(value);
  }

  toggleTemplateFilter(template: ProjectTemplateId): void {
    this.rawTemplates.set(toggled(this.rawTemplates(), template));
  }

  toggleStatusFilter(status: ProjectStatus): void {
    this.rawStatuses.set(toggled(this.rawStatuses(), status));
  }

  clearFilters(): void {
    this.rawTemplates.set([]);
    this.rawStatuses.set([]);
  }

  clearQueryAndFilters(): void {
    this.query.set("");
    this.clearFilters();
  }

  selectOnly(id: number): void {
    this.selected.set(id);
  }

  clearSelection(): void {
    this.selected.set(null);
  }

  toggleExpanded(key: string): void {
    this.expanded.set(toggled(this.expanded(), key));
  }

  isExpanded(key: string): boolean {
    return this.expanded().includes(key);
  }

  dirEntries(projectId: number, path: string): DirEntry[] {
    const key = treeKey(projectId, path);
    return this.loadedDirectories()[key] ? this.directoryCache()[key] ?? [] : [];
  }

  async ensureDir(projectId: number, path: string): Promise<DirEntry[]> {
    const key = treeKey(projectId, path);
    if (this.loadedDirectories()[key]) {
      return this.directoryCache()[key] ?? [];
    }
    const pending = this.pendingDirectories.get(key);
    if (pending) {
      return pending;
    }
    const request = this.fetchDirectory(projectId, path, key, this.treeEpoch);
    this.pendingDirectories.set(key, request);
    const entries = await request;
    if (this.pendingDirectories.get(key) === request) {
      this.pendingDirectories.delete(key);
    }
    return entries;
  }

  refreshTree(projectId?: number): void {
    this.treeEpoch += 1;
    this.pendingDirectories.clear();
    if (projectId === undefined) {
      this.directoryCache.set({});
      this.loadedDirectories.set({});
      this.expanded.set([]);
      return;
    }
    const prefix = `${projectId}:`;
    this.directoryCache.set(this.withoutTreePrefix(this.directoryCache(), prefix));
    this.loadedDirectories.set(this.withoutTreePrefix(this.loadedDirectories(), prefix));
    this.expanded.set(this.expanded().filter(hasTreePrefix.bind(null, prefix)));
  }

  reset(): void {
    this.epoch += 1;
    this.treeEpoch += 1;
    this.items.set([]);
    this.selected.set(null);
    this.rawTemplates.set([]);
    this.rawStatuses.set([]);
    this.directoryCache.set({});
    this.loadedDirectories.set({});
    this.pendingDirectories.clear();
    this.expanded.set([]);
    this.covers.set({});
    this.pendingCovers.clear();
    this.query.set("");
    this.sort.set("updated");
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(null);
  }

  private async fetchCover(id: number): Promise<void> {
    const epoch = this.epoch;
    let url: string | null = null;
    try {
      url = await this.ipc.invoke<string | null>("project_cover_get", { id });
    } catch {
      url = null;
    }
    this.pendingCovers.delete(id);
    if (epoch === this.epoch) {
      this.covers.set({ ...this.covers(), [id]: url });
    }
  }

  private async fetchDirectory(projectId: number, path: string, key: string, treeEpoch: number): Promise<DirEntry[]> {
    try {
      const entries = await this.ipc.invoke<DirEntry[]>("project_dir_list", { id: projectId, path });
      if (treeEpoch === this.treeEpoch) {
        this.directoryCache.set({ ...this.directoryCache(), [key]: sortDirEntries(entries) });
        this.loadedDirectories.set({ ...this.loadedDirectories(), [key]: true });
      }
      return sortDirEntries(entries);
    } catch (cause) {
      if (treeEpoch === this.treeEpoch) {
        this.error.set(toProjectError(cause));
      }
      return [];
    }
  }

  private syncWorkspace(): void {
    const path = this.workspace.current()?.path ?? null;
    untracked(this.applyWorkspace.bind(this, path));
  }

  private applyWorkspace(path: string | null): void {
    if (path === this.workspacePath) {
      return;
    }
    this.workspacePath = path;
    this.reset();
    if (path !== null) {
      void this.load();
    }
  }

  private withoutTreePrefix<T>(record: Record<string, T>, prefix: string): Record<string, T> {
    const next: Record<string, T> = {};
    for (const key of Object.keys(record)) {
      if (!hasTreePrefix(prefix, key)) {
        next[key] = record[key] as T;
      }
    }
    return next;
  }

  private refreshTreeForIds(ids: number[]): void {
    for (const id of ids) {
      this.refreshTree(id);
    }
  }

  private pruneSelection(): void {
    const id = this.selected();
    if (id !== null && !this.projectById(id)) {
      this.selected.set(null);
    }
  }

  private selectionAfterRemoval(removed: Set<number>): number | null {
    const id = this.selected();
    return id !== null && removed.has(id) ? null : id;
  }

  private buildFilters(): ProjectFilters {
    const templates = new Set<ProjectTemplateId>();
    const statuses = new Set<ProjectStatus>();
    for (const project of this.items()) {
      templates.add(templateOf(project));
      statuses.add(statusOf(project));
    }
    return {
      templates: this.rawTemplates().filter(isKnownTemplate.bind(null, templates)),
      status: this.rawStatuses().filter(isKnownStatus.bind(null, statuses)),
    };
  }

  private buildFilterActive(): boolean {
    return this.filters().templates.length + this.filters().status.length > 0;
  }

  private buildVisible(): ProjectSummary[] {
    return sortProjects(filterProjects(this.items(), this.filters(), this.query()), this.sort());
  }

  private buildSelectedId(): number | null {
    const id = this.selected();
    return id !== null && this.projectById(id) ? id : null;
  }

  private buildTotals(): ProjectTotals {
    const totals: ProjectTotals = { projects: this.items().length, active: 0, archived: 0 };
    for (const project of this.items()) {
      totals[project.archived ? "archived" : "active"] += 1;
    }
    return totals;
  }

  private buildRecent(): ProjectSummary[] {
    return [...this.items()].sort(compareOpenedAt).slice(0, 5);
  }

  private buildIsEmpty(): boolean {
    return this.loaded() && this.items().length === 0;
  }

  private buildTemplateCounts(): ProjectTemplateCount[] {
    const counts = new Map<ProjectTemplateId, number>();
    for (const project of this.items()) {
      counts.set(project.template, (counts.get(project.template) ?? 0) + 1);
    }
    const rows: ProjectTemplateCount[] = [];
    for (const template of PROJECT_TEMPLATES) {
      rows.push({ template: template.id, count: counts.get(template.id) ?? 0 });
    }
    return rows;
  }

  private buildStatusCounts(): ProjectStatusCount[] {
    let active = 0;
    let archived = 0;
    for (const project of this.items()) {
      if (project.archived) {
        archived += 1;
      } else {
        active += 1;
      }
    }
    return [{ status: "active", count: active }, { status: "archived", count: archived }];
  }
}
