import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { fieldValue } from '@shared/utils/dom';

import { NovelDialogsService } from '../novel.dialogs.service';
import { ChapterRow, TranslationStatus } from '../novel.models';
import { formatCount, matchesChapter, toNovelError } from '../novel.rules';
import { NovelService } from '../novel.service';
import { ChapterFilter } from '../novel.translation.models';
// prettier-ignore
import { CHAPTER_FILTER_KEYS, CHAPTER_FILTERS, CHAPTER_ROW_LIMIT, matchesChapterFilter, STATUS_BADGES, STATUS_KEYS } from '../novel.translation.rules';
import { NovelTranslationService } from '../novel.translation.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-novel-translation-pipeline',
  imports: [Icon, CoreModule],
  templateUrl: './translation-pipeline.component.html',
  host: { 'data-testid': 'novel-translation-pipeline' },
})
export class NovelTranslationPipeline {
  private readonly novels = inject(NovelService);
  private readonly dialogs = inject(NovelDialogsService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  readonly translation = inject(NovelTranslationService);

  readonly novelId = input.required<number>();
  readonly count = formatCount;
  readonly filters = CHAPTER_FILTERS;
  readonly limit = CHAPTER_ROW_LIMIT;
  readonly query = signal('');
  readonly filter = signal<ChapterFilter>('all');

  readonly matching = computed(this.buildMatching.bind(this));
  readonly shown = computed(this.buildShown.bind(this));
  readonly ready = computed(this.buildReady.bind(this));

  filterKey(filter: ChapterFilter): LanguageKey {
    return CHAPTER_FILTER_KEYS[filter];
  }

  statusKey(status: TranslationStatus): LanguageKey {
    return STATUS_KEYS[status];
  }

  badgeOf(status: TranslationStatus): string {
    return STATUS_BADGES[status];
  }

  numberOf(row: ChapterRow): string {
    return String(row.seq).padStart(2, '0');
  }

  statusOf(row: ChapterRow): TranslationStatus {
    return this.translation.statusOf(this.novelId(), row.id);
  }

  hasTranslation(row: ChapterRow): boolean {
    return this.translation.of(this.novelId()).chapters[row.id] !== undefined;
  }

  onQuery(event: Event): void {
    this.query.set(fieldValue(event));
  }

  onFilter(event: Event): void {
    this.filter.set(fieldValue(event) as ChapterFilter);
  }

  read(row: ChapterRow): void {
    this.translation.focusPassage(this.novelId(), row.seq, null);
  }

  start(): void {
    this.dialogs.openTranslate(this.novelId());
  }

  async cancel(): Promise<void> {
    try {
      await this.translation.cancelNovel(this.novelId());
    } catch (cause) {
      const detail = toNovelError(cause).detail;
      this.toasts.show(this.languageService.translate('novel.error.generic', { detail }), 'danger');
    }
  }

  private buildMatching(): ChapterRow[] {
    const out: ChapterRow[] = [];
    for (const row of this.novels.chaptersOf(this.novelId())) {
      if (
        matchesChapter(row, this.query()) &&
        matchesChapterFilter(this.statusOf(row), this.filter())
      ) {
        out.push(row);
      }
    }
    return out;
  }

  private buildShown(): ChapterRow[] {
    return this.matching().slice(0, CHAPTER_ROW_LIMIT);
  }

  private buildReady(): boolean {
    return this.novels.chaptersOf(this.novelId()).length > 0;
  }
}
