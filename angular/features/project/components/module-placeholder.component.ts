import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

import {
  ProjectModule,
  ProjectModuleId,
  ProjectModuleState,
  ProjectSummary,
} from '../project.models';
import { moduleStateKey, projectModule } from '../project.rules';
import { ProjectService } from '../project.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-project-module-placeholder',
  imports: [Icon, CoreModule],
  templateUrl: './module-placeholder.component.html',
})
export class ProjectModulePlaceholder {
  private readonly projects = inject(ProjectService);

  readonly projectId = input.required<number>();
  readonly moduleId = input.required<ProjectModuleId>();
  readonly project = computed(this.findProject.bind(this));
  readonly module = computed(this.findModule.bind(this));
  readonly state = computed(this.findState.bind(this));
  readonly stateKey = computed(this.buildStateKey.bind(this));

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
}
