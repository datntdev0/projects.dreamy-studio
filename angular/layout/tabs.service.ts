import { Injectable, computed, effect, inject, signal } from "@angular/core";
import { WorkspaceService } from "../app/features/workspace/workspace.service";
import { COLLECTIONS_TAB, EditorTab, HOME_TAB, HOME_TAB_ID, IMAGES_TAB, NOVELS_TAB, PROJECTS_TAB, collectionTab, collectionTabId, novelTab, novelTabId, projectTab, projectTabId } from "./layout.models";

function indexOfTab(tabs: EditorTab[], id: string): number {
  for (let index = 0; index < tabs.length; index++) {
    if (tabs[index].id === id) {
      return index;
    }
  }
  return -1;
}

@Injectable({ providedIn: "root" })
export class TabsService {
  private readonly workspace = inject(WorkspaceService);
  private readonly workspacePath = computed(this.currentPath.bind(this));

  readonly tabs = signal<EditorTab[]>([HOME_TAB]);
  readonly activeId = signal<string>(HOME_TAB_ID);
  readonly active = computed(this.findActive.bind(this));

  constructor() {
    effect(this.clearOnWorkspaceChange.bind(this));
  }

  isActive(id: string): boolean {
    return this.activeId() === id;
  }

  openHome(): void {
    this.activate(HOME_TAB_ID);
  }

  openNovels(): void {
    this.open(NOVELS_TAB);
  }

  openProjects(): void {
    this.open(PROJECTS_TAB);
  }

  openImages(): void { this.open(IMAGES_TAB); }

  openCollections(): void { this.open(COLLECTIONS_TAB); }

  openCollection(id: number, name: string): void {
    const tabId = collectionTabId(id);
    if (indexOfTab(this.tabs(), tabId) >= 0) { this.renameCollection(id, name); this.activate(tabId); return; }
    this.open(collectionTab(id, name));
  }

  renameCollection(id: number, name: string): void {
    const tabs = [...this.tabs()];
    const index = indexOfTab(tabs, collectionTabId(id));
    if (index < 0) return;
    tabs[index] = { ...tabs[index], title: name };
    this.tabs.set(tabs);
  }

  closeCollection(id: number): void { this.close(collectionTabId(id)); }

  openProject(id: number, title: string, icon = "folder"): void {
    const tabId = projectTabId(id);
    if (indexOfTab(this.tabs(), tabId) >= 0) {
      this.renameProject(id, title);
      this.activate(tabId);
      return;
    }
    this.open(projectTab(id, title, icon));
  }

  openNovel(novelId: number, title: string): void {
    const id = novelTabId(novelId);
    if (indexOfTab(this.tabs(), id) >= 0) {
      this.renameNovel(novelId, title);
      this.activate(id);
      return;
    }
    this.open(novelTab(novelId, title));
  }

  renameNovel(novelId: number, title: string): void {
    const tabs = [...this.tabs()];
    const index = indexOfTab(tabs, novelTabId(novelId));
    if (index < 0) {
      return;
    }
    tabs[index] = { ...tabs[index], title };
    this.tabs.set(tabs);
  }

  renameProject(id: number, title: string): void {
    const tabs = [...this.tabs()];
    const index = indexOfTab(tabs, projectTabId(id));
    if (index < 0) {
      return;
    }
    tabs[index] = { ...tabs[index], title };
    this.tabs.set(tabs);
  }

  activate(id: string): void {
    if (indexOfTab(this.tabs(), id) >= 0) {
      this.activeId.set(id);
    }
  }

  close(id: string): void {
    const tabs = this.tabs();
    const index = indexOfTab(tabs, id);
    if (index < 0 || !tabs[index].closable) {
      return;
    }
    const next = [...tabs];
    next.splice(index, 1);
    this.tabs.set(next);
    if (this.activeId() === id) {
      this.activeId.set(next[Math.min(index, next.length - 1)].id);
    }
  }

  closeNovel(novelId: number): void {
    this.close(novelTabId(novelId));
  }

  closeNovels(novelIds: number[]): void {
    for (const novelId of novelIds) {
      this.closeNovel(novelId);
    }
  }

  closeProject(id: number): void {
    this.close(projectTabId(id));
  }

  closeProjects(ids: number[]): void {
    for (const id of ids) {
      this.closeProject(id);
    }
  }

  reset(): void {
    this.tabs.set([HOME_TAB]);
    this.activeId.set(HOME_TAB_ID);
  }

  private open(tab: EditorTab): void {
    if (indexOfTab(this.tabs(), tab.id) < 0) {
      this.tabs.set([...this.tabs(), tab]);
    }
    this.activeId.set(tab.id);
  }

  private findActive(): EditorTab {
    const tabs = this.tabs();
    return tabs[indexOfTab(tabs, this.activeId())] ?? HOME_TAB;
  }

  private currentPath(): string | null {
    return this.workspace.current()?.path ?? null;
  }

  private clearOnWorkspaceChange(): void {
    this.workspacePath();
    this.reset();
  }
}
