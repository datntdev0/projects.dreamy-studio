import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { moduleTabId } from '@layout/layout.models';
import { TabsService } from '@layout/tabs.service';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

import { ProjectModuleRow, ProjectSummary } from '../project.models';
import { moduleRows, moduleStateKey } from '../project.rules';
import { ProjectService } from '../project.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-project-modules',
  imports: [Icon, CoreModule],
  templateUrl: './modules.component.html',
})
export class ProjectModules {
  private readonly projects = inject(ProjectService);
  private readonly tabs = inject(TabsService);

  readonly project = input.required<ProjectSummary>();
  readonly rows = computed(this.buildRows.bind(this));

  constructor() {
    effect(this.ensureModules.bind(this));
  }

  stateKey(row: ProjectModuleRow): LanguageKey {
    return moduleStateKey(row.state.state);
  }

  isActive(row: ProjectModuleRow): boolean {
    return this.tabs.isActive(moduleTabId(this.project().id, row.module.id));
  }

  open(row: ProjectModuleRow): void {
    if (row.module.implemented) {
      this.tabs.openModule(this.project().id, this.project().name, row.module.id);
    }
  }

  onKeydown(row: ProjectModuleRow, event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.open(row);
    }
  }

  private ensureModules(): void {
    void this.projects.ensureModules(this.project().id);
  }

  private buildRows(): ProjectModuleRow[] {
    return moduleRows(this.projects.moduleStates(this.project().id));
  }
}
