import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';

import { ScriptContext } from '../scripting.models';
import { ScriptingService } from '../scripting.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-missing',
  imports: [Icon, CoreModule],
  templateUrl: './missing.component.html',
})
export class ScriptingMissing {
  private readonly scripting = inject(ScriptingService);

  readonly ctx = input.required<ScriptContext>();
  readonly reference = input.required<string>();

  cover(): void {
    this.scripting.coverParagraph(this.ctx().projectId, this.reference());
  }
}
