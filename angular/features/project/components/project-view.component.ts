// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Icon } from '@components/icon';
import { TabsService } from '@layout/tabs.service';
import { CoreModule } from '@shared/core.module';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { ProjectConfirmService } from '../project.confirm.service';
import { ProjectLabels } from '../project.labels';
import { ProjectModule, ProjectSummary } from '../project.models';
// prettier-ignore
import { isModuleEnabled, isModuleRequired, PROJECT_MODULES, toProjectError, validateProjectName } from '../project.rules';
import { ProjectService } from '../project.service';
import { ProjectOverview } from './overview.component';

type ProjectViewTab = 'overview' | 'settings';
type EditableElement = HTMLInputElement | HTMLTextAreaElement;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-project-view',
  imports: [Icon, CoreModule, ProjectOverview],
  templateUrl: './project-view.component.html',
})
export class ProjectView {
  private readonly projects = inject(ProjectService);
  private readonly tabs = inject(TabsService);
  readonly labels = inject(ProjectLabels);
  private readonly confirms = inject(ProjectConfirmService);
  private readonly toasts = inject(ToastService);
  private readonly languageService = inject(LanguageService);

  readonly projectId = input.required<number>();
  readonly project = computed(this.findProject.bind(this));
  readonly missing = signal(false);
  readonly tab = signal<ProjectViewTab>('overview');
  readonly modules = PROJECT_MODULES;
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
      this.toasts.show(this.languageService.translate('project.error.empty'), 'warning');
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
    if (event.key === 'Enter') {
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

  isEnabled(project: ProjectSummary, module: ProjectModule): boolean {
    return isModuleEnabled(project, module.id);
  }

  isRequired(project: ProjectSummary, module: ProjectModule): boolean {
    return isModuleRequired(project, module.id);
  }

  async toggleModule(project: ProjectSummary, module: ProjectModule, event: Event): Promise<void> {
    const element = event.target as HTMLInputElement;
    try {
      await this.projects.setModuleEnabled(project, module.id, element.checked);
    } catch (cause) {
      element.checked = isModuleEnabled(project, module.id);
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
    this.toasts.show(this.languageService.translate('project.error.generic', { detail }), 'danger');
  }
}
