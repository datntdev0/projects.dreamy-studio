import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from "@angular/core";
import { Icon } from "@components/icon";
import { I18nKey } from "@app/core/i18n/i18n.models";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { I18nService } from "@app/core/i18n/i18n.service";
import { ToastService } from "@app/core/toast/toast.service";
import { ChapterRow, NovelSummary, ParagraphRow, ParagraphSaveResult } from "../novel.models";
import { NovelService } from "../novel.service";
import { NOVEL_LANG_KEYS, toNovelError } from "../novel.rules";
import { ChapterTranslation, PassageState, PassageTranslation, TranslationView, TranslationWarning } from "../novel.translation.models";
import { PASSAGE_STATE_BADGES, PASSAGE_STATE_KEYS } from "../novel.translation.rules";
import { NovelTranslationService } from "../novel.translation.service";

const SAVE_NOTICES: Record<ParagraphSaveResult, I18nKey | null> = {
  saved: "novel.translation.result.saved",
  empty: "novel.reader.empty",
  unchanged: "novel.reader.unchanged",
  idle: null,
};

@Component({
  selector: "app-novel-translation-result",
  standalone: true,
  imports: [Icon, I18nPipe],
  templateUrl: "./translation-result.component.html",
})
export class NovelTranslationResult {
  private readonly novels = inject(NovelService);
  private readonly i18n = inject(I18nService);
  private readonly toasts = inject(ToastService);
  private readonly translation = inject(NovelTranslationService);
  private token = 0;

  readonly novelId = input.required<number>();
  readonly source = signal<ParagraphRow[]>([]);
  readonly editing = signal<number | null>(null);
  readonly noteFor = signal<number | null>(null);
  readonly onlyReview = signal(false);
  readonly flash = signal<number | null>(null);
  readonly editor = viewChild<ElementRef<HTMLTextAreaElement>>("editor");
  readonly noteInput = viewChild<ElementRef<HTMLInputElement>>("noteInput");

  readonly novel = computed(this.findNovel.bind(this));
  readonly targetKey = computed(this.buildTargetKey.bind(this));
  readonly view = computed(this.buildView.bind(this));
  readonly chapters = computed(this.buildChapters.bind(this));
  readonly chapter = computed(this.buildChapter.bind(this));
  readonly translated = computed(this.buildTranslated.bind(this));
  readonly rows = computed(this.buildRows.bind(this));

  constructor() {
    effect(this.syncSource.bind(this));
    effect(this.syncFocus.bind(this));
    effect(this.syncEditor.bind(this));
    effect(this.syncNote.bind(this));
  }

  jumpLabel(row: ChapterRow): string {
    const note = this.translation.of(this.novelId()).chapters[row.id] ? "" : this.i18n.translate("novel.translation.result.untranslated");
    return `${this.i18n.translate("novel.translation.result.chapterOption", { n: row.seq, title: row.title })}${note}`;
  }

  stateKey(state: PassageState): I18nKey {
    return PASSAGE_STATE_KEYS[state];
  }

  badgeOf(state: PassageState): string {
    return PASSAGE_STATE_BADGES[state];
  }

  passageOf(n: number): PassageTranslation | null {
    return this.translated()?.passages[n] ?? null;
  }

  warningsOf(n: number): TranslationWarning[] {
    const chapter = this.chapter();
    return this.translation.openWarningsOf(this.novelId()).filter((warning) => warning.chapterId === chapter?.id && warning.n === n);
  }

  indexOf(paragraph: ParagraphRow): number {
    return this.source().indexOf(paragraph) + 1;
  }

  prev(): void {
    this.go(this.view().seq - 1);
  }

  next(): void {
    this.go(this.view().seq + 1);
  }

  onJump(event: Event): void {
    this.go(Number((event.target as HTMLSelectElement).value));
  }

  onOnly(event: Event): void {
    this.onlyReview.set((event.target as HTMLInputElement).checked);
  }

