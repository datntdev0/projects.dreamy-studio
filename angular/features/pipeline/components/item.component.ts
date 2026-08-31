import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { formatStamp } from '@features/novel/novel.rules';
// prettier-ignore
import { PipelineSnapshot, PipelineStatus, PipelineTask } from '@features/novel/novel.translation.models';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

// prettier-ignore
import { durationMs, elapsedMs, etaMs, firstError, formatDuration, isActive, kindIcon, kindKey, kindSize, percentOf, PIPELINE_STATUS_BADGES, PIPELINE_STATUS_KEYS, queuedCount, runningTasks } from '../pipeline.rules';
import { PipelineService } from '../pipeline.service';
import { PipelineStrip } from './strip.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'li[app-pipeline-item]',
  host: {
    class: 'pipe-item',
    'data-testid': 'pipeline-item',
    '[class.is-running]': 'running()',
    '[class.is-selected]': 'selected()',
    '[attr.data-pipeline-id]': 'pipeline().id',
    '[attr.data-status]': 'pipeline().status',
    '[attr.data-kind]': 'pipeline().kind',
  },
  imports: [Icon, CoreModule, PipelineStrip],
  templateUrl: './item.component.html',
})
export class PipelineItem {
  readonly pipelines = inject(PipelineService);

  readonly pipeline = input.required<PipelineSnapshot>();
  readonly selected = input(false);
  readonly now = input(0);
  readonly running = computed(this.isRunning.bind(this));
  readonly percent = computed(this.buildPercent.bind(this));
  readonly active = computed(this.buildActive.bind(this));
  readonly queued = computed(this.buildQueued.bind(this));
  readonly error = computed(this.buildError.bind(this));
  readonly elapsed = computed(this.buildElapsed.bind(this));
  readonly eta = computed(this.buildEta.bind(this));
  readonly duration = computed(this.buildDuration.bind(this));
  readonly stamp = computed(this.buildStamp.bind(this));
  readonly novel = computed(this.buildNovel.bind(this));
  readonly icon = computed(this.buildIcon.bind(this));
  readonly kind = computed(this.buildKind.bind(this));
  readonly iconSize = computed(this.buildIconSize.bind(this));
  readonly badge = computed(this.buildBadge.bind(this));
  readonly statusKey = computed(this.buildStatusKey.bind(this));

  seqOf(task: PipelineTask): number {
    return this.pipelines.chapterOf(this.pipeline().novelId, task.chapterId)?.seq ?? 0;
  }

  taskLabelKey(task: PipelineTask): LanguageKey {
    return task.passage === null ? 'pipeline.task.chapter' : 'pipeline.task.passage';
  }

  open(): void {
    this.pipelines.openLog(this.pipeline().id);
  }

  cancel(): void {
    void this.pipelines.cancel(this.pipeline().id);
  }

  private isRunning(): boolean {
    return isActive(this.pipeline());
  }

  private buildPercent(): number {
    return percentOf(this.pipeline());
  }

  private buildActive(): PipelineTask[] {
    return runningTasks(this.pipeline());
  }

  private buildQueued(): number {
    return queuedCount(this.pipeline());
  }

  private buildError(): string {
    return firstError(this.pipeline());
  }

  private buildElapsed(): string {
    return formatDuration(elapsedMs(this.pipeline(), this.now()));
  }

  private buildEta(): string {
    const eta = etaMs(this.pipeline(), this.now());
    return eta === null ? '' : formatDuration(eta);
  }

  private buildDuration(): string {
    return formatDuration(durationMs(this.pipeline()));
  }

  private buildStamp(): string {
    const pipeline = this.pipeline();
    return formatStamp(pipeline.startedAt ?? pipeline.createdAt);
  }

  private buildNovel(): string {
    return this.pipelines.novelName(this.pipeline().novelId);
  }

  private buildIcon(): string {
    return kindIcon(this.pipeline().kind);
  }

  private buildKind(): LanguageKey | null {
    return kindKey(this.pipeline().kind);
  }

  private buildIconSize(): number {
    return kindSize(this.pipeline().kind);
  }

  private buildBadge(): string {
    return PIPELINE_STATUS_BADGES[this.pipeline().status];
  }

  private buildStatusKey(): LanguageKey {
    const status: PipelineStatus = this.pipeline().status;
    return PIPELINE_STATUS_KEYS[status];
  }
}
