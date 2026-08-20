import { Component, computed, inject } from "@angular/core";
import { Icon } from "@components/icon";
import { I18nKey } from "@app/core/i18n/i18n.models";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { I18nService } from "@app/core/i18n/i18n.service";
import { formatStamp } from "@app/features/novel/novel.rules";
import { PipelineSnapshot, PipelineStatus, PipelineTask } from "@app/features/novel/novel.translation.models";
import { PipelineLogEntry } from "../pipeline.models";
import { PipelineStrip } from "./strip.component";
import { PIPELINE_LOG_KEYS, PIPELINE_STATUS_BADGES, PIPELINE_STATUS_KEYS, durationMs, formatClock, formatDuration, kindIcon, kindKey, kindSize, logOf, percentOf } from "../pipeline.rules";
import { PipelineService } from "../pipeline.service";

@Component({
  selector: "app-pipeline-log",
  standalone: true,
  imports: [Icon, I18nPipe, PipelineStrip],
  templateUrl: "./log.component.html",
})
export class PipelineLog {
  private readonly i18n = inject(I18nService);

  readonly pipelines = inject(PipelineService);
  readonly entries = computed(this.buildEntries.bind(this));

  novelOf(pipeline: PipelineSnapshot): string {
    return this.pipelines.novelName(pipeline.novelId);
  }

  iconOf(pipeline: PipelineSnapshot): string {
    return kindIcon(pipeline.kind);
  }

  stampOf(pipeline: PipelineSnapshot): string {
    return formatStamp(pipeline.startedAt ?? pipeline.createdAt);
  }

  sizeOf(pipeline: PipelineSnapshot): number {
    return kindSize(pipeline.kind);
  }

  kindOf(pipeline: PipelineSnapshot): I18nKey | null {
    return kindKey(pipeline.kind);
  }

  statusKey(status: PipelineStatus): I18nKey {
    return PIPELINE_STATUS_KEYS[status];
  }

  statusBadge(status: PipelineStatus): string {
    return PIPELINE_STATUS_BADGES[status];
  }

  percent(pipeline: PipelineSnapshot): number {
    return percentOf(pipeline);
  }

  durationOf(pipeline: PipelineSnapshot): string {
    return formatDuration(durationMs(pipeline));
  }

  clockOf(entry: PipelineLogEntry): string {
    return formatClock(entry.time);
  }

  messageOf(pipeline: PipelineSnapshot, entry: PipelineLogEntry): string {
    const kind = kindKey(pipeline.kind);
    return this.i18n.translate(PIPELINE_LOG_KEYS[entry.kind], {
      id: pipeline.id,
      kind: kind ? this.i18n.translate(kind) : pipeline.kind,
      target: pipeline.target,
      total: pipeline.total,
      done: pipeline.done,
      failed: pipeline.failed,
      status: this.i18n.translate(PIPELINE_STATUS_KEYS[pipeline.status]),
      duration: formatDuration(durationMs(pipeline)),
      label: entry.task ? this.labelOf(pipeline, entry.task) : "",
      progress: entry.task?.progress ?? 0,
      error: entry.task?.error ?? "",
    });
  }

  cancel(): void {
    void this.pipelines.cancel();
  }

  private labelOf(pipeline: PipelineSnapshot, task: PipelineTask): string {
    const chapter = this.pipelines.chapterOf(pipeline.novelId, task.chapterId);
    const key: I18nKey = task.passage === null ? "pipeline.task.chapter" : "pipeline.task.passage";
    const base = this.i18n.translate(key, { seq: chapter?.seq ?? 0, n: task.passage ?? 0 });
    return chapter?.title ? `${base} · ${chapter.title}` : base;
  }

  private buildEntries(): PipelineLogEntry[] {
    const pipeline = this.pipelines.selected();
    return pipeline ? logOf(pipeline) : [];
  }
}