  translateThis(): void {
    const chapter = this.chapter();
    if (chapter) {
      this.translation.goTranslate(this.novelId(), chapter);
    }
  }

  edit(n: number): void {
    this.editing.set(n);
  }

  cancelEdit(): void {
    this.editing.set(null);
  }

  async save(chapter: ChapterRow, n: number, text: string): Promise<void> {
    try {
      const result = await this.translation.saveParagraph(this.novelId(), chapter.id, n, text);
      this.editing.set(result === "empty" ? n : null);
      const key = SAVE_NOTICES[result];
      if (key) {
        this.toasts.show(this.i18n.translate(key), result === "saved" ? "success" : "warning");
      }
    } catch (cause) {
      this.fail(cause);
    }
  }

  openNote(n: number): void {
    this.noteFor.set(n);
  }

  closeNote(): void {
    this.noteFor.set(null);
  }

  async saveNote(chapter: ChapterRow, n: number, text: string): Promise<void> {
    try {
      await this.translation.setNote(this.novelId(), chapter.id, n, text);
      this.noteFor.set(null);
    } catch (cause) {
      this.fail(cause);
    }
  }

  addToDictionary(): void {
    this.translation.startEntry(this.novelId());
  }

  private go(seq: number): void {
    this.editing.set(null);
    this.noteFor.set(null);
    this.translation.setSeq(this.novelId(), seq);
  }

  private fail(cause: unknown): void {
    const detail = toNovelError(cause).detail;
    this.toasts.show(this.i18n.translate("novel.error.generic", { detail }), "danger");
  }

  private buildTargetKey(): I18nKey {
    return NOVEL_LANG_KEYS[this.translation.targetOf(this.novelId())];
  }

  private findNovel(): NovelSummary | null {
    return this.novels.novelById(this.novelId()) ?? null;
  }

  private buildView(): TranslationView {
    return this.translation.viewOf(this.novelId());
  }

  private buildChapters(): ChapterRow[] {
    return this.novels.chaptersOf(this.novelId());
  }

  private buildChapter(): ChapterRow | null {
    return this.chapters().find((row) => row.seq === this.view().seq) ?? null;
  }

  private buildTranslated(): ChapterTranslation | null {
    const chapter = this.chapter();
    return chapter ? (this.translation.of(this.novelId()).chapters[chapter.id] ?? null) : null;
  }

  private buildRows(): ParagraphRow[] {
    const only = this.onlyReview();
    return this.source().filter((paragraph) => !only || this.passageOf(paragraph.n)?.state === "review");
  }

  private syncSource(): void {
    const chapter = this.chapter();
    const id = this.novelId();
    untracked(this.loadSource.bind(this, id, chapter));
  }

  private async loadSource(novelId: number, chapter: ChapterRow | null): Promise<void> {
    const token = ++this.token;
    if (!chapter) {
      this.source.set([]);
      return;
    }
    try {
      const rows = await this.novels.readChapter(novelId, chapter.id);
      if (token === this.token) {
        this.source.set(rows);
      }
    } catch {
      if (token === this.token) {
        this.source.set([]);
      }
    }
  }

  private syncFocus(): void {
    const target = this.view().focus;
    if (target !== null && this.source().length > 0) {
      untracked(this.revealPassage.bind(this, target));
    }
  }

  private revealPassage(target: number): void {
    this.translation.consumeFocus(this.novelId());
    this.editing.set(null);
    this.flash.set(target);
    setTimeout(this.scrollToPassage.bind(this, target), 0);
  }

  private scrollToPassage(target: number): void {
    document.getElementById(`ntp-${this.novelId()}-${target}`)?.scrollIntoView({ block: "center" });
  }

  private syncEditor(): void {
    const area = this.editor();
    if (area) {
      const element = area.nativeElement;
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    }
  }

  private syncNote(): void {
    this.noteInput()?.nativeElement.focus();
  }
}
