import { Component, computed, effect, inject, input } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { TabsService } from "../../../../layout/tabs.service";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nService } from "../../../core/i18n/i18n.service";
import { ToastService } from "../../../core/toast/toast.service";
import { checkCoverFile } from "../novel.cover";
import { prepareCover } from "../novel.cover";
import { NovelDialogsService } from "../novel.dialogs.service";
import { NOVEL_LANG_KEYS } from "../novel.labels";
import { NovelField } from "../novel.models";
import { NovelLang } from "../novel.models";
import { NovelOrigin } from "../novel.models";
import { NovelPatch } from "../novel.models";
import { NovelSummary } from "../novel.models";
import { MAX_TAGS } from "../novel.rules";
import { NOVEL_LANGS } from "../novel.rules";
import { displayName } from "../novel.rules";
import { fieldPatch } from "../novel.rules";
import { formatCount } from "../novel.rules";
import { formatStamp } from "../novel.rules";
import { hasCustomName } from "../novel.rules";
import { normTag } from "../novel.rules";
import { toNovelError } from "../novel.rules";
import { NovelService } from "../novel.service";
import { NovelCover, coverColorsFor } from "./cover.component";
import { NovelProgressFrac } from "./progress-frac.component";

type EditableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const ORIGIN_KEYS: Record<NovelOrigin, I18nKey> = {
  created: "novel.origin.created",
  imported: "novel.origin.imported",
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
  selector: "app-novel-panel",
  standalone: true,
  imports: [Icon, I18nPipe, NovelCover, NovelProgressFrac],
  templateUrl: "./novel.panel.html",
  host: { "data-testid": "novel-panel" },
})
export class NovelPanel {
  private readonly novels = inject(NovelService);
  private readonly dialogs = inject(NovelDialogsService);
  private readonly tabs = inject(TabsService);
  private readonly toasts = inject(ToastService);
  private readonly i18n = inject(I18nService);

  readonly novelId = input<number | null>(null);
  readonly showOpen = input(false);

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
    return novel.author.trim() || this.i18n.translate("novel.author.unknown");
  }

  colorsOf(novel: NovelSummary): string[] {
    return coverColorsFor(novel.id);
  }

  imageOf(novel: NovelSummary): string {
    return this.novels.coverUrl(novel) ?? "";
  }

  wordsOf(novel: NovelSummary): string {
    return formatCount(novel.wordCount);
  }

  chaptersOf(novel: NovelSummary): string {
    return formatCount(novel.chapterCount);
  }

  langKey(lang: NovelLang): I18nKey {
    return NOVEL_LANG_KEYS[lang];
  }

  originKey(novel: NovelSummary): I18nKey {
    return ORIGIN_KEYS[novel.origin];
  }

  stampOf(novel: NovelSummary): string {
    return formatStamp(novel.updatedAt);
  }

  coverKey(): I18nKey {
    return this.hasCover() ? "novel.panel.coverChange" : "novel.panel.coverChoose";
  }

  openNovel(novel: NovelSummary): void {
    this.tabs.openNovel(novel.id, displayName(novel));
  }

  requestDelete(novel: NovelSummary): void {
    this.dialogs.openDelete([novel.id]);
  }

  async onField(novel: NovelSummary, field: NovelField, event: Event): Promise<void> {
    const element = event.target as EditableElement;
    const patch = fieldPatch(novel, field, element.value);
    if (patch === null) {
      element.value = novel.title;
      this.toasts.show(this.i18n.translate("novel.form.titleEmpty"), "warning");
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
    element.value = "";
    const result = await this.addTag(novel.id, raw);
    if (result === "added") {
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
    input.value = "";
    if (!file) {
      return;
    }
    const check = checkCoverFile(file);
    if (check === "notImage") {
      this.toasts.show(this.i18n.translate("novel.toast.notImage"), "warning");
    } else if (check === "tooLarge") {
      this.toasts.show(this.i18n.translate("novel.toast.imageTooLarge"), "warning");
    } else {
      await this.applyCover(novel.id, file);
    }
  }

  async clearCover(novel: NovelSummary): Promise<void> {
    try {
      await this.novels.clearCover(novel.id);
      this.toasts.show(this.i18n.translate("novel.toast.coverRemoved"));
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
      return "failed";
    }
  }

  private notifyTag(result: string, tag: string): void {
    if (result === "duplicate") {
      this.toasts.show(this.i18n.translate("novel.toast.tagExists", { tag }), "warning");
    } else if (result === "limit") {
      this.toasts.show(this.i18n.translate("novel.toast.tagLimit", { count: MAX_TAGS }), "warning");
    }
  }

  private async applyCover(id: number, file: File): Promise<void> {
    let dataUrl: string;
    try {
      dataUrl = await prepareCover(file);
    } catch {
      this.toasts.show(this.i18n.translate("novel.toast.imageUnreadable"), "warning");
      return;
    }
    try {
      await this.novels.setCover(id, dataUrl);
      this.toasts.show(this.i18n.translate("novel.toast.coverChanged"));
    } catch (cause) {
      this.fail(cause);
    }
  }

  private fail(cause: unknown): void {
    const detail = toNovelError(cause).detail;
    this.toasts.show(this.i18n.translate("novel.error.generic", { detail }), "danger");
  }

  private loadCover(): void {
    const novel = this.novel();
    if (novel) {
      this.novels.ensureCover(novel);
    }
  }

  private buildActiveId(): number | null {
    return this.novelId() ?? this.novels.selectedIds()[0] ?? null;
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
