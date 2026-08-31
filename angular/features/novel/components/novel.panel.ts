// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Cover } from '@components/cover';
import { Icon } from '@components/icon';
import { TabsService } from '@layout/tabs.service';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { NovelConfirmService } from '../novel.confirm.service';
import { checkCoverFile, prepareCover } from '../novel.cover';
import { NovelField, NovelLang, NovelOrigin, NovelPatch, NovelSummary } from '../novel.models';
// prettier-ignore
import { displayName, exportFileName, fieldPatch, fileNameOf, formatCount, formatStamp, hasCustomName, MAX_TAGS, normTag, NOVEL_LANG_KEYS, NOVEL_LANGS, toNovelError } from '../novel.rules';
import { NovelService } from '../novel.service';
import { NovelProgressFrac } from './progress-frac.component';

type EditableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const ORIGIN_KEYS: Record<NovelOrigin, LanguageKey> = {
  created: 'novel.origin.created',
  imported: 'novel.origin.imported',
};

function currentValue(novel: NovelSummary, field: NovelField): string {
  return novel[field];
}

function patchValue(patch: NovelPatch, field: NovelField): string | undefined {
  return patch[field];
}

function fieldOf(patch: NovelPatch): NovelField {
  const keys = Object.keys(patch) as NovelField[];
  return keys[0];
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-novel-panel',
  imports: [Icon, CoreModule, Cover, NovelProgressFrac],
  templateUrl: './novel.panel.html',
  host: { 'data-testid': 'novel-panel' },
})
export class NovelPanel {
  private readonly novels = inject(NovelService);
  private readonly confirms = inject(NovelConfirmService);
  private readonly tabs = inject(TabsService);
  private readonly toasts = inject(ToastService);
  private readonly languageService = inject(LanguageService);

  readonly novelId = input<number | null>(null);
  readonly showOpen = input(false);
  readonly exporting = signal(false);

  readonly activeId = computed(this.buildActiveId.bind(this));
  readonly novel = computed(this.buildNovel.bind(this));
  readonly suggestions = computed(this.buildSuggestions.bind(this));
  readonly hasCover = computed(this.buildHasCover.bind(this));
  readonly langs: NovelLang[] = NOVEL_LANGS;
  readonly maxTags = MAX_TAGS;

  constructor() {
    effect(this.loadCover.bind(this));
  }

  nameOf(novel: NovelSummary): string {
    return displayName(novel);
  }

  hasOriginal(novel: NovelSummary): boolean {
    return hasCustomName(novel);
  }

  authorOf(novel: NovelSummary): string {
    return novel.author.trim() || this.languageService.translate('novel.author.unknown');
  }

  imageOf(novel: NovelSummary): string {
    return this.novels.coverUrl(novel) ?? '';
  }

  wordsOf(novel: NovelSummary): string {
    return formatCount(novel.wordCount);
  }

  chaptersOf(novel: NovelSummary): string {
    return formatCount(novel.chapterCount);
  }

  langKey(lang: NovelLang): LanguageKey {
    return NOVEL_LANG_KEYS[lang];
  }

  originKey(novel: NovelSummary): LanguageKey {
    return ORIGIN_KEYS[novel.origin];
  }

  stampOf(novel: NovelSummary): string {
    return formatStamp(novel.updatedAt);
  }

  coverKey(): LanguageKey {
    return this.hasCover() ? 'novel.panel.coverChange' : 'novel.panel.coverChoose';
  }

  openNovel(novel: NovelSummary): void {
    this.tabs.openNovel(novel.id, displayName(novel));
  }

  requestDelete(novel: NovelSummary): void {
    this.confirms.deleteNovels([novel.id]);
  }

  exportTipKey(novel: NovelSummary): LanguageKey {
    return novel.chapterCount === 0 ? 'novel.panel.exportEmptyTip' : 'novel.panel.exportTip';
  }

  async exportNovel(novel: NovelSummary): Promise<void> {
    if (this.exporting() || novel.chapterCount === 0) {
      return;
    }
    this.exporting.set(true);
    try {
      await this.saveExport(novel);
    } catch (cause) {
      this.fail(cause);
    } finally {
      this.exporting.set(false);
    }
  }

  private async saveExport(novel: NovelSummary): Promise<void> {
    const path = await this.novels.packageSavePick(exportFileName(novel));
    if (path === null) {
      return;
    }
    const result = await this.novels.packageExport(novel.id, path);
    const file = fileNameOf(result.path);
    this.toasts.show(
      this.languageService.translate('novel.toast.exported', { title: displayName(novel), file }),
    );
  }

