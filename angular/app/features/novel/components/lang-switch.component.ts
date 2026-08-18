import { Component, computed, inject, input } from "@angular/core";
import { I18nKey } from "@app/core/i18n/i18n.models";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { NovelLang, NovelSummary, ReaderLang, ReaderView } from "../novel.models";
import { NovelReaderService } from "../novel.reader.service";
import { NovelService } from "../novel.service";
import { NOVEL_LANG_KEYS } from "../novel.rules";
import { targetsOf } from "../novel.translation.rules";

@Component({
  selector: "app-novel-lang-switch",
  standalone: true,
  imports: [I18nPipe],
  templateUrl: "./lang-switch.component.html",
})
export class NovelLangSwitch {
  private readonly novels = inject(NovelService);
  private readonly reader = inject(NovelReaderService);

  readonly novelId = input.required<number>();

  readonly novel = computed(this.findNovel.bind(this));
  readonly view = computed(this.buildView.bind(this));
  readonly targets = computed(this.buildTargets.bind(this));

  nameKey(lang: NovelLang): I18nKey {
    return NOVEL_LANG_KEYS[lang];
  }

  onChange(event: Event): void {
    this.reader.setLang(this.novelId(), (event.target as HTMLSelectElement).value as ReaderLang);
  }

  private findNovel(): NovelSummary | null {
    return this.novels.novelById(this.novelId()) ?? null;
  }

  private buildView(): ReaderView {
    return this.reader.viewOf(this.novelId());
  }

  private buildTargets(): NovelLang[] {
    return targetsOf(this.novel()?.lang);
  }
}
