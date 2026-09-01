import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CoreModule } from '@shared/core.module';

import { AudiobookContext, SegmentFilter } from '../audiobook.models';
import { AudiobookService } from '../audiobook.service';
import { AudiobookLabels } from './audiobook.labels';

interface FilterOption {
  filter: SegmentFilter;
  labelKey:
    | 'audiobook.editor.filter.all'
    | 'audiobook.editor.filter.todo'
    | 'audiobook.editor.filter.stale'
    | 'audiobook.editor.filter.flag';
}

const FILTERS: FilterOption[] = [
  { filter: 'all', labelKey: 'audiobook.editor.filter.all' },
  { filter: 'todo', labelKey: 'audiobook.editor.filter.todo' },
  { filter: 'stale', labelKey: 'audiobook.editor.filter.stale' },
  { filter: 'flag', labelKey: 'audiobook.editor.filter.flag' },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-subbar',
  imports: [CoreModule],
  templateUrl: './subbar.component.html',
})
export class AudiobookSubbar {
  protected readonly labels = inject(AudiobookLabels);
  private readonly audiobook = inject(AudiobookService);

  readonly ctx = input.required<AudiobookContext>();
  readonly filters = FILTERS;
  readonly stats = computed(this.buildStats.bind(this));

  setFilter(filter: SegmentFilter): void {
    this.audiobook.setFilter(this.ctx().projectId, filter);
  }

  private buildStats(): string[] {
    return this.labels.stats(this.ctx());
  }
}
