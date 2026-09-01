import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { fieldChecked, fieldValue, setFieldValue } from '@shared/utils/dom';

import { ScriptingLabels } from '../../scripting/components/scripting.labels';
import { AudiobookContext, LexField, LexKind, LexRow } from '../audiobook.models';
import { readText } from '../audiobook.rules';
import { AudiobookService } from '../audiobook.service';

const LEX_KINDS: LexKind[] = ['names', 'number', 'abbreviation', 'terms'];

const DEFAULT_KIND: LexKind = 'names';

export function lexKindKey(kind: LexKind): LanguageKey {
  return `audiobook.lex.kind.${kind}`;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-rules',
  imports: [Icon, CoreModule],
  templateUrl: './rules.component.html',
  host: { 'data-testid': 'audiobook-rules', style: 'display: contents' },
})
export class AudiobookRules {
  private readonly audiobook = inject(AudiobookService);
  protected readonly labels = inject(ScriptingLabels);
  protected readonly kinds = LEX_KINDS;
  protected readonly kindKey = lexKindKey;
  private readonly draft = signal<string | null>(null);

  readonly projectId = input.required<number>();
  readonly ctx = computed(this.buildContext.bind(this));
  readonly unitLower = computed(this.buildUnitLower.bind(this));
  readonly testText = computed(this.buildTestText.bind(this));
  readonly testOutput = computed(this.buildTestOutput.bind(this));

  editLex(row: LexRow, field: LexField, event: Event): void {
    const value = fieldValue(event).trim() || row.rule[field];
    this.audiobook.editLexRule(this.projectId(), row.rule.id, field, value);
    setFieldValue(event, value);
  }

  removeLex(row: LexRow): void {
    this.audiobook.removeLexRule(this.projectId(), row.rule.id);
  }

  addLex(term: HTMLInputElement, say: HTMLInputElement, kind: HTMLSelectElement): void {
    if (!term.value.trim() || !say.value.trim()) {
      (term.value.trim() ? say : term).focus();
      return;
    }
    const result = this.audiobook.addLexRule(
      this.projectId(),
      term.value,
      say.value,
      kind.value as LexKind,
    );
    if (result === 'added') {
      term.value = '';
      say.value = '';
      kind.value = DEFAULT_KIND;
    }
  }

  toggleSymbol(id: string, event: Event): void {
    this.audiobook.setSymbol(this.projectId(), id, fieldChecked(event));
  }

  setTest(event: Event): void {
    const text = fieldValue(event);
    this.draft.set(text);
    this.audiobook.setTestText(this.projectId(), text);
  }

  showProduction(): void {
    this.audiobook.setMode(this.projectId(), 'prod');
  }

  private buildContext(): AudiobookContext | null {
    return this.audiobook.contextOf(this.projectId());
  }

  private buildUnitLower(): string {
    const ctx = this.ctx();
    return ctx ? this.labels.unitLower(ctx.config) : '';
  }

  private buildTestText(): string {
    return this.draft() ?? this.ctx()?.testText ?? '';
  }

  private buildTestOutput(): string {
    const ctx = this.ctx();
    return ctx ? readText(ctx.book.lex, this.testText()) : '';
  }
}
