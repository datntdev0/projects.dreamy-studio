import { applicationConfig } from "@storybook/angular-vite";
import type { Decorator } from "@storybook/angular-vite";
import { ChapterRow, NovelSummary } from "@features/novel/novel.models";
import { applyEdits } from "@features/novel/novel.knowledge.draft";
import { AnalyzedChapter, KnowledgeEdit, KnowledgeEditResult, KnowledgeItem, KnowledgeLang, WireKnowledge } from "@features/novel/novel.knowledge.models";
import { PipelineEvent, PipelineSnapshot, PipelineTask, TaskRequest } from "@features/novel/novel.translation.models";
import { batchesOf } from "@features/novel/novel.knowledge.rules";
import { ONTOLOGY_VIEW } from "./novel-knowledge.ontology";
import { CHARACTER_PREDICATE_FACT, KNOWLEDGE_ANALYZED, KNOWLEDGE_ITEMS, chapterItems } from "./novel-knowledge.fixtures";
import { TranslationScenario, handlersFor as translationHandlers } from "./novel-translation.mocks";
import { IpcHandlers, screenProviders } from "./screen.mocks";

const TICK_MS = 600;
const PROGRESS_TICKS = [30, 55, 80, 100];
const FIRST_PIPELINE_ID = 500;
const SEEDED_LANG: KnowledgeLang = "VI";
const KNOWLEDGE_LANGS: KnowledgeLang[] = ["src", "VI", "EN"];

export interface KnowledgeScenario {
  analyzed?: boolean;
  chapters?: boolean;
  translated?: boolean;
  tickMs?: number;
}

interface MockPipeline {
  snapshot: PipelineSnapshot;
  lang: KnowledgeLang;
  emit: (event: PipelineEvent) => void;
  cancelled: boolean;
}

interface LangState {
  items: KnowledgeItem[];
  analyzed: Record<number, AnalyzedChapter>;
}

