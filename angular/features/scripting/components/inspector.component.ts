import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { ScriptContext } from '../scripting.models';
import { ScriptingService } from '../scripting.service';
import { ScriptingInspectorBlock } from './inspector-block.component';
import { ScriptingInspectorCast } from './inspector-cast.component';
import { ScriptingInspectorScript } from './inspector-script.component';
import { ScriptingInspectorSummary } from './inspector-summary.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-inspector',
  host: { 'data-testid': 'scripting-inspector' },
  imports: [
    ScriptingInspectorScript,
    ScriptingInspectorBlock,
    ScriptingInspectorSummary,
    ScriptingInspectorCast,
  ],
  templateUrl: './inspector.component.html',
})
export class ScriptingInspector {
  private readonly scripting = inject(ScriptingService);

  readonly projectId = input.required<number>();
  readonly ctx = computed(this.buildContext.bind(this));

  private buildContext(): ScriptContext | null {
    return this.scripting.contextOf(this.projectId());
  }
}
