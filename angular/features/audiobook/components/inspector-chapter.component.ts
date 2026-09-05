import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { fieldValue, setFieldValue } from '@shared/utils/dom';

import { AudiobookContext, ChapterPanel, MixField } from '../audiobook.models';
import { clampMix } from '../audiobook.rules';
import { AudiobookService } from '../audiobook.service';
import { AudiobookInspectorLabels, EMPTY_VALUE } from './inspector.labels';
import { MIX_FIELDS } from './inspector.rules';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-inspector-chapter',
  host: { 'data-testid': 'audiobook-inspector-chapter' },
  imports: [Icon, CoreModule],
  templateUrl: './inspector-chapter.component.html',
})
export class AudiobookInspectorChapter {
  private readonly audiobook = inject(AudiobookService);
  readonly labels = inject(AudiobookInspectorLabels);

  readonly ctx = input.required<AudiobookContext>();
  readonly mixFields = MIX_FIELDS;
  readonly empty = EMPTY_VALUE;
  readonly panel = computed(this.buildPanel.bind(this));
  readonly blockers = computed(this.buildBlockers.bind(this));

  changeMix(field: MixField, event: Event): void {
    const value = clampMix(field, parseFloat(fieldValue(event)));
    setFieldValue(event, String(value));
    this.audiobook.setMix(this.ctx().projectId, field, value);
  }

  private buildPanel(): ChapterPanel {
    return this.ctx().chapterPanel;
  }

  private buildBlockers(): string[] {
    return this.panel().blockers.map((blocker) => this.audiobook.messageText(blocker.message));
  }
}
