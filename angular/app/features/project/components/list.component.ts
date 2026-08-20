import { Component, HostListener, inject } from "@angular/core";
import { Icon } from "@components/icon";
import { I18nKey } from "@app/core/i18n/i18n.models";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { TabsService } from "@layout/tabs.service";
import { ProjectDialogsService } from "../project.dialogs.service";
import { ProjectConfirmService } from "../project.confirm.service";
import { ProjectStatus } from "../project.models";
import { ProjectSummary } from "../project.models";
import { ProjectTemplateId } from "../project.models";
import { ProjectViewMode } from "../project.models";
import { ProjectLabels } from "../project.labels";
import { ProjectService } from "../project.service";
import { ProjectThumb } from "./thumb.component";

const FIELD_SELECTOR = "input,textarea,select";

function isField(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(FIELD_SELECTOR) !== null;
}

@Component({
  selector: "app-project-list",
  standalone: true,
  imports: [Icon, I18nPipe, ProjectThumb],
  templateUrl: "./list.component.html",
})
export class ProjectList {
  private readonly tabs = inject(TabsService);
  readonly projects = inject(ProjectService);
  readonly labels = inject(ProjectLabels);
  readonly dialogs = inject(ProjectDialogsService);
  private readonly confirms = inject(ProjectConfirmService);

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
    return this.projects.selectedId() === id;
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

  @HostListener("document:keydown", ["$event"])
  onDeleteKey(event: KeyboardEvent): void {
    const id = this.projects.selectedId();
    if (event.key !== "Delete" || isField(event.target) || id === null || this.isModalOpen()) {
      return;
    }
    this.confirms.deleteProjects([id]);
  }

  private isModalOpen(): boolean {
    return this.dialogs.createOpen() || document.querySelector(".modal") !== null;
  }

  private async openProject(project: ProjectSummary): Promise<void> {
    this.projects.selectOnly(project.id);
    const opened = await this.projects.open(project.id);
    this.tabs.openProject(opened.id, opened.name, this.labels.iconOf(opened.template));
  }
}
