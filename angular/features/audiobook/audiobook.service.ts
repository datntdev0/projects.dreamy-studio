import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { noop } from '@shared/utils/noop';

import { LibraryVoiceService } from '../library/library.voices.service';
import { ProjectError } from '../project/project.models';
import { toProjectError } from '../project/project.rules';
import { ProjectService } from '../project/project.service';
import { CastAddResult } from '../scripting/scripting.models';
import { findBlock, findUnit } from '../scripting/scripting.rules';
import { ScriptingService } from '../scripting/scripting.service';
import { BackendService } from '../settings/backend.service';
import { CloudService } from '../settings/cloud.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { buildContext } from './audiobook.context';
import * as edit from './audiobook.edit';
import { generatePlanOf, segmentRequestOf } from './audiobook.generate';
// prettier-ignore
import { Audiobook, AudiobookConfig, AudiobookContext, AudiobookMessage, AudiobookMode, AudiobookView, AudioEnv, AudioRecord, GeneratePlan, GenerationJob, LexAddResult, LexField, LexKind, MixField, RegenerateResult, SegmentFilter, StaleReason, VoiceAvailability, VoiceIssue } from './audiobook.models';
import { emptyBook, emptyView, REASON_KEYS } from './audiobook.rules';

type Persist = { kind: 'config' } | { kind: 'unit'; unitId: string };

function normalizeBook(stored: Partial<Audiobook> | null): Audiobook {
  return { ...emptyBook(), ...stored };
}

function configOf(book: Audiobook): AudiobookConfig {
  return { voices: book.voices, lex: book.lex, symbols: book.symbols };
}

function sameJob(left: GenerationJob, right: GenerationJob): boolean {
  return left.unitId === right.unitId && left.blockId === right.blockId;
}

function envOf(ctx: AudiobookContext): AudioEnv {
  return { book: ctx.book, cast: ctx.cast, voices: ctx.voices };
}

