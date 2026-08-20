import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from "@angular/core";
import { Icon } from "@components/icon";
import { LanguageKey } from "@app/core/language/language.models";
import { CoreModule } from "@app/core/core.module";
import { LanguageService } from "@app/core/language/language.service";
import { ToastService } from "@app/core/toast/toast.service";
import { ChapterRow, NovelSummary, ParagraphRow, ParagraphSaveResult } from "../novel.models";
import { NovelService } from "../novel.service";
import { NOVEL_LANG_KEYS, toNovelError } from "../novel.rules";
import { ChapterTranslation, PassageState, PassageTranslation, TranslationView, TranslationWarning } from "../novel.translation.models";
import { passageState, warningReason, warningsOfPassage } from "../novel.translation.rules";
import { NovelTranslationService } from "../novel.translation.service";

const SAVE_NOTICES: Record<ParagraphSaveResult, LanguageKey | null> = {
  saved: "novel.translation.result.saved",
  empty: "novel.reader.empty",
  unchanged: "novel.reader.unchanged",
  idle: null,
};

@Component({
  selector: "app-novel-translation-result",
  standalone: true,
  imports: [Icon, CoreModule],
  templateUrl: "./translation-result.component.html",
})
export class NovelTranslationResult {
  private readonly novels = inject(NovelService);
  private readonly languageService = inject(LanguageService);
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
    const note = this.translation.of(this.novelId()).chapters[row.id] ? "" : this.languageService.translate("novel.translation.result.untranslated");
    return `${this.languageService.translate("novel.translation.result.chapterOption", { n: row.seq, title: row.title })}${note}`;
  }

  passageOf(n: number): PassageTranslation | null {
    return this.translated()?.passages[n] ?? null;
  }

  stateOf(n: number): PassageState {
    const chapter = this.chapter();
    return chapter ? passageState(this.translation.warningsOf(this.novelId()), chapter.id, n) : "ok";
  }

  warningsOf(n: number): TranslationWarning[] {
    const chapter = this.chapter();
    return chapter ? warningsOfPassage(this.translation.warningsOf(this.novelId()), chapter.id, n) : [];
  }

  reasonOf(warning: TranslationWarning): string {
    const reason = warningReason(warning, this.translation.of(this.novelId()).dict);
    return this.languageService.translate(reason.key, reason.params);
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
        this.toasts.show(this.languageService.translate(key), result === "saved" ? "success" : "warning");
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
    this.toasts.show(this.languageService.translate("novel.error.generic", { detail }), "danger");
  }

  private buildTargetKey(): LanguageKey {
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
    return this.source().filter((paragraph) => !only || this.stateOf(paragraph.n) === "review");
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
