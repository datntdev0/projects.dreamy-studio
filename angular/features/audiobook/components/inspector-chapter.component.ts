import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { fieldValue, setFieldValue } from '@shared/utils/dom';

import { AudiobookContext, ChapterPanel, ExportFormat, MixField } from '../audiobook.models';
import { clampMix } from '../audiobook.rules';
import { AudiobookService } from '../audiobook.service';
import { AudiobookInspectorLabels, EMPTY_VALUE } from './inspector.labels';
import { EXPORT_FORMATS, MIX_FIELDS } from './inspector.rules';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-inspector-chapter',
  host: { 'data-testid': 'audiobook-inspector-chapter' },
  imports: [Icon, CoreModule],
  templateUrl: './inspector-chapter.component.html',
})
export class AudiobookInspectorChapter {
  private readonly audiobook = inject(AudiobookService);
  private readonly toasts = inject(ToastService);
  private readonly languageService = inject(LanguageService);
  readonly labels = inject(AudiobookInspectorLabels);

  readonly ctx = input.required<AudiobookContext>();
  readonly mixFields = MIX_FIELDS;
  readonly exportFormats = EXPORT_FORMATS;
  readonly empty = EMPTY_VALUE;
  readonly panel = computed(this.buildPanel.bind(this));
  readonly blockers = computed(this.buildBlockers.bind(this));

  changeMix(field: MixField, event: Event): void {
    const value = clampMix(field, parseFloat(fieldValue(event)));
    setFieldValue(event, String(value));
    this.audiobook.setMix(this.ctx().projectId, field, value);
  }

  async exportAs(format: ExportFormat): Promise<void> {
    const path = await this.audiobook.exportUnit(this.ctx().projectId, format);
    if (path) {
      this.toasts.show(
        this.languageService.translate('audiobook.inspector.export.done', { path }),
        'success',
      );
    }
  }

  private buildPanel(): ChapterPanel {
    return this.ctx().chapterPanel;
  }

  private buildBlockers(): string[] {
    return this.panel().blockers.map((blocker) => this.audiobook.messageText(blocker.message));
  }
}
