import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { fieldValue } from '@shared/utils/dom';

import { NovelLang, NovelSummary, ReaderLang, ReaderView } from '../novel.models';
import { NovelReaderService } from '../novel.reader.service';
import { NOVEL_LANG_KEYS } from '../novel.rules';
import { NovelService } from '../novel.service';
import { targetsOf } from '../novel.translation.rules';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-novel-lang-switch',
  imports: [CoreModule],
  templateUrl: './lang-switch.component.html',
})
export class NovelLangSwitch {
  private readonly novels = inject(NovelService);
  private readonly reader = inject(NovelReaderService);

  readonly novelId = input.required<number>();

  readonly novel = computed(this.findNovel.bind(this));
  readonly view = computed(this.buildView.bind(this));
  readonly targets = computed(this.buildTargets.bind(this));

  nameKey(lang: NovelLang): LanguageKey {
    return NOVEL_LANG_KEYS[lang];
  }

  onChange(event: Event): void {
    this.reader.setLang(this.novelId(), fieldValue(event) as ReaderLang);
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
