import { applicationConfig } from "@storybook/angular-vite";
import type { Decorator } from "@storybook/angular-vite";
import { ChapterRow, NovelSummary } from "@app/features/novel/novel.models";
import { AnalyzedChapter, KnowledgeChange, KnowledgeItem, KnowledgeLang, WireKnowledge } from "@app/features/novel/novel.knowledge.models";
import { PipelineEvent, PipelineSnapshot, PipelineTask, TaskRequest } from "@app/features/novel/novel.translation.models";
import { batchesOf } from "@app/features/novel/novel.knowledge.rules";
import { CHARACTER_PREDICATE_FACT, KNOWLEDGE_ANALYZED, KNOWLEDGE_ITEMS, chapterItems } from "./novel-knowledge.fixtures";
import { TranslationScenario, handlersFor as translationHandlers } from "./novel-translation.mocks";
import { IpcHandlers, screenProviders } from "./screen.mocks";

const TICK_MS = 600;
const PROGRESS_TICKS = [30, 55, 80, 100];
const FIRST_PIPELINE_ID = 500;

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

interface MockState {
  scenario: KnowledgeScenario;
  items: KnowledgeItem[];
  analyzed: Record<number, AnalyzedChapter>;
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

function seedItems(scenario: KnowledgeScenario): KnowledgeItem[] {
  return scenario.analyzed === false ? [] : [...clone(KNOWLEDGE_ITEMS), clone(CHARACTER_PREDICATE_FACT)];
}

function emitTask(pipeline: MockPipeline, task: PipelineTask): void {
  pipeline.emit({ type: "task", pipelineId: pipeline.snapshot.id, task: { ...task } });
}

function writeChapter(state: MockState, seq: number, lang: KnowledgeLang): void {
  const made = chapterItems(seq);
  const known = new Set(state.items.map((item) => item.id));
  state.items = [...state.items, ...made.filter((item) => !known.has(item.id))];
  const entities = made.filter((item) => item.kind === "entity").length;
  state.analyzed[seq] = { lang, at: new Date().toISOString(), entities, facts: made.length - entities };
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
  const pipeline: MockPipeline = { snapshot, lang: args["lang"] as KnowledgeLang, emit, cancelled: false };
  state.active = pipeline;
  setTimeout(() => void runAnalysis(state, pipeline), 0);
  return clone(snapshot);
}

function applyChange(state: MockState, change: KnowledgeChange): void {
  const gone = new Set(change.remove);
  const changed = new Map(change.upsert.map((item) => [item.id, item]));
  const kept = state.items.filter((item) => !gone.has(item.id)).map((item) => changed.get(item.id) ?? item);
  const known = new Set(kept.map((item) => item.id));
  state.items = [...kept, ...change.upsert.filter((item) => !known.has(item.id))];
}

function withAnalysis(rows: ChapterRow[], state: MockState): ChapterRow[] {
  return rows.map((row) => ({ ...row, analysisStatus: state.analyzed[row.seq] ? "done" : "none" }));
}

function knowledgeHandlers(state: MockState, base: IpcHandlers): IpcHandlers {
  return {
    ...base,
    novel_list: (args) => (base["novel_list"](args) as NovelSummary[]).map((novel) => ({ ...novel, analyzedCount: Object.keys(state.analyzed).length })),
    novel_chapters: (args) => withAnalysis(base["novel_chapters"](args) as ChapterRow[], state),
    knowledge_get: (): WireKnowledge => ({ items: clone(state.items), analyzed: clone(state.analyzed) }),
    knowledge_save: (args) => {
      applyChange(state, clone(args["change"] as KnowledgeChange));
      return undefined;
    },
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
    items: seedItems(scenario),
    analyzed: scenario.analyzed === false ? {} : clone(KNOWLEDGE_ANALYZED),
    history: [],
    nextPipeline: FIRST_PIPELINE_ID,
    active: null,
  };
}

function handlersFor(scenario: KnowledgeScenario): IpcHandlers {
  const translation: TranslationScenario = { translated: scenario.translated ?? true, warnings: false, chapters: scenario.chapters };
  return knowledgeHandlers(stateFor(scenario), translationHandlers(translation));
}

export function withKnowledge(scenario: KnowledgeScenario = {}): { decorators: Decorator[] } {
  return { decorators: [applicationConfig({ providers: screenProviders(handlersFor(scenario)) })] };
}
