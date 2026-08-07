import { Component, ElementRef, effect, inject, signal, untracked, viewChild } from "@angular/core";
import { Dialog } from "../../../../components/dialog";
import { Button } from "../../../../components/button";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nService } from "../../../core/i18n/i18n.service";
import { ToastService } from "../../../core/toast/toast.service";
import { NovelDialogsService } from "../novel.dialogs.service";
import { NOVEL_LANG_KEYS } from "../novel.labels";
import { NovelFormValue } from "../novel.models";
import { NovelLang } from "../novel.models";
import { NOVEL_LANGS } from "../novel.rules";
import { toNovelError } from "../novel.rules";
import { toNovelInput } from "../novel.rules";
import { NovelService } from "../novel.service";

type CreateField = keyof NovelFormValue;

const EMPTY_FORM: NovelFormValue = {
  title: "",
  name: "",
  author: "",
  lang: "VI",
  description: "",
  tags: "",
};

@Component({
  selector: "app-novel-create-dialog",
  standalone: true,
  imports: [Button, Dialog, I18nPipe],
  templateUrl: "./create.dialog.html",
  host: { "data-testid": "novel-create-dialog" },
})
export class NovelCreateDialog {
  private readonly novels = inject(NovelService);
  private readonly dialogs = inject(NovelDialogsService);
  private readonly toasts = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>("titleInput");

  readonly open = this.dialogs.createOpen;
  readonly form = signal<NovelFormValue>({ ...EMPTY_FORM });
  readonly titleInvalid = signal(false);
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
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.form.set({ ...this.form(), [field]: value });
    if (field === "title" && value.trim()) {
      this.titleInvalid.set(false);
    }
  }

  onLang(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as NovelLang;
    this.form.set({ ...this.form(), lang: value });
  }

  async submit(): Promise<void> {
    if (this.busy()) {
      return;
    }
    const value = this.form();
    if (!value.title.trim()) {
      this.titleInvalid.set(true);
      return;
    }
    this.busy.set(true);
    try {
      const created = await this.novels.create(toNovelInput(value));
      this.novels.select(created.id);
      this.close();
      this.toasts.show(this.i18n.translate("novel.toast.created", { title: created.title }));
    } catch (cause) {
      const detail = toNovelError(cause).detail;
      this.toasts.show(this.i18n.translate("novel.error.generic", { detail }), "danger");
    } finally {
      this.busy.set(false);
    }
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
