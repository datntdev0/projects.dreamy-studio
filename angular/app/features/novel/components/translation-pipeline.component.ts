import { Component, computed, inject, input, signal } from "@angular/core";
import { Icon } from "@components/icon";
import { I18nKey } from "@app/core/i18n/i18n.models";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { I18nService } from "@app/core/i18n/i18n.service";
import { ToastService } from "@app/core/toast/toast.service";
import { ChapterRow, TranslationStatus } from "../novel.models";
import { NovelService } from "../novel.service";
import { formatCount, matchesChapter, toNovelError } from "../novel.rules";
import { ChapterFilter, TranslationView } from "../novel.translation.models";
import { CHAPTER_FILTERS, CHAPTER_FILTER_KEYS, CHAPTER_ROW_LIMIT, STATUS_BADGES, STATUS_KEYS, matchesChapterFilter } from "../novel.translation.rules";
import { NovelTranslationService } from "../novel.translation.service";

@Component({
  selector: "app-novel-translation-pipeline",
  standalone: true,
  imports: [Icon, I18nPipe],
  templateUrl: "./translation-pipeline.component.html",
})
export class NovelTranslationPipeline {
  private readonly novels = inject(NovelService);
  private readonly i18n = inject(I18nService);
  private readonly toasts = inject(ToastService);
  readonly translation = inject(NovelTranslationService);

  readonly novelId = input.required<number>();
  readonly count = formatCount;
  readonly filters = CHAPTER_FILTERS;
  readonly limit = CHAPTER_ROW_LIMIT;
  readonly query = signal("");
  readonly filter = signal<ChapterFilter>("all");

  readonly view = computed(this.buildView.bind(this));
  readonly matching = computed(this.buildMatching.bind(this));
  readonly shown = computed(this.buildShown.bind(this));
  readonly allPicked = computed(this.buildAllPicked.bind(this));
  readonly ready = computed(this.buildReady.bind(this));

  filterKey(filter: ChapterFilter): I18nKey {
    return CHAPTER_FILTER_KEYS[filter];
  }

  statusKey(status: TranslationStatus): I18nKey {
    return STATUS_KEYS[status];
  }

  badgeOf(status: TranslationStatus): string {
    return STATUS_BADGES[status];
  }

  numberOf(row: ChapterRow): string {
    return String(row.seq).padStart(2, "0");
  }

  statusOf(row: ChapterRow): TranslationStatus {
    return this.translation.statusOf(this.novelId(), row.id);
  }

  progressOf(row: ChapterRow): number {
    return Math.round(this.translation.progressOf(this.novelId())[row.id] ?? 0);
  }

  hasProgress(row: ChapterRow): boolean {
    return Object.hasOwn(this.translation.progressOf(this.novelId()), row.id);
  }

  isPicked(row: ChapterRow): boolean {
    return this.view().picks.includes(row.id);
  }

  hasTranslation(row: ChapterRow): boolean {
    return this.translation.of(this.novelId()).chapters[row.id] !== undefined;
  }

  onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  onFilter(event: Event): void {
    this.filter.set((event.target as HTMLSelectElement).value as ChapterFilter);
  }

  onPick(row: ChapterRow, event: Event): void {
    this.translation.pickChapter(this.novelId(), row.id, (event.target as HTMLInputElement).checked);
  }

  onPickAll(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    const ids = this.matching().filter((row) => this.statusOf(row) !== "running").map((row) => row.id);
    const rest = this.view().picks.filter((id) => !ids.includes(id));
    this.translation.setPicks(this.novelId(), on ? [...rest, ...ids] : rest);
  }

  read(row: ChapterRow): void {
    this.translation.focusPassage(this.novelId(), row.seq, null);
  }

  async start(): Promise<void> {
    try {
      await this.translation.translate(this.novelId(), this.view().picks);
    } catch (cause) {
      const error = toNovelError(cause);
      if (error.code === "pipeline_busy") {
        this.toasts.show(this.i18n.translate("novel.error.pipelineBusy"), "warning");
        return;
      }
      this.toasts.show(this.i18n.translate("novel.error.generic", { detail: error.detail }), "danger");
    }
  }

  async cancel(): Promise<void> {
    try {
      await this.translation.cancelPipeline();
    } catch (cause) {
      const detail = toNovelError(cause).detail;
      this.toasts.show(this.i18n.translate("novel.error.generic", { detail }), "danger");
    }
  }

  private buildView(): TranslationView {
    return this.translation.viewOf(this.novelId());
  }

  private buildMatching(): ChapterRow[] {
    const out: ChapterRow[] = [];
    for (const row of this.novels.chaptersOf(this.novelId())) {
      if (matchesChapter(row, this.query()) && matchesChapterFilter(this.statusOf(row), this.filter())) {
        out.push(row);
      }
    }
    return out;
  }

  private buildShown(): ChapterRow[] {
    return this.matching().slice(0, CHAPTER_ROW_LIMIT);
  }

  private buildAllPicked(): boolean {
    const rows = this.matching();
    return rows.length > 0 && rows.every((row) => this.isPicked(row));
  }

  private buildReady(): boolean {
    return this.view().picks.length > 0 && !this.translation.busy();
  }
}
