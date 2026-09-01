import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { BLOCK_TYPES } from '../../scripting/scripting.rules';
import { SegmentRow } from '../audiobook.models';
import { AudiobookPlayerService } from '../audiobook.player.service';
import { AudiobookService } from '../audiobook.service';
import { AudiobookLabels, STATE_BADGES, stateKey } from './audiobook.labels';
import { AudiobookNavigation } from './audiobook.navigation';

const NO_DURATION = '—';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-segment',
  imports: [Icon, CoreModule],
  templateUrl: './segment.component.html',
})
export class AudiobookSegment {
  protected readonly labels = inject(AudiobookLabels);
  protected readonly player = inject(AudiobookPlayerService);
  private readonly audiobook = inject(AudiobookService);
  private readonly navigation = inject(AudiobookNavigation);
  private readonly toasts = inject(ToastService);
  private readonly languageService = inject(LanguageService);

  readonly projectId = input.required<number>();
  readonly row = input.required<SegmentRow>();
  readonly selected = input(false);
  readonly definition = computed(this.buildDefinition.bind(this));
  readonly stateLabel = computed(this.buildStateLabel.bind(this));
  readonly stateClass = computed(this.buildStateClass.bind(this));
  readonly playing = computed(this.buildPlaying.bind(this));
  readonly progress = computed(this.buildProgress.bind(this));
  readonly duration = computed(this.buildDuration.bind(this));
  readonly flagNote = computed(this.buildFlagNote.bind(this));

  hitTitle(say: string): string {
    return this.languageService.translate('audiobook.editor.hit', { say });
  }

  select(): void {
    this.audiobook.selectSegment(this.projectId(), this.row().block.id);
  }

  selectOnKey(event: Event): void {
    if (event.target === event.currentTarget) {
      this.select();
    }
  }

  play(event: Event): void {
    event.stopPropagation();
    this.player.playSegment(this.projectId(), this.row().block.id);
  }

  regenerate(event: Event): void {
    event.stopPropagation();
    const projectId = this.projectId();
    if (this.audiobook.regenerate(projectId, this.row().block.id) === 'blocked') {
      const first = this.audiobook.contextOf(projectId)?.blockers[0];
      if (first) {
        this.toasts.show(this.audiobook.messageText(first.message), 'warning');
      }
    }
  }

  edit(event: Event): void {
    event.stopPropagation();
    this.navigation.editBlock(this.projectId(), this.row().block.id);
  }

  private buildDefinition(): (typeof BLOCK_TYPES)[keyof typeof BLOCK_TYPES] {
    return BLOCK_TYPES[this.row().block.type];
  }

  private buildStateLabel(): string {
    return this.languageService.translate(stateKey(this.row().state));
  }

  private buildStateClass(): string {
    return STATE_BADGES[this.row().state];
  }

  private buildPlaying(): boolean {
    return this.player.isCurrentSegment(this.row().block.id);
  }

  private buildDuration(): string {
    const record = this.row().record;
    return record ? this.labels.duration(record.dur) : NO_DURATION;
  }

  private buildFlagNote(): string {
    return this.row().record?.flag ?? '';
  }

  private buildProgress(): string | null {
    return this.playing() ? `${this.player.itemPercent()}%` : null;
  }
}
