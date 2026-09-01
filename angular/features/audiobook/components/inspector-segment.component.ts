import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { ToastService } from '@shared/toast/toast.service';

import { BLOCK_TYPES } from '../../scripting/scripting.rules';
import { AudiobookDialogsService } from '../audiobook.dialogs.service';
import { AudiobookContext, SegmentPanel } from '../audiobook.models';
import { AudiobookPlayerService } from '../audiobook.player.service';
import { AudiobookService } from '../audiobook.service';
import { STATE_BADGES, stateKey } from './audiobook.labels';
import { AudiobookInspectorActions } from './inspector.actions';
import { AudiobookInspectorLabels, EMPTY_VALUE } from './inspector.labels';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-inspector-segment',
  host: { 'data-testid': 'audiobook-inspector-segment' },
  imports: [Icon, CoreModule],
  templateUrl: './inspector-segment.component.html',
})
export class AudiobookInspectorSegment {
  private readonly audiobook = inject(AudiobookService);
  private readonly player = inject(AudiobookPlayerService);
  private readonly dialogs = inject(AudiobookDialogsService);
  private readonly actions = inject(AudiobookInspectorActions);
  private readonly toasts = inject(ToastService);
  readonly labels = inject(AudiobookInspectorLabels);

  readonly ctx = input.required<AudiobookContext>();
  readonly panel = input.required<SegmentPanel>();
  readonly empty = EMPTY_VALUE;
  readonly def = computed(this.buildDef.bind(this));
  readonly stateKey = computed(this.buildStateKey.bind(this));
  readonly badge = computed(this.buildBadge.bind(this));
  readonly speaker = computed(this.buildSpeaker.bind(this));
  readonly engineLine = computed(this.buildEngineLine.bind(this));
  readonly reasons = computed(this.buildReasons.bind(this));

  play(): void {
    this.player.playSegment(this.ctx().projectId, this.panel().row.block.id);
  }

  regenerate(): void {
    const projectId = this.ctx().projectId;
    const result = this.audiobook.regenerate(projectId, this.panel().row.block.id);
    const blocker = this.ctx().blockers[0];
    if (result === 'blocked' && blocker) {
      this.toasts.show(this.audiobook.messageText(blocker.message), 'warning');
    }
  }

  flag(): void {
    this.dialogs.openFlag(this.ctx().projectId, this.panel().row.block.id);
  }

  clearFlag(): void {
    this.audiobook.clearFlag(this.ctx().projectId, this.panel().row.block.id);
  }

  editScript(): void {
    this.actions.openScript(this.ctx(), this.panel().row.block.id);
  }

  private buildDef(): (typeof BLOCK_TYPES)[keyof typeof BLOCK_TYPES] {
    return BLOCK_TYPES[this.panel().row.block.type];
  }

  private buildStateKey(): LanguageKey {
    return stateKey(this.panel().row.state);
  }

  private buildBadge(): string {
    return STATE_BADGES[this.panel().row.state];
  }

  private buildSpeaker(): string {
    return this.labels.speakerName(this.panel().row.speaker);
  }

  private buildEngineLine(): string {
    const panel = this.panel();
    const issue = panel.issue ? ` · ${this.audiobook.issueText(panel.issue)}` : '';
    return `${panel.engineName ?? ''}${panel.usable ? '' : issue}`;
  }

  private buildReasons(): string[] {
    return this.panel().row.reasons.map((reason) => this.audiobook.reasonText(reason));
  }
}
