import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AudiobookService } from '@features/audiobook/audiobook.service';
import { NovelError, NovelSummary } from '@features/novel/novel.models';
import { displayName, toNovelError } from '@features/novel/novel.rules';
import { NovelService } from '@features/novel/novel.service';
import { PipelineSnapshot } from '@features/novel/novel.translation.models';
import { NovelTranslationService } from '@features/novel/novel.translation.service';
import { ProjectSummary } from '@features/project/project.models';
import { ProjectService } from '@features/project/project.service';
import { ScriptingService } from '@features/scripting/scripting.service';
import { WorkspaceService } from '@features/workspace/workspace.service';
import { LayoutService } from '@layout/layout.service';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';

import { PipelineChapter, PipelineTotals } from './pipeline.models';
import { compareNewestFirst, HISTORY_LIMIT, totalsOf } from './pipeline.rules';

@Injectable({ providedIn: 'root' })
export class PipelineService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly novels = inject(NovelService);
  private readonly translation = inject(NovelTranslationService);
  private readonly audiobook = inject(AudiobookService);
  private readonly projects = inject(ProjectService);
  private readonly scripting = inject(ScriptingService);
  private readonly workspace = inject(WorkspaceService);
  private readonly layout = inject(LayoutService);
  private readonly records = signal<PipelineSnapshot[]>([]);
  private epoch = 0;
  private lastActiveCount = 0;
  private workspacePath: string | null | undefined = undefined;

  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<NovelError | null>(null);
  readonly selectedId = signal<number | null>(null);
  readonly running = computed(this.buildRunning.bind(this));
  readonly totals = computed(this.buildTotals.bind(this));
  readonly history = computed(this.buildHistory.bind(this));
  readonly selected = computed(this.buildSelected.bind(this));

  constructor() {
    effect(this.syncWorkspace.bind(this));
    effect(this.syncActive.bind(this));
  }

  novelName(novelId: number): string {
    const novel = this.novels.novelById(novelId);
    return novel ? displayName(novel) : `#${novelId}`;
  }

  projectName(projectId: number): string {
    return this.projects.projectById(projectId)?.name ?? `#${projectId}`;
  }

  ownerName(pipeline: PipelineSnapshot): string {
    if (pipeline.projectId !== null) {
      return this.projectName(pipeline.projectId);
    }
    return pipeline.novelId === null ? '' : this.novelName(pipeline.novelId);
  }

  chapterOf(pipeline: PipelineSnapshot, chapterId: string): PipelineChapter | undefined {
    if (pipeline.projectId !== null) {
      return this.unitOf(pipeline.projectId, chapterId);
    }
    for (const chapter of pipeline.novelId === null
      ? []
      : this.novels.chaptersOf(pipeline.novelId)) {
      if (chapter.id === chapterId) {
        return { seq: chapter.seq, title: chapter.title };
      }
    }
    return undefined;
  }

  async ensureLoaded(): Promise<void> {
    if (!this.loaded() && !this.loading()) {
      await this.load();
    }
  }

  async load(): Promise<void> {
    const epoch = this.epoch;
    this.loading.set(true);
    this.error.set(null);
    try {
      await Promise.all([this.novels.ensureLoaded(), this.projects.ensureLoaded()]);
      const lists = await Promise.all([
        ...this.novels.novels().map(this.fetchNovel.bind(this)),
        ...this.projects.projects().map(this.fetchProject.bind(this)),
      ]);
      if (epoch === this.epoch) {
        const records = lists.flat().sort(compareNewestFirst);
        this.records.set(records);
        this.loaded.set(true);
        this.loadRunningChapters(records);
      }
    } catch (cause) {
      if (epoch === this.epoch) {
        this.error.set(toNovelError(cause));
      }
    } finally {
      if (epoch === this.epoch) {
        this.loading.set(false);
      }
    }
  }

  select(id: number | null): void {
    this.selectedId.set(id);
    const novelId = this.selected()?.novelId ?? null;
    if (novelId !== null && this.novels.chaptersOf(novelId).length === 0) {
      void this.novels.loadChapters(novelId).catch(this.ignore);
    }
  }

  openLog(id: number): void {
    this.select(id);
    this.layout.showBottomTab('output');
  }

  async cancel(id: number): Promise<void> {
    await this.translation.cancelPipeline(id);
  }

  reset(): void {
    this.epoch += 1;
    this.records.set([]);
    this.selectedId.set(null);
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(null);
    this.lastActiveCount = 0;
  }

  private loadRunningChapters(records: PipelineSnapshot[]): void {
    const novelIds = new Set<number>();
    for (const record of records) {
      const novelId = record.novelId;
      if (
        record.status === 'running' &&
        novelId !== null &&
        this.novels.chaptersOf(novelId).length === 0
      ) {
        novelIds.add(novelId);
      }
    }
    for (const novelId of novelIds) {
      void this.novels.loadChapters(novelId).catch(this.ignore);
    }
  }

  private unitOf(projectId: number, unitId: string): PipelineChapter | undefined {
    const unit = this.scripting.scriptOf(projectId)?.units.find((item) => item.id === unitId);
    return unit ? { seq: unit.no, title: unit.title } : undefined;
  }

  private ignore(): void {
    return;
  }

  private fetchNovel(novel: NovelSummary): Promise<PipelineSnapshot[]> {
    return this.ipc.invoke<PipelineSnapshot[]>('pipeline_history_list', {
      novelId: novel.id,
      limit: HISTORY_LIMIT,
    });
  }

  private fetchProject(project: ProjectSummary): Promise<PipelineSnapshot[]> {
    return this.ipc.invoke<PipelineSnapshot[]>('pipeline_history_list', {
      projectId: project.id,
      limit: HISTORY_LIMIT,
    });
  }

  private buildRunning(): PipelineSnapshot[] {
    return [...this.translation.running(), ...this.audiobook.running()];
  }

  private buildTotals(): PipelineTotals {
    return totalsOf(this.running());
  }

  private buildHistory(): PipelineSnapshot[] {
    const active = this.running();
    const out: PipelineSnapshot[] = [];
    for (const record of this.records()) {
      out.push(active.find((pipeline) => pipeline.id === record.id) ?? record);
    }
    for (const pipeline of active) {
      if (!out.some(this.isSamePipeline.bind(this, pipeline))) {
        out.unshift(pipeline);
      }
    }
    return out;
  }

  private buildSelected(): PipelineSnapshot | null {
    const id = this.selectedId();
    for (const pipeline of this.history()) {
      if (pipeline.id === id) {
        return pipeline;
      }
    }
    return null;
  }

  private isSamePipeline(target: PipelineSnapshot, candidate: PipelineSnapshot): boolean {
    return target.id === candidate.id;
  }

  private syncActive(): void {
    const count = this.running().length;
    untracked(this.applyActive.bind(this, count));
  }

  private applyActive(count: number): void {
    const finished = count < this.lastActiveCount;
    this.lastActiveCount = count;
    if (finished && this.loaded()) {
      void this.load();
    }
  }

  private syncWorkspace(): void {
    const path = this.workspace.current()?.path ?? null;
    untracked(this.applyWorkspace.bind(this, path));
  }

  private applyWorkspace(path: string | null): void {
    if (path !== this.workspacePath) {
      this.workspacePath = path;
      this.reset();
    }
  }
}
