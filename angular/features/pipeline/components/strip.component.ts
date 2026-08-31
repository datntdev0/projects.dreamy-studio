import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { PipelineSnapshot } from '@features/novel/novel.translation.models';
import { LanguageService } from '@shared/language/language.service';

import { PipelineBar } from '../pipeline.models';
import { barOf } from '../pipeline.rules';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-pipeline-strip',
  templateUrl: './strip.component.html',
})
export class PipelineStrip {
  private readonly languageService = inject(LanguageService);

  readonly pipeline = input.required<PipelineSnapshot>();
  readonly bar = computed(this.buildBar.bind(this));
  readonly label = computed(this.buildLabel.bind(this));

  private buildBar(): PipelineBar {
    return barOf(this.pipeline());
  }

  private buildLabel(): string {
    const pipeline = this.pipeline();
    return this.languageService.translate('pipeline.strip.label', {
      done: pipeline.done,
      total: pipeline.total,
    });
  }
}
