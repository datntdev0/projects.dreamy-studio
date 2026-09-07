import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Icon } from '@components/icon';
import { BLOCK_TYPES } from '@features/scripting/scripting.rules';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

// prettier-ignore
import { ProposalResolution, ProposalStatus, ScriptDraft, ScriptDraftRow, ScriptDraftView } from '../assistant.models';
// prettier-ignore
import { canApplyDraft, changedDraftBlocks, DRAFT_COLLAPSED_ROWS, draftRows, isNewSpeaker, STATUS_KEYS } from '../assistant.proposals';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-assistant-script-draft-card',
  imports: [Icon, CoreModule],
  templateUrl: './script-draft-card.component.html',
})
export class AssistantScriptDraftCard {
  readonly draft = input.required<ScriptDraft>();
  readonly messageId = input.required<string>();
  readonly busy = input(false);
  readonly resolved = output<ProposalResolution>();

  readonly view = signal<ScriptDraftView>('after');
  readonly expanded = signal(false);
  readonly rows = computed(this.buildRows.bind(this));
  readonly visibleRows = computed(this.buildVisibleRows.bind(this));
  readonly hiddenCount = computed(this.buildHiddenCount.bind(this));
  readonly changed = computed(this.buildChanged.bind(this));
  readonly applicable = computed(this.buildApplicable.bind(this));

  statusKey(status: ProposalStatus): LanguageKey {
    return STATUS_KEYS[status];
  }

  typeOf(row: ScriptDraftRow): { icon: string; labelKey: LanguageKey } {
    return BLOCK_TYPES[row.type];
  }

  isNew(id: string): boolean {
    return isNewSpeaker(this.draft(), id);
  }

  show(view: ScriptDraftView): void {
    this.view.set(view);
    this.expanded.set(false);
  }

  expand(): void {
    this.expanded.set(true);
  }

  apply(): void {
    if (this.applicable() && !this.busy()) {
      this.emit('applied');
    }
  }

  reject(): void {
    if (this.draft().status === 'pending' && !this.busy()) {
      this.emit('rejected');
    }
  }

  private emit(status: ProposalResolution['status']): void {
    this.resolved.emit({ messageId: this.messageId(), itemIds: [this.draft().id], status });
  }

  private buildRows(): ScriptDraftRow[] {
    return draftRows(this.draft(), this.view());
  }

  private buildVisibleRows(): ScriptDraftRow[] {
    const rows = this.rows();
    return this.expanded() ? rows : rows.slice(0, DRAFT_COLLAPSED_ROWS);
  }

  private buildHiddenCount(): number {
    return this.rows().length - this.visibleRows().length;
  }

  private buildChanged(): number {
    return changedDraftBlocks(this.draft());
  }

  private buildApplicable(): boolean {
    return canApplyDraft(this.draft());
  }
}
