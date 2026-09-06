import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastTone } from '@shared/toast/toast.models';
import { ToastService } from '@shared/toast/toast.service';

import { LibraryVoiceService } from '../library/library.voices.service';
import { PipelineEvent, PipelineSnapshot, PipelineTask } from '../novel/novel.translation.models';
import { trackPipeline, withoutPipeline, withStarted } from '../pipeline/pipeline.tracking';
import { ProjectError } from '../project/project.models';
import { toProjectError } from '../project/project.rules';
import { ProjectService } from '../project/project.service';
import { CastAddResult, ScriptUnit } from '../scripting/scripting.models';
import { findBlock, findUnit } from '../scripting/scripting.rules';
import { ScriptingService } from '../scripting/scripting.service';
import { CloudService } from '../settings/cloud.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { buildContext } from './audiobook.context';
import * as edit from './audiobook.edit';
// prettier-ignore
import { AUDIO_KIND, audioJobsOf, audioStartOf, generateChaptersOf, generatePlanOf, pipelineUnits, segmentRequestOf } from './audiobook.generate';
// prettier-ignore
import { Audiobook, AudiobookConfig, AudiobookContext, AudiobookMessage, AudiobookMode, AudiobookView, AudioEnv, AudioRecord, ExportReply, GenerateChapter, GenerateOptions, GeneratePlan, GenerationJob, MixField, MixSettings, RegenerateResult, StaleReason, UnitAudio, VoiceAvailability, VoiceIssue } from './audiobook.models';
import {
  blockersOf,
  DEFAULT_MIX,
  emptyBook,
  emptyView,
  isInProgress,
  REASON_KEYS,
  unitAudioOf,
} from './audiobook.rules';

type Persist =
  { kind: 'config' } | { kind: 'mix' } | { kind: 'flag'; unitId: string; blockId: string };

function normalizeBook(stored: Partial<Audiobook> | null): Audiobook {
  const book = { ...emptyBook(), ...stored };
  return { ...book, mix: { ...DEFAULT_MIX, ...book.mix } };
}

function configOf(book: Audiobook): AudiobookConfig {
  return { voices: book.voices };
}

function sameJob(left: GenerationJob, right: GenerationJob): boolean {
  return left.unitId === right.unitId && left.blockId === right.blockId;
}

const DEFAULT_GENERATE_OPTIONS: GenerateOptions = { exportAfter: false, overwrite: false };

function withActiveHead(job: GenerationJob, index: number): GenerationJob {
  return { ...job, active: index === 0 };
}

function envOf(ctx: AudiobookContext): AudioEnv {
  return { book: ctx.book, cast: ctx.cast, voices: ctx.voices };
}

function unitsIn(ctx: AudiobookContext, unitIds: string[]): ScriptUnit[] {
  return ctx.script.units.filter((unit) => unit.blocks !== null && unitIds.includes(unit.id));
}