@Injectable({ providedIn: 'root' })
export class AudiobookService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly projects = inject(ProjectService);
  private readonly scripting = inject(ScriptingService);
  private readonly voices = inject(LibraryVoiceService);
  private readonly backend = inject(BackendService);
  private readonly cloud = inject(CloudService);
  private readonly workspace = inject(WorkspaceService);
  private readonly languageService = inject(LanguageService);
  private readonly books = signal<Record<number, Audiobook>>({});
  private readonly views = signal<Record<number, AudiobookView>>({});
  private readonly jobs = signal<Record<number, GenerationJob[]>>({});
  private readonly loadedIds = signal<Record<number, true>>({});
  private readonly chains = new Map<number, Promise<void>>();
  private readonly generations = new Map<number, Promise<void>>();
  private workspacePath: string | null | undefined = undefined;

  readonly loading = signal(false);
  readonly error = signal<ProjectError | null>(null);
  readonly availability = computed(this.buildAvailability.bind(this));

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
    const running = this.jobs()[projectId] ?? [];
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
      jobs: this.jobs()[projectId] ?? [],
    });
  }

  generatePlanOf(projectId: number): GeneratePlan | null {
    const ctx = this.contextOf(projectId);
    if (!ctx || !ctx.unit || !ctx.unit.blocks) {
      return null;
    }
    return generatePlanOf(envOf(ctx), ctx.availability, this.cloud.accounts(), ctx.unit);
  }

  messageText(message: AudiobookMessage): string {
    const params = { ...message.params };
    if (typeof params['unit'] === 'string') {
      params['unit'] = this.languageService.translate(
        `scripting.unit.${params['unit']}` as LanguageKey,
      );
    }
    return this.languageService.translate(message.key, params);
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
      this.books.set({ ...this.books(), [projectId]: normalizeBook(stored) });
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
      this.patchView(projectId, { unit: unitId, sel: null });
    }
  }

  setMode(projectId: number, mode: AudiobookMode): void {
    this.patchView(projectId, { mode, sel: null });
  }

  setFilter(projectId: number, filter: SegmentFilter): void {
    this.patchView(projectId, { filter });
  }

  selectSegment(projectId: number, blockId: string | null): void {
    this.patchView(projectId, { sel: blockId });
  }

  gotoSegment(projectId: number, blockId: string): void {
    this.patchView(projectId, { mode: 'prod', sel: blockId, goto: blockId });
  }

  consumeGoto(projectId: number): string | null {
    const pending = this.viewOf(projectId).goto;
    this.patchView(projectId, { goto: null });
    return pending;
  }

  setTestText(projectId: number, text: string): void {
    this.patchView(projectId, { test: text });
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

  addLexRule(projectId: number, term: string, say: string, kind: LexKind): LexAddResult {
    let result: LexAddResult = 'empty';
    this.mutate(
      projectId,
      (book) => {
        const added = edit.addLexRule(book, term, say, kind);
        result = added.result;
        return added.book;
      },
      { persist: { kind: 'config' }, progress: true },
    );
    return result;
  }

  editLexRule(projectId: number, id: string, field: LexField, value: string): void {
    this.mutate(projectId, (book) => edit.editLexRule(book, id, field, value), {
      persist: { kind: 'config' },
      progress: true,
    });
  }

  removeLexRule(projectId: number, id: string): void {
    this.mutate(projectId, (book) => edit.removeLexRule(book, id), {
      persist: { kind: 'config' },
      progress: true,
    });
  }

  setSymbol(projectId: number, id: string, on: boolean): void {
    this.mutate(projectId, (book) => edit.setSymbol(book, id, on), {
      persist: { kind: 'config' },
      progress: false,
    });
  }

  setMix(projectId: number, field: MixField, value: number): void {
    const unit = this.contextOf(projectId)?.unit;
    if (unit && unit.blocks) {
      this.mutate(projectId, (book) => edit.setMix(book, unit.id, field, value), {
        persist: { kind: 'unit', unitId: unit.id },
        progress: false,
      });
    }
  }

  flagSegment(projectId: number, blockId: string, note: string): boolean {
    return this.mutateRecord(projectId, blockId, (book, unitId) =>
      edit.flagRecord(book, unitId, blockId, note),
    );
  }

  clearFlag(projectId: number, blockId: string): boolean {
    return this.mutateRecord(projectId, blockId, (book, unitId) =>
      edit.clearRecordFlag(book, unitId, blockId),
    );
  }

  generate(projectId: number): Promise<number> {
    const ctx = this.contextOf(projectId);
    if (!ctx || !ctx.unit || !ctx.canGenerate) {
      return Promise.resolve(0);
    }
    return this.startJobs(
      projectId,
      ctx.unit.id,
      ctx.todo.map((block) => block.id),
    );
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
    if (row.state === 'running') {
      return 'running';
    }
    void this.startJobs(projectId, ctx.unit.id, [blockId]);
    return 'started';
  }

  reset(): void {
    this.books.set({});
    this.views.set({});
    this.jobs.set({});
    this.loadedIds.set({});
    this.chains.clear();
    this.generations.clear();
    this.loading.set(false);
    this.error.set(null);
  }

  private mutateRecord(
    projectId: number,
    blockId: string,
    change: (book: Audiobook, unitId: string) => Audiobook,
  ): boolean {
    const unit = this.contextOf(projectId)?.unit;
    const before = this.bookOf(projectId);
    if (!unit || !before) {
      return false;
    }
    const next = change(before, unit.id);
    this.mutate(projectId, () => next, {
      persist: { kind: 'unit', unitId: unit.id },
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
    this.books.set({ ...this.books(), [projectId]: next });
    this.enqueue(projectId, this.persist.bind(this, projectId, next, options));
  }

  private enqueue(projectId: number, task: () => Promise<void>): void {
    const previous = this.chains.get(projectId) ?? Promise.resolve();
    this.chains.set(projectId, previous.then(task));
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
    } else {
      await this.ipc.invoke<void>('audiobook_unit_save', {
        projectId,
        unitId: persist.unitId,
        unit: book.units[persist.unitId],
      });
    }
  }

  private startJobs(projectId: number, unitId: string, blockIds: string[]): Promise<number> {
    const added = blockIds.map((blockId) => ({ unitId, blockId }));
    this.setJobs(projectId, [...(this.jobs()[projectId] ?? []), ...added]);
    const previous = this.generations.get(projectId) ?? Promise.resolve();
    const run = previous.then(this.runJobs.bind(this, projectId, added));
    this.generations.set(projectId, run.then(noop, noop));
    return run;
  }

  private async runJobs(projectId: number, queued: GenerationJob[]): Promise<number> {
    await this.flush(projectId);
    let generated = 0;
    for (const job of queued) {
      generated += (await this.generateOne(projectId, job)) ? 1 : 0;
      this.setJobs(
        projectId,
        (this.jobs()[projectId] ?? []).filter((item) => !sameJob(item, job)),
      );
    }
    if (generated > 0) {
      await this.projects.refreshModules(projectId);
    }
    return generated;
  }

  private async generateOne(projectId: number, job: GenerationJob): Promise<boolean> {
    const ctx = this.contextOf(projectId);
    const unit = ctx ? findUnit(ctx.script, job.unitId) : undefined;
    const block = findBlock(unit, job.blockId);
    const symbols = ctx ? ctx.book.symbols.filter((item) => item.on).map((item) => item.id) : [];
    const request = ctx && block ? segmentRequestOf(envOf(ctx), block, symbols) : null;
    if (!ctx || !request) {
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
      this.error.set(toProjectError(cause));
      return false;
    }
  }

  private applyRecord(projectId: number, job: GenerationJob, record: AudioRecord): void {
    const book = this.bookOf(projectId);
    if (book) {
      const next = edit.putRecord(book, job.unitId, job.blockId, record);
      this.books.set({ ...this.books(), [projectId]: next });
    }
  }

  private setJobs(projectId: number, list: GenerationJob[]): void {
    this.jobs.set({ ...this.jobs(), [projectId]: list });
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
    return {
      engines: this.voices.engines(),
      backendRunning: this.backend.server().status === 'running',
    };
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
