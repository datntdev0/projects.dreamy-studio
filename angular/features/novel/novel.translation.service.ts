import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';

import { WorkspaceService } from '../workspace/workspace.service';
import { NovelError, ParagraphSaveResult, TargetLang, TranslationStatus } from './novel.models';
import { clampSeq, normalizeParagraphText, toNovelError } from './novel.rules';
import { NovelService } from './novel.service';
// prettier-ignore
import { DictChange, DictDraft, NovelTranslation, PipelineEvent, PipelineSnapshot, PipelineTask, TaskRequest, TranslationStep, TranslationView, TranslationWarning, WireChapter, WireTranslation, WireWarning } from './novel.translation.models';
// prettier-ignore
import { chapterStatus, EMPTY_VIEW, emptyTranslation, fromWireChapter, fromWireTranslation, fromWireWarnings, replaceEntry, reviewCount, targetsOf, translatedCount, withoutEntry } from './novel.translation.rules';

const EMPTY = emptyTranslation();

export const ANALYSIS_KIND = 'analysis';

function storeKey(novelId: number, target: TargetLang): string {
  return `${novelId}:${target}`;
}

function replaceTask(tasks: PipelineTask[], next: PipelineTask): PipelineTask[] {
  const result: PipelineTask[] = [];
  for (const task of tasks) {
    result.push(task.id === next.id ? next : task);
  }
  return result;
}

function taskTotals(tasks: PipelineTask[]): { done: number; failed: number } {
  let done = 0;
  let failed = 0;
  for (const task of tasks) {
    if (task.status === 'completed') {
      done += 1;
    }
    if (task.status === 'failed') {
      failed += 1;
    }
  }
  return { done, failed };
}

