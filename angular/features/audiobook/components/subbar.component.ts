import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CoreModule } from '@shared/core.module';

import { AudiobookContext } from '../audiobook.models';
import { AudiobookLabels } from './audiobook.labels';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-subbar',
  imports: [CoreModule],
  templateUrl: './subbar.component.html',
})
export class AudiobookSubbar {
  protected readonly labels = inject(AudiobookLabels);

  readonly ctx = input.required<AudiobookContext>();
  readonly stats = computed(this.buildStats.bind(this));

  private buildStats(): string[] {
    return this.labels.stats(this.ctx());
  }
}
