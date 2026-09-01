import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';

import { BlockType, BlockTypeDef, ScriptContext } from '../scripting.models';
import { BLOCK_TYPES } from '../scripting.rules';
import { ScriptingService } from '../scripting.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-add-bar',
  imports: [Icon, CoreModule],
  templateUrl: './add-bar.component.html',
})
export class ScriptingAddBar {
  private readonly scripting = inject(ScriptingService);

  readonly ctx = input.required<ScriptContext>();

  definition(type: BlockType): BlockTypeDef {
    return BLOCK_TYPES[type];
  }

  add(type: BlockType): void {
    this.scripting.addBlock(this.ctx().projectId, type);
  }
}
