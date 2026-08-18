import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from "@angular/core";
import { Icon } from "@components/icon";
import { I18nKey } from "@app/core/i18n/i18n.models";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { I18nService } from "@app/core/i18n/i18n.service";
import { ToastService } from "@app/core/toast/toast.service";
import { ToastTone } from "@app/core/toast/toast.models";
import { NovelLang } from "../novel.models";
import { NovelSummary } from "../novel.models";
import { ParagraphSaveResult } from "../novel.models";
import { ReaderMode } from "../novel.models";
import { NovelReaderService } from "../novel.reader.service";
import { NovelService } from "../novel.service";
import { formatCount } from "../novel.rules";
import { toNovelError } from "../novel.rules";

interface ResultNotice {
  key: I18nKey;
  tone: ToastTone;
}

const RESULT_NOTICES: Record<ParagraphSaveResult, ResultNotice | null> = {
  saved: { key: "novel.reader.saved", tone: "success" },
  empty: { key: "novel.reader.empty", tone: "warning" },
  unchanged: { key: "novel.reader.unchanged", tone: "warning" },
  idle: null,
};

@Component({
  selector: "app-novel-reader",
  standalone: true,
  imports: [Icon, I18nPipe],
  templateUrl: "./reader.component.html",
})
export class NovelReader {
  private readonly novels = inject(NovelService);
  private readonly i18n = inject(I18nService);
  private readonly toasts = inject(ToastService);

  readonly reader = inject(NovelReaderService);
  readonly novelId = input.required<number>();
  readonly count = formatCount;
  readonly flash = signal<number | null>(null);
  readonly targetCode: NovelLang = "VI";
  readonly modes: ReaderMode[] = ["read", "edit"];
  readonly page = viewChild<ElementRef<HTMLElement>>("page");
  readonly editorRef = viewChild<ElementRef<HTMLTextAreaElement>>("editor");

  readonly novel = computed(this.findNovel.bind(this));
  readonly langName = computed(this.buildLangName.bind(this));
  readonly targetName = computed(this.buildTargetName.bind(this));

  constructor() {
    effect(this.syncFocus.bind(this));
    effect(this.syncScroll.bind(this));
    effect(this.syncEditor.bind(this));
  }

  back(): void {
    this.reader.backToChapters(this.novelId());
  }

  prev(): void {
    this.flash.set(null);
    void this.reader.prev();
  }

  next(): void {
    this.flash.set(null);
    void this.reader.next();
  }

  onJump(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    this.flash.set(null);
    void this.reader.gotoChapter(Math.floor(value) || 1);
  }

  setMode(mode: ReaderMode): void {
    this.reader.setMode(mode);
  }

  modeKey(mode: ReaderMode): I18nKey {
    return mode === "read" ? "novel.reader.mode.read" : "novel.reader.mode.edit";
  }

  edit(n: number): void {
    this.reader.startEdit(n);
  }

  cancel(): void {
    this.reader.cancelEdit();
  }

  addPassage(): void {
    this.reader.startAddPassage();
  }

  async rename(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    try {
      const result = await this.reader.renameChapter(input.value);
      if (result === "empty") {
        input.value = this.reader.current()?.title ?? "";
        this.notify(this.i18n.translate("novel.error.titleEmpty"), "warning");
      } else if (result === "saved") {
        this.notify(this.i18n.translate("novel.toast.chapterRenamed"), "success");
      }
    } catch (cause) {
      const detail = toNovelError(cause).detail;
      this.notify(this.i18n.translate("novel.error.generic", { detail }), "danger");
    }
  }

  async save(text: string): Promise<void> {
    try {
      this.announce(await this.reader.saveParagraph(text));
    } catch (cause) {
      const detail = toNovelError(cause).detail;
      this.notify(this.i18n.translate("novel.error.generic", { detail }), "danger");
    }
  }

  private announce(result: ParagraphSaveResult): void {
    const entry = RESULT_NOTICES[result];
    if (entry) {
      this.notify(this.i18n.translate(entry.key), entry.tone);
    }
  }

  private notify(message: string, tone: ToastTone): void {
    this.toasts.show(message, tone);
  }

  private findNovel(): NovelSummary | null {
    return this.novels.novelById(this.novelId()) ?? null;
  }

  private buildLangName(): string {
    const novel = this.novel();
    return novel ? this.i18n.translate(`novel.lang.${novel.lang}`) : "";
  }

  private buildTargetName(): string {
    return this.i18n.translate(`novel.lang.${this.targetCode}`);
  }

  private syncFocus(): void {
    const target = this.reader.focus();
    const ready = this.reader.paragraphs().length > 0 && !this.reader.loading();
    if (target !== null && ready) {
      untracked(this.revealParagraph.bind(this, target));
    }
  }

  private revealParagraph(target: number): void {
    this.reader.consumeFocus();
    this.flash.set(target);
    setTimeout(this.scrollToParagraph.bind(this, target), 0);
  }

  private scrollToParagraph(target: number): void {
    document.getElementById(`rp-${target}`)?.scrollIntoView({ block: "center" });
  }

  private syncScroll(): void {
    this.reader.seq();
    const page = untracked(this.page);
    if (page && untracked(this.reader.focus) === null) {
      page.nativeElement.scrollTop = 0;
    }
  }

  private syncEditor(): void {
    const area = this.editorRef();
    if (area) {
      const element = area.nativeElement;
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    }
  }
}
