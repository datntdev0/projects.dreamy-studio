import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';

import { ScriptContext, ScriptPreset } from '../scripting.models';
import { SCRIPT_PRESETS } from '../scripting.rules';
import { ScriptingService } from '../scripting.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-presets',
  imports: [Icon, CoreModule],
  templateUrl: './presets.component.html',
})
export class ScriptingPresets {
  private readonly scripting = inject(ScriptingService);

  readonly ctx = input.required<ScriptContext>();
  readonly presets = SCRIPT_PRESETS;

  pick(preset: ScriptPreset): void {
    this.scripting.setPreset(this.ctx().projectId, preset);
  }
}
