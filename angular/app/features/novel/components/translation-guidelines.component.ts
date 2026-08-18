import { Component, computed, inject, input } from "@angular/core";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { I18nService } from "@app/core/i18n/i18n.service";
import { ToastService } from "@app/core/toast/toast.service";
import { toNovelError } from "../novel.rules";
import { NovelTranslationService } from "../novel.translation.service";

@Component({
  selector: "app-novel-translation-guidelines",
  standalone: true,
  imports: [I18nPipe],
  templateUrl: "./translation-guidelines.component.html",
})
export class NovelTranslationGuidelines {
  private readonly i18n = inject(I18nService);
  private readonly toasts = inject(ToastService);
  private readonly translation = inject(NovelTranslationService);

  readonly novelId = input.required<number>();
  readonly guidelines = computed(this.buildGuidelines.bind(this));

  async save(prompt: string): Promise<void> {
    try {
      const changed = await this.translation.saveGuidelines(this.novelId(), prompt);
      this.announce(changed);
    } catch (cause) {
      const detail = toNovelError(cause).detail;
      this.toasts.show(this.i18n.translate("novel.error.generic", { detail }), "danger");
    }
  }

  private announce(changed: boolean): void {
    if (!changed) {
      this.toasts.show(this.i18n.translate("novel.translation.guide.unchanged"), "warning");
      return;
    }
    const count = this.translation.translatedCountOf(this.novelId());
    this.toasts.show(this.i18n.translate("novel.translation.guide.saved", { count }), "warning");
  }

  private buildGuidelines(): string {
    return this.translation.of(this.novelId()).guidelines;
  }
}
