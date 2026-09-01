import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { LayoutService } from '@layout/layout.service';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

// prettier-ignore
import { BlockPatch, BlockType, BlockTypeDef, CastMember, MoveDirection, ScriptBlock, ScriptContext } from '../scripting.models';
// prettier-ignore
import { BLOCK_TYPES, findBlock, isStale, SCENE_TIMES, speakerClass, speakerOf } from '../scripting.rules';
import { ScriptingService } from '../scripting.service';
import { arrowTarget, placeCaret, textFieldsIn } from './scripting.caret';
import { ScriptingLabels } from './scripting.labels';
// prettier-ignore
import { MENU_DIVIDER, menuItem, ScriptingMenuRow, ScriptingMenuService } from './scripting.menu.service';
import { ScriptingText } from './scripting.text.directive';

const SCROLL_SELECTOR = '[data-testid="sc-scroll"]';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-block',
  imports: [Icon, CoreModule, ScriptingText],
  templateUrl: './block.component.html',
})
export class ScriptingBlock {
  protected readonly labels = inject(ScriptingLabels);
  private readonly scripting = inject(ScriptingService);
  private readonly menus = inject(ScriptingMenuService);
  private readonly layout = inject(LayoutService);
  private readonly languageService = inject(LanguageService);

  readonly ctx = input.required<ScriptContext>();
  readonly block = input.required<ScriptBlock>();
  readonly times = SCENE_TIMES;
  readonly definition = computed(this.buildDefinition.bind(this));
  readonly typeLabel = computed(this.buildTypeLabel.bind(this));
  readonly speaker = computed(this.buildSpeaker.bind(this));
  readonly speakerClass = computed(this.buildSpeakerClass.bind(this));
  readonly stale = computed(this.buildStale.bind(this));
  readonly selected = computed(this.buildSelected.bind(this));
  readonly hasLine = computed(this.buildHasLine.bind(this));
  readonly seconds = computed(this.buildSeconds.bind(this));

  select(): void {
    const ctx = this.ctx();
    if (ctx.view.sel !== this.block().id) {
      this.scripting.selectBlock(ctx.projectId, this.block().id);
    }
  }

  editText(text: string): void {
    this.patch({ text });
  }

  editParen(event: Event): void {
    this.patch({ paren: (event.target as HTMLInputElement).value });
  }

  editLocation(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = input.value.toUpperCase();
    this.patch({ loc: input.value });
  }

  editTime(event: Event): void {
    this.patch({ time: (event.target as HTMLSelectElement).value });
  }

  editSeconds(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.patch({ seconds: parseFloat(input.value || '0') });
    const fresh = findBlock(this.scripting.contextOf(this.ctx().projectId)?.unit, this.block().id);
    input.value = ((fresh?.ms ?? 0) / 1000).toFixed(1);
  }

  openTypeMenu(event: Event): void {
    this.menus.open(event.currentTarget as HTMLElement, this.typeRows());
  }

  openWhoMenu(event: Event): void {
    this.menus.open(event.currentTarget as HTMLElement, this.whoRows());
  }

  setType(type: BlockType): void {
    this.scripting.setBlockType(this.ctx().projectId, this.block().id, type);
  }

  setWho(who: string): void {
    this.patch({ who });
  }

  manageCast(): void {
    this.layout.selectRightTab('inspector');
    this.layout.inspectorOpen.set(true);
  }

  move(direction: MoveDirection): void {
    this.scripting.moveBlock(this.ctx().projectId, this.block().id, direction);
  }

  duplicate(): void {
    this.scripting.duplicateBlock(this.ctx().projectId, this.block().id);
  }

  remove(): void {
    this.scripting.removeBlock(this.ctx().projectId, this.block().id);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.isComposing || this.ctx().locked) {
      return;
    }
    const element = event.currentTarget as HTMLElement;
    const key = event.key;
    if (key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.scripting.insertAfter(this.ctx().projectId, this.block().id);
    } else if (key === 'Backspace' && !element.textContent) {
      event.preventDefault();
      this.remove();
    } else if (key === 'Tab') {
      event.preventDefault();
      this.scripting.cycleBlockType(this.ctx().projectId, this.block().id, event.shiftKey);
    } else if ((key === 'ArrowUp' || key === 'ArrowDown') && !event.shiftKey) {
      this.moveCaret(event, element);
    }
  }

  private moveCaret(event: KeyboardEvent, element: HTMLElement): void {
    const fields = textFieldsIn(element.closest(SCROLL_SELECTOR));
    const target = arrowTarget(event.key, element, fields);
    if (target) {
      event.preventDefault();
      placeCaret(target);
    }
  }

  private patch(patch: BlockPatch): void {
    this.scripting.patchBlock(this.ctx().projectId, this.block().id, patch);
  }

  private typeRows(): ScriptingMenuRow[] {
    const current = this.block().type;
    return this.ctx().config.types.map((type) => this.typeRow(type, type === current));
  }

  private typeRow(type: BlockType, disabled: boolean): ScriptingMenuRow {
    const definition = BLOCK_TYPES[type];
    return menuItem(
      this.languageService.translate(definition.labelKey),
      definition.icon,
      disabled,
      this.setType.bind(this, type),
    );
  }

  private whoRows(): ScriptingMenuRow[] {
    const current = this.block().who;
    return [
      ...this.ctx().cast.map((member) => this.whoRow(member, member.id === current)),
      MENU_DIVIDER,
      menuItem(
        this.languageService.translate('scripting.editor.block.manage'),
        'settings',
        false,
        this.manageCast.bind(this),
      ),
    ];
  }

  private whoRow(member: CastMember, disabled: boolean): ScriptingMenuRow {
    return menuItem(
      this.labels.speakerName(member),
      'user',
      disabled,
      this.setWho.bind(this, member.id),
    );
  }

  private buildDefinition(): BlockTypeDef {
    return BLOCK_TYPES[this.block().type];
  }

  private buildTypeLabel(): LanguageKey {
    return this.definition().labelKey;
  }

  private buildSpeaker(): CastMember | undefined {
    return speakerOf(this.ctx().cast, this.block().who);
  }

  private buildSpeakerClass(): string {
    return speakerClass(this.speaker());
  }

  private buildStale(): boolean {
    return isStale(this.ctx().source, this.block());
  }

  private buildSelected(): boolean {
    return this.ctx().view.sel === this.block().id;
  }

  private buildHasLine(): boolean {
    return this.block().type === 'dialogue' && this.ctx().config.speakers;
  }

  private buildSeconds(): string {
    return (this.block().ms / 1000).toFixed(1);
  }
}
