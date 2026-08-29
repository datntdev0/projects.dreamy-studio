import { Component, computed, inject } from "@angular/core";
import { Icon } from "@components/icon";
import { LanguageKey } from "@core/language/language.models";
import { CoreModule } from "@core/core.module";
import { LanguageService } from "@core/language/language.service";
import { formatStamp } from "@features/novel/novel.rules";
import { PipelineSnapshot, PipelineStatus, PipelineTask } from "@features/novel/novel.translation.models";
import { PipelineLogEntry } from "../pipeline.models";
import { PipelineStrip } from "./strip.component";
import { PIPELINE_LOG_KEYS, PIPELINE_STATUS_BADGES, PIPELINE_STATUS_KEYS, durationMs, formatClock, formatDuration, isActive, kindIcon, kindKey, kindSize, logOf, percentOf } from "../pipeline.rules";
import { PipelineService } from "../pipeline.service";

@Component({
  selector: "app-pipeline-log",
  standalone: true,
  imports: [Icon, CoreModule, PipelineStrip],
  templateUrl: "./log.component.html",
})
export class PipelineLog {
  private readonly languageService = inject(LanguageService);

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

  kindOf(pipeline: PipelineSnapshot): LanguageKey | null {
    return kindKey(pipeline.kind);
  }

  statusKey(status: PipelineStatus): LanguageKey {
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
    return this.languageService.translate(PIPELINE_LOG_KEYS[entry.kind], {
      id: pipeline.id,
      kind: kind ? this.languageService.translate(kind) : pipeline.kind,
      target: pipeline.target,
      total: pipeline.total,
      done: pipeline.done,
      failed: pipeline.failed,
      status: this.languageService.translate(PIPELINE_STATUS_KEYS[pipeline.status]),
      duration: formatDuration(durationMs(pipeline)),
      label: entry.task ? this.labelOf(pipeline, entry.task) : "",
      progress: entry.task?.progress ?? 0,
      error: entry.task?.error ?? "",
    });
  }

  isActive(pipeline: PipelineSnapshot): boolean {
    return isActive(pipeline);
  }

  cancel(): void {
    const pipeline = this.pipelines.selected();
    if (pipeline) {
      void this.pipelines.cancel(pipeline.id);
    }
  }

  private labelOf(pipeline: PipelineSnapshot, task: PipelineTask): string {
    const chapter = this.pipelines.chapterOf(pipeline.novelId, task.chapterId);
    const key: LanguageKey = task.passage === null ? "pipeline.task.chapter" : "pipeline.task.passage";
    const base = this.languageService.translate(key, { seq: chapter?.seq ?? 0, n: task.passage ?? 0 });
    return chapter?.title ? `${base} · ${chapter.title}` : base;
  }

  private buildEntries(): PipelineLogEntry[] {
    const pipeline = this.pipelines.selected();
    return pipeline ? logOf(pipeline) : [];
  }
}
