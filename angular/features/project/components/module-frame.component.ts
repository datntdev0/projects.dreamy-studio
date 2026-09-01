import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { TabsService } from '@layout/tabs.service';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

import { ProjectLabels } from '../project.labels';
import {
  ProjectModule,
  ProjectModuleId,
  ProjectModuleState,
  ProjectSummary,
} from '../project.models';
import { moduleBadgeClass, moduleStateKey, projectModule } from '../project.rules';
import { ProjectService } from '../project.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-project-module-frame',
  imports: [Icon, CoreModule],
  templateUrl: './module-frame.component.html',
})
export class ProjectModuleFrame {
  readonly projects = inject(ProjectService);
  private readonly tabs = inject(TabsService);
  private readonly labels = inject(ProjectLabels);

  readonly projectId = input.required<number>();
  readonly moduleId = input.required<ProjectModuleId>();
  readonly project = computed(this.findProject.bind(this));
  readonly module = computed(this.findModule.bind(this));
  readonly state = computed(this.findState.bind(this));
  readonly stateKey = computed(this.buildStateKey.bind(this));
  readonly badgeClass = computed(this.buildBadgeClass.bind(this));

  constructor() {
    effect(this.ensureData.bind(this));
  }

  backToProject(project: ProjectSummary): void {
    this.projects.selectOnly(project.id);
    this.tabs.openProject(project.id, project.name, this.labels.iconOf(project.template));
  }

  backToCatalog(): void {
    this.tabs.openProjects();
  }

  private findProject(): ProjectSummary | undefined {
    return this.projects.projectById(this.projectId());
  }

  private findModule(): ProjectModule {
    return projectModule(this.moduleId());
  }

  private findState(): ProjectModuleState {
    return this.projects.moduleStateOf(this.projectId(), this.moduleId());
  }

  private buildStateKey(): LanguageKey {
    return moduleStateKey(this.state().state);
  }

  private buildBadgeClass(): string {
    return moduleBadgeClass(this.state().state);
  }

  private ensureData(): void {
    void this.projects.ensureLoaded();
    void this.projects.ensureModules(this.projectId());
  }
}
