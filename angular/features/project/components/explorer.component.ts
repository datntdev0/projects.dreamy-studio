import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Icon } from '@components/icon';
import { projectTabId } from '@layout/layout.models';
import { TabsService } from '@layout/tabs.service';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { fieldValue } from '@shared/utils/dom';

import { ProjectLabels } from '../project.labels';
import { ProjectStatus, ProjectSummary, ProjectTemplateId } from '../project.models';
import { ProjectService } from '../project.service';
import { ProjectModules } from './modules.component';
import { ProjectThumb } from './thumb.component';

function compareExplorerProjects(a: ProjectSummary, b: ProjectSummary): number {
  return (
    Number(a.archived) - Number(b.archived) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-project-explorer',
  imports: [Icon, CoreModule, ProjectModules, ProjectThumb],
  templateUrl: './explorer.component.html',
})
export class ProjectExplorer {
  readonly projects = inject(ProjectService);
  readonly labels = inject(ProjectLabels);
  readonly tabs = inject(TabsService);
  readonly filtersOpen = signal(true);
  readonly shown = computed(this.buildShown.bind(this));

  constructor() {
    void this.projects.ensureLoaded();
  }

  statusKey(status: ProjectStatus): LanguageKey {
    return `project.status.${status}`;
  }

  selectedTemplate(): ProjectTemplateId | '' {
    return this.projects.filters().templates[0] ?? '';
  }

  setTemplateFilter(event: Event): void {
    const value = fieldValue(event);
    this.projects.setTemplateFilter(value === '' ? null : (value as ProjectTemplateId));
  }

  isStatusOn(status: ProjectStatus): boolean {
    return this.projects.filters().status.includes(status);
  }

  toggleFilters(): void {
    this.filtersOpen.set(!this.filtersOpen());
  }

  isExpanded(project: ProjectSummary): boolean {
    return this.projects.isExpanded(this.projectRootKey(project));
  }

  isSelected(project: ProjectSummary): boolean {
    return this.projects.selectedId() === project.id;
  }

  isActive(project: ProjectSummary): boolean {
    return this.tabs.isActive(projectTabId(project.id));
  }

  toggle(project: ProjectSummary): void {
    this.projects.toggleExpanded(this.projectRootKey(project));
  }

  toggleFromChevron(project: ProjectSummary, event: Event): void {
    event.stopPropagation();
    this.toggle(project);
  }

  select(project: ProjectSummary): void {
    this.projects.selectOnly(project.id);
  }

  open(project: ProjectSummary): void {
    this.projects.selectOnly(project.id);
    void this.openProject(project);
  }

  openCatalog(): void {
    this.tabs.openProjects();
  }

  onKeydown(project: ProjectSummary, event: KeyboardEvent): void {
    if (event.key === 'ArrowRight' && !this.isExpanded(project)) {
      event.preventDefault();
      this.toggle(project);
    }
    if (event.key === 'ArrowLeft' && this.isExpanded(project)) {
      event.preventDefault();
      this.toggle(project);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.open(project);
    }
  }

  private projectRootKey(project: ProjectSummary): string {
    return `${project.id}:`;
  }

  private buildShown(): ProjectSummary[] {
    return [...this.projects.projects()].sort(compareExplorerProjects);
  }

  private async openProject(project: ProjectSummary): Promise<void> {
    const opened = await this.projects.open(project.id);
    this.tabs.openProject(opened.id, opened.name, this.labels.iconOf(opened.template));
  }
}
