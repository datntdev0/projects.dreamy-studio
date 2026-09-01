import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';

import { CheckRow } from '../scripting.models';
import { ScriptingDialogBase } from './scripting.dialog.base';

type CheckTone = 'ok' | 'error' | 'warn';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-check-dialog',
  imports: [Button, Icon, CoreModule],
  templateUrl: './check.dialog.html',
  host: { 'data-testid': 'scripting-check-dialog' },
})
export class ScriptingCheckDialog extends ScriptingDialogBase {
  constructor() {
    super('check');
  }

  toneOf(row: CheckRow): CheckTone {
    return row.count === 0 ? 'ok' : row.level;
  }

  iconOf(row: CheckRow): string {
    const tone = this.toneOf(row);
    return tone === 'ok' ? 'check-circle' : tone === 'error' ? 'x-circle' : 'alert';
  }

  canView(row: CheckRow): boolean {
    return row.count > 0 && row.first !== null && (!!row.first.blockId || !!row.first.ref);
  }

  view(row: CheckRow): void {
    const projectId = this.projectId();
    const issue = row.first;
    if (projectId === null || issue === null) {
      return;
    }
    if (issue.blockId) {
      this.scripting.gotoBlock(projectId, issue.blockId);
    } else if (issue.ref) {
      this.scripting.gotoRef(projectId, issue.ref);
    }
    this.close();
  }

  lock(): void {
    const projectId = this.projectId();
    const ctx = this.ctx();
    if (projectId === null || ctx === null || ctx.unit === null) {
      return;
    }
    const unit = this.unitName();
    const result = this.scripting.lockUnit(projectId);
    if (result === 'errors') {
      return;
    }
    this.close();
    if (result === 'locked') {
      this.toasts.show(
        this.languageService.translate('scripting.dialog.check.toast', {
          unit,
          no: ctx.unit.no,
        }),
      );
    }
  }
}
