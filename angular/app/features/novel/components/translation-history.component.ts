import { Component, computed, effect, inject, input, signal, untracked } from "@angular/core";
import { I18nKey } from "@app/core/i18n/i18n.models";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { ChapterRow } from "../novel.models";
import { NovelService } from "../novel.service";
import { formatStamp } from "../novel.rules";
import { PipelineSnapshot, PipelineStatus, PipelineTask } from "../novel.translation.models";
import { PIPELINE_STATUS_BADGES, PIPELINE_STATUS_KEYS } from "../novel.translation.rules";
import { NovelTranslationService } from "../novel.translation.service";

@Component({
  selector: "app-novel-translation-history",
  standalone: true,
  imports: [I18nPipe],
  templateUrl: "./translation-history.component.html",
})
export class NovelTranslationHistory {
  private readonly novels = inject(NovelService);
  readonly translation = inject(NovelTranslationService);

  readonly novelId = input.required<number>();
  readonly expanded = signal<number | null>(null);
  readonly pipelines = computed(this.buildPipelines.bind(this));

  constructor() {
    effect(this.load.bind(this));
  }

  stampOf(pipeline: PipelineSnapshot): string {
    return formatStamp(pipeline.startedAt ?? pipeline.createdAt);
  }

  statusKey(status: PipelineStatus): I18nKey {
    return PIPELINE_STATUS_KEYS[status];
  }

  badgeOf(status: PipelineStatus): string {
    return PIPELINE_STATUS_BADGES[status];
  }

  snapshotOf(pipeline: PipelineSnapshot): PipelineSnapshot {
    const active = this.translation.active();
    return active?.id === pipeline.id ? active : pipeline;
  }

  failedTasks(pipeline: PipelineSnapshot): PipelineTask[] {
    return this.snapshotOf(pipeline).tasks.filter(this.isFailed.bind(this));
  }

  seqOf(task: PipelineTask): number {
    return this.chapterOf(task)?.seq ?? 0;
  }

  passageOf(task: PipelineTask): number {
    return task.passage ?? 0;
  }

  toggle(pipeline: PipelineSnapshot): void {
    this.expanded.set(this.expanded() === pipeline.id ? null : pipeline.id);
  }

  isExpanded(pipeline: PipelineSnapshot): boolean {
    return this.expanded() === pipeline.id;
  }

  private load(): void {
    const novelId = this.novelId();
    untracked(this.translation.loadHistory.bind(this.translation, novelId));
  }

  private buildPipelines(): PipelineSnapshot[] {
    const pipelines: PipelineSnapshot[] = [];
    const active = this.translation.active();
    for (const pipeline of this.translation.historyOf(this.novelId())) {
      pipelines.push(pipeline);
    }
    if (active?.novelId === this.novelId() && !pipelines.some(this.matchesActive.bind(this, active))) {
      pipelines.unshift(active);
    }
    return pipelines;
  }

  private matchesActive(active: PipelineSnapshot, pipeline: PipelineSnapshot): boolean {
    return active.id === pipeline.id;
  }

  private isFailed(task: PipelineTask): boolean {
    return task.status === "failed";
  }

  private chapterOf(task: PipelineTask): ChapterRow | undefined {
    return this.novels.chaptersOf(this.novelId()).find(this.matchesChapter.bind(this, task.chapterId));
  }

  private matchesChapter(chapterId: string, chapter: ChapterRow): boolean {
    return chapter.id === chapterId;
  }
}
