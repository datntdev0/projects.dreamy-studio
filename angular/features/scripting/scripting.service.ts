import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

import { NovelKnowledge } from '../novel/novel.knowledge.models';
import { NovelKnowledgeService } from '../novel/novel.knowledge.service';
import { ParagraphRow, TargetLang } from '../novel/novel.models';
import { NovelService } from '../novel/novel.service';
import { NovelTranslationService } from '../novel/novel.translation.service';
import { ProjectError, ProjectSummary } from '../project/project.models';
import { toProjectError } from '../project/project.rules';
import { ProjectService } from '../project/project.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { buildContext, castFor, unitSources } from './scripting.context';
import { capitalize } from './scripting.dialogs.rules';
import { draftLoadOf, draftOptionOf, estimateDraft } from './scripting.draft';
import * as edit from './scripting.edit';
import { kbBeatsOf, kbSnapshotOf, kbStatusOf } from './scripting.knowledge';
// prettier-ignore
import { BlockPatch, BlockType, CastAddResult, CastMember, DraftEstimate, DraftLoad, DraftOption, DraftRequest, DraftResult, KbSnapshot, LockResult, MoveDirection, ResetScope, Script, ScriptChange, ScriptContext, ScriptIssue, ScriptPreset, ScriptSource, ScriptUnit, ScriptView, SourceParagraph, ViewFocus } from './scripting.models';
// prettier-ignore
import { activeUnit, anyGroupOpen, chaptersOf, emptyView, findBlock, findUnit, issuesOf, nextChapterRange, nextUnitChapters, replaceUnit, toggledAllGroups, toggledGroup, withoutGroup } from './scripting.rules';
// prettier-ignore
import { chapterParagraphs, chapterTitleOf, initialScript, unitSource, usesTranslation } from './scripting.source';

type PersistKind = 'unit' | 'script' | 'cast';

interface Persist {
  kind: PersistKind;
  unitId: string | null;
  progress: boolean;
}

interface Editable {
  project: ProjectSummary;
  script: Script;
  unit: ScriptUnit;
  cast: CastMember[];
}

const snapshots = new WeakMap<NovelKnowledge, KbSnapshot>();

function snapshotOf(knowledge: NovelKnowledge): KbSnapshot {
  const cached = snapshots.get(knowledge);
  if (cached) {
    return cached;
  }
  const built = kbSnapshotOf(knowledge);
  snapshots.set(knowledge, built);
  return built;
}

function originalKey(novelId: number, seq: number): string {
  return `${novelId}:${seq}`;
}

function targetOf(project: ProjectSummary): TargetLang {
  return project.srcLang === 'EN' ? 'EN' : 'VI';
}

function knowledgeLangOf(project: ProjectSummary): TargetLang | 'src' {
  return usesTranslation(project) ? targetOf(project) : 'src';
}

function stampNow(): string {
  return new Date().toISOString();
}

function without(list: string[], id: string): string[] {
  return list.filter((item) => item !== id);
}

