import { Component, computed, inject, input } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { TabsService } from "../../../../layout/tabs.service";
import { ProjectDialogsService } from "../project.dialogs.service";
import { ProjectLabels } from "../project.labels";
import { ProjectSummary } from "../project.models";
import { projectCode } from "../project.rules";
import { ProjectService } from "../project.service";

@Component({
  selector: "app-project-panel",
  standalone: true,
  imports: [Icon, I18nPipe],
  templateUrl: "./project.panel.html",
})
export class ProjectPanel {
  private readonly tabs = inject(TabsService);
  readonly projects = inject(ProjectService);
  readonly labels = inject(ProjectLabels);
  readonly dialogs = inject(ProjectDialogsService);
  readonly projectId = input.required<number>();
  readonly showOpen = input(false);
  readonly project = computed(this.buildProject.bind(this));

  code(project: ProjectSummary): string {
    return projectCode(project.id);
  }

  async open(project: ProjectSummary): Promise<void> {
    const opened = await this.projects.open(project.id);
    this.tabs.openProject(opened.id, opened.name, this.labels.iconOf(opened.template));
  }

  archive(project: ProjectSummary): void {
    void this.projects.setArchived([project.id], !project.archived);
  }

  openFolder(project: ProjectSummary): void {
    void this.projects.folderOpen(project.id);
  }

  remove(project: ProjectSummary): void {
    this.dialogs.openDelete([project.id]);
  }

  private buildProject(): ProjectSummary | undefined {
    return this.projects.projectById(this.projectId());
  }
}
