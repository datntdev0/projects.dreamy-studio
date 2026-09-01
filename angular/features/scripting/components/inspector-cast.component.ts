import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { fieldValue, setFieldValue } from '@shared/utils/dom';

import { ScriptContext } from '../scripting.models';
import { speakerClass } from '../scripting.rules';
import { ScriptingService } from '../scripting.service';
import { ScriptingInspectorLabels } from './inspector.labels';
import { CastRow, castRowsOf } from './inspector.rules';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-inspector-cast',
  host: { 'data-testid': 'scripting-inspector-cast' },
  imports: [Icon, CoreModule],
  templateUrl: './inspector-cast.component.html',
})
export class ScriptingInspectorCast {
  private readonly scripting = inject(ScriptingService);
  private readonly toasts = inject(ToastService);
  private readonly language = inject(LanguageService);
  readonly labels = inject(ScriptingInspectorLabels);
  readonly classOf = speakerClass;

  readonly ctx = input.required<ScriptContext>();
  readonly rows = computed(this.buildRows.bind(this));

  rename(row: CastRow, event: Event): void {
    const name = fieldValue(event).trim();
    if (!name) {
      setFieldValue(event, row.member.name);
      return;
    }
    this.scripting.renameCastMember(this.ctx().projectId, row.member.id, name);
  }

  remove(row: CastRow): void {
    this.scripting.removeCastMember(this.ctx().projectId, row.member.id);
  }

  add(field: HTMLInputElement): void {
    const name = field.value.trim();
    if (!name) {
      field.focus();
      return;
    }
    const result = this.scripting.addCastMember(this.ctx().projectId, name);
    if (result === 'duplicate') {
      this.toasts.show(this.language.translate('scripting.inspector.cast.duplicate'), 'warning');
      return;
    }
    field.value = '';
    field.focus();
  }

  private buildRows(): CastRow[] {
    const ctx = this.ctx();
    return castRowsOf(ctx.cast, ctx.script);
  }
}
