import { Injectable, inject } from "@angular/core";
import { DialogItem } from "@app/core/dialog/dialog.models";
import { DialogService } from "@app/core/dialog/dialog.service";
import { LanguageService } from "@app/core/language/language.service";
import { ToastService } from "@app/core/toast/toast.service";
import { TabsService } from "@layout/tabs.service";
import { NovelConfirmThumb } from "./components/confirm-thumb.component";
import { NovelSummary } from "./novel.models";
import { NovelReaderService } from "./novel.reader.service";
import { displayName, formatCount, toNovelError } from "./novel.rules";
import { NovelService } from "./novel.service";

@Injectable({ providedIn: "root" })
export class NovelConfirmService {
  private readonly dialogs = inject(DialogService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly tabs = inject(TabsService);
  private readonly novels = inject(NovelService);
  private readonly reader = inject(NovelReaderService);

  deleteNovels(ids: number[]): Promise<boolean> {
    const known = this.novels.byId();
    const rows: NovelSummary[] = [];
    for (const id of ids) {
      const novel = known.get(id);
      if (novel) {
        rows.push(novel);
      }
    }
    if (rows.length === 0) {
      return Promise.resolve(false);
    }
    const one = rows.length === 1;
    return this.dialogs.ask({
      title: this.languageService.translate(one ? "novel.delete.title.one" : "novel.delete.title.other", { count: rows.length }),
      eyebrow: this.languageService.translate("novel.cap"),
      closeLabel: this.languageService.translate("novel.dialog.close"),
      items: rows.map(this.toItem.bind(this)),
      thumb: NovelConfirmThumb,
      warning: this.languageService.translate(one ? "novel.delete.warn.one" : "novel.delete.warn.other"),
      confirmLabel: this.languageService.translate(one ? "novel.delete.confirm.one" : "novel.delete.confirm.other", { count: rows.length }),
      confirmIcon: "trash",
      onConfirm: this.removeNovels.bind(this, rows),
    });
  }

  async deleteChapter(novelId: number, chapterId: string): Promise<boolean> {
    const row = this.novels.chaptersOf(novelId).find((entry) => entry.id === chapterId);
    if (!row) {
      return false;
    }
    let passages = 0;
    try {
      passages = await this.novels.paragraphCount(novelId, chapterId);
    } catch {
      passages = 0;
    }
    return this.dialogs.ask({
      title: this.languageService.translate("novel.chapters.delete.title"),
      eyebrow: this.languageService.translate("novel.cap"),
      closeLabel: this.languageService.translate("novel.dialog.close"),
      items: [
        {
          name: this.languageService.translate("novel.chapters.delete.heading", { n: row.seq, title: row.title }),
          meta: this.languageService.translate("novel.chapters.delete.meta", { words: formatCount(row.wordCount), passages }),
        },
      ],
      warning: this.languageService.translate("novel.chapters.delete.warn"),
      confirmLabel: this.languageService.translate("novel.chapters.delete.submit"),
      confirmIcon: "trash",
      onConfirm: this.removeChapter.bind(this, novelId, row.id, row.title),
    });
  }

  private toItem(novel: NovelSummary): DialogItem {
    const author = novel.author.trim() || this.languageService.translate("novel.author.unknown");
    const chapters = formatCount(novel.chapterCount);
    return { name: displayName(novel), meta: this.languageService.translate("novel.delete.meta", { author, chapters }), data: novel };
  }

  private async removeNovels(rows: NovelSummary[]): Promise<void> {
    const ids = rows.map((novel) => novel.id);
    try {
      await this.novels.remove(ids);
      this.tabs.closeNovels(ids);
      this.reader.closeNovels(ids);
    } catch (cause) {
      throw this.failure(cause);
    }
    this.toasts.show(this.deletedMessage(rows));
  }

  private async removeChapter(novelId: number, chapterId: string, title: string): Promise<void> {
    try {
      await this.reader.deleteChapter(novelId, chapterId);
    } catch (cause) {
      throw this.failure(cause);
    }
    this.toasts.show(this.languageService.translate("novel.toast.chapterDeleted", { title }));
  }

  private deletedMessage(rows: NovelSummary[]): string {
    if (rows.length === 1) {
      return this.languageService.translate("novel.toast.deleted.one", { title: displayName(rows[0]) });
    }
    return this.languageService.translate("novel.toast.deleted.other", { count: rows.length });
  }

  private failure(cause: unknown): Error {
    return new Error(this.languageService.translate("novel.error.generic", { detail: toNovelError(cause).detail }));
  }
}
