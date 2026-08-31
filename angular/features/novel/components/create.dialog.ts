// prettier-ignore
import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { Button } from '@components/button';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { fieldValue } from '@shared/utils/dom';

import { NovelDialogsService } from '../novel.dialogs.service';
import { NovelFormValue, NovelLang } from '../novel.models';
// prettier-ignore
import { NOVEL_LANG_KEYS, NOVEL_LANGS, titleTooLong, toNovelError, toNovelInput } from '../novel.rules';
import { NovelService } from '../novel.service';

type CreateField = keyof NovelFormValue;

const EMPTY_FORM: NovelFormValue = {
  title: '',
  name: '',
  author: '',
  lang: 'VI',
  description: '',
  tags: '',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-novel-create-dialog',
  imports: [Button, CoreModule],
  templateUrl: './create.dialog.html',
  host: { 'data-testid': 'novel-create-dialog' },
})
export class NovelCreateDialog {
  private readonly novels = inject(NovelService);
  private readonly dialogs = inject(NovelDialogsService);
  private readonly toasts = inject(ToastService);
  private readonly languageService = inject(LanguageService);
  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  readonly open = this.dialogs.createOpen;
  readonly form = signal<NovelFormValue>({ ...EMPTY_FORM });
  readonly titleInvalid = signal(false);
  readonly titleErrorKey = signal<LanguageKey>('novel.form.titleRequired');
  readonly busy = signal(false);
  readonly langs: NovelLang[] = NOVEL_LANGS;

  constructor() {
    effect(this.syncOpen.bind(this));
    effect(this.focusTitle.bind(this));
  }

  langKey(lang: NovelLang) {
    return NOVEL_LANG_KEYS[lang];
  }

  close(): void {
    this.dialogs.closeCreate();
  }

  onInput(field: CreateField, event: Event): void {
    const value = fieldValue(event);
    this.form.set({ ...this.form(), [field]: value });
    if (field === 'title' && value.trim()) {
      this.titleInvalid.set(false);
    }
  }

  onLang(event: Event): void {
    const value = fieldValue(event) as NovelLang;
    this.form.set({ ...this.form(), lang: value });
  }

  async submit(): Promise<void> {
    if (this.busy()) {
      return;
    }
    const value = this.form();
    if (!value.title.trim()) {
      this.flagTitle('novel.form.titleRequired');
      return;
    }
    if (titleTooLong(value.title)) {
      this.flagTitle('novel.form.titleTooLong');
      return;
    }
    this.busy.set(true);
    try {
      const created = await this.novels.create(toNovelInput(value));
      this.novels.select(created.id);
      this.close();
      this.toasts.show(
        this.languageService.translate('novel.toast.created', { title: created.title }),
      );
    } catch (cause) {
      const detail = toNovelError(cause).detail;
      this.toasts.show(this.languageService.translate('novel.error.generic', { detail }), 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  private flagTitle(key: LanguageKey): void {
    this.titleErrorKey.set(key);
    this.titleInvalid.set(true);
  }

  private syncOpen(): void {
    if (this.open()) {
      untracked(this.resetForm.bind(this));
    }
  }

  private resetForm(): void {
    this.form.set({ ...EMPTY_FORM });
    this.titleInvalid.set(false);
    this.busy.set(false);
  }

  private focusTitle(): void {
    const input = this.titleInput();
    if (input) {
      setTimeout(this.focusElement.bind(this, input.nativeElement));
    }
  }

  private focusElement(element: HTMLElement): void {
    element.focus();
  }
}
