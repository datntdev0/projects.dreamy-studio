import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { ScriptContext } from '../scripting.models';
import { ScriptingService } from '../scripting.service';
import { ScriptingInspectorCast } from './inspector-cast.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-inspector',
  host: { 'data-testid': 'scripting-inspector' },
  imports: [ScriptingInspectorCast],
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
