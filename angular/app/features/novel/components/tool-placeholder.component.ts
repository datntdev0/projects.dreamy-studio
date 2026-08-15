import { Component, computed, inject, input } from "@angular/core";
import { Cover } from "../../../../components/cover";
import { Icon } from "../../../../components/icon";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { NovelToolKind } from "../../../../layout/layout.models";
import { NovelSummary } from "../novel.models";
import { NovelService } from "../novel.service";
import { displayName } from "../novel.rules";

@Component({
  selector: "app-novel-tool-placeholder",
  standalone: true,
  imports: [Cover, Icon, I18nPipe],
  templateUrl: "./tool-placeholder.component.html",
})
export class NovelToolPlaceholder {
  private readonly novels = inject(NovelService);

  readonly kind = input.required<NovelToolKind>();
  readonly novelId = input.required<number>();

  readonly novel = computed(this.findNovel.bind(this));
  readonly cover = computed(this.buildCover.bind(this));
  readonly icon = computed(this.buildIcon.bind(this));
  readonly titleKey = computed(this.buildTitleKey.bind(this));
  readonly descriptionKey = computed(this.buildDescriptionKey.bind(this));

  nameOf(novel: NovelSummary): string {
    return displayName(novel);
  }

  private findNovel(): NovelSummary | null {
    return this.novels.novelById(this.novelId()) ?? null;
  }

  private buildCover(): string {
    const novel = this.novel();
    return novel ? (this.novels.coverUrl(novel) ?? "") : "";
  }

  private buildIcon(): string {
    return this.kind() === "translation" ? "lang" : "graph";
  }

  private buildTitleKey(): I18nKey {
    return this.kind() === "translation" ? "novel.tool.translation.title" : "novel.tool.knowledge.title";
  }

  private buildDescriptionKey(): I18nKey {
    return this.kind() === "translation" ? "novel.tool.translation.description" : "novel.tool.knowledge.description";
  }
}
