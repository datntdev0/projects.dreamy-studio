import { Component, effect, inject } from "@angular/core";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { NovelSummary } from "../novel.models";
import { NovelDialogsService } from "../novel.dialogs.service";
import { NovelService } from "../novel.service";
import { displayName, formatCount, formatMonthDay } from "../novel.rules";
import { NovelCover, coverColorsFor } from "./cover.component";
import { NovelProgressFrac } from "./progress-frac.component";

@Component({
  selector: "app-novel-library-panel",
  standalone: true,
  imports: [I18nPipe, NovelCover, NovelProgressFrac],
  templateUrl: "./library.panel.html",
})
export class NovelLibraryPanel {
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

  dayOf(novel: NovelSummary): string {
    return formatMonthDay(novel.updatedAt);
  }

  colorsOf(novel: NovelSummary): string[] {
    return coverColorsFor(novel.id);
  }

  imageOf(novel: NovelSummary): string {
    return this.novels.coverUrl(novel) ?? "";
  }

  select(event: MouseEvent, novel: NovelSummary): void {
    this.novels.select(novel.id, event);
  }

  openCreate(): void {
    this.dialogs.openCreate();
  }

  openImport(): void {
    this.dialogs.openImport();
  }

  private loadCovers(): void {
    for (const novel of this.novels.recent()) {
      this.novels.ensureCover(novel);
    }
  }
}
