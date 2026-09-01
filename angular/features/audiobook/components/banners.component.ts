import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';

import { AudiobookContext, Blocker } from '../audiobook.models';
import { AudiobookService } from '../audiobook.service';
import { AudiobookLabels } from './audiobook.labels';
import { AudiobookNavigation } from './audiobook.navigation';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-banners',
  imports: [Icon, CoreModule],
  templateUrl: './banners.component.html',
})
export class AudiobookBanners {
  protected readonly labels = inject(AudiobookLabels);
  private readonly audiobook = inject(AudiobookService);
  private readonly navigation = inject(AudiobookNavigation);

  readonly ctx = input.required<AudiobookContext>();

  editBlock(blocker: Blocker): void {
    if (blocker.blockId) {
      this.navigation.editBlock(this.ctx().projectId, blocker.blockId);
    }
  }

  openVoices(): void {
    this.audiobook.setMode(this.ctx().projectId, 'voices');
  }
}
