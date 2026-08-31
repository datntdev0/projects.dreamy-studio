import { NgTemplateOutlet } from '@angular/common';
// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastTone } from '@shared/toast/toast.models';
import { ToastService } from '@shared/toast/toast.service';
import { fieldValue } from '@shared/utils/dom';

// prettier-ignore
import { ChapterRow, NovelSummary, ParagraphRow, ParagraphSaveResult, ReaderLayout, ReaderMode } from '../novel.models';
import { NovelReaderService } from '../novel.reader.service';
import { formatCount, NOVEL_LANG_KEYS, toNovelError } from '../novel.rules';
import { NovelService } from '../novel.service';
import { ChapterTranslation, PassageTranslation } from '../novel.translation.models';
import { passageState } from '../novel.translation.rules';
import { NovelTranslationService } from '../novel.translation.service';
import { NovelLangSwitch } from './lang-switch.component';

interface ResultNotice {
  key: LanguageKey;
  tone: ToastTone;
}

interface ReaderRow {
  index: number;
  source: ParagraphRow | null;
  passage: PassageTranslation | null;
  key: number | null;
}

const MODE_KEYS: Record<ReaderMode, LanguageKey> = {
  read: 'novel.reader.mode.read',
  edit: 'novel.reader.mode.edit',
  write: 'novel.reader.mode.write',
};

function SOURCE_ROW(paragraph: ParagraphRow): ReaderRow {
  return { index: paragraph.n, source: paragraph, passage: null, key: null };
}

function BY_NUMBER(left: number, right: number): number {
  return left - right;
}

const WRITE_NOTICES: Record<ParagraphSaveResult, ResultNotice | null> = {
  saved: { key: 'novel.reader.write.saved', tone: 'success' },
  empty: { key: 'novel.reader.write.empty', tone: 'warning' },
  unchanged: { key: 'novel.reader.unchanged', tone: 'warning' },
  idle: null,
};

const RESULT_NOTICES: Record<ParagraphSaveResult, ResultNotice | null> = {
  saved: { key: 'novel.reader.saved', tone: 'success' },
  empty: { key: 'novel.reader.empty', tone: 'warning' },
  unchanged: { key: 'novel.reader.unchanged', tone: 'warning' },
  idle: null,
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-novel-reader',
  imports: [NgTemplateOutlet, Icon, CoreModule, NovelLangSwitch],
  templateUrl: './reader.component.html',
})
export class NovelReader {
  private readonly novels = inject(NovelService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly translation = inject(NovelTranslationService);

  readonly reader = inject(NovelReaderService);
  readonly novelId = input.required<number>();
  readonly count = formatCount;
  readonly flash = signal<number | null>(null);
  readonly modes: ReaderMode[] = ['read', 'edit', 'write'];
  readonly page = viewChild<ElementRef<HTMLElement>>('page');
  readonly editorRef = viewChild<ElementRef<HTMLTextAreaElement>>('editor');

  readonly novel = computed(this.findNovel.bind(this));
  readonly langName = computed(this.buildLangName.bind(this));
  readonly targetName = computed(this.buildTargetName.bind(this));
  readonly parallel = computed(this.buildParallel.bind(this));
  readonly showTranslation = computed(this.buildShowTranslation.bind(this));
  readonly chapterTranslation = computed(this.buildChapterTranslation.bind(this));
  readonly rows = computed(this.buildRows.bind(this));
  readonly layoutOn = computed(this.buildLayoutOn.bind(this));
  readonly heading = computed(this.buildHeading.bind(this));
  readonly label = computed(this.buildLabel.bind(this));

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
    const value = Number(fieldValue(event));
    this.flash.set(null);
    void this.reader.gotoChapter(Math.floor(value) || 1);
  }

  setLayout(layout: ReaderLayout): void {
    this.reader.setLayout(this.novelId(), layout);
  }

  titleOf(chapter: ChapterRow): string {
    return this.reader.titleOf(this.novelId(), chapter);
  }

