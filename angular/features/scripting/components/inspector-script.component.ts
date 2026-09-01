import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { ProjectModule, ProjectModuleId } from '@features/project/project.models';
import { projectModule } from '@features/project/project.rules';
import { ProjectService } from '@features/project/project.service';
import { TabsService } from '@layout/tabs.service';
import { CoreModule } from '@shared/core.module';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { ScriptingDialogsService } from '../scripting.dialogs.service';
import { ScriptContext } from '../scripting.models';
import { ScriptingInspectorLabels } from './inspector.labels';
import { nextModuleOf } from './inspector.rules';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-inspector-script',
  host: { 'data-testid': 'scripting-inspector-script' },
  imports: [Icon, CoreModule],
  templateUrl: './inspector-script.component.html',
})
export class ScriptingInspectorScript {
  private readonly dialogs = inject(ScriptingDialogsService);
  private readonly projects = inject(ProjectService);
  private readonly tabs = inject(TabsService);
  private readonly toasts = inject(ToastService);
  private readonly language = inject(LanguageService);
  readonly labels = inject(ScriptingInspectorLabels);

  readonly ctx = input.required<ScriptContext>();
  readonly next = computed(this.buildNext.bind(this));

  reset(): void {
    const ctx = this.ctx();
    if (ctx.locked) {
      this.toasts.show(
        this.language.translate('scripting.inspector.resetLocked', {
          unit: this.labels.unit(ctx.config),
        }),
        'warning',
      );
      return;
    }
    this.dialogs.openReset(ctx.projectId);
  }

  openNext(moduleId: ProjectModuleId): void {
    const project = this.projects.projectById(this.ctx().projectId);
    if (project) {
      this.tabs.openModule(project.id, project.name, moduleId);
    }
  }

  private buildNext(): ProjectModule {
    return projectModule(nextModuleOf(this.ctx().config));
  }
}
