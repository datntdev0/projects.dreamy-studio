import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CoreModule } from '@shared/core.module';

import { ScriptContext, SourceParagraph } from '../scripting.models';
import { chaptersOf, paragraphNumber } from '../scripting.rules';
import { ScriptingLabels } from './scripting.labels';

export interface DrawerGroup {
  chapter: number;
  paragraphs: SourceParagraph[];
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-drawer',
  imports: [CoreModule],
  templateUrl: './drawer.component.html',
})
export class ScriptingDrawer {
  protected readonly labels = inject(ScriptingLabels);

  readonly ctx = input.required<ScriptContext>();
  readonly groups = computed(this.buildGroups.bind(this));
  readonly range = computed(this.buildRange.bind(this));

  paragraphNo(id: string): number {
    return paragraphNumber(id);
  }

  private buildGroups(): DrawerGroup[] {
    const ctx = this.ctx();
    const list = ctx.source?.list ?? [];
    return chaptersOf(ctx.unit ?? { ch: null, chs: null }).map((chapter) => ({
      chapter,
      paragraphs: list.filter((paragraph) => paragraph.id.startsWith(`${chapter}.`)),
    }));
  }

  private buildRange(): string {
    return this.labels.chapterLabel(chaptersOf(this.ctx().unit ?? { ch: null, chs: null }));
  }
}
