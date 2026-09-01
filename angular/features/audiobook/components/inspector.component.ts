import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { AudiobookContext } from '../audiobook.models';
import { AudiobookService } from '../audiobook.service';
import { AudiobookInspectorChapter } from './inspector-chapter.component';
import { AudiobookInspectorRules } from './inspector-rules.component';
import { AudiobookInspectorSegment } from './inspector-segment.component';
import { AudiobookInspectorVoices } from './inspector-voices.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-inspector',
  host: { 'data-testid': 'audiobook-inspector' },
  imports: [
    AudiobookInspectorChapter,
    AudiobookInspectorSegment,
    AudiobookInspectorVoices,
    AudiobookInspectorRules,
  ],
  templateUrl: './inspector.component.html',
})
export class AudiobookInspector {
  private readonly audiobook = inject(AudiobookService);

  readonly projectId = input.required<number>();
  readonly ctx = computed(this.buildContext.bind(this));

  private buildContext(): AudiobookContext | null {
    return this.audiobook.contextOf(this.projectId());
  }
}