@Injectable({ providedIn: 'root' })
export class ScriptingService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly projects = inject(ProjectService);
  private readonly novels = inject(NovelService);
  private readonly translation = inject(NovelTranslationService);
  private readonly knowledge = inject(NovelKnowledgeService);
  private readonly workspace = inject(WorkspaceService);
  private readonly languageService = inject(LanguageService);
  private readonly scripts = signal<Record<number, Script>>({});
  private readonly views = signal<Record<number, ScriptView>>({});
  private readonly originals = signal<Record<string, ParagraphRow[]>>({});
  private readonly drafting = signal<Record<number, string[]>>({});
  private readonly loadedIds = signal<Record<number, true>>({});
  private readonly chains = new Map<number, Promise<void>>();
  private workspacePath: string | null | undefined = undefined;

  readonly loading = signal(false);
  readonly error = signal<ProjectError | null>(null);

  constructor() {
    effect(this.syncWorkspace.bind(this));
  }

  isLoaded(projectId: number): boolean {
    return this.loadedIds()[projectId] === true;
  }

  scriptOf(projectId: number): Script | null {
    return this.scripts()[projectId] ?? null;
  }

  viewOf(projectId: number): ScriptView {
    return this.views()[projectId] ?? emptyView();
  }

  contextOf(projectId: number): ScriptContext | null {
    const project = this.projects.projectById(projectId);
    const script = this.scriptOf(projectId);
    if (!project || !script) {
      return null;
    }
    return buildContext({
      projectId,
      script,
      view: this.viewOf(projectId),
      kb: this.kbOf(project),
      hasNovel: project.novelId !== null,
      chapters: this.chapterMap(project, script),
      novelChapters: project.novelId === null ? 0 : this.novels.chaptersOf(project.novelId).length,
      generating: this.drafting()[projectId] ?? [],
    });
  }

  isGenerating(projectId: number, unitId?: string): boolean {
    const running = this.drafting()[projectId] ?? [];
    return unitId === undefined ? running.length > 0 : running.includes(unitId);
  }

  issueMessage(issue: ScriptIssue): string {
    const params = { ...issue.params };
    if (typeof params['unit'] === 'string') {
      params['unit'] = capitalize(
        this.languageService.translate(`scripting.unit.${params['unit']}` as LanguageKey),
      );
    }
    if (typeof params['type'] === 'string') {
      params['type'] = this.languageService
        .translate(`scripting.type.${params['type']}` as LanguageKey)
        .toLowerCase();
    }
    return this.languageService.translate(issue.messageKey, params);
  }

  resettableUnitsOf(projectId: number): ScriptUnit[] {
    const project = this.projects.projectById(projectId);
    const script = this.scriptOf(projectId);
    if (!project || !script) {
      return [];
    }
    return edit.resettableUnits(script, unitSources(script, this.chapterMap(project, script)));
  }

  draftOptionsOf(projectId: number): DraftOption[] {
    const project = this.projects.projectById(projectId);
    const script = this.scriptOf(projectId);
    if (!project || !script) {
      return [];
    }
    const chapters = this.chapterMap(project, script);
    const kb = this.kbOf(project);
    return script.units.map((unit) =>
      draftOptionOf({
        config: script.cfg,
        unit,
        source: unitSource(unit, chapters),
        kb: kbStatusOf(kb, project.novelId !== null, chaptersOf(unit)),
      }),
    );
  }

  draftEstimateOf(projectId: number, unitIds: string[]): DraftEstimate {
    return estimateDraft(this.draftLoadsOf(projectId, unitIds));
  }

  draftWordsOf(projectId: number, unitIds: string[]): number {
    return this.draftLoadsOf(projectId, unitIds).reduce((sum, load) => sum + load.words, 0);
  }

  private draftLoadsOf(projectId: number, unitIds: string[]): DraftLoad[] {
    const project = this.projects.projectById(projectId);
    const script = this.scriptOf(projectId);
    if (!project || !script) {
      return [];
    }
    const chapters = this.chapterMap(project, script);
    const kb = this.kbOf(project);
    return script.units
      .filter((unit) => unitIds.includes(unit.id))
      .map((unit) =>
        draftLoadOf(script.cfg, unitSource(unit, chapters), kbBeatsOf(kb, chaptersOf(unit)) ?? []),
      );
  }

  async load(projectId: number): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.projects.ensureLoaded();
      const project = this.requireProject(projectId);
      await this.loadNovelData(project);
      const stored = await this.ipc.invoke<Script | null>('scripting_get', { projectId });
      const script = stored ?? (await this.createScript(project));
      this.scripts.set({ ...this.scripts(), [projectId]: script });
      this.loadedIds.set({ ...this.loadedIds(), [projectId]: true });
      await this.ensureSources(projectId);
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

  async ensureSources(projectId: number, everyUnit = false): Promise<void> {
    const project = this.projects.projectById(projectId);
    const script = this.scriptOf(projectId);
    if (!project || !script || project.novelId === null) {
      return;
    }
    const wanted = new Set<number>();
    const active = activeUnit(script, this.viewOf(projectId).unit);
    for (const unit of script.units) {
      if (everyUnit || unit === active || (unit.blocks && unit.blocks.length > 0)) {
        for (const seq of chaptersOf(unit)) {
          wanted.add(seq);
        }
      }
    }
    await Promise.all([...wanted].map((seq) => this.loadOriginal(project, seq)));
  }

  async reloadSources(projectId: number): Promise<void> {
    const project = this.projects.projectById(projectId);
    if (!project || project.novelId === null) {
      return;
    }
    const prefix = `${project.novelId}:`;
    const kept: Record<string, ParagraphRow[]> = {};
    for (const key of Object.keys(this.originals())) {
      if (!key.startsWith(prefix)) {
        kept[key] = this.originals()[key];
      }
    }
    this.originals.set(kept);
    await this.loadNovelData(project);
    await this.ensureSources(projectId);
  }

  flush(projectId: number): Promise<void> {
    return this.chains.get(projectId) ?? Promise.resolve();
  }

  selectUnit(projectId: number, unitId: string): void {
    const script = this.scriptOf(projectId);
    if (script && findUnit(script, unitId)) {
      this.patchView(projectId, { unit: unitId, sel: null });
      void this.ensureSources(projectId);
    }
  }

  selectBlock(projectId: number, blockId: string | null): void {
    this.patchView(projectId, { sel: blockId });
  }

  toggleGroup(projectId: number, ref: string): void {
    this.patchView(projectId, { collapsed: toggledGroup(this.viewOf(projectId).collapsed, ref) });
  }

  toggleAllGroups(projectId: number): void {
    const source = this.contextOf(projectId)?.source;
    if (source) {
      this.patchView(projectId, {
        collapsed: toggledAllGroups(this.viewOf(projectId).collapsed, source),
      });
    }
  }

  anyGroupOpen(projectId: number): boolean {
    const source = this.contextOf(projectId)?.source;
    return source ? anyGroupOpen(this.viewOf(projectId).collapsed, source) : false;
  }

  toggleDrawer(projectId: number): void {
    this.patchView(projectId, { drawer: !this.viewOf(projectId).drawer });
  }

  gotoBlock(projectId: number, blockId: string): void {
    const unit = this.activeOf(projectId);
    const block = findBlock(unit, blockId);
    const view = this.viewOf(projectId);
    const collapsed = block?.ref ? withoutGroup(view.collapsed, block.ref) : view.collapsed;
    this.patchView(projectId, { collapsed, sel: blockId, goto: blockId });
  }

  gotoRef(projectId: number, ref: string): void {
    this.patchView(projectId, { ref });
  }

  consumeFocus(projectId: number): ViewFocus {
    const view = this.viewOf(projectId);
    const pending: ViewFocus = { focus: view.focus, goto: view.goto, ref: view.ref };
    this.patchView(projectId, { focus: null, goto: null, ref: null });
    return pending;
  }

  setPreset(projectId: number, preset: ScriptPreset): void {
    const script = this.scriptOf(projectId);
    if (script) {
      const change: ScriptChange = { script: edit.setPreset(script, preset), view: { sel: null } };
      this.commit(projectId, change, { kind: 'script', unitId: null, progress: true });
    }
  }

  addUnit(projectId: number): ScriptUnit | null {
    const script = this.scriptOf(projectId);
    const project = this.projects.projectById(projectId);
    if (!script || !project || !script.cfg.freeUnits) {
      return null;
    }
    const total = project.novelId === null ? 0 : this.novels.chaptersOf(project.novelId).length;
    const next = edit.addUnitWith(script, nextUnitChapters(script, total));
    const unit = next.units[next.units.length - 1];
    this.commit(
      projectId,
      { script: next, view: { unit: unit.id, sel: null } },
      { kind: 'script', unitId: null, progress: true },
    );
    void this.ensureSources(projectId);
    return unit;
  }

  setUnitTitle(projectId: number, title: string): void {
    const target = this.activeOf(projectId);
    const script = this.scriptOf(projectId);
    if (script && target && target.status !== 'locked' && script.cfg.preset === 'film') {
      const next = edit.setUnitTitle(script, target.id, title, stampNow());
      this.commit(projectId, { script: next, view: {} }, this.unitPersist(target.id, false));
    }
  }

  setUnitChapter(projectId: number, index: 0 | 1, value: number): void {
    const target = this.activeOf(projectId);
    const script = this.scriptOf(projectId);
    const project = this.projects.projectById(projectId);
    if (!script || !target || !project || target.status === 'locked' || !script.cfg.ranges) {
      return;
    }
    const max = this.chapterMax(project);
    const range = nextChapterRange(target.chs, index, value, max);
    const next = edit.setUnitChapters(script, target.id, range, stampNow());
    this.commit(projectId, { script: next, view: {} }, this.unitPersist(target.id, false));
    void this.ensureSources(projectId);
  }

  startWriting(projectId: number): string | null {
    const target = this.activeOf(projectId);
    const script = this.scriptOf(projectId);
    if (!script || !target || target.status === 'locked') {
      return null;
    }
    const change = edit.startUnit(script, target.id, this.castOf(projectId), stampNow());
    this.commit(projectId, change, this.unitPersist(target.id, true));
    return change.view.sel ?? null;
  }

  addBlock(projectId: number, type: BlockType): string | null {
    const ctx = this.editable(projectId);
    if (!ctx || !ctx.script.cfg.types.includes(type)) {
      return null;
    }
    const blocks = ctx.unit.blocks ?? [];
    const selected = findBlock(ctx.unit, this.viewOf(projectId).sel);
    const after = selected ?? blocks[blocks.length - 1] ?? null;
    return this.applyInsert(projectId, ctx, after ? after.id : null, type);
  }

  insertAfter(projectId: number, blockId: string): string | null {
    const ctx = this.editable(projectId);
    const block = findBlock(ctx?.unit, blockId);
    if (!ctx || !block) {
      return null;
    }
    const type = edit.typeAfterEnter(ctx.script.cfg, block.type);
    return this.applyInsert(projectId, ctx, blockId, type);
  }

  removeBlock(projectId: number, blockId: string): void {
    const ctx = this.editable(projectId);
    if (ctx) {
      const change = edit.removeBlock(ctx.script, ctx.unit.id, blockId, stampNow());
      this.commit(projectId, change, this.unitPersist(ctx.unit.id, false));
    }
  }

  setBlockType(projectId: number, blockId: string, type: BlockType): void {
    const ctx = this.editable(projectId);
    if (ctx && ctx.script.cfg.types.includes(type)) {
      const change = edit.setBlockType(
        ctx.script,
        ctx.unit.id,
        blockId,
        type,
        ctx.cast,
        stampNow(),
      );
      this.commit(projectId, change, this.unitPersist(ctx.unit.id, false));
    }
  }

  cycleBlockType(projectId: number, blockId: string, backwards: boolean): void {
    const ctx = this.editable(projectId);
    const block = findBlock(ctx?.unit, blockId);
    if (ctx && block) {
      this.setBlockType(projectId, blockId, edit.cycleType(ctx.script.cfg, block.type, backwards));
    }
  }

  patchBlock(projectId: number, blockId: string, patch: BlockPatch): void {
    const ctx = this.editable(projectId);
    if (ctx) {
      const change = edit.patchBlock(ctx.script, ctx.unit.id, blockId, patch, stampNow());
      this.commit(projectId, change, this.unitPersist(ctx.unit.id, false));
    }
  }

  moveBlock(projectId: number, blockId: string, direction: MoveDirection): void {
    const ctx = this.editable(projectId);
    if (ctx) {
      const change = edit.moveBlock(ctx.script, ctx.unit.id, blockId, direction, stampNow());
      this.commit(projectId, change, this.unitPersist(ctx.unit.id, false));
    }
  }

  duplicateBlock(projectId: number, blockId: string): string | null {
    const ctx = this.editable(projectId);
    if (!ctx) {
      return null;
    }
    const change = edit.duplicateBlock(ctx.script, ctx.unit.id, blockId, stampNow());
    this.commit(projectId, change, this.unitPersist(ctx.unit.id, false));
    return change.view.sel ?? null;
  }

  lockUnit(projectId: number): LockResult {
    const target = this.activeOf(projectId);
    const script = this.scriptOf(projectId);
    const source = this.activeSource(projectId);
    if (!script || !target || target.status === 'locked') {
      return 'noop';
    }
    const errors = issuesOf(script.cfg, target, source).filter((item) => item.level === 'error');
    if (errors.length > 0) {
      return 'errors';
    }
    const next = edit.lockUnit(script, target.id, stampNow());
    this.commit(projectId, { script: next, view: {} }, this.unitPersist(target.id, true));
    return 'locked';
  }

  unlockUnit(projectId: number): boolean {
    const target = this.activeOf(projectId);
    const script = this.scriptOf(projectId);
    if (!script || !target || target.status !== 'locked') {
      return false;
    }
    const next = edit.unlockUnit(script, target.id, this.activeSource(projectId), stampNow());
    this.commit(projectId, { script: next, view: {} }, this.unitPersist(target.id, true));
    return true;
  }

  applyDefault(projectId: number): boolean {
    const ctx = this.editable(projectId, false);
    if (!ctx) {
      return false;
    }
    const next = edit.applyDefault(
      ctx.script,
      ctx.unit.id,
      this.activeSource(projectId),
      stampNow(),
    );
    if (!next) {
      return false;
    }
    this.commit(
      projectId,
      { script: next, view: { sel: null } },
      this.unitPersist(ctx.unit.id, true),
    );
    return true;
  }

  resetUnits(projectId: number, scope: ResetScope): number {
    const script = this.scriptOf(projectId);
    const project = this.projects.projectById(projectId);
    const target = this.activeOf(projectId);
    if (!script || !project || !target || target.status === 'locked') {
      return 0;
    }
    const sources = unitSources(script, this.chapterMap(project, script));
    const ids =
      scope === 'all' ? edit.resettableUnits(script, sources).map((unit) => unit.id) : [target.id];
    const result = edit.resetUnits(script, ids, sources, stampNow());
    if (result.count > 0) {
      this.commit(
        projectId,
        { script: result.script, view: { sel: null } },
        { kind: 'script', unitId: null, progress: true },
      );
    }
    return result.count;
  }

  keepStale(projectId: number, ref: string): void {
    const ctx = this.editable(projectId, false);
    if (ctx) {
      const next = edit.keepRef(
        ctx.script,
        ctx.unit.id,
        ref,
        this.activeSource(projectId),
        stampNow(),
      );
      this.commit(projectId, { script: next, view: {} }, this.unitPersist(ctx.unit.id, true));
    }
  }

  regenerate(projectId: number, ref: string): void {
    const ctx = this.editable(projectId, false);
    if (ctx) {
      const next = edit.regenerateRef(
        ctx.script,
        ctx.unit.id,
        ref,
        this.activeSource(projectId),
        stampNow(),
      );
      this.commit(projectId, { script: next, view: {} }, this.unitPersist(ctx.unit.id, true));
    }
  }

  coverParagraph(projectId: number, ref: string): void {
    const ctx = this.editable(projectId, false);
    if (ctx) {
      const next = edit.coverRef(
        ctx.script,
        ctx.unit.id,
        ref,
        this.activeSource(projectId),
        stampNow(),
      );
      this.commit(projectId, { script: next, view: {} }, this.unitPersist(ctx.unit.id, true));
    }
  }

  addCastMember(projectId: number, name: string): CastAddResult {
    const script = this.scriptOf(projectId);
    if (!script) {
      return 'empty';
    }
    const cast = this.castOf(projectId);
    const added = edit.addExtraMember(script, cast, name, this.newCastId(cast));
    this.commit(
      projectId,
      { script: added.script, view: {} },
      { kind: 'cast', unitId: null, progress: false },
    );
    return added.result;
  }

  renameCastMember(projectId: number, id: string, name: string): void {
    const script = this.scriptOf(projectId);
    if (script) {
      this.commit(
        projectId,
        { script: edit.renameExtraMember(script, id, name), view: {} },
        { kind: 'cast', unitId: null, progress: false },
      );
    }
  }

  removeCastMember(projectId: number, id: string): boolean {
    const script = this.scriptOf(projectId);
    if (!script) {
      return false;
    }
    const next = edit.removeExtraMember(script, id);
    this.commit(
      projectId,
      { script: next, view: {} },
      { kind: 'cast', unitId: null, progress: false },
    );
    return next !== script;
  }

  async generateDrafts(projectId: number, unitIds: string[], provider: string): Promise<number> {
    let generated = 0;
    for (const unitId of unitIds) {
      if (await this.generateDraft(projectId, unitId, provider)) {
        generated += 1;
      }
    }
    return generated;
  }

  reset(): void {
    this.scripts.set({});
    this.views.set({});
    this.originals.set({});
    this.drafting.set({});
    this.loadedIds.set({});
    this.chains.clear();
    this.loading.set(false);
    this.error.set(null);
  }

  private async generateDraft(
    projectId: number,
    unitId: string,
    provider: string,
  ): Promise<boolean> {
    await this.ensureSources(projectId, true);
    const request = this.draftRequestOf(projectId, unitId);
    if (!request) {
      return false;
    }
    await this.flush(projectId);
    this.setDrafting(projectId, unitId, true);
    try {
      const result = await this.ipc.invoke<DraftResult>('scripting_draft_generate', {
        projectId,
        unitId,
        provider,
        request,
      });
      this.applyDraft(projectId, result);
      await this.projects.refreshModules(projectId);
      return true;
    } catch (cause) {
      this.error.set(toProjectError(cause));
      return false;
    } finally {
      this.setDrafting(projectId, unitId, false);
    }
  }

  private applyDraft(projectId: number, result: DraftResult): void {
    const script = this.scriptOf(projectId);
    if (script) {
      const next = { ...replaceUnit(script, result.unit), seq: Math.max(script.seq, result.seq) };
      this.scripts.set({ ...this.scripts(), [projectId]: next });
    }
  }

  private draftRequestOf(projectId: number, unitId: string): DraftRequest | null {
    const project = this.projects.projectById(projectId);
    const script = this.scriptOf(projectId);
    const unit = script ? findUnit(script, unitId) : undefined;
    const option = this.draftOptionsOf(projectId).find((item) => item.unit.id === unitId);
    if (!project || !script || !unit || !option || option.reason) {
      return null;
    }
    const kb = this.kbOf(project);
    const source = unitSource(unit, this.chapterMap(project, script));
    return {
      preset: script.cfg.preset,
      unit: { id: unit.id, no: unit.no, title: unit.title, ch: unit.ch, chs: unit.chs },
      source: source ? source.list : null,
      beats: kbBeatsOf(kb, chaptersOf(unit)) ?? [],
      cast: castFor(script, kb),
    };
  }

  private setDrafting(projectId: number, unitId: string, running: boolean): void {
    const current = this.drafting()[projectId] ?? [];
    const next = running ? [...without(current, unitId), unitId] : without(current, unitId);
    this.drafting.set({ ...this.drafting(), [projectId]: next });
  }

  private applyInsert(
    projectId: number,
    ctx: Editable,
    afterId: string | null,
    type: BlockType,
  ): string | null {
    const change = edit.insertBlock(ctx.script, ctx.unit.id, afterId, type, ctx.cast, stampNow());
    this.commit(projectId, change, this.unitPersist(ctx.unit.id, false));
    return change.view.sel ?? null;
  }

  private unitPersist(unitId: string, progress: boolean): Persist {
    return { kind: 'unit', unitId, progress };
  }

  private commit(projectId: number, change: ScriptChange, persist: Persist): void {
    const before = this.scriptOf(projectId);
    if (!before || change.script === before) {
      return;
    }
    const pinned = this.pinnedUnit(projectId, before);
    this.scripts.set({ ...this.scripts(), [projectId]: change.script });
    this.patchView(projectId, { ...pinned, ...change.view });
    this.enqueue(projectId, this.persist.bind(this, projectId, change.script, persist));
  }

  private pinnedUnit(projectId: number, script: Script): Partial<ScriptView> {
    const view = this.viewOf(projectId);
    const active = activeUnit(script, view.unit);
    return view.unit === null && active ? { unit: active.id } : {};
  }

  private enqueue(projectId: number, task: () => Promise<void>): void {
    const previous = this.chains.get(projectId) ?? Promise.resolve();
    this.chains.set(projectId, previous.then(task));
  }

  private async persist(projectId: number, script: Script, persist: Persist): Promise<void> {
    try {
      await this.write(projectId, script, persist);
      if (persist.progress) {
        await this.projects.refreshModules(projectId);
      }
    } catch (cause) {
      this.error.set(toProjectError(cause));
    }
  }

  private async write(projectId: number, script: Script, persist: Persist): Promise<void> {
    if (persist.kind === 'script') {
      await this.ipc.invoke<void>('scripting_save', { projectId, script });
    } else if (persist.kind === 'cast') {
      await this.ipc.invoke<void>('scripting_cast_save', {
        projectId,
        extraCast: script.extraCast,
      });
    } else {
      await this.ipc.invoke<void>('scripting_unit_save', {
        projectId,
        unit: findUnit(script, persist.unitId),
        seq: script.seq,
      });
    }
  }

  private editable(projectId: number, needBlocks = true): Editable | null {
    const project = this.projects.projectById(projectId);
    const script = this.scriptOf(projectId);
    const unit = script ? activeUnit(script, this.viewOf(projectId).unit) : null;
    if (!project || !script || !unit || unit.status === 'locked') {
      return null;
    }
    if (needBlocks && !unit.blocks) {
      return null;
    }
    return { project, script, unit, cast: this.castOf(projectId) };
  }

  private activeOf(projectId: number): ScriptUnit | null {
    const script = this.scriptOf(projectId);
    return script && !script.choose ? activeUnit(script, this.viewOf(projectId).unit) : null;
  }

  private activeSource(projectId: number): ScriptSource | null {
    const project = this.projects.projectById(projectId);
    const script = this.scriptOf(projectId);
    const target = this.activeOf(projectId);
    return project && script && target
      ? unitSource(target, this.chapterMap(project, script))
      : null;
  }

  private castOf(projectId: number): CastMember[] {
    const project = this.projects.projectById(projectId);
    const script = this.scriptOf(projectId);
    return project && script ? castFor(script, this.kbOf(project)) : [];
  }

  private newCastId(cast: CastMember[]): string {
    let id = `spk${Date.now().toString(36)}`;
    while (cast.some((member) => member.id === id)) {
      id = `${id}x`;
    }
    return id;
  }

  private chapterMax(project: ProjectSummary): number {
    const total = project.novelId === null ? 0 : this.novels.chaptersOf(project.novelId).length;
    return total || 99;
  }

  private patchView(projectId: number, patch: Partial<ScriptView>): void {
    if (Object.keys(patch).length === 0) {
      return;
    }
    this.views.set({ ...this.views(), [projectId]: { ...this.viewOf(projectId), ...patch } });
  }

  private kbOf(project: ProjectSummary): KbSnapshot | null {
    if (project.novelId === null) {
      return null;
    }
    return snapshotOf(this.knowledge.of(project.novelId, knowledgeLangOf(project)));
  }

  private chapterMap(
    project: ProjectSummary,
    script: Script,
  ): Record<number, SourceParagraph[] | null> {
    const map: Record<number, SourceParagraph[] | null> = {};
    if (project.novelId === null) {
      return map;
    }
    for (const unit of script.units) {
      for (const seq of chaptersOf(unit)) {
        map[seq] ??= this.paragraphsOf(project, project.novelId, seq);
      }
    }
    return map;
  }

  private paragraphsOf(
    project: ProjectSummary,
    novelId: number,
    seq: number,
  ): SourceParagraph[] | null {
    const translated = usesTranslation(project);
    const row = this.novels.chaptersOf(novelId).find((item) => item.seq === seq);
    const passages = row
      ? this.translation.of(novelId, targetOf(project)).chapters[row.id]?.passages
      : undefined;
    return chapterParagraphs({
      seq,
      originals: this.originals()[originalKey(novelId, seq)],
      passages,
      translated,
    });
  }

  private async loadOriginal(project: ProjectSummary, seq: number): Promise<void> {
    const novelId = project.novelId;
    const row =
      novelId === null
        ? undefined
        : this.novels.chaptersOf(novelId).find((item) => item.seq === seq);
    if (novelId === null || !row || this.originals()[originalKey(novelId, seq)]) {
      return;
    }
    const rows = await this.novels.readChapter(novelId, row.id);
    this.originals.set({ ...this.originals(), [originalKey(novelId, seq)]: rows });
  }

  private async loadNovelData(project: ProjectSummary): Promise<void> {
    if (project.novelId === null) {
      return;
    }
    await this.novels.loadChapters(project.novelId);
    await Promise.all([
      usesTranslation(project)
        ? this.translation.ensure(project.novelId, targetOf(project))
        : Promise.resolve(),
      this.knowledge.ensure(project.novelId, knowledgeLangOf(project)),
    ]);
  }

  private async createScript(project: ProjectSummary): Promise<Script> {
    const script = initialScript(project, this.titlesOf(project));
    await this.ipc.invoke<void>('scripting_save', { projectId: project.id, script });
    return script;
  }

  private titlesOf(project: ProjectSummary): Record<number, string> {
    const titles: Record<number, string> = {};
    const novelId = project.novelId;
    if (novelId === null || project.rangeFrom === null || project.rangeTo === null) {
      return titles;
    }
    for (let seq = project.rangeFrom; seq <= project.rangeTo; seq += 1) {
      const row = this.novels.chaptersOf(novelId).find((item) => item.seq === seq);
      titles[seq] = chapterTitleOf({
        seq,
        hasNovel: true,
        translated: usesTranslation(project),
        translatedTitle: row ? this.translation.titleOf(novelId, row.id, targetOf(project)) : null,
        originalTitle: row ? row.title : null,
      });
    }
    return titles;
  }

  private requireProject(projectId: number): ProjectSummary {
    const project = this.projects.projectById(projectId);
    if (!project) {
      throw { code: 'not_found', detail: `Project ${projectId} not found` };
    }
    return project;
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
