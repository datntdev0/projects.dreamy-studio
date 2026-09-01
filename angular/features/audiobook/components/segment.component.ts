import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';

import { BLOCK_TYPES } from '../../scripting/scripting.rules';
import { AudiobookDialogsService } from '../audiobook.dialogs.service';
import { SegmentRow, StaleReason } from '../audiobook.models';
import { AudiobookPlayerService } from '../audiobook.player.service';
import { AudiobookService } from '../audiobook.service';
import { AudiobookLabels, STATE_BADGES, stateKey } from './audiobook.labels';
import { AudiobookNavigation } from './audiobook.navigation';
import { SegmentAction, SegmentActionKind, segmentActions } from './segment.rules';

const NO_DURATION = '—';

interface ReasonView {
  reason: StaleReason;
  text: string;
}

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
  private readonly dialogs = inject(AudiobookDialogsService);
  private readonly navigation = inject(AudiobookNavigation);
  private readonly toasts = inject(ToastService);
  private readonly languageService = inject(LanguageService);

  readonly projectId = input.required<number>();
  readonly row = input.required<SegmentRow>();
  readonly definition = computed(this.buildDefinition.bind(this));
  readonly stateLabel = computed(this.buildStateLabel.bind(this));
  readonly stateClass = computed(this.buildStateClass.bind(this));
  readonly playing = computed(this.buildPlaying.bind(this));
  readonly progress = computed(this.buildProgress.bind(this));
  readonly duration = computed(this.buildDuration.bind(this));
  readonly flagNote = computed(this.buildFlagNote.bind(this));
  readonly reasons = computed(this.buildReasons.bind(this));
  readonly actions = computed(this.buildActions.bind(this));

  play(): void {
    this.player.playSegment(this.projectId(), this.row().block.id);
  }

  run(kind: SegmentActionKind): void {
    const blockId = this.row().block.id;
    const projectId = this.projectId();
    switch (kind) {
      case 'regen':
        this.regenerate(projectId, blockId);
        break;
      case 'flag':
        this.toggleFlag(projectId, blockId);
        break;
      default:
        this.navigation.editBlock(projectId, blockId);
    }
  }

  private regenerate(projectId: number, blockId: string): void {
    if (this.audiobook.regenerate(projectId, blockId) === 'blocked') {
      const first = this.audiobook.contextOf(projectId)?.blockers[0];
      if (first) {
        this.toasts.show(this.audiobook.messageText(first.message), 'warning');
      }
    }
  }

  private toggleFlag(projectId: number, blockId: string): void {
    if (this.row().record?.flag) {
      this.audiobook.clearFlag(projectId, blockId);
    } else {
      this.dialogs.openFlag(projectId, blockId);
    }
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

  private buildReasons(): ReasonView[] {
    return this.row().reasons.map((reason) => ({
      reason,
      text: this.audiobook.reasonText(reason),
    }));
  }

  private buildActions(): SegmentAction[] {
    return segmentActions(this.row());
  }

  private buildProgress(): string | null {
    return this.playing() ? `${this.player.itemPercent()}%` : null;
  }
}
