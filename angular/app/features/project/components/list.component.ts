import { Component, HostListener, inject } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { TabsService } from "../../../../layout/tabs.service";
import { ProjectDialogsService } from "../project.dialogs.service";
import { ProjectStatus } from "../project.models";
import { ProjectSummary } from "../project.models";
import { ProjectTemplateId } from "../project.models";
import { ProjectViewMode } from "../project.models";
import { ProjectLabels } from "../project.labels";
import { ProjectService } from "../project.service";

const FIELD_SELECTOR = "input,textarea,select";

function isField(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(FIELD_SELECTOR) !== null;
}

function allArchived(projects: ProjectSummary[]): boolean {
  for (const project of projects) {
    if (!project.archived) {
      return false;
    }
  }
  return true;
}

function idsOf(projects: ProjectSummary[]): number[] {
  const ids: number[] = [];
  for (const project of projects) {
    ids.push(project.id);
  }
  return ids;
}

@Component({
  selector: "app-project-list",
  standalone: true,
  imports: [Icon, I18nPipe],
  templateUrl: "./list.component.html",
})
export class ProjectList {
  private readonly tabs = inject(TabsService);
  readonly projects = inject(ProjectService);
  readonly labels = inject(ProjectLabels);
  readonly dialogs = inject(ProjectDialogsService);

  constructor() {
    void this.projects.ensureLoaded();
  }

  onQuery(event: Event): void {
    this.projects.setQuery((event.target as HTMLInputElement).value);
  }

  onSort(event: Event): void {
    this.projects.setSort((event.target as HTMLSelectElement).value as "updated" | "name");
  }

  isViewActive(view: ProjectViewMode): boolean {
    return this.projects.view() === view;
  }

  setView(view: ProjectViewMode): void {
    this.projects.setView(view);
  }

  templateKey(id: ProjectTemplateId): I18nKey {
    return this.labels.templateKey(id);
  }

  statusKey(status: ProjectStatus): I18nKey {
    return `project.status.${status}`;
  }

  isSelected(id: number): boolean {
    return this.projects.selectedIds().includes(id);
  }

  toggleSelection(id: number): void {
    this.projects.toggleSelect(id);
  }

  select(project: ProjectSummary): void {
    this.projects.selectOnly(project.id);
  }

  open(project: ProjectSummary): void {
    void this.openProject(project);
  }

  onKeydown(project: ProjectSummary, event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      this.open(project);
    }
    if (event.key === " ") {
      event.preventDefault();
      this.select(project);
    }
  }

  openCreate(): void {
    this.dialogs.openCreate();
  }

  toggleTemplate(template: ProjectTemplateId): void {
    this.projects.toggleTemplateFilter(template);
  }

  toggleStatus(status: ProjectStatus): void {
    this.projects.toggleStatusFilter(status);
  }

  clearFilters(): void {
    this.projects.clearQueryAndFilters();
  }

  allSelected(): boolean {
    const visible = this.projects.visible();
    if (visible.length === 0) {
      return false;
    }
    const selected = new Set(this.projects.selectedIds());
    for (const project of visible) {
      if (!selected.has(project.id)) {
        return false;
      }
    }
    return true;
  }

  selectAll(): void {
    if (this.allSelected()) {
      this.projects.clearSelection();
      return;
    }
    this.projects.selectAll();
  }

  clearSelection(): void {
    this.projects.clearSelection();
  }

  archiveSelected(): void {
    const selected = this.selectedProjects();
    const archived = !allArchived(selected);
    void this.projects.setArchived(idsOf(selected), archived);
  }

  deleteSelected(): void {
    this.dialogs.openDelete(this.projects.selectedIds());
  }

  archiveLabel(): I18nKey {
    return allArchived(this.selectedProjects()) ? "project.action.unarchive" : "project.action.archive";
  }

  @HostListener("document:keydown", ["$event"])
  onDeleteKey(event: KeyboardEvent): void {
    if (event.key !== "Delete" || isField(event.target) || this.projects.selectedIds().length === 0 || this.isModalOpen()) {
      return;
    }
    this.deleteSelected();
  }

  private selectedProjects(): ProjectSummary[] {
    const selected = new Set(this.projects.selectedIds());
    return this.projects.projects().filter(this.isSelectedProject.bind(this, selected));
  }

  private isSelectedProject(selected: Set<number>, project: ProjectSummary): boolean {
    return selected.has(project.id);
  }

  private isModalOpen(): boolean {
    return this.dialogs.createOpen() || this.dialogs.deleteIds().length > 0 || document.querySelector(".modal") !== null;
  }

  private async openProject(project: ProjectSummary): Promise<void> {
    this.projects.selectOnly(project.id);
    const opened = await this.projects.open(project.id);
    this.tabs.openProject(opened.id, opened.name, this.labels.iconOf(opened.template));
  }
}
