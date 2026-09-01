import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CoreModule } from '@shared/core.module';

import { ScriptBlock, ScriptContext } from '../scripting.models';
import { chaptersOf } from '../scripting.rules';
import { ScriptingBlock } from './block.component';
import { ScriptingDrawer } from './drawer.component';
import { ScriptingLabels } from './scripting.labels';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-page',
  imports: [CoreModule, NgTemplateOutlet, ScriptingBlock, ScriptingDrawer],
  templateUrl: './page.component.html',
})
export class ScriptingPage {
  protected readonly labels = inject(ScriptingLabels);

  readonly ctx = input.required<ScriptContext>();
  readonly blocks = computed(this.buildBlocks.bind(this));
  readonly heading = computed(this.buildHeading.bind(this));
  readonly drawer = computed(this.buildDrawer.bind(this));

  private buildBlocks(): ScriptBlock[] {
    return this.ctx().unit?.blocks ?? [];
  }

  private buildHeading(): string {
    const ctx = this.ctx();
    const unit = ctx.unit;
    if (!unit) {
      return '';
    }
    const base = this.labels.unitNumber(ctx.config, unit.no);
    return ctx.config.ranges ? `${base} · ${this.labels.chapterLabel(chaptersOf(unit))}` : base;
  }

  private buildDrawer(): boolean {
    const ctx = this.ctx();
    return ctx.view.drawer && ctx.source !== null;
  }
}