@Injectable({ providedIn: 'root' })
export class NovelTranslationService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly novels = inject(NovelService);
  private readonly workspace = inject(WorkspaceService);
  private readonly store = signal<Record<string, NovelTranslation>>({});
  private readonly views = signal<Record<number, TranslationView>>({});
  private readonly activePipelines = signal<PipelineSnapshot[]>([]);
  private workspacePath: string | null | undefined = undefined;
  private tickets: Record<string, number> = {};

  readonly loading = signal(false);
  readonly error = signal<NovelError | null>(null);
  readonly running = this.activePipelines.asReadonly();
  readonly finished = signal<PipelineSnapshot | null>(null);

  constructor() {
    effect(this.syncWorkspace.bind(this));
  }

  targetOf(novelId: number): TargetLang {
    const targets = targetsOf(this.novels.novelById(novelId)?.lang);
    const wanted = this.viewOf(novelId).target;
    return wanted !== null && targets.includes(wanted) ? wanted : (targets[0] ?? 'VI');
  }

  of(novelId: number, target: TargetLang = this.targetOf(novelId)): NovelTranslation {
    return this.store()[storeKey(novelId, target)] ?? EMPTY;
  }

  viewOf(novelId: number): TranslationView {
    return this.views()[novelId] ?? EMPTY_VIEW;
  }

  progressOf(novelId: number, target: TargetLang = this.targetOf(novelId)): Record<string, number> {
    const progress: Record<string, number> = {};
    for (const pipeline of this.running()) {
      if (
        pipeline.novelId === novelId &&
        pipeline.kind !== ANALYSIS_KIND &&
        pipeline.target === target
      ) {
        this.collectProgress(pipeline, progress);
      }
    }
    return progress;
  }

  queuedOf(novelId: number, target: TargetLang = this.targetOf(novelId)): string[] {
    const queued: string[] = [];
    for (const pipeline of this.running()) {
      if (
        pipeline.novelId === novelId &&
        pipeline.kind !== ANALYSIS_KIND &&
        pipeline.target === target
      ) {
        this.collectQueued(pipeline, queued);
      }
    }
    return queued;
  }

  isTranslating(novelId: number): boolean {
    return this.running().some(
      (pipeline) => pipeline.novelId === novelId && pipeline.kind !== ANALYSIS_KIND,
    );
  }

  isAnalyzing(novelId: number): boolean {
    return this.running().some(
      (pipeline) => pipeline.novelId === novelId && pipeline.kind === ANALYSIS_KIND,
    );
  }

  statusOf(
    novelId: number,
    chapterId: string,
    target: TargetLang = this.targetOf(novelId),
  ): TranslationStatus {
    return chapterStatus(
      this.of(novelId, target),
      chapterId,
      Object.keys(this.progressOf(novelId, target)),
      this.queuedOf(novelId, target),
    );
  }

  reviewCountOf(novelId: number): number {
    return reviewCount(this.of(novelId).warnings);
  }

  translatedCountOf(novelId: number): number {
    return translatedCount(this.of(novelId));
  }

  warningsOf(novelId: number): TranslationWarning[] {
    return this.of(novelId).warnings;
  }

  async ensure(novelId: number, target: TargetLang = this.targetOf(novelId)): Promise<void> {
    if (!this.store()[storeKey(novelId, target)]) {
      await this.load(novelId, target);
    }
  }

  titleOf(
    novelId: number,
    chapterId: string,
    target: TargetLang = this.targetOf(novelId),
  ): string | null {
    return this.of(novelId, target).chapters[chapterId]?.title || null;
  }

  setTarget(novelId: number, target: TargetLang): void {
    this.patchView(novelId, { target, seq: 1 });
    void this.ensure(novelId, target);
  }

  async load(novelId: number, target: TargetLang = this.targetOf(novelId)): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.fetch(novelId, target);
    } catch (cause) {
      this.error.set(toNovelError(cause));
    } finally {
      this.loading.set(false);
    }
  }

  async refresh(novelId: number, target: TargetLang): Promise<void> {
    try {
      await this.fetch(novelId, target);
    } catch (cause) {
      this.error.set(toNovelError(cause));
    }
  }

  setStep(novelId: number, step: TranslationStep): void {
    this.patchView(novelId, { step });
  }

  setSeq(novelId: number, seq: number): void {
    this.patchView(novelId, { seq: clampSeq(seq, this.novels.chaptersOf(novelId).length) });
  }

  focusPassage(novelId: number, seq: number, n: number | null): void {
    this.patchView(novelId, { step: 'result', seq, focus: n });
  }

  consumeFocus(novelId: number): number | null {
    const target = this.viewOf(novelId).focus;
    this.patchView(novelId, { focus: null });
    return target;
  }

  startEntry(novelId: number): void {
    this.patchView(novelId, { step: 'dict', newEntry: true });
  }

  consumeEntry(novelId: number): boolean {
    const wanted = this.viewOf(novelId).newEntry;
    this.patchView(novelId, { newEntry: false });
    return wanted;
  }

  async saveGuidelines(novelId: number, text: string): Promise<boolean> {
    const target = this.targetOf(novelId);
    const changed = await this.ipc.invoke<boolean>('translation_guidelines_save', {
      novelId,
      target,
      text,
    });
    if (changed) {
      const current = this.of(novelId, target);
      this.storeTranslation(novelId, target, { ...current, guidelines: text.trim() });
    }
    return changed;
  }

  async addEntry(novelId: number, draft: DictDraft): Promise<DictChange> {
    const target = this.targetOf(novelId);
    const change = await this.ipc.invoke<DictChange>('translation_dict_add', {
      novelId,
      target,
      input: draft,
    });
    const current = this.of(novelId, target);
    this.storeTranslation(novelId, target, { ...current, dict: [...current.dict, change.entry] });
    await this.refreshWarnings(novelId, target);
    return change;
  }

  async updateEntry(
    novelId: number,
    id: number,
    patch: Partial<DictDraft>,
  ): Promise<DictChange | null> {
    const target = this.targetOf(novelId);
    if (!this.of(novelId, target).dict.some((entry) => entry.id === id)) {
      return null;
    }
    const change = await this.ipc.invoke<DictChange>('translation_dict_update', {
      novelId,
      id,
      patch,
    });
    const current = this.of(novelId, target);
    this.storeTranslation(novelId, target, {
      ...current,
      dict: replaceEntry(current.dict, change.entry),
    });
    await this.refreshWarnings(novelId, target);
    return change;
  }

  async removeEntry(novelId: number, id: number): Promise<void> {
    const target = this.targetOf(novelId);
    await this.ipc.invoke<void>('translation_dict_delete', { novelId, id });
    const current = this.of(novelId, target);
    this.storeTranslation(novelId, target, { ...current, dict: withoutEntry(current.dict, id) });
    await this.refreshWarnings(novelId, target);
  }

  async saveParagraph(
    novelId: number,
    chapterId: string,
    n: number,
    text: string,
  ): Promise<ParagraphSaveResult> {
    const target = this.targetOf(novelId);
    const current = this.of(novelId, target);
    const passage = current.chapters[chapterId]?.passages[n];
    const value = normalizeParagraphText(text);
    if (!passage) {
      return 'idle';
    }
    if (!value) {
      return 'empty';
    }
    if (value === passage.text) {
      return 'unchanged';
    }
    const chapter = await this.ipc.invoke<WireChapter>('translation_passage_save', {
      novelId,
      target,
      chapterId,
      n,
      text: value,
    });
    this.storeChapter(novelId, target, chapterId, chapter);
    await this.refreshWarnings(novelId, target);
    return 'saved';
  }

  async setNote(novelId: number, chapterId: string, n: number, text: string): Promise<void> {
    const target = this.targetOf(novelId);
    const current = this.of(novelId, target);
    const passage = current.chapters[chapterId]?.passages[n];
    const value = text.trim();
    if (!passage || value === passage.note) {
      return;
    }
    const chapter = await this.ipc.invoke<WireChapter>('translation_note_save', {
      novelId,
      target,
      chapterId,
      n,
      text: value,
    });
    this.storeChapter(novelId, target, chapterId, chapter);
  }

  async translate(
    novelId: number,
    chapterIds: string[],
    target: TargetLang = this.targetOf(novelId),
  ): Promise<void> {
    const tasks: TaskRequest[] = [];
    for (const chapterId of chapterIds) {
      tasks.push({ chapterId, passage: null });
    }
    await this.startPipeline(novelId, target, tasks);
  }

  async retranslate(novelId: number, warningId: string): Promise<void> {
    const target = this.targetOf(novelId);
    const warning = this.of(novelId, target).warnings.find((item) => item.id === warningId);
    if (!warning) {
      return;
    }
    await this.startPipeline(novelId, target, [
      { chapterId: warning.chapterId, passage: warning.n },
    ]);
  }

  async cancelPipeline(pipelineId: number): Promise<void> {
    await this.ipc.invoke<boolean>('pipeline_cancel', { pipelineId });
  }

  async cancelNovel(novelId: number): Promise<void> {
    for (const pipeline of this.running()) {
      if (pipeline.novelId === novelId && pipeline.kind !== ANALYSIS_KIND) {
        await this.cancelPipeline(pipeline.id);
      }
    }
  }

  async startAnalysis(novelId: number, lang: string, chapterIds: string[]): Promise<void> {
    const tasks: TaskRequest[] = chapterIds.map((chapterId) => ({ chapterId, passage: null }));
    const channel = this.ipc.channel<PipelineEvent>(this.handlePipelineEvent.bind(this));
    await this.ipc.invoke<PipelineSnapshot>('pipeline_start', {
      kind: ANALYSIS_KIND,
      novelId,
      lang,
      tasks,
      onEvent: channel,
    });
  }

  reset(): void {
    this.store.set({});
    this.views.set({});
    this.activePipelines.set([]);
    this.tickets = {};
    this.loading.set(false);
    this.error.set(null);
  }

  private async fetch(novelId: number, target: TargetLang): Promise<void> {
    const key = storeKey(novelId, target);
    const ticket = (this.tickets[key] ?? 0) + 1;
    this.tickets[key] = ticket;
    const wire = await this.ipc.invoke<WireTranslation>('translation_get', { novelId, target });
    await this.novels.loadChapters(novelId);
    if (this.tickets[key] === ticket) {
      this.storeTranslation(
        novelId,
        target,
        fromWireTranslation(wire, this.novels.chaptersOf(novelId)),
      );
    }
  }

  private collectProgress(pipeline: PipelineSnapshot, progress: Record<string, number>): void {
    for (const task of pipeline.tasks) {
      if (task.status === 'running') {
        progress[task.chapterId] = task.progress;
      }
    }
  }

  private collectQueued(pipeline: PipelineSnapshot, queued: string[]): void {
    for (const task of pipeline.tasks) {
      if (task.status === 'queued' && !queued.includes(task.chapterId)) {
        queued.push(task.chapterId);
      }
    }
  }

  private async startPipeline(
    novelId: number,
    target: TargetLang,
    tasks: TaskRequest[],
  ): Promise<void> {
    const channel = this.ipc.channel<PipelineEvent>(this.handlePipelineEvent.bind(this));
    await this.ipc.invoke<PipelineSnapshot>('pipeline_start', {
      novelId,
      target,
      tasks,
      onEvent: channel,
    });
  }

  private handlePipelineEvent(event: PipelineEvent): void {
    if (event.type === 'started') {
      this.activePipelines.set([
        ...this.running().filter((pipeline) => pipeline.id !== event.pipeline.id),
        event.pipeline,
      ]);
      return;
    }
    if (event.type === 'updated') {
      this.activePipelines.set(
        this.running().map((pipeline) => this.withSnapshot(pipeline, event.pipeline)),
      );
      return;
    }
    if (event.type === 'task') {
      this.applyTask(event.pipelineId, event.task);
      return;
    }
    void this.finishPipeline(event.pipeline);
  }

  private applyTask(pipelineId: number, task: PipelineTask): void {
    const owner = this.running().find((pipeline) => pipeline.id === pipelineId);
    this.activePipelines.set(
      this.running().map((pipeline) => this.withTask(pipeline, pipelineId, task)),
    );
    if (owner && owner.kind !== ANALYSIS_KIND && task.status === 'completed') {
      void this.refresh(owner.novelId, owner.target as TargetLang);
    }
  }

  private async finishPipeline(pipeline: PipelineSnapshot): Promise<void> {
    if (pipeline.kind === ANALYSIS_KIND) {
      this.removePipeline(pipeline.id);
      this.finished.set(pipeline);
      return;
    }
    await this.refresh(pipeline.novelId, pipeline.target as TargetLang);
    this.removePipeline(pipeline.id);
  }

  private removePipeline(pipelineId: number): void {
    this.activePipelines.set(this.running().filter((pipeline) => pipeline.id !== pipelineId));
  }

  private withSnapshot(pipeline: PipelineSnapshot, next: PipelineSnapshot): PipelineSnapshot {
    return pipeline.id === next.id
      ? { ...pipeline, status: next.status, startedAt: next.startedAt }
      : pipeline;
  }

  private withTask(
    pipeline: PipelineSnapshot,
    pipelineId: number,
    task: PipelineTask,
  ): PipelineSnapshot {
    if (pipeline.id !== pipelineId) {
      return pipeline;
    }
    const tasks = replaceTask(pipeline.tasks, task);
    return { ...pipeline, ...taskTotals(tasks), tasks };
  }

  private async refreshWarnings(novelId: number, target: TargetLang): Promise<void> {
    const list = await this.ipc.invoke<WireWarning[]>('translation_warnings', { novelId, target });
    const current = this.of(novelId, target);
    const warnings = fromWireWarnings(list, this.novels.chaptersOf(novelId));
    this.storeTranslation(novelId, target, { ...current, warnings });
  }

  private storeChapter(
    novelId: number,
    target: TargetLang,
    chapterId: string,
    wire: WireChapter,
  ): void {
    const current = this.of(novelId, target);
    this.storeTranslation(novelId, target, {
      ...current,
      chapters: { ...current.chapters, [chapterId]: fromWireChapter(wire) },
    });
  }

  private storeTranslation(
    novelId: number,
    target: TargetLang,
    translation: NovelTranslation,
  ): void {
    this.store.set({ ...this.store(), [storeKey(novelId, target)]: translation });
  }

  private patchView(novelId: number, patch: Partial<TranslationView>): void {
    this.views.set({ ...this.views(), [novelId]: { ...this.viewOf(novelId), ...patch } });
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
