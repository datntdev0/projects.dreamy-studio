import { Component, computed, effect, inject, signal, untracked } from "@angular/core";
import { Button } from "@components/button";
import { Dialog } from "@components/dialog";
import { Icon } from "@components/icon";
import { TabsService } from "@layout/tabs.service";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { I18nService } from "@app/core/i18n/i18n.service";
import { ToastService } from "@app/core/toast/toast.service";
import { ProjectDialogsService } from "../project.dialogs.service";
import { ProjectLabels } from "../project.labels";
import { ProjectSummary, ProjectTemplate } from "../project.models";
import { toProjectError } from "../project.rules";
import { ProjectService } from "../project.service";
import { ProjectThumb } from "./thumb.component";

@Component({
  selector: "app-project-delete-dialog",
  standalone: true,
  imports: [Button, Dialog, Icon, I18nPipe, ProjectThumb],
  templateUrl: "./delete.dialog.html",
  host: { "data-testid": "project-delete-dialog" },
})
export class ProjectDeleteDialog {
  private readonly projects = inject(ProjectService);
  private readonly dialogs = inject(ProjectDialogsService);
  private readonly tabs = inject(TabsService);
  private readonly toasts = inject(ToastService);
  private readonly i18n = inject(I18nService);

  readonly labels = inject(ProjectLabels);
  readonly rows = computed(this.buildRows.bind(this));
  readonly open = computed(this.buildOpen.bind(this));
  readonly busy = signal(false);
  readonly confirmed = signal(false);

  constructor() {
    effect(this.resetConfirmation.bind(this));
    effect(this.closeWhenEmpty.bind(this));
  }

  close(): void {
    this.dialogs.closeDelete();
  }

  templateLabelKey(project: ProjectSummary): ProjectTemplate["labelKey"] {
    return `project.template.${project.template}`;
  }

  onConfirmChange(event: Event): void {
    this.confirmed.set((event.target as HTMLInputElement).checked);
  }

  async confirm(): Promise<void> {
    const rows = this.rows();
    if (this.busy() || !this.confirmed() || rows.length === 0) {
      return;
    }
    this.busy.set(true);
    try {
      const ids = rows.map(this.idOf);
      await this.projects.remove(ids);
      this.tabs.closeProjects(ids);
      this.close();
      this.toasts.show(this.i18n.translate(rows.length === 1 ? "project.delete.toast.one" : "project.delete.toast.other", {
        name: rows[0].name,
        count: rows.length,
      }));
    } catch (cause) {
      const error = toProjectError(cause);
      this.toasts.show(this.i18n.translate("project.error.generic", { detail: error.detail }), "danger");
    } finally {
      this.busy.set(false);
    }
  }

  private buildRows(): ProjectSummary[] {
    const known = new Map<number, ProjectSummary>();
    for (const project of this.projects.projects()) {
      known.set(project.id, project);
    }
    const rows: ProjectSummary[] = [];
    for (const id of this.dialogs.deleteIds()) {
      const project = known.get(id);
      if (project) {
        rows.push(project);
      }
    }
    return rows;
  }

  private buildOpen(): boolean {
    return this.rows().length > 0;
  }

  private idOf(project: ProjectSummary): number {
    return project.id;
  }

  private resetConfirmation(): void {
    this.dialogs.deleteIds();
    untracked(this.confirmed.set.bind(this.confirmed, false));
  }

  private closeWhenEmpty(): void {
    if (this.dialogs.deleteIds().length > 0 && this.rows().length === 0) {
      this.dialogs.closeDelete();
    }
  }
}
