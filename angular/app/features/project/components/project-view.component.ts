import { Component, computed, effect, inject, input, signal } from "@angular/core";
import { Icon } from "@components/icon";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { I18nService } from "@app/core/i18n/i18n.service";
import { ToastService } from "@app/core/toast/toast.service";
import { TabsService } from "@layout/tabs.service";
import { ProjectConfirmService } from "../project.confirm.service";
import { ProjectLabels } from "../project.labels";
import { ProjectSummary } from "../project.models";
import { ProjectService } from "../project.service";
import { toProjectError } from "../project.rules";
import { validateProjectName } from "../project.rules";
import { ProjectTree } from "./tree.component";

type ProjectViewTab = "files" | "settings";
type EditableElement = HTMLInputElement | HTMLTextAreaElement;

@Component({
  selector: "app-project-view",
  standalone: true,
  imports: [Icon, I18nPipe, ProjectTree],
  templateUrl: "./project-view.component.html",
})
export class ProjectView {
  private readonly projects = inject(ProjectService);
  private readonly tabs = inject(TabsService);
  readonly labels = inject(ProjectLabels);
  private readonly confirms = inject(ProjectConfirmService);
  private readonly toasts = inject(ToastService);
  private readonly i18n = inject(I18nService);

  readonly projectId = input.required<number>();
  readonly project = computed(this.findProject.bind(this));
  readonly missing = signal(false);
  readonly tab = signal<ProjectViewTab>("files");
  private readonly openedIds = new Set<number>();

  constructor() {
    effect(this.syncProject.bind(this));
  }

  setTab(tab: ProjectViewTab): void {
    this.tab.set(tab);
  }

  backToCatalog(): void {
    this.tabs.openProjects();
  }

  refreshTree(): void {
    this.projects.refreshTree(this.projectId());
  }

  async openFolder(): Promise<void> {
    try {
      await this.projects.folderOpen(this.projectId());
    } catch (cause) {
      this.fail(cause);
    }
  }

  async saveName(event: Event): Promise<void> {
    const element = event.target as EditableElement;
    const project = this.project();
    if (!project) {
      return;
    }
    const name = element.value.trim();
    const issue = validateProjectName(name);
    if (issue !== null) {
      element.value = project.name;
      this.toasts.show(this.i18n.translate("project.error.empty"), "warning");
      return;
    }
    if (name === project.name) {
      element.value = project.name;
      return;
    }
    try {
      const updated = await this.projects.update(project.id, { name });
      this.tabs.renameProject(updated.id, updated.name);
    } catch (cause) {
      element.value = project.name;
      this.fail(cause);
    }
  }

  onNameKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
    }
  }

  async saveDescription(event: Event): Promise<void> {
    const element = event.target as HTMLTextAreaElement;
    const project = this.project();
    if (!project || element.value === project.description) {
      return;
    }
    try {
      await this.projects.update(project.id, { description: element.value });
    } catch (cause) {
      element.value = project.description;
      this.fail(cause);
    }
  }

  async toggleArchived(project: ProjectSummary): Promise<void> {
    try {
      await this.projects.setArchived([project.id], !project.archived);
    } catch (cause) {
      this.fail(cause);
    }
  }

  requestDelete(project: ProjectSummary): void {
    this.confirms.deleteProjects([project.id]);
  }

  private findProject(): ProjectSummary | null {
    return this.projects.projectById(this.projectId()) ?? null;
  }

  private syncProject(): void {
    const id = this.projectId();
    const project = this.projects.projectById(id);
    if (this.projects.loaded() && project === undefined) {
      this.missing.set(true);
      this.tabs.closeProject(id);
      return;
    }
    if (project && !this.openedIds.has(id)) {
      this.openedIds.add(id);
      void this.touchProject(id);
    }
  }

  private async touchProject(id: number): Promise<void> {
    try {
      await this.projects.open(id);
    } catch (cause) {
      this.missing.set(true);
      this.tabs.closeProject(id);
      this.fail(cause);
    }
  }

  private fail(cause: unknown): void {
    const detail = toProjectError(cause).detail;
    this.toasts.show(this.i18n.translate("project.error.generic", { detail }), "danger");
  }
}
