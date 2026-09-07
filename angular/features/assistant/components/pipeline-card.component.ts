import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icon } from '@components/icon';
import { PipelineKindMeta } from '@features/pipeline/pipeline.models';
import { PIPELINE_KINDS } from '@features/pipeline/pipeline.rules';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

// prettier-ignore
import { PipelineRun, PipelineRunLaunch, ProposalResolution, ProposalStatus } from '../assistant.models';
import { canRun, PIPELINE_MODE_KEYS, runKindOf, STATUS_KEYS } from '../assistant.proposals';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-assistant-pipeline-card',
  imports: [Icon, CoreModule],
  templateUrl: './pipeline-card.component.html',
})
export class AssistantPipelineCard {
  readonly run = input.required<PipelineRun>();
  readonly messageId = input.required<string>();
  readonly busy = input(false);
  readonly launched = output<PipelineRunLaunch>();
  readonly resolved = output<ProposalResolution>();
  readonly opened = output<number>();

  readonly kind = computed(this.buildKind.bind(this));
  readonly modeKey = computed(this.buildModeKey.bind(this));
  readonly runnable = computed(this.buildRunnable.bind(this));

  statusKey(status: ProposalStatus): LanguageKey {
    return STATUS_KEYS[status];
  }

  start(): void {
    if (this.runnable() && !this.busy()) {
      this.launched.emit({ messageId: this.messageId(), run: this.run() });
    }
  }

  reject(): void {
    const run = this.run();
    if (run.status === 'pending' && !this.busy()) {
      this.resolved.emit({ messageId: this.messageId(), itemIds: [run.id], status: 'rejected' });
    }
  }

  open(): void {
    const pipelineId = this.run().pipelineId;
    if (pipelineId !== null) {
      this.opened.emit(pipelineId);
    }
  }

  private buildKind(): PipelineKindMeta {
    return PIPELINE_KINDS[runKindOf(this.run())];
  }

  private buildModeKey(): LanguageKey | null {
    const mode = this.run().mode;
    return mode === null ? null : (PIPELINE_MODE_KEYS[mode] ?? null);
  }

  private buildRunnable(): boolean {
    return canRun(this.run());
  }
}
