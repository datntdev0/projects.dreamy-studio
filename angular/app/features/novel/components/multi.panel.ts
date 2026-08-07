import { Component, effect, inject } from "@angular/core";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { NovelSummary } from "../novel.models";
import { NovelDialogsService } from "../novel.dialogs.service";
import { NovelService } from "../novel.service";
import { displayName, formatCount } from "../novel.rules";
import { NovelCover, coverColorsFor } from "./cover.component";

@Component({
  selector: "app-novel-multi-panel",
  standalone: true,
  imports: [I18nPipe, NovelCover],
  templateUrl: "./multi.panel.html",
})
export class NovelMultiPanel {
  private readonly dialogs = inject(NovelDialogsService);

  readonly novels = inject(NovelService);

  constructor() {
    effect(this.loadCovers.bind(this));
  }

  nameOf(novel: NovelSummary): string {
    return displayName(novel);
  }

  fmt(value: number): string {
    return formatCount(value);
  }

  chapterTotal(): number {
    let total = 0;
    for (const novel of this.novels.selectedNovels()) {
      total += novel.chapterCount;
    }
    return total;
  }

  wordTotal(): number {
    let total = 0;
    for (const novel of this.novels.selectedNovels()) {
      total += novel.wordCount;
    }
    return total;
  }

  colorsOf(novel: NovelSummary): string[] {
    return coverColorsFor(novel.id);
  }

  imageOf(novel: NovelSummary): string {
    return this.novels.coverUrl(novel) ?? "";
  }

  deselect(event: Event, novel: NovelSummary): void {
    event.stopPropagation();
    this.novels.toggleSelected(novel.id);
  }

  deleteSelected(): void {
    this.dialogs.openDelete(this.novels.selectedIds());
  }

  private loadCovers(): void {
    for (const novel of this.novels.selectedNovels()) {
      this.novels.ensureCover(novel);
    }
  }
}
