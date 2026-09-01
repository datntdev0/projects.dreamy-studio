import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CoreModule } from '@shared/core.module';

import { ScriptContext, SourceRow } from '../scripting.models';
import { ScriptingBlock } from './block.component';
import { ScriptingGroup } from './group.component';
import { ScriptingLabels } from './scripting.labels';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-source-page',
  imports: [CoreModule, ScriptingBlock, ScriptingGroup],
  templateUrl: './source-page.component.html',
})
export class ScriptingSourcePage {
  protected readonly labels = inject(ScriptingLabels);

  readonly ctx = input.required<ScriptContext>();
  readonly rows = computed(this.buildRows.bind(this));

  rowKey(row: SourceRow): string {
    return row.ref ?? row.blocks?.[0]?.id ?? '';
  }

  private buildRows(): SourceRow[] {
    return this.ctx().rows ?? [];
  }
}
