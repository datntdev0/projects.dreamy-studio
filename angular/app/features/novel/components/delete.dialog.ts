import { Component, computed, effect, inject, signal } from "@angular/core";
import { Dialog } from "../../../../components/dialog";
import { Button } from "../../../../components/button";
import { Icon } from "../../../../components/icon";
import { TabsService } from "../../../../layout/tabs.service";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nService } from "../../../core/i18n/i18n.service";
import { ToastService } from "../../../core/toast/toast.service";
import { NovelDialogsService } from "../novel.dialogs.service";
import { NovelSummary } from "../novel.models";
import { displayName } from "../novel.rules";
import { formatCount } from "../novel.rules";
import { toNovelError } from "../novel.rules";
import { NovelReaderService } from "../novel.reader.service";
import { NovelService } from "../novel.service";
import { NovelCover, coverColorsFor } from "./cover.component";
import { NovelProgressFrac } from "./progress-frac.component";

@Component({
  selector: "app-novel-delete-dialog",
  standalone: true,
  imports: [Button, Dialog, Icon, I18nPipe, NovelCover, NovelProgressFrac],
  templateUrl: "./delete.dialog.html",
  host: { "data-testid": "novel-delete-dialog" },
})
export class NovelDeleteDialog {
  private readonly novels = inject(NovelService);
  private readonly dialogs = inject(NovelDialogsService);
  private readonly tabs = inject(TabsService);
  private readonly reader = inject(NovelReaderService);
  private readonly toasts = inject(ToastService);
  private readonly i18n = inject(I18nService);

  readonly rows = computed(this.buildRows.bind(this));
  readonly open = computed(this.buildOpen.bind(this));
  readonly one = computed(this.buildOne.bind(this));
  readonly busy = signal(false);

  constructor() {
    effect(this.loadCovers.bind(this));
    effect(this.closeWhenEmpty.bind(this));
  }

  close(): void {
    this.dialogs.closeDelete();
  }

  nameOf(novel: NovelSummary): string {
    return displayName(novel);
  }

  authorOf(novel: NovelSummary): string {
    return novel.author.trim() || this.i18n.translate("novel.author.unknown");
  }

  chaptersOf(novel: NovelSummary): string {
    return formatCount(novel.chapterCount);
  }

  colorsOf(novel: NovelSummary): string[] {
    return coverColorsFor(novel.id);
  }

  imageOf(novel: NovelSummary): string {
    return this.novels.coverUrl(novel) ?? "";
  }

  async confirm(): Promise<void> {
    const rows = this.rows();
    if (this.busy() || rows.length === 0) {
      return;
    }
    this.busy.set(true);
    try {
      await this.removeRows(rows);
    } catch (cause) {
      const detail = toNovelError(cause).detail;
      this.toasts.show(this.i18n.translate("novel.error.generic", { detail }), "danger");
    } finally {
      this.busy.set(false);
    }
  }

  private async removeRows(rows: NovelSummary[]): Promise<void> {
    const ids = rows.map(this.idOf);
    await this.novels.remove(ids);
    this.tabs.closeNovels(ids);
    this.reader.closeNovels(ids);
    this.close();
    this.toasts.show(this.deletedMessage(rows));
  }

  private deletedMessage(rows: NovelSummary[]): string {
    if (rows.length === 1) {
      return this.i18n.translate("novel.toast.deleted.one", { title: displayName(rows[0]) });
    }
    return this.i18n.translate("novel.toast.deleted.other", { count: rows.length });
  }

  private idOf(novel: NovelSummary): number {
    return novel.id;
  }

  private buildRows(): NovelSummary[] {
    const known = this.novels.byId();
    const out: NovelSummary[] = [];
    for (const id of this.dialogs.deleteIds()) {
      const novel = known.get(id);
      if (novel) {
        out.push(novel);
      }
    }
    return out;
  }

  private buildOpen(): boolean {
    return this.rows().length > 0;
  }

  private buildOne(): boolean {
    return this.rows().length === 1;
  }

  private loadCovers(): void {
    for (const novel of this.rows()) {
      this.novels.ensureCover(novel);
    }
  }

  private closeWhenEmpty(): void {
    if (this.dialogs.deleteIds().length > 0 && this.rows().length === 0) {
      this.dialogs.closeDelete();
    }
  }
}
