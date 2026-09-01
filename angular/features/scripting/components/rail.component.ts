import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { RailMark, RailRow, ScriptContext } from '../scripting.models';
import { ScriptingService } from '../scripting.service';
import { ScriptingLabels } from './scripting.labels';

const MARK_KEYS: Record<RailMark, LanguageKey> = {
  locked: 'scripting.editor.rail.mark.locked',
  stale: 'scripting.editor.rail.mark.stale',
  review: 'scripting.editor.rail.mark.review',
  draft: 'scripting.editor.rail.mark.draft',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-rail',
  imports: [Icon, CoreModule],
  templateUrl: './rail.component.html',
})
export class ScriptingRail {
  protected readonly labels = inject(ScriptingLabels);
  private readonly scripting = inject(ScriptingService);
  private readonly toasts = inject(ToastService);
  private readonly languageService = inject(LanguageService);

  readonly ctx = input.required<ScriptContext>();
  readonly unit = computed(this.buildUnit.bind(this));
  readonly unitLower = computed(this.buildUnitLower.bind(this));

  markKey(row: RailRow): LanguageKey {
    return MARK_KEYS[row.mark];
  }

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
