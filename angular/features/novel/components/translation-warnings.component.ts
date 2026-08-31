import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { NovelReaderService } from '../novel.reader.service';
import { toNovelError } from '../novel.rules';
import { TranslationWarning, WarningFilter, WarningKind } from '../novel.translation.models';
// prettier-ignore
import { filterWarnings, WARNING_FILTER_KEYS, WARNING_FILTERS, WARNING_KIND_BADGES, WARNING_KIND_KEYS, warningReason } from '../novel.translation.rules';
import { NovelTranslationService } from '../novel.translation.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-novel-translation-warnings',
  imports: [Icon, CoreModule],
  templateUrl: './translation-warnings.component.html',
  host: { 'data-testid': 'novel-translation-warnings' },
})
export class NovelTranslationWarnings {
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly reader = inject(NovelReaderService);
  private readonly translation = inject(NovelTranslationService);

  readonly novelId = input.required<number>();
  readonly filters = WARNING_FILTERS;
  readonly filter = signal<WarningFilter>('all');

  readonly all = computed(this.buildAll.bind(this));
  readonly rows = computed(this.buildRows.bind(this));

  filterKey(filter: WarningFilter): LanguageKey {
    return WARNING_FILTER_KEYS[filter];
  }

  filterCount(filter: WarningFilter): number {
    return filterWarnings(this.all(), filter).length;
  }

  kindKey(kind: WarningKind): LanguageKey {
    return WARNING_KIND_KEYS[kind];
  }

  kindBadge(kind: WarningKind): string {
    return WARNING_KIND_BADGES[kind];
  }

  reasonOf(warning: TranslationWarning): string {
    const reason = warningReason(warning, this.translation.of(this.novelId()).dict);
    return this.languageService.translate(reason.key, reason.params);
  }

  setFilter(filter: WarningFilter): void {
    this.filter.set(filter);
  }

  openSource(warning: TranslationWarning): void {
    void this.reader.openReader(this.novelId(), warning.seq, warning.n);
  }

  openDictionary(): void {
    this.translation.setStep(this.novelId(), 'dict');
  }

  view(warning: TranslationWarning): void {
    this.translation.focusPassage(this.novelId(), warning.seq, warning.n);
  }

  async retranslate(warning: TranslationWarning): Promise<void> {
    await this.run(this.translation.retranslate(this.novelId(), warning.id));
  }

  private async run(work: Promise<void>): Promise<void> {
    try {
      await work;
    } catch (cause) {
      const error = toNovelError(cause);
      const detail = error.detail;
      this.toasts.show(this.languageService.translate('novel.error.generic', { detail }), 'danger');
    }
  }

  private buildAll(): TranslationWarning[] {
    return this.translation.of(this.novelId()).warnings;
  }

  private buildRows(): TranslationWarning[] {
    return filterWarnings(this.all(), this.filter());
  }
}
