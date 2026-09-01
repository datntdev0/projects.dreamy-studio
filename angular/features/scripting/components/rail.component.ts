import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { Resizer } from '@components/resizer';
import { UnitRailService } from '@layout/unit-rail.service';
import { CoreModule } from '@shared/core.module';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { RailRow, ScriptContext } from '../scripting.models';
import { ScriptingService } from '../scripting.service';
import { ScriptingLabels } from './scripting.labels';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-rail',
  imports: [Icon, Resizer, CoreModule],
  templateUrl: './rail.component.html',
})
export class ScriptingRail {
  protected readonly rail = inject(UnitRailService);
  protected readonly labels = inject(ScriptingLabels);
  private readonly scripting = inject(ScriptingService);
  private readonly toasts = inject(ToastService);
  private readonly languageService = inject(LanguageService);

  readonly ctx = input.required<ScriptContext>();
  readonly unit = computed(this.buildUnit.bind(this));
  readonly unitLower = computed(this.buildUnitLower.bind(this));

  select(row: RailRow): void {
    this.scripting.selectUnit(this.ctx().projectId, row.unit.id);
  }

  selectOnKey(event: Event, row: RailRow): void {
    event.preventDefault();
    this.select(row);
  }

  addUnit(): void {
    const unit = this.scripting.addUnit(this.ctx().projectId);
    if (unit) {
      this.toasts.show(
        this.languageService.translate('scripting.editor.unitAdded', {
          unit: this.unitLower(),
          no: unit.no,
        }),
        'info',
      );
    }
  }

  private buildUnit(): string {
    return this.labels.unit(this.ctx().config);
  }

  private buildUnitLower(): string {
    return this.labels.unitLower(this.ctx().config);
  }
}
