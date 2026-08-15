import { Component, computed, effect, inject, signal } from "@angular/core";
import { Dialog } from "../../../../components/dialog";
import { Button } from "../../../../components/button";
import { Icon } from "../../../../components/icon";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nService } from "../../../core/i18n/i18n.service";
import { ToastService } from "../../../core/toast/toast.service";
import { NovelDialogsService } from "../novel.dialogs.service";
import { ChapterRow } from "../novel.models";
import { NovelReaderService } from "../novel.reader.service";
import { formatCount } from "../novel.rules";
import { toNovelError } from "../novel.rules";
import { NovelService } from "../novel.service";

@Component({
  selector: "app-novel-chapter-delete-dialog",
  standalone: true,
  imports: [Button, Dialog, Icon, I18nPipe],
  templateUrl: "./chapter-delete.dialog.html",
  host: { "data-testid": "novel-chapter-delete-dialog" },
})
export class NovelChapterDeleteDialog {
  private readonly novels = inject(NovelService);
  private readonly dialogs = inject(NovelDialogsService);
  private readonly reader = inject(NovelReaderService);
  private readonly toasts = inject(ToastService);
  private readonly i18n = inject(I18nService);

  readonly count = formatCount;
  readonly chapter = computed(this.buildChapter.bind(this));
  readonly passages = signal<number | null>(null);
  readonly busy = signal(false);

  constructor() {
    effect(this.loadPassages.bind(this));
    effect(this.closeWhenGone.bind(this));
  }

  close(): void {
    this.dialogs.closeDeleteChapter();
  }

  async confirm(): Promise<void> {
    const row = this.chapter();
    if (this.busy() || row === null) {
      return;
    }
    this.busy.set(true);
    try {
      await this.reader.deleteChapter(row.novelId, row.id);
      this.close();
      this.toasts.show(this.i18n.translate("novel.toast.chapterDeleted", { title: row.title }));
    } catch (cause) {
      const detail = toNovelError(cause).detail;
      this.toasts.show(this.i18n.translate("novel.error.generic", { detail }), "danger");
    } finally {
      this.busy.set(false);
    }
  }

  private buildChapter(): ChapterRow | null {
    const target = this.dialogs.deleteChapterTarget();
    if (target === null) {
      return null;
    }
    for (const row of this.novels.chaptersOf(target.novelId)) {
      if (row.id === target.chapterId) {
        return row;
      }
    }
    return null;
  }

  private loadPassages(): void {
    const row = this.chapter();
    this.passages.set(null);
    if (row !== null) {
      void this.readPassages(row);
    }
  }

  private async readPassages(row: ChapterRow): Promise<void> {
    try {
      this.passages.set(await this.novels.paragraphCount(row.novelId, row.id));
    } catch {
      this.passages.set(0);
    }
  }

  private closeWhenGone(): void {
    if (this.dialogs.deleteChapterTarget() !== null && this.chapter() === null && !this.busy()) {
      this.dialogs.closeDeleteChapter();
    }
  }
}
