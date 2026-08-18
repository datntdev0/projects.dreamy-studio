import { Component, computed, inject, input } from "@angular/core";
import { Icon } from "@components/icon";
import { I18nKey } from "@app/core/i18n/i18n.models";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { I18nService } from "@app/core/i18n/i18n.service";
import { ToastService } from "@app/core/toast/toast.service";
import { TabsService } from "@layout/tabs.service";
import { checkCoverFile, prepareCover } from "@app/features/novel/novel.cover";
import { ProjectDialogsService } from "../project.dialogs.service";
import { ProjectLabels } from "../project.labels";
import { ProjectSummary } from "../project.models";
import { projectCode, toProjectError } from "../project.rules";
import { ProjectService } from "../project.service";
import { ProjectThumb } from "./thumb.component";

@Component({
  selector: "app-project-panel",
  standalone: true,
  imports: [Icon, I18nPipe, ProjectThumb],
  templateUrl: "./project.panel.html",
})
export class ProjectPanel {
  private readonly tabs = inject(TabsService);
  readonly projects = inject(ProjectService);
  readonly labels = inject(ProjectLabels);
  readonly dialogs = inject(ProjectDialogsService);
  private readonly i18n = inject(I18nService);
  private readonly toasts = inject(ToastService);
  readonly projectId = input.required<number>();
  readonly showOpen = input(false);
  readonly project = computed(this.buildProject.bind(this));
  readonly hasCover = computed(this.buildHasCover.bind(this));

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

  coverKey(): I18nKey {
    return this.hasCover() ? "project.panel.coverChange" : "project.panel.coverChoose";
  }

  async onCoverFile(project: ProjectSummary, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }
    const check = checkCoverFile(file);
    if (check === "notImage") {
      this.toasts.show(this.i18n.translate("novel.toast.notImage"), "warning");
    } else if (check === "tooLarge") {
      this.toasts.show(this.i18n.translate("novel.toast.imageTooLarge"), "warning");
    } else {
      await this.applyCover(project.id, file);
    }
  }

  async clearCover(project: ProjectSummary): Promise<void> {
    try {
      await this.projects.clearCover(project.id);
      this.toasts.show(this.i18n.translate("project.toast.coverRemoved"));
    } catch (cause) {
      this.fail(cause);
    }
  }

  private async applyCover(id: number, file: File): Promise<void> {
    let dataUrl: string;
    try {
      dataUrl = await prepareCover(file);
    } catch {
      this.toasts.show(this.i18n.translate("novel.toast.imageUnreadable"), "warning");
      return;
    }
    try {
      await this.projects.setCover(id, dataUrl);
      this.toasts.show(this.i18n.translate("project.toast.coverChanged"));
    } catch (cause) {
      this.fail(cause);
    }
  }

  private fail(cause: unknown): void {
    const detail = toProjectError(cause).detail;
    this.toasts.show(this.i18n.translate("project.error.generic", { detail }), "danger");
  }

  private buildHasCover(): boolean {
    return this.projects.coverUrl(this.projectId()) !== null;
  }

  private buildProject(): ProjectSummary | undefined {
    return this.projects.projectById(this.projectId());
  }
}