@Injectable({ providedIn: 'root' })
export class AudiobookService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly projects = inject(ProjectService);
  private readonly scripting = inject(ScriptingService);
  private readonly voices = inject(LibraryVoiceService);
  private readonly cloud = inject(CloudService);
  private readonly workspace = inject(WorkspaceService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  private readonly books = signal<Record<number, Audiobook>>({});
  private readonly views = signal<Record<number, AudiobookView>>({});
  private readonly singles = signal<Record<number, GenerationJob[]>>({});
  private readonly pipelines = signal<PipelineSnapshot[]>([]);
  private readonly finishedIds = new Set<number>();
  private readonly pendingExports = new Map<number, string[]>();
  private readonly loadedIds = signal<Record<number, true>>({});
  private readonly chains = new Map<number, Promise<void>>();
  private readonly generations = new Map<number, Promise<void>>();
  private workspacePath: string | null | undefined = undefined;

  readonly loading = signal(false);
  readonly error = signal<ProjectError | null>(null);
  readonly availability = computed(this.buildAvailability.bind(this));
  readonly running = this.pipelines.asReadonly();

  constructor() {
    effect(this.syncWorkspace.bind(this));
  }

  isLoaded(projectId: number): boolean {
    return this.loadedIds()[projectId] === true;
  }

  bookOf(projectId: number): Audiobook | null {
    return this.books()[projectId] ?? null;
  }

  viewOf(projectId: number): AudiobookView {
    return this.views()[projectId] ?? emptyView();
  }

  isGenerating(projectId: number, unitId?: string): boolean {
    const running = this.jobsOf(projectId);
    return unitId === undefined ? running.length > 0 : running.some((job) => job.unitId === unitId);
  }

  contextOf(projectId: number): AudiobookContext | null {
    const scripting = this.scripting.contextOf(projectId);
    const book = this.bookOf(projectId);
    if (!scripting || !book) {
      return null;
    }
    return buildContext({
      projectId,
      script: scripting.script,
      cast: scripting.cast,
      book,
      view: this.viewOf(projectId),
      voices: this.voices.items(),
      availability: this.availability(),
      jobs: this.jobsOf(projectId),
    });
  }

  generateChaptersOf(projectId: number): GenerateChapter[] {
    const ctx = this.contextOf(projectId);
    return ctx ? generateChaptersOf(envOf(ctx), ctx.availability, ctx.script.units) : [];
  }

  generatePlanOf(projectId: number, unitIds: string[], overwrite = false): GeneratePlan | null {
    const ctx = this.contextOf(projectId);
    if (!ctx) {
      return null;
    }
    const units = unitsIn(ctx, unitIds);
    return generatePlanOf(envOf(ctx), ctx.availability, this.cloud.accounts(), units, overwrite);
  }

  messageText(message: AudiobookMessage): string {
    return this.languageService.translate(message.key, message.params);
  }

  reasonText(reason: StaleReason): string {
    return this.languageService.translate(REASON_KEYS[reason]);
  }

  issueText(issue: VoiceIssue): string {
    return this.languageService.translate(`audiobook.voice.issue.${issue.kind}`, {
      engine: issue.engine,
    });
  }

  async load(projectId: number): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.scripting.ensureLoaded(projectId);
      await this.voices.ensureLoaded();
      const stored = await this.ipc.invoke<Audiobook | null>('audiobook_get', { projectId });
      this.storeBook(projectId, normalizeBook(stored));
      this.loadedIds.set({ ...this.loadedIds(), [projectId]: true });
      this.pinUnit(projectId);
    } catch (cause) {
      this.error.set(toProjectError(cause));
    } finally {
      this.loading.set(false);
    }
  }

  async ensureLoaded(projectId: number): Promise<void> {
    if (!this.isLoaded(projectId)) {
      await this.load(projectId);
    }
  }

  flush(projectId: number): Promise<void> {
    return this.chains.get(projectId) ?? Promise.resolve();
  }

  async settled(projectId: number): Promise<void> {
    await this.generations.get(projectId);
    await this.flush(projectId);
  }

  selectUnit(projectId: number, unitId: string): void {
    const script = this.scripting.scriptOf(projectId);
    if (script && findUnit(script, unitId)) {
      this.patchView(projectId, { unit: unitId });
    }
  }

  setMode(projectId: number, mode: AudiobookMode): void {
    this.patchView(projectId, { mode });
  }

  gotoSegment(projectId: number, blockId: string): void {
    this.patchView(projectId, { mode: 'prod', goto: blockId });
  }

  consumeGoto(projectId: number): string | null {
    const pending = this.viewOf(projectId).goto;
    this.patchView(projectId, { goto: null });
    return pending;
  }

  setSpeakerVoice(projectId: number, speakerId: string, voiceId: number | null): void {
    this.mutate(projectId, (book) => edit.setSpeakerVoice(book, speakerId, voiceId), {
      persist: { kind: 'config' },
      progress: true,
    });
  }

  setSpeakerSpeed(projectId: number, speakerId: string, speed: number): void {
    this.mutate(projectId, (book) => edit.setSpeakerSpeed(book, speakerId, speed), {
      persist: { kind: 'config' },
      progress: true,
    });
  }

  addSpeaker(projectId: number, name: string): CastAddResult {
    return this.scripting.addCastMember(projectId, name);
  }

  renameSpeaker(projectId: number, speakerId: string, name: string): void {
    this.scripting.renameCastMember(projectId, speakerId, name);
  }

  removeSpeaker(projectId: number, speakerId: string): boolean {
    const row = this.contextOf(projectId)?.speakers.find((item) => item.member.id === speakerId);
    if (
      !row ||
      row.deleteBlock !== null ||
      !this.scripting.removeCastMember(projectId, speakerId)
    ) {
      return false;
    }
    this.mutate(projectId, (book) => edit.removeSpeakerVoice(book, speakerId), {
      persist: { kind: 'config' },
      progress: false,
    });
    return true;
  }

  setMix(projectId: number, field: MixField, value: number): void {
    this.mutate(projectId, (book) => edit.setMix(book, field, value), {
      persist: { kind: 'mix' },
      progress: false,
    });
  }

  flagSegment(projectId: number, blockId: string, note: string): boolean {
    const flag = note.trim() || this.languageService.translate('audiobook.flag.defaultNote');
    return this.setFlag(projectId, blockId, flag);
  }

  clearFlag(projectId: number, blockId: string): boolean {
    return this.setFlag(projectId, blockId, '');
  }

  async generate(
    projectId: number,
    unitIds: string[],
    options: GenerateOptions = DEFAULT_GENERATE_OPTIONS,
  ): Promise<number> {
    const ctx = this.contextOf(projectId);
    if (!ctx) {
      return 0;
    }
    const { exportAfter, overwrite } = options;
    const start = audioStartOf(envOf(ctx), this.startableUnits(ctx, unitIds), overwrite);
    if (start.tasks.length === 0) {
      if (exportAfter) {
        await this.exportAndAnnounce(projectId, unitIds);
      }
      return 0;
    }
    await this.flush(projectId);
    try {
      const snapshot = await this.ipc.invoke<PipelineSnapshot>('pipeline_start', {
        kind: AUDIO_KIND,
        projectId,
        tasks: start.tasks,
        params: { requests: start.requests },
        onEvent: this.ipc.channel<PipelineEvent>(this.handleAudioEvent.bind(this, projectId)),
      });
      this.trackStarted(snapshot);
      if (exportAfter) {
        this.pendingExports.set(snapshot.id, unitIds);
      }
      return start.tasks.length;
    } catch (cause) {
      this.showFailure(cause);
      return 0;
    }
  }

  regenerate(projectId: number, blockId: string): RegenerateResult {
    const ctx = this.contextOf(projectId);
    const row = ctx?.segments.find((item) => item.block.id === blockId);
    if (!ctx || !ctx.unit || !row) {
      return 'noop';
    }
    if (ctx.blockers.length > 0) {
      return 'blocked';
    }
    if (isInProgress(row.state)) {
      return 'running';
    }
    this.startSingle(projectId, { unitId: ctx.unit.id, blockId, active: false });
    return 'started';
  }

  async exportUnits(projectId: number, unitIds: string[]): Promise<ExportReply | null> {
    await this.flush(projectId);
    try {
      return await this.ipc.invoke<ExportReply>('audiobook_export', { projectId, unitIds });
    } catch (cause) {
      this.toast('audiobook.export.failed', { reason: toProjectError(cause).detail }, 'danger');
      return null;
    }
  }

  reset(): void {
    this.books.set({});
    this.views.set({});
    this.singles.set({});
    this.pipelines.set([]);
    this.finishedIds.clear();
    this.pendingExports.clear();
    this.loadedIds.set({});
    this.chains.clear();
    this.generations.clear();
    this.loading.set(false);
    this.error.set(null);
  }

  private setFlag(projectId: number, blockId: string, flag: string): boolean {
    const unit = this.contextOf(projectId)?.unit;
    const before = this.bookOf(projectId);
    if (!unit || !before) {
      return false;
    }
    const next = edit.setRecordFlag(before, unit.id, blockId, flag);
    this.mutate(projectId, () => next, {
      persist: { kind: 'flag', unitId: unit.id, blockId },
      progress: true,
    });
    return next !== before;
  }

  private mutate(
    projectId: number,
    change: (book: Audiobook) => Audiobook,
    options: { persist: Persist; progress: boolean },
  ): void {
    const before = this.bookOf(projectId);
    if (!before) {
      return;
    }
    const next = change(before);
    if (next === before) {
      return;
    }
    this.pinUnit(projectId);
    this.storeBook(projectId, next);
    void this.enqueue(projectId, this.persist.bind(this, projectId, next, options));
  }

  private enqueue(projectId: number, task: () => Promise<void>): Promise<void> {
    const previous = this.chains.get(projectId) ?? Promise.resolve();
    const next = previous.then(task);
    this.chains.set(projectId, next);
    return next;
  }

  private async persist(
    projectId: number,
    book: Audiobook,
    options: { persist: Persist; progress: boolean },
  ): Promise<void> {
    try {
      await this.write(projectId, book, options.persist);
      if (options.progress) {
        await this.projects.refreshModules(projectId);
      }
    } catch (cause) {
      this.error.set(toProjectError(cause));
    }
  }

  private async write(projectId: number, book: Audiobook, persist: Persist): Promise<void> {
    if (persist.kind === 'config') {
      await this.ipc.invoke<void>('audiobook_config_save', { projectId, config: configOf(book) });
    } else if (persist.kind === 'mix') {
      await this.writeMix(projectId, book.mix);
    } else {
      const record = unitAudioOf(book, persist.unitId).audio[persist.blockId];
      await this.writeFlag(projectId, persist.unitId, persist.blockId, record);
    }
  }

  private async writeMix(projectId: number, mix: MixSettings): Promise<void> {
    const saved = await this.ipc.invoke<MixSettings>('audiobook_mix_save', { projectId, mix });
    const book = this.bookOf(projectId);
    if (book && saved && book.mix === mix) {
      this.storeBook(projectId, edit.putMix(book, saved));
    }
  }

  private async writeFlag(
    projectId: number,
    unitId: string,
    blockId: string,
    record: AudioRecord | undefined,
  ): Promise<void> {
    if (!record) {
      return;
    }
    const saved = await this.ipc.invoke<AudioRecord>('audiobook_flag_set', {
      projectId,
      unitId,
      blockId,
      flag: record.flag,
    });
    const book = this.bookOf(projectId);
    if (book && saved && unitAudioOf(book, unitId).audio[blockId] === record) {
      this.storeBook(projectId, edit.putRecord(book, unitId, blockId, saved));
    }
  }

  private startSingle(projectId: number, job: GenerationJob): void {
    this.setSingles(projectId, [...(this.singles()[projectId] ?? []), job]);
    const previous = this.generations.get(projectId) ?? Promise.resolve();
    this.generations.set(projectId, previous.then(this.runSingle.bind(this, projectId, job)));
  }

  private async runSingle(projectId: number, job: GenerationJob): Promise<void> {
    await this.flush(projectId);
    const generated = await this.generateOne(projectId, job);
    this.setSingles(
      projectId,
      (this.singles()[projectId] ?? []).filter((item) => !sameJob(item, job)),
    );
    if (generated) {
      await this.projects.refreshModules(projectId);
    }
  }

  private async generateOne(projectId: number, job: GenerationJob): Promise<boolean> {
    const ctx = this.contextOf(projectId);
    const unit = ctx ? findUnit(ctx.script, job.unitId) : undefined;
    const block = findBlock(unit, job.blockId);
    const request = ctx && block ? segmentRequestOf(envOf(ctx), block) : null;
    if (!request) {
      return false;
    }
    try {
      const record = await this.ipc.invoke<AudioRecord>('audiobook_segment_generate', {
        projectId,
        unitId: job.unitId,
        blockId: job.blockId,
        request,
      });
      this.applyRecord(projectId, job, record);
      return true;
    } catch (cause) {
      this.showFailure(cause);
      return false;
    }
  }

  private applyRecord(projectId: number, job: GenerationJob, record: AudioRecord): void {
    const book = this.bookOf(projectId);
    if (book) {
      this.storeBook(projectId, edit.putRecord(book, job.unitId, job.blockId, record));
    }
  }

  private startableUnits(ctx: AudiobookContext, unitIds: string[]): ScriptUnit[] {
    return unitsIn(ctx, unitIds).filter(this.isStartable.bind(this, ctx));
  }

  private isStartable(ctx: AudiobookContext, unit: ScriptUnit): boolean {
    return (
      !this.isGenerating(ctx.projectId, unit.id) &&
      blockersOf(envOf(ctx), ctx.availability, unit).length === 0
    );
  }

  private setSingles(projectId: number, list: GenerationJob[]): void {
    this.singles.set({ ...this.singles(), [projectId]: list });
  }

  private jobsOf(projectId: number): GenerationJob[] {
    const singles = (this.singles()[projectId] ?? []).map(withActiveHead);
    return [...singles, ...audioJobsOf(this.pipelines(), projectId)];
  }

  private trackStarted(snapshot: PipelineSnapshot): void {
    const known = this.pipelines().some((pipeline) => pipeline.id === snapshot.id);
    if (!known && !this.finishedIds.has(snapshot.id)) {
      this.pipelines.set(withStarted(this.pipelines(), snapshot));
    }
  }

  private handleAudioEvent(projectId: number, event: PipelineEvent): void {
    if (event.type === 'finished') {
      void this.finishAudio(projectId, event.pipeline);
      return;
    }
    if (event.type === 'started' && this.finishedIds.has(event.pipeline.id)) {
      return;
    }
    this.pipelines.set(trackPipeline(this.pipelines(), event));
    if (event.type === 'task') {
      this.applyAudioTask(projectId, event.task);
    }
  }

  private applyAudioTask(projectId: number, task: PipelineTask): void {
    if (task.status === 'completed') {
      void this.refreshUnit(projectId, task.chapterId);
    } else if (task.status === 'failed') {
      this.toast('audiobook.toast.segmentFailed', { reason: task.error }, 'danger');
    }
  }

  private async finishAudio(projectId: number, pipeline: PipelineSnapshot): Promise<void> {
    this.finishedIds.add(pipeline.id);
    this.pipelines.set(withoutPipeline(this.pipelines(), pipeline.id));
    await Promise.all(pipelineUnits(pipeline).map(this.refreshUnit.bind(this, projectId)));
    await this.projects.refreshModules(projectId);
    this.announceFinished(projectId, pipeline);
    await this.exportFinished(projectId, pipeline);
  }

  private async exportFinished(projectId: number, pipeline: PipelineSnapshot): Promise<void> {
    const unitIds = this.pendingExports.get(pipeline.id);
    this.pendingExports.delete(pipeline.id);
    if (!unitIds) {
      return;
    }
    if (pipeline.failed > 0 || pipeline.status === 'cancelled') {
      this.toast('audiobook.export.skipped', {}, 'warning');
      return;
    }
    await this.exportAndAnnounce(projectId, unitIds);
  }

  private async exportAndAnnounce(projectId: number, unitIds: string[]): Promise<void> {
    const reply = await this.exportUnits(projectId, unitIds);
    if (reply) {
      this.toast('audiobook.export.done', { wav: reply.wav, srt: reply.srt }, 'success');
    }
  }

  private announceFinished(projectId: number, pipeline: PipelineSnapshot): void {
    const name = this.projects.projectById(projectId)?.name ?? '';
    if (pipeline.failed > 0) {
      const params = { name, count: pipeline.failed };
      this.toast('audiobook.dialog.generate.failed', params, 'warning');
    } else if (pipeline.status === 'cancelled') {
      this.toast('audiobook.dialog.generate.cancelled', { name }, 'info');
    } else {
      this.toast('audiobook.dialog.generate.done', { name }, 'success');
    }
  }

  private refreshUnit(projectId: number, unitId: string): Promise<void> {
    return this.enqueue(projectId, this.fetchUnit.bind(this, projectId, unitId));
  }

  private async fetchUnit(projectId: number, unitId: string): Promise<void> {
    try {
      const unit = await this.ipc.invoke<UnitAudio>('audiobook_unit_get', { projectId, unitId });
      this.mergeUnit(projectId, unitId, unit);
    } catch (cause) {
      this.error.set(toProjectError(cause));
    }
  }

  private mergeUnit(projectId: number, unitId: string, unit: UnitAudio): void {
    const book = this.bookOf(projectId);
    if (book && unit) {
      this.storeBook(projectId, edit.putUnit(book, unitId, { audio: unit.audio, meta: unit.meta }));
    }
  }

  private showFailure(cause: unknown): void {
    this.toast('audiobook.toast.segmentFailed', { reason: toProjectError(cause).detail }, 'danger');
  }

  private toast(key: LanguageKey, params: Record<string, string | number>, tone: ToastTone): void {
    this.toasts.show(this.languageService.translate(key, params), tone);
  }

  private storeBook(projectId: number, book: Audiobook): void {
    this.books.set({ ...this.books(), [projectId]: book });
  }

  private pinUnit(projectId: number): void {
    const view = this.viewOf(projectId);
    const ctx = view.unit === null ? this.contextOf(projectId) : null;
    if (ctx && ctx.unit) {
      this.patchView(projectId, { unit: ctx.unit.id });
    }
  }

  private patchView(projectId: number, patch: Partial<AudiobookView>): void {
    this.views.set({ ...this.views(), [projectId]: { ...this.viewOf(projectId), ...patch } });
  }

  private buildAvailability(): VoiceAvailability {
    return { engines: this.voices.engines() };
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