  async onField(novel: NovelSummary, field: NovelField, event: Event): Promise<void> {
    const element = event.target as EditableElement;
    const patch = fieldPatch(novel, field, element.value);
    if (patch === null) {
      element.value = novel.title;
      this.toasts.show(this.languageService.translate('novel.form.titleEmpty'), 'warning');
      return;
    }
    if (patchValue(patch, field) === currentValue(novel, field)) {
      element.value = currentValue(novel, field);
      return;
    }
    await this.save(novel, patch, element);
  }

  async onTagEnter(novel: NovelSummary, event: Event): Promise<void> {
    const element = event.target as HTMLInputElement;
    const raw = element.value;
    element.value = '';
    const result = await this.addTag(novel.id, raw);
    if (result === 'added') {
      element.focus();
    }
  }

  async removeTag(novel: NovelSummary, tag: string): Promise<void> {
    try {
      await this.novels.removeTag(novel.id, tag);
    } catch (cause) {
      this.fail(cause);
    }
  }

  async onCoverFile(novel: NovelSummary, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    const check = checkCoverFile(file);
    if (check === 'notImage') {
      this.toasts.show(this.languageService.translate('novel.toast.notImage'), 'warning');
    } else if (check === 'tooLarge') {
      this.toasts.show(this.languageService.translate('novel.toast.imageTooLarge'), 'warning');
    } else {
      await this.applyCover(novel.id, file);
    }
  }

  async clearCover(novel: NovelSummary): Promise<void> {
    try {
      await this.novels.clearCover(novel.id);
      this.toasts.show(this.languageService.translate('novel.toast.coverRemoved'));
    } catch (cause) {
      this.fail(cause);
    }
  }

  private async save(
    novel: NovelSummary,
    patch: NovelPatch,
    element: EditableElement,
  ): Promise<void> {
    try {
      const next = await this.novels.update(novel.id, patch);
      this.tabs.renameNovel(next.id, displayName(next));
    } catch (cause) {
      element.value = currentValue(novel, fieldOf(patch));
      this.fail(cause);
    }
  }

  private async addTag(id: number, raw: string): Promise<string> {
    try {
      const result = await this.novels.addTag(id, raw);
      this.notifyTag(result, normTag(raw));
      return result;
    } catch (cause) {
      this.fail(cause);
      return 'failed';
    }
  }

  private notifyTag(result: string, tag: string): void {
    if (result === 'duplicate') {
      this.toasts.show(this.languageService.translate('novel.toast.tagExists', { tag }), 'warning');
    } else if (result === 'limit') {
      this.toasts.show(
        this.languageService.translate('novel.toast.tagLimit', { count: MAX_TAGS }),
        'warning',
      );
    }
  }

  private async applyCover(id: number, file: File): Promise<void> {
    let dataUrl: string;
    try {
      dataUrl = await prepareCover(file);
    } catch {
      this.toasts.show(this.languageService.translate('novel.toast.imageUnreadable'), 'warning');
      return;
    }
    try {
      await this.novels.setCover(id, dataUrl);
      this.toasts.show(this.languageService.translate('novel.toast.coverChanged'));
    } catch (cause) {
      this.fail(cause);
    }
  }

  private fail(cause: unknown): void {
    const detail = toNovelError(cause).detail;
    this.toasts.show(this.languageService.translate('novel.error.generic', { detail }), 'danger');
  }

  private loadCover(): void {
    const novel = this.novel();
    if (novel) {
      this.novels.ensureCover(novel);
    }
  }

  private buildActiveId(): number | null {
    return this.novelId() ?? this.novels.selectedId();
  }

  private buildNovel(): NovelSummary | null {
    const id = this.activeId();
    return id === null ? null : (this.novels.byId().get(id) ?? null);
  }

  private buildSuggestions(): string[] {
    const novel = this.novel();
    const own = novel ? novel.tags : [];
    const out: string[] = [];
    for (const entry of this.novels.allTags()) {
      if (!own.includes(entry.tag)) {
        out.push(entry.tag);
      }
    }
    return out;
  }

  private buildHasCover(): boolean {
    const novel = this.novel();
    return novel !== null && this.novels.coverUrl(novel) !== null;
  }
}
