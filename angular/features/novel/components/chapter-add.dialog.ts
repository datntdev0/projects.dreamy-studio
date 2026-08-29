import { Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from "@angular/core";
import { Button } from "@components/button";
import { Icon } from "@components/icon";
import { CoreModule } from "@core/core.module";
import { LanguageService } from "@core/language/language.service";
import { ToastService } from "@core/toast/toast.service";
import { NovelDialogsService } from "../novel.dialogs.service";
import { toNovelError } from "../novel.rules";
import { NovelService } from "../novel.service";

@Component({
  selector: "app-novel-chapter-add-dialog",
  standalone: true,
  imports: [Button, Icon, CoreModule],
  templateUrl: "./chapter-add.dialog.html",
  host: { "data-testid": "novel-chapter-add-dialog" },
})
export class NovelChapterAddDialog {
  private readonly novels = inject(NovelService);
  private readonly dialogs = inject(NovelDialogsService);
  private readonly toasts = inject(ToastService);
  private readonly languageService = inject(LanguageService);
  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>("titleInput");

  readonly open = computed(this.buildOpen.bind(this));
  readonly nextSeq = computed(this.buildNextSeq.bind(this));
  readonly title = signal("");
  readonly busy = signal(false);

  constructor() {
    effect(this.resetOnOpen.bind(this));
    effect(this.focusTitle.bind(this));
  }

  close(): void {
    this.dialogs.closeAddChapter();
  }

  onInput(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
  }

  async submit(): Promise<void> {
    const novelId = this.dialogs.addChapterNovelId();
    if (this.busy() || novelId === null) {
      return;
    }
    this.busy.set(true);
    try {
      const row = await this.novels.addChapter(novelId, this.title().trim());
      this.close();
      this.toasts.show(this.languageService.translate("novel.toast.chapterAdded", { n: row.seq, title: row.title }));
    } catch (cause) {
      const detail = toNovelError(cause).detail;
      this.toasts.show(this.languageService.translate("novel.error.generic", { detail }), "danger");
    } finally {
      this.busy.set(false);
    }
  }

  private buildOpen(): boolean {
    return this.dialogs.addChapterNovelId() !== null;
  }

  private buildNextSeq(): number {
    const novelId = this.dialogs.addChapterNovelId();
    return novelId === null ? 1 : this.novels.chaptersOf(novelId).length + 1;
  }

  private resetOnOpen(): void {
    if (this.open()) {
      untracked(this.clearTitle.bind(this));
    }
  }

  private clearTitle(): void {
    this.title.set("");
    this.busy.set(false);
  }

  private focusTitle(): void {
    const input = this.titleInput();
    if (input) {
      input.nativeElement.focus();
    }
  }
}
