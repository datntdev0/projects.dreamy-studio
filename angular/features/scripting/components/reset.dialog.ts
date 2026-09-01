import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';

import { ResetScope, ScriptContext } from '../scripting.models';
import { ScriptingDialogBase } from './scripting.dialog.base';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-reset-dialog',
  imports: [Button, Icon, CoreModule],
  templateUrl: './reset.dialog.html',
  host: { 'data-testid': 'scripting-reset-dialog' },
})
export class ScriptingResetDialog extends ScriptingDialogBase {
  readonly picked = signal<ResetScope>('unit');
  readonly resettable = computed(this.buildResettable.bind(this));
  readonly allEnabled = computed(this.buildAllEnabled.bind(this));
  readonly scope = computed(this.buildScope.bind(this));
  readonly blocks = computed(this.buildBlocks.bind(this));
  readonly allHint = computed(this.buildAllHint.bind(this));

  constructor() {
    super('reset');
  }

  pick(scope: ResetScope): void {
    this.picked.set(scope);
  }

  confirm(): void {
    const projectId = this.projectId();
    const ctx = this.ctx();
    if (projectId === null || ctx === null) {
      return;
    }
    const count = this.scripting.resetUnits(projectId, this.scope());
    this.close();
    this.announce(ctx, count);
  }

  private announce(ctx: ScriptContext, count: number): void {
    if (count === 0) {
      this.toasts.show(this.languageService.translate('scripting.dialog.reset.none'), 'warning');
      return;
    }
    this.toasts.show(
      this.languageService.translate('scripting.dialog.reset.toast', {
        what: this.countOf(ctx.config.unit, count),
      }),
    );
  }

  private buildResettable(): number {
    const projectId = this.projectId();
    return projectId === null ? 0 : this.scripting.resettableUnitsOf(projectId).length;
  }

  private buildAllEnabled(): boolean {
    return this.resettable() >= 2;
  }

  private buildScope(): ResetScope {
    return this.allEnabled() ? this.picked() : 'unit';
  }

  private buildBlocks(): number {
    return this.ctx()?.unit?.blocks?.length ?? 0;
  }

  private buildAllHint(): string {
    const ctx = this.ctx();
    return ctx ? this.countOf(ctx.config.unit, this.resettable()) : '';
  }
}
