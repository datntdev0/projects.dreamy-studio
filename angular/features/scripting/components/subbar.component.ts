import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageService } from '@shared/language/language.service';

import { ScriptingDialogsService } from '../scripting.dialogs.service';
import { BlockType, ScriptContext } from '../scripting.models';
import { BLOCK_TYPES } from '../scripting.rules';
import { ScriptingService } from '../scripting.service';
import { ScriptingLabels } from './scripting.labels';
import { menuItem, ScriptingMenuRow, ScriptingMenuService } from './scripting.menu.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-subbar',
  imports: [Icon, CoreModule],
  templateUrl: './subbar.component.html',
})
export class ScriptingSubbar {
  protected readonly labels = inject(ScriptingLabels);
  private readonly scripting = inject(ScriptingService);
  private readonly dialogs = inject(ScriptingDialogsService);
  private readonly menus = inject(ScriptingMenuService);
  private readonly languageService = inject(LanguageService);

  readonly ctx = input.required<ScriptContext>();
  readonly unitLower = computed(this.buildUnitLower.bind(this));
  readonly stats = computed(this.buildStats.bind(this));

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

  reset(): void {
    this.dialogs.openReset(this.ctx().projectId);
  }

  openAddMenu(event: Event): void {
    this.menus.open(event.currentTarget as HTMLElement, this.addRows());
  }

  add(type: BlockType): void {
    this.scripting.addBlock(this.ctx().projectId, type);
  }

  private addRows(): ScriptingMenuRow[] {
    return this.ctx().config.types.map(this.addRow.bind(this));
  }

  private addRow(type: BlockType): ScriptingMenuRow {
    const definition = BLOCK_TYPES[type];
    return menuItem(
      this.languageService.translate(definition.labelKey),
      definition.icon,
      false,
      this.add.bind(this, type),
    );
  }

  private buildUnitLower(): string {
    return this.labels.unitLower(this.ctx().config);
  }

  private buildStats(): string[] {
    return this.labels.stats(this.ctx());
  }
}
