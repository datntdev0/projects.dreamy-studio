import { Component, computed, effect, inject, input } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { ChapterRow } from "../novel.models";
import { NovelSummary } from "../novel.models";
import { NovelReaderService } from "../novel.reader.service";
import { NovelService } from "../novel.service";
import { displayName } from "../novel.rules";
import { filterChapters } from "../novel.rules";
import { formatCount } from "../novel.rules";
import { NovelCover } from "./cover.component";
import { coverColorsFor } from "./cover.component";
import { NovelProgressFrac } from "./progress-frac.component";

@Component({
  selector: "app-novel-chapters",
  standalone: true,
  imports: [Icon, I18nPipe, NovelCover, NovelProgressFrac],
  templateUrl: "./chapters.component.html",
})
export class NovelChapters {
  private readonly novels = inject(NovelService);
  private readonly reader = inject(NovelReaderService);

  readonly novelId = input.required<number>();
  readonly query = this.novels.chapterQuery;
  readonly count = formatCount;

  readonly novel = computed(this.findNovel.bind(this));
  readonly all = computed(this.buildAll.bind(this));
  readonly rows = computed(this.buildRows.bind(this));
  readonly resumeSeq = computed(this.buildResumeSeq.bind(this));
  readonly cover = computed(this.buildCover.bind(this));
  readonly colors = computed(this.buildColors.bind(this));

  constructor() {
    effect(this.syncCover.bind(this));
  }

  nameOf(novel: NovelSummary): string {
    return displayName(novel);
  }

  numberOf(row: ChapterRow): string {
    return String(row.seq).padStart(2, "0");
  }

  onQuery(event: Event): void {
    this.novels.setChapterQuery((event.target as HTMLInputElement).value);
  }

  read(): void {
    void this.reader.openReader(this.novelId(), this.resumeSeq());
  }

  open(seq: number): void {
    void this.reader.openReader(this.novelId(), seq);
  }

  private findNovel(): NovelSummary | null {
    return this.novels.novelById(this.novelId()) ?? null;
  }

  private buildAll(): ChapterRow[] {
    return this.novels.chaptersOf(this.novelId());
  }

  private buildRows(): ChapterRow[] {
    return filterChapters(this.all(), this.novels.chapterQuery());
  }

  private buildResumeSeq(): number {
    return this.reader.resumeSeq(this.novelId());
  }

  private buildCover(): string {
    const novel = this.novel();
    return novel ? (this.novels.coverUrl(novel) ?? "") : "";
  }

  private buildColors(): string[] {
    return coverColorsFor(this.novelId());
  }

  private syncCover(): void {
    const novel = this.novel();
    if (novel) {
      this.novels.ensureCover(novel);
    }
  }
}
