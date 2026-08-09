import { Component, inject } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { TabsService } from "../../../../layout/tabs.service";
import { ProjectDialogsService } from "../project.dialogs.service";
import { ProjectLabels } from "../project.labels";
import { ProjectSummary } from "../project.models";
import { ProjectService } from "../project.service";

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
  selector: "app-project-library-panel",
  standalone: true,
  imports: [Icon, I18nPipe],
  templateUrl: "./library.panel.html",
})
export class ProjectLibraryPanel {
  private readonly tabs = inject(TabsService);
  readonly projects = inject(ProjectService);
  readonly labels = inject(ProjectLabels);
  readonly dialogs = inject(ProjectDialogsService);

  async open(project: ProjectSummary): Promise<void> {
    this.projects.selectOnly(project.id);
    const opened = await this.projects.open(project.id);
    this.tabs.openProject(opened.id, opened.name, this.labels.iconOf(opened.template));
  }

  deselect(project: ProjectSummary): void {
    this.projects.toggleSelect(project.id);
  }

  archiveSelection(): void {
    const selected = this.selectedProjects();
    const archived = !allArchived(selected);
    void this.projects.setArchived(idsOf(selected), archived);
  }

  archiveLabel(): I18nKey {
    return allArchived(this.selectedProjects()) ? "project.action.unarchive" : "project.action.archive";
  }

  deleteSelection(): void {
    this.dialogs.openDelete(this.projects.selectedIds());
  }

  selectedProjects(): ProjectSummary[] {
    const ids = new Set(this.projects.selectedIds());
    return this.projects.projects().filter(this.isSelectedProject.bind(this, ids));
  }

  private isSelectedProject(ids: Set<number>, project: ProjectSummary): boolean {
    return ids.has(project.id);
  }
}
