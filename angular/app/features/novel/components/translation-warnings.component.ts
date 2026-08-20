import { Component, computed, inject, input, signal } from "@angular/core";
import { Icon } from "@components/icon";
import { I18nKey } from "@app/core/i18n/i18n.models";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { I18nService } from "@app/core/i18n/i18n.service";
import { ToastService } from "@app/core/toast/toast.service";
import { NovelReaderService } from "../novel.reader.service";
import { toNovelError } from "../novel.rules";
import { TranslationWarning, WarningFilter, WarningKind } from "../novel.translation.models";
import { WARNING_FILTERS, WARNING_FILTER_KEYS, WARNING_KIND_BADGES, WARNING_KIND_KEYS, filterWarnings, warningReason } from "../novel.translation.rules";
import { NovelTranslationService } from "../novel.translation.service";

@Component({
  selector: "app-novel-translation-warnings",
  standalone: true,
  imports: [Icon, I18nPipe],
  templateUrl: "./translation-warnings.component.html",
})
export class NovelTranslationWarnings {
  private readonly i18n = inject(I18nService);
  private readonly toasts = inject(ToastService);
  private readonly reader = inject(NovelReaderService);
  private readonly translation = inject(NovelTranslationService);

  readonly novelId = input.required<number>();
  readonly filters = WARNING_FILTERS;
  readonly filter = signal<WarningFilter>("all");

  readonly all = computed(this.buildAll.bind(this));
  readonly rows = computed(this.buildRows.bind(this));

  filterKey(filter: WarningFilter): I18nKey {
    return WARNING_FILTER_KEYS[filter];
  }

  filterCount(filter: WarningFilter): number {
    return filterWarnings(this.all(), filter).length;
  }

  kindKey(kind: WarningKind): I18nKey {
    return WARNING_KIND_KEYS[kind];
  }

  kindBadge(kind: WarningKind): string {
    return WARNING_KIND_BADGES[kind];
  }

  reasonOf(warning: TranslationWarning): string {
    const reason = warningReason(warning, this.translation.of(this.novelId()).dict);
    return this.i18n.translate(reason.key, reason.params);
  }

  setFilter(filter: WarningFilter): void {
    this.filter.set(filter);
  }

  openSource(warning: TranslationWarning): void {
    void this.reader.openReader(this.novelId(), warning.seq, warning.n);
  }

  openDictionary(): void {
    this.translation.setStep(this.novelId(), "dict");
  }

  view(warning: TranslationWarning): void {
    this.translation.focusPassage(this.novelId(), warning.seq, warning.n);
  }

  async retranslate(warning: TranslationWarning): Promise<void> {
    await this.run(this.translation.retranslate(this.novelId(), warning.id));
  }

  private async run(work: Promise<void>): Promise<void> {
    try {
      await work;
    } catch (cause) {
      const error = toNovelError(cause);
      const detail = error.detail;
      this.toasts.show(this.i18n.translate("novel.error.generic", { detail }), "danger");
    }
  }

  private buildAll(): TranslationWarning[] {
    return this.translation.of(this.novelId()).warnings;
  }

  private buildRows(): TranslationWarning[] {
    return filterWarnings(this.all(), this.filter());
  }
}
