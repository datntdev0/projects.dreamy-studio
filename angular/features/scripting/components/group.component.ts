import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';

import { ScriptBlock, ScriptContext, SourceRow } from '../scripting.models';
import { paragraphNumber } from '../scripting.rules';
import { ScriptingService } from '../scripting.service';
import { ScriptingBlock } from './block.component';
import { ScriptingMissing } from './missing.component';
import { ScriptingStaleBar } from './stale-bar.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-group',
  imports: [Icon, CoreModule, ScriptingBlock, ScriptingStaleBar, ScriptingMissing],
  templateUrl: './group.component.html',
})
export class ScriptingGroup {
  private readonly scripting = inject(ScriptingService);

  readonly ctx = input.required<ScriptContext>();
  readonly row = input.required<SourceRow>();
  readonly ref = computed(this.buildRef.bind(this));
  readonly text = computed(this.buildText.bind(this));
  readonly collapsed = computed(this.buildCollapsed.bind(this));
  readonly stale = computed(this.buildStale.bind(this));
  readonly snap = computed(this.buildSnap.bind(this));
  readonly number = computed(this.buildNumber.bind(this));

  toggle(): void {
    this.scripting.toggleGroup(this.ctx().projectId, this.ref());
  }

  toggleOnKey(event: Event): void {
    event.preventDefault();
    this.toggle();
  }

  private buildRef(): string {
    return this.row().ref ?? '';
  }

  private buildText(): string {
    return this.row().para?.text ?? '';
  }

  private buildCollapsed(): boolean {
    return this.ctx().view.collapsed[this.ref()] === true;
  }

  private buildStale(): boolean {
    return this.row().blocks !== null && this.ctx().staleRefs.includes(this.ref());
  }

  private buildSnap(): string {
    const blocks: ScriptBlock[] = this.row().blocks ?? [];
    return blocks.find((block) => block.snap !== null)?.snap ?? '';
  }

  private buildNumber(): number {
    return paragraphNumber(this.ref());
  }
}
