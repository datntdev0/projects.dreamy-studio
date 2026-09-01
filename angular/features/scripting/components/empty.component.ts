import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';

import { ScriptingDialogsService } from '../scripting.dialogs.service';
import { ScriptContext } from '../scripting.models';
import { ScriptingService } from '../scripting.service';
import { formatCount, ScriptingLabels } from './scripting.labels';

export type EmptyVariant = 'meta' | 'default' | 'film' | 'scratch';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-empty',
  imports: [Icon, CoreModule],
  templateUrl: './empty.component.html',
})
export class ScriptingEmpty {
  protected readonly dialogs = inject(ScriptingDialogsService);
  protected readonly labels = inject(ScriptingLabels);
  private readonly scripting = inject(ScriptingService);

  readonly ctx = input.required<ScriptContext>();
  readonly variant = computed(this.buildVariant.bind(this));
  readonly unit = computed(this.buildUnit.bind(this));
  readonly unitLower = computed(this.buildUnitLower.bind(this));
  readonly words = computed(this.buildWords.bind(this));

  start(): void {
    this.scripting.startWriting(this.ctx().projectId);
  }

  private buildVariant(): EmptyVariant {
    const ctx = this.ctx();
    if (ctx.unit?.meta) {
      return 'meta';
    }
    if (ctx.hasDefault) {
      return 'default';
    }
    return ctx.config.ranges ? 'film' : 'scratch';
  }

  private buildUnit(): string {
    return this.labels.unit(this.ctx().config);
  }

  private buildUnitLower(): string {
    return this.labels.unitLower(this.ctx().config);
  }

  private buildWords(): string {
    return formatCount(this.ctx().unit?.meta?.words ?? 0);
  }
}
