import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';

import { AudiobookContext, RailRow } from '../audiobook.models';
import { AudiobookService } from '../audiobook.service';
import { AudiobookLabels } from './audiobook.labels';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-rail',
  imports: [Icon, CoreModule],
  templateUrl: './rail.component.html',
})
export class AudiobookRail {
  protected readonly labels = inject(AudiobookLabels);
  private readonly audiobook = inject(AudiobookService);

  readonly ctx = input.required<AudiobookContext>();
  readonly unit = computed(this.buildUnit.bind(this));
  readonly unitLower = computed(this.buildUnitLower.bind(this));

  select(row: RailRow): void {
    this.audiobook.selectUnit(this.ctx().projectId, row.unit.id);
  }

  selectOnKey(event: Event, row: RailRow): void {
    event.preventDefault();
    this.select(row);
  }

  private buildUnit(): string {
    return this.labels.unit(this.ctx());
  }

  private buildUnitLower(): string {
    return this.labels.unitLower(this.ctx());
  }
}
