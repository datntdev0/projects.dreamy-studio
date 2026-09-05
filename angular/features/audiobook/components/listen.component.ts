import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { AudiobookContext } from '../audiobook.models';
import { AudiobookPlayerService } from '../audiobook.player.service';
import { AudiobookLabels } from './audiobook.labels';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-listen',
  imports: [Icon, CoreModule],
  templateUrl: './listen.component.html',
  host: { 'data-testid': 'audiobook-listen' },
})
export class AudiobookListen {
  protected readonly labels = inject(AudiobookLabels);
  private readonly player = inject(AudiobookPlayerService);
  private readonly toasts = inject(ToastService);
  private readonly languageService = inject(LanguageService);

  readonly ctx = input.required<AudiobookContext>();
  readonly active = computed(this.buildActive.bind(this));
  readonly playing = computed(this.buildPlaying.bind(this));

  toggle(): void {
    if (this.active()) {
      this.player.toggle();
      return;
    }
    if (!this.player.playChapter(this.ctx().projectId)) {
      this.toasts.show(this.languageService.translate('audiobook.editor.toast.noAudio'), 'warning');
    }
  }

  private buildActive(): boolean {
    const state = this.player.state();
    const unitId = this.ctx().unit?.id;
    return state.queue.length > 1 && state.queue.every((item) => item.unitId === unitId);
  }

  private buildPlaying(): boolean {
    return this.active() && this.player.playing();
  }
}
