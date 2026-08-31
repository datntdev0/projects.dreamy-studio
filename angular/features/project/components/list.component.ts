import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { Icon } from '@components/icon';
import { TabsService } from '@layout/tabs.service';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { fieldValue, isDeleteShortcut, isModalOpen } from '@shared/utils/dom';

import { ProjectConfirmService } from '../project.confirm.service';
import { ProjectDialogsService } from '../project.dialogs.service';
import { ProjectLabels } from '../project.labels';
// prettier-ignore
import { ProjectStatus, ProjectSummary, ProjectTemplateId, ProjectViewMode } from '../project.models';
import { ProjectService } from '../project.service';
import { ProjectThumb } from './thumb.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-project-list',
  imports: [Icon, CoreModule, ProjectThumb],
  templateUrl: './list.component.html',
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
    this.projects.setQuery(fieldValue(event));
  }

  onSort(event: Event): void {
    this.projects.setSort(fieldValue(event) as 'updated' | 'name');
  }

  isViewActive(view: ProjectViewMode): boolean {
    return this.projects.view() === view;
  }

  setView(view: ProjectViewMode): void {
    this.projects.setView(view);
  }

  templateKey(id: ProjectTemplateId): LanguageKey {
    return this.labels.templateKey(id);
  }

  statusKey(status: ProjectStatus): LanguageKey {
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
    if (event.key === 'Enter') {
      event.preventDefault();
      this.open(project);
    }
    if (event.key === ' ') {
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

  @HostListener('document:keydown', ['$event'])
  onDeleteKey(event: KeyboardEvent): void {
    const id = this.projects.selectedId();
    if (!isDeleteShortcut(event) || id === null || this.isModalOpen()) {
      return;
    }
    this.confirms.deleteProjects([id]);
  }

  private isModalOpen(): boolean {
    return this.dialogs.createOpen() || isModalOpen();
  }

  private async openProject(project: ProjectSummary): Promise<void> {
    this.projects.selectOnly(project.id);
    const opened = await this.projects.open(project.id);
    this.tabs.openProject(opened.id, opened.name, this.labels.iconOf(opened.template));
  }
}
