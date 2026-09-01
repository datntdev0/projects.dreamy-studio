import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

import { ScriptContext, ScriptUnit, UnitStatus } from '../scripting.models';
import { anyGroupOpen } from '../scripting.rules';
import { ScriptingService } from '../scripting.service';
import { ScriptingAddBar } from './add-bar.component';
import { ScriptingLabels } from './scripting.labels';

const STATUS_CLASSES: Record<UnitStatus, string> = {
  locked: 'badge badge-success',
  review: 'badge badge-warning',
  draft: 'badge',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-subbar',
  imports: [Icon, CoreModule, ScriptingAddBar],
  templateUrl: './subbar.component.html',
})
export class ScriptingSubbar {
  protected readonly labels = inject(ScriptingLabels);
  private readonly scripting = inject(ScriptingService);

  readonly ctx = input.required<ScriptContext>();
  readonly unitLower = computed(this.buildUnitLower.bind(this));
  readonly grouped = computed(this.buildGrouped.bind(this));
  readonly anyOpen = computed(this.buildAnyOpen.bind(this));
  readonly stats = computed(this.buildStats.bind(this));
  readonly statusKey = computed(this.buildStatusKey.bind(this));
  readonly statusClass = computed(this.buildStatusClass.bind(this));

  setTitle(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = input.value.trim();
    this.scripting.setUnitTitle(this.ctx().projectId, input.value);
  }

  setChapter(event: Event, index: 0 | 1): void {
    const input = event.target as HTMLInputElement;
    this.scripting.setUnitChapter(this.ctx().projectId, index, parseInt(input.value, 10));
    input.value = String(this.scripting.contextOf(this.ctx().projectId)?.unit?.chs?.[index] ?? '');
  }

  toggleAll(): void {
    this.scripting.toggleAllGroups(this.ctx().projectId);
  }

  toggleDrawer(): void {
    this.scripting.toggleDrawer(this.ctx().projectId);
  }

  private currentUnit(): ScriptUnit | null {
    return this.ctx().unit;
  }

  private buildUnitLower(): string {
    return this.labels.unitLower(this.ctx().config);
  }

  private buildGrouped(): boolean {
    const ctx = this.ctx();
    return ctx.config.source && ctx.source !== null && !!this.currentUnit()?.blocks;
  }

  private buildAnyOpen(): boolean {
    const ctx = this.ctx();
    return ctx.source ? anyGroupOpen(ctx.view.collapsed, ctx.source) : false;
  }

  private buildStats(): string[] {
    return this.labels.stats(this.ctx());
  }

  private buildStatusKey(): LanguageKey {
    const ctx = this.ctx();
    return ctx.generating
      ? 'scripting.status.generating'
      : (`scripting.status.${this.currentUnit()?.status ?? 'draft'}` as LanguageKey);
  }

  private buildStatusClass(): string {
    const ctx = this.ctx();
    return ctx.generating
      ? 'badge badge-running'
      : STATUS_CLASSES[this.currentUnit()?.status ?? 'draft'];
  }
}