interface MockState {
  scenario: KnowledgeScenario;
  langs: Record<KnowledgeLang, LangState>;
  nextItem: number;
  history: PipelineSnapshot[];
  nextPipeline: number;
  active: MockPipeline | null;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function seqOf(chapterId: string): number {
  return Number(chapterId.slice(3));
}

function emptyLang(): LangState {
  return { items: [], analyzed: {} };
}

function seededLang(): LangState {
  return { items: [...clone(KNOWLEDGE_ITEMS), clone(CHARACTER_PREDICATE_FACT)], analyzed: clone(KNOWLEDGE_ANALYZED) };
}

function langsFor(scenario: KnowledgeScenario): Record<KnowledgeLang, LangState> {
  const langs: Record<KnowledgeLang, LangState> = { src: emptyLang(), VI: emptyLang(), EN: emptyLang() };
  if (scenario.analyzed !== false) {
    langs[SEEDED_LANG] = seededLang();
  }
  return langs;
}

function langOf(args: Record<string, unknown>): KnowledgeLang {
  const lang = args["lang"] as KnowledgeLang;
  if (!KNOWLEDGE_LANGS.includes(lang)) {
    throw { code: "invalid_input", detail: "Unknown language." };
  }
  return lang;
}

function wireOf(state: MockState, lang: KnowledgeLang): WireKnowledge {
  return { lang, ontology: clone(ONTOLOGY_VIEW), items: clone(state.langs[lang].items), analyzed: clone(state.langs[lang].analyzed) };
}

function clearStale(target: LangState, chapters: number[]): void {
  for (const seq of chapters) {
    if (target.analyzed[seq]) {
      target.analyzed[seq].stale = false;
    }
  }
  for (const item of target.items) {
    item.stale = item.stale.filter((seq) => !chapters.includes(seq));
  }
}

function createdRefs(edits: KnowledgeEdit[]): string[] {
  const refs: string[] = [];
  for (const edit of edits) {
    if (edit.k === "add_entity" || edit.k === "add_fact") {
      refs.push(edit.ref);
    }
    if (edit.k === "character") {
      refs.push(`${edit.persona}.character`, `${edit.persona}.link`);
    }
  }
  return refs;
}

function rekey(items: KnowledgeItem[], from: string, to: string): void {
  for (const item of items) {
    item.id = item.id === from ? to : item.id;
    if (item.kind === "fact") {
      item.subject = item.subject === from ? to : item.subject;
      item.object = item.object === from ? to : item.object;
    }
  }
}

function assignIds(state: MockState, items: KnowledgeItem[], edits: KnowledgeEdit[]): Record<string, string> {
  const remap: Record<string, string> = {};
  for (const ref of createdRefs(edits)) {
    if (items.some((item) => item.id === ref)) {
      remap[ref] = `M${state.nextItem}`;
      state.nextItem += 1;
      rekey(items, ref, remap[ref]);
    }
  }
  return remap;
}

function editKnowledge(state: MockState, args: Record<string, unknown>): KnowledgeEditResult {
  const lang = langOf(args);
  const edits = clone(args["edits"] as KnowledgeEdit[]);
  const items = applyEdits(state.langs[lang].items, edits);
  const remap = assignIds(state, items, edits);
  state.langs[lang].items = items;
  return { knowledge: wireOf(state, lang), remap };
}

function acceptStale(state: MockState, args: Record<string, unknown>): WireKnowledge {
  const lang = langOf(args);
  clearStale(state.langs[lang], args["chapters"] as number[]);
  return wireOf(state, lang);
}

function emitTask(pipeline: MockPipeline, task: PipelineTask): void {
  pipeline.emit({ type: "task", pipelineId: pipeline.snapshot.id, task: { ...task } });
}

function writeChapter(state: MockState, seq: number, lang: KnowledgeLang): void {
  const target = state.langs[lang];
  const made = chapterItems(seq);
  const known = new Set(target.items.map((item) => item.id));
  target.items = [...target.items, ...made.filter((item) => !known.has(item.id))];
  const entities = made.filter((item) => item.kind === "entity").length;
  target.analyzed[seq] = { at: new Date().toISOString(), entities, facts: made.length - entities, stale: false };
  clearStale(target, [seq]);
}

async function runTask(state: MockState, pipeline: MockPipeline, task: PipelineTask): Promise<void> {
  const tick = state.scenario.tickMs ?? TICK_MS;
  for (const progress of PROGRESS_TICKS) {
    await pause(tick + (seqOf(task.chapterId) % 3) * Math.round(tick / 3));
    if (pipeline.cancelled) {
      return;
    }
    task.progress = progress;
    emitTask(pipeline, task);
  }
  writeChapter(state, seqOf(task.chapterId), pipeline.lang);
  task.status = "completed";
  task.finishedAt = new Date().toISOString();
  emitTask(pipeline, task);
}

async function runBatch(state: MockState, pipeline: MockPipeline, tasks: PipelineTask[]): Promise<void> {
  const tick = state.scenario.tickMs ?? TICK_MS;
  for (const task of tasks) {
    task.status = "running";
    task.startedAt = new Date().toISOString();
    task.progress = 10;
    emitTask(pipeline, task);
  }
  await pause(tick * 3);
  if (!pipeline.cancelled) {
    await Promise.all(tasks.map((task) => runTask(state, pipeline, task)));
  }
}

function finish(state: MockState, pipeline: MockPipeline): void {
  const snapshot = pipeline.snapshot;
  if (pipeline.cancelled) {
    for (const task of snapshot.tasks) {
      if (task.status === "queued" || task.status === "running") {
        task.status = "cancelled";
        task.finishedAt = new Date().toISOString();
        emitTask(pipeline, task);
      }
    }
  }
  snapshot.status = pipeline.cancelled ? "cancelled" : "completed";
  snapshot.done = snapshot.tasks.filter((task) => task.status === "completed").length;
  snapshot.finishedAt = new Date().toISOString();
  pipeline.emit({ type: "finished", pipeline: clone(snapshot) });
  state.history.unshift(clone(snapshot));
  state.active = null;
}

async function runAnalysis(state: MockState, pipeline: MockPipeline): Promise<void> {
  pipeline.snapshot.startedAt = new Date().toISOString();
  pipeline.emit({ type: "started", pipeline: clone(pipeline.snapshot) });
  const bySeq = new Map(pipeline.snapshot.tasks.map((task) => [seqOf(task.chapterId), task]));
  for (const group of batchesOf([...bySeq.keys()])) {
    if (pipeline.cancelled) {
      break;
    }
    await runBatch(state, pipeline, group.map((seq) => bySeq.get(seq) as PipelineTask));
  }
  finish(state, pipeline);
}

function startAnalysis(state: MockState, args: Record<string, unknown>): PipelineSnapshot {
  if (state.active) {
    throw { code: "pipeline_busy", detail: "A pipeline is already running." };
  }
  const requests = args["tasks"] as TaskRequest[];
  const createdAt = new Date().toISOString();
  const snapshot: PipelineSnapshot = {
    id: state.nextPipeline,
    novelId: Number(args["novelId"]),
    kind: "analysis",
    target: "Knowledge",
    status: "running",
    total: requests.length,
    done: 0,
    failed: 0,
    createdAt,
    startedAt: null,
    finishedAt: null,
    tasks: requests.map((task, index) => ({ id: index + 1, chapterId: task.chapterId, passage: null, status: "queued", progress: 0, error: "", startedAt: null, finishedAt: null })),
  };
  state.nextPipeline += 1;
  const emit = (args["onEvent"] as { emit: (event: PipelineEvent) => void }).emit;
  const pipeline: MockPipeline = { snapshot, lang: langOf(args), emit, cancelled: false };
  state.active = pipeline;
  setTimeout(() => void runAnalysis(state, pipeline), 0);
  return clone(snapshot);
}

function withAnalysis(rows: ChapterRow[], state: MockState): ChapterRow[] {
  return rows.map((row) => ({ ...row, analysisStatus: state.langs[SEEDED_LANG].analyzed[row.seq] ? "done" : "none" }));
}

function knowledgeHandlers(state: MockState, base: IpcHandlers): IpcHandlers {
  return {
    ...base,
    novel_list: (args) => (base["novel_list"](args) as NovelSummary[]).map((novel) => ({ ...novel, analyzedCount: Object.keys(state.langs[SEEDED_LANG].analyzed).length })),
    novel_chapters: (args) => withAnalysis(base["novel_chapters"](args) as ChapterRow[], state),
    knowledge_get: (args): WireKnowledge => wireOf(state, langOf(args)),
    knowledge_edit: (args) => editKnowledge(state, args),
    knowledge_stale_accept: (args) => acceptStale(state, args),
    pipeline_start: (args) => (args["kind"] === "analysis" ? startAnalysis(state, args) : base["pipeline_start"](args)),
    pipeline_cancel: (args) => {
      if (state.active && state.active.snapshot.id === Number(args["pipelineId"])) {
        state.active.cancelled = true;
        return true;
      }
      return base["pipeline_cancel"](args);
    },
    pipeline_history_list: (args) => [...state.history.filter((item) => item.novelId === Number(args["novelId"])), ...(base["pipeline_history_list"](args) as PipelineSnapshot[])],
  };
}

function stateFor(scenario: KnowledgeScenario): MockState {
  return {
    scenario,
    langs: langsFor(scenario),
    nextItem: 1,
    history: [],
    nextPipeline: FIRST_PIPELINE_ID,
    active: null,
  };
}

function handlersFor(scenario: KnowledgeScenario): IpcHandlers {
  const translation: TranslationScenario = { translated: scenario.translated ?? true, warnings: false, chapters: scenario.chapters };
  return knowledgeHandlers(stateFor(scenario), translationHandlers(translation));
}

export function knowledgeScreenHandlers(scenario: KnowledgeScenario = {}): IpcHandlers {
  return handlersFor(scenario);
}

export function withKnowledge(scenario: KnowledgeScenario = {}): { decorators: Decorator[] } {
  return { decorators: [applicationConfig({ providers: screenProviders(handlersFor(scenario)) })] };
}
