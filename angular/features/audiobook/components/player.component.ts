import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';

import { AudiobookPlayerService } from '../audiobook.player.service';
import { AudiobookLabels } from './audiobook.labels';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-player',
  imports: [Icon, CoreModule],
  templateUrl: './player.component.html',
})
export class AudiobookPlayer {
  protected readonly player = inject(AudiobookPlayerService);
  private readonly labels = inject(AudiobookLabels);

  readonly title = computed(this.buildTitle.bind(this));
  readonly time = computed(this.buildTime.bind(this));

  private buildTitle(): string {
    const item = this.player.current();
    return item ? this.player.titleOf(item) : '';
  }

  private buildTime(): string {
    return `${this.labels.duration(this.player.elapsed())} / ${this.labels.duration(this.player.total())}`;
  }
}