  isReview(n: number | null): boolean {
    const chapter = this.reader.current();
    if (n === null) {
      return false;
    }
    const warnings = this.translation.of(
      this.novelId(),
      this.reader.readerTarget(this.novelId()),
    ).warnings;
    return chapter ? passageState(warnings, chapter.id, n) === 'review' : false;
  }

  setMode(mode: ReaderMode): void {
    this.reader.setMode(mode);
  }

  modeKey(mode: ReaderMode): LanguageKey {
    return MODE_KEYS[mode];
  }

  stopWriting(): void {
    this.reader.setMode('read');
  }

  async saveWrite(text: string): Promise<void> {
    try {
      const result = await this.reader.saveChapter(text);
      const entry = WRITE_NOTICES[result];
      if (entry) {
        this.notify(this.languageService.translate(entry.key), entry.tone);
      }
    } catch (cause) {
      const detail = toNovelError(cause).detail;
      this.notify(this.languageService.translate('novel.error.generic', { detail }), 'danger');
    }
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
      if (result === 'empty') {
        input.value = this.reader.current()?.title ?? '';
        this.notify(this.languageService.translate('novel.error.titleEmpty'), 'warning');
      } else if (result === 'saved') {
        this.notify(this.languageService.translate('novel.toast.chapterRenamed'), 'success');
      }
    } catch (cause) {
      const detail = toNovelError(cause).detail;
      this.notify(this.languageService.translate('novel.error.generic', { detail }), 'danger');
    }
  }

  async save(text: string): Promise<void> {
    try {
      this.announce(await this.reader.saveParagraph(text));
    } catch (cause) {
      const detail = toNovelError(cause).detail;
      this.notify(this.languageService.translate('novel.error.generic', { detail }), 'danger');
    }
  }

  private announce(result: ParagraphSaveResult): void {
    const entry = RESULT_NOTICES[result];
    if (entry) {
      this.notify(this.languageService.translate(entry.key), entry.tone);
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
    return novel ? this.languageService.translate(`novel.lang.${novel.lang}`) : '';
  }

  private buildTargetName(): string {
    return this.languageService.translate(
      NOVEL_LANG_KEYS[this.reader.readerTarget(this.novelId())],
    );
  }

  private buildParallel(): boolean {
    return this.reader.view().layout === 'parallel';
  }

  private buildShowTranslation(): boolean {
    return this.parallel() || this.reader.view().lang !== 'src';
  }

  private buildChapterTranslation(): ChapterTranslation | null {
    const chapter = this.reader.current();
    return chapter
      ? (this.translation.of(this.novelId(), this.reader.readerTarget(this.novelId())).chapters[
          chapter.id
        ] ?? null)
      : null;
  }

  private buildLayoutOn(): boolean {
    return this.reader.view().lang !== 'src';
  }

  private buildRows(): ReaderRow[] {
    const source = this.reader.paragraphs();
    if (!this.showTranslation()) {
      return source.map(SOURCE_ROW);
    }
    const passages = this.chapterTranslation()?.passages ?? {};
    const keys = Object.keys(passages).map(Number).sort(BY_NUMBER);
    const rows: ReaderRow[] = [];
    for (let index = 0; index < Math.max(source.length, keys.length); index += 1) {
      const key = keys[index];
      rows.push({
        index: index + 1,
        source: source[index] ?? null,
        passage: key === undefined ? null : passages[key],
        key: key ?? null,
      });
    }
    return rows;
  }

  private buildHeading(): string {
    const chapter = this.reader.current();
    if (!chapter) {
      return '';
    }
    return this.titleOf(chapter);
  }

  private buildLabel(): string {
    if (this.parallel()) {
      return `${this.langName()} ⇄ ${this.targetName()}`;
    }
    return this.showTranslation()
      ? this.languageService.translate('novel.reader.langLabel.translated', {
          lang: this.targetName(),
        })
      : this.langName();
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
    document.getElementById(`rp-${target}`)?.scrollIntoView({ block: 'center' });
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
