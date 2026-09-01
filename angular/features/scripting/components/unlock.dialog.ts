import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { ProjectService } from '@features/project/project.service';
import { CoreModule } from '@shared/core.module';

import { ScriptContext } from '../scripting.models';
import { ScriptingDialogBase } from './scripting.dialog.base';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-unlock-dialog',
  imports: [Button, Icon, CoreModule],
  templateUrl: './unlock.dialog.html',
  host: { 'data-testid': 'scripting-unlock-dialog' },
})
export class ScriptingUnlockDialog extends ScriptingDialogBase {
  private readonly projects = inject(ProjectService);

  readonly downstream = computed(this.buildDownstream.bind(this));

  constructor() {
    super('unlock');
  }

  confirm(): void {
    const projectId = this.projectId();
    const ctx = this.ctx();
    if (projectId === null || ctx === null || ctx.unit === null) {
      return;
    }
    const no = ctx.unit.no;
    const unit = this.unitName();
    const done = this.scripting.unlockUnit(projectId);
    this.close();
    if (done) {
      this.toasts.show(
        this.languageService.translate('scripting.dialog.unlock.toast', {
          unit,
          no,
        }),
        'warning',
      );
    }
  }

  protected override admits(ctx: ScriptContext): boolean {
    return ctx.unit !== null && ctx.locked;
  }

  private buildDownstream(): boolean {
    const projectId = this.projectId();
    return (
      projectId !== null && this.projects.moduleStateOf(projectId, 'audiobook').state !== 'idle'
    );
  }
}
