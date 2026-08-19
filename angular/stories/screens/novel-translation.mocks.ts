import { EnvironmentProviders, Provider, inject, provideAppInitializer } from "@angular/core";
import { applicationConfig } from "@storybook/angular-vite";
import type { Decorator } from "@storybook/angular-vite";
import { DesktopIpcService } from "@app/core/desktop/desktop-ipc.service";
import { I18nService } from "@app/core/i18n/i18n.service";
import { SettingsService } from "@app/features/settings/settings.service";
import { SettingsView } from "@app/features/settings/settings.models";
import { WorkspaceService } from "@app/features/workspace/workspace.service";
import { ChapterRow, NovelSummary, ParagraphRow, TranslationStatus } from "@app/features/novel/novel.models";
import { DictEntry, PipelineEvent, PipelineSnapshot, PipelineTask, TaskRequest, WireChapter, WireTranslation, WireWarning } from "@app/features/novel/novel.translation.models";
import { APP_INFO, CURRENT_WORKSPACE, LLM_PROVIDERS, llmServiceProvider } from "../features/mocks";
import { LANTERN_CHAPTERS, LANTERN_VI, LANTERN_VI_TITLES } from "./novel-translation.fixtures";

export const NOVEL_ID = 1;

const STAMP = "2026-11-09T09:15:00Z";
const PROGRESS_TICKS = [20, 40, 60, 80, 100];
const PIPELINE_DELAY_MS = 200;
const MAX_PARALLEL_TASKS = 5;
const COVER = `data:image/svg+xml;utf8,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='96' height='128'><defs><linearGradient id='g' x1='0' y1='0' x2='0.4' y2='1'><stop offset='0' stop-color='#1d2340'/><stop offset='0.55' stop-color='#5b6cff'/><stop offset='1' stop-color='#e08a4b'/></linearGradient></defs><rect width='96' height='128' fill='url(#g)'/></svg>")}`;

const GUIDELINES = [
  "Translate for adult readers who love dark fantasy.",
  "Tone: formal, slow sentence rhythm, slightly archaic.",
  "Forms of address: third person uses “cô” / “anh”. Do not use “hắn”, “nàng”.",
  "Conventions: keep proper names. Place names with a meaning are translated by meaning (Tháp Đèn, Bến Chìm). Use “ ” marks for dialogue.",
].join("\n");

const SETTINGS: SettingsView = {
  dataDir: "C:\\Users\\dreamy\\AppData\\Roaming\\dreamy-studio",
  file: "settings.json",
  general: {},
  layout: { explorerOpen: true, inspectorOpen: true, bottomOpen: true, rightTab: "inspector" },
};

const TRANSLATED_CHAPTERS = 2;
const SAMPLE_CHAPTERS = 3;

export interface TranslationScenario {
  chapters?: boolean;
  translated?: boolean;
  warnings?: boolean;
}

interface MockState {
  scenario: TranslationScenario;
  translations: Record<string, WireTranslation>;
  nextDictionaryId: number;
  nextPipelineId: number;
  activePipeline: MockPipeline | null;
}

interface MockPipeline {
  snapshot: PipelineSnapshot;
  target: string;
  emit: (event: PipelineEvent) => void;
  cancelled: boolean;
  finalized: boolean;
  nextTask: number;
}

function chapterId(seq: number): string {
  return `ch-${seq}`;
}

function status(seq: number, translated: boolean): TranslationStatus {
  if (!translated || seq > TRANSLATED_CHAPTERS) {
    return "none";
  }
  return seq === 2 ? "review" : "draft";
}

function chapterRows(translated: boolean): ChapterRow[] {
  return LANTERN_CHAPTERS.map((chapter, index) => ({
    id: chapterId(index + 1),
    novelId: NOVEL_ID,
    seq: index + 1,
    title: chapter.title,
    wordCount: chapter.words,
    translationStatus: status(index + 1, translated),
    analysisStatus: "none",
    createdAt: STAMP,
    updatedAt: STAMP,
  }));
}

function novelSummary(chapters: number, words: number, translated: number): NovelSummary {
  return {
    id: NOVEL_ID,
    title: "哈罗米尔的守灯人",
    name: "",
    author: "伊索尔德·维兰",
    lang: "ZH",
    description: "雾锁港城的最后一位守灯人，和一个被派来清点剩余之物的书记员。",
    origin: "imported",
    createdAt: STAMP,
    updatedAt: STAMP,
    chapterCount: chapters,
    wordCount: words,
    translatedCount: translated,
    analyzedCount: 0,
    tags: ["奇幻", "暗黑", "港口"],
  };
}

function sourceOf(chapterIdValue: string): ParagraphRow[] {
  const seq = Number(chapterIdValue.slice(3));
  const chapter = seq <= SAMPLE_CHAPTERS ? LANTERN_CHAPTERS[seq - 1] : undefined;
  return (chapter?.paragraphs ?? []).map((text, index) => ({ n: index + 1, text, hashcheck: `mock-${seq}-${index + 1}` }));
}

function viText(seq: number, n: number): string {
  const key = `${seq}.${n}`;
  return LANTERN_VI[key] ?? `[Mock] ${LANTERN_CHAPTERS[seq - 1]?.paragraphs[n - 1] ?? ""}`;
}

function dictionary(): DictEntry[] {
  return [
    { id: 1, src: "雷恩·奥尔德斯", dst: "Wren Aldous", type: "name", note: "Keep as is" },
    { id: 2, src: "马洛·奎尔", dst: "Maro Quill", type: "name", note: "Keep as is" },
    { id: 3, src: "塞弗林夫人", dst: "Phu nhân Sevrin", type: "title", note: "" },
    { id: 4, src: "灯塔", dst: "Tháp Đèn", type: "place", note: "" },
    { id: 5, src: "沉没码头", dst: "Bến Chìm", type: "place", note: "Translate by meaning" },
    { id: 6, src: "哈罗米尔", dst: "Harrowmere", type: "place", note: "Keep as is" },
    { id: 7, src: "议会", dst: "Hội đồng", type: "org", note: "" },
    { id: 8, src: "港口书记员", dst: "thư lại bến cảng", type: "title", note: "" },
    { id: 9, src: "守灯人", dst: "người giữ đèn", type: "term", note: "Changed from “người coi đèn” for consistency" },
    { id: 10, src: "账簿", dst: "sổ cái", type: "term", note: "" },
  ];
}

function chapterTranslation(seq: number): WireChapter {
  return {
    title: LANTERN_VI_TITLES[seq - 1],
    paragraphs: sourceOf(chapterId(seq)).map((row) => ({
      n: row.n,
      originalHashcheck: seq === 1 && row.n === 3 ? "mock-stale-1-3" : row.hashcheck,
      text: viText(seq, row.n),
      note: seq === 1 && row.n === 4 ? "Giọng Wren nên cộc và lạnh. Cân nhắc bỏ “đâu có”." : "",
    })),
  };
}

function emptyWireTranslation(): WireTranslation {
  return { guidelines: "", dict: [], chapters: {}, warnings: [] };
}

function seededTranslation(scenario: TranslationScenario): WireTranslation {
  const translation: WireTranslation = { guidelines: GUIDELINES, dict: dictionary(), chapters: {}, warnings: [] };
  if (scenario.translated !== false) {
    translation.chapters = { [chapterId(1)]: chapterTranslation(1), [chapterId(2)]: chapterTranslation(2) };
  }
  return translation;
}

function cloneChapter(chapter: WireChapter): WireChapter {
  return { title: chapter.title, paragraphs: chapter.paragraphs.map((paragraph) => ({ ...paragraph })) };
}

function cloneTranslation(translation: WireTranslation): WireTranslation {
  const chapters: Record<string, WireChapter> = {};
  for (const [id, chapter] of Object.entries(translation.chapters)) {
    chapters[id] = cloneChapter(chapter);
  }
  return { guidelines: translation.guidelines, dict: translation.dict.map((entry) => ({ ...entry })), chapters, warnings: translation.warnings.map((warning) => ({ ...warning })) };
}

function matchesTerm(text: string, term: string): boolean {
  return text.toLocaleLowerCase().includes(term.toLocaleLowerCase());
}

function warningsFor(translation: WireTranslation): WireWarning[] {
  const warnings: WireWarning[] = [];
  for (let seq = 1; seq <= LANTERN_CHAPTERS.length; seq += 1) {
    const id = chapterId(seq);
    const chapter = translation.chapters[id];
    if (!chapter) {
      continue;
    }
    for (const paragraph of chapter.paragraphs) {
      const source = sourceOf(id).find((item) => item.n === paragraph.n);
      if (!source) {
        continue;
      }
      if (source.hashcheck !== paragraph.originalHashcheck) {
        warnings.push({ kind: "source", chapterId: id, n: paragraph.n, entryId: null });
      }
      for (const entry of translation.dict) {
        if (entry.src && matchesTerm(source.text, entry.src) && !matchesTerm(paragraph.text, entry.dst)) {
          warnings.push({ kind: "dict", chapterId: id, n: paragraph.n, entryId: entry.id });
        }
      }
    }
  }
  return warnings;
}

function refreshWarnings(translation: WireTranslation): WireWarning[] {
  const warnings = warningsFor(translation);
  translation.warnings = warnings;
  return warnings;
}

function translationKey(novelId: number, target: string): string {
  return `${novelId}:${target}`;
}

function translationFor(state: MockState, novelId: number, target: string): WireTranslation {
  const key = translationKey(novelId, target);
  if (!state.translations[key]) {
    state.translations[key] = target === "VI" ? seededTranslation(state.scenario) : emptyWireTranslation();
    refreshWarnings(state.translations[key]);
  }
  return state.translations[key];
}

function chapterFor(translation: WireTranslation, chapterIdValue: string): WireChapter {
  const chapter = translation.chapters[chapterIdValue];
  if (!chapter) {
    throw new Error(`No translated chapter: ${chapterIdValue}`);
  }
  return chapter;
}

function dictionaryWarningCount(translation: WireTranslation, entryId: number): number {
  return warningsFor(translation).filter((warning) => warning.kind === "dict" && warning.entryId === entryId).length;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emitTask(pipeline: MockPipeline, task: PipelineTask): void {
  pipeline.emit({ type: "task", pipelineId: pipeline.snapshot.id, task: { ...task } });
}

function finishPipeline(state: MockState, pipeline: MockPipeline, status: PipelineSnapshot["status"]): void {
  if (pipeline.finalized) {
    return;
  }
  pipeline.finalized = true;
  pipeline.snapshot.status = status;
  pipeline.snapshot.done = pipeline.snapshot.tasks.filter((task) => task.status === "completed").length;
  pipeline.snapshot.failed = pipeline.snapshot.tasks.filter((task) => task.status === "failed").length;
  pipeline.snapshot.finishedAt = new Date().toISOString();
  pipeline.emit({ type: "finished", pipeline: clonePipeline(pipeline.snapshot) });
  if (state.activePipeline === pipeline) {
    state.activePipeline = null;
  }
}

function cancelPipeline(state: MockState): boolean {
  const pipeline = state.activePipeline;
  if (!pipeline || pipeline.finalized) {
    return false;
  }
  pipeline.cancelled = true;
  for (const task of pipeline.snapshot.tasks) {
    if (task.status === "queued" || task.status === "running") {
      task.status = "cancelled";
      task.finishedAt = new Date().toISOString();
      emitTask(pipeline, task);
    }
  }
  finishPipeline(state, pipeline, "cancelled");
  return true;
}

function writeTranslatedTask(state: MockState, pipeline: MockPipeline, task: PipelineTask): void {
  const translation = translationFor(state, pipeline.snapshot.novelId, pipeline.target);
  const source = sourceOf(task.chapterId);
  if (task.passage === null) {
    const existing = translation.chapters[task.chapterId];
    const notes = new Map(existing?.paragraphs.map((paragraph) => [paragraph.n, paragraph.note]));
    translation.chapters[task.chapterId] = {
      title: `[translated] ${LANTERN_CHAPTERS[Number(task.chapterId.slice(3)) - 1]?.title ?? ""}`,
      paragraphs: source.map((paragraph) => ({ n: paragraph.n, originalHashcheck: paragraph.hashcheck, text: `[translated] ${paragraph.text}`, note: notes.get(paragraph.n) ?? "" })),
    };
    refreshWarnings(translation);
    return;
  }
  const chapter = chapterFor(translation, task.chapterId);
  const paragraph = source.find((item) => item.n === task.passage);
  const translated = chapter.paragraphs.find((item) => item.n === task.passage);
  if (paragraph && translated) {
    translated.text = `[translated] ${paragraph.text}`;
    translated.originalHashcheck = paragraph.hashcheck;
  }
  refreshWarnings(translation);
}

async function runTask(state: MockState, pipeline: MockPipeline, task: PipelineTask): Promise<void> {
  task.status = "running";
  task.startedAt = new Date().toISOString();
  emitTask(pipeline, task);
  for (const progress of PROGRESS_TICKS) {
    await pause(PIPELINE_DELAY_MS);
    if (pipeline.cancelled || pipeline.finalized) {
      return;
    }
    task.progress = progress;
    emitTask(pipeline, task);
  }
  if (pipeline.cancelled || pipeline.finalized) {
    return;
  }
  try {
    writeTranslatedTask(state, pipeline, task);
    task.status = "completed";
    task.finishedAt = new Date().toISOString();
    emitTask(pipeline, task);
  } catch (cause) {
    task.status = "failed";
    task.error = cause instanceof Error ? cause.message : String(cause);
    task.finishedAt = new Date().toISOString();
    emitTask(pipeline, task);
  }
}

async function runWorker(state: MockState, pipeline: MockPipeline): Promise<void> {
  while (!pipeline.cancelled && !pipeline.finalized) {
    const task = pipeline.snapshot.tasks[pipeline.nextTask];
    pipeline.nextTask += 1;
    if (!task) {
      return;
    }
    await runTask(state, pipeline, task);
  }
}

async function runPipeline(state: MockState, pipeline: MockPipeline): Promise<void> {
  if (pipeline.finalized) {
    return;
  }
  pipeline.snapshot.startedAt = new Date().toISOString();
  pipeline.emit({ type: "started", pipeline: clonePipeline(pipeline.snapshot) });
  const workerCount = Math.min(MAX_PARALLEL_TASKS, pipeline.snapshot.tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker(state, pipeline)));
  if (!pipeline.finalized) {
    finishPipeline(state, pipeline, pipeline.cancelled ? "cancelled" : pipeline.snapshot.failed > 0 ? "failed" : "completed");
  }
}

function runPipelineSafely(state: MockState, pipeline: MockPipeline): void {
  void runPipeline(state, pipeline).catch(() => finishPipeline(state, pipeline, "failed"));
}

function clonePipeline(snapshot: PipelineSnapshot): PipelineSnapshot {
  return { ...snapshot, tasks: snapshot.tasks.map((task) => ({ ...task })) };
}

function startPipeline(state: MockState, args: Record<string, unknown>): PipelineSnapshot {
  if (state.activePipeline) {
    throw { code: "pipeline_busy", detail: "A pipeline is already running." };
  }
  const tasks = args["tasks"] as TaskRequest[];
  const emit = (args["onEvent"] as { emit: (event: PipelineEvent) => void }).emit;
  const createdAt = new Date().toISOString();
  const snapshot: PipelineSnapshot = {
    id: state.nextPipelineId,
    novelId: Number(args["novelId"]),
    kind: "translation",
    target: String(args["target"]),
    status: "running",
    total: tasks.length,
    done: 0,
    failed: 0,
    createdAt,
    startedAt: null,
    finishedAt: null,
    tasks: tasks.map((task, index) => ({ id: index + 1, chapterId: task.chapterId, passage: task.passage, status: "queued", progress: 0, error: "", startedAt: null, finishedAt: null })),
  };
  state.nextPipelineId += 1;
  const pipeline: MockPipeline = { snapshot, target: snapshot.target, emit, cancelled: false, finalized: false, nextTask: 0 };
  state.activePipeline = pipeline;
  setTimeout(runPipelineSafely, 0, state, pipeline);
  return clonePipeline(snapshot);
}

function ipcHandlers(state: MockState, rows: ChapterRow[]): Record<string, (args: Record<string, unknown>) => unknown> {
  const words = rows.reduce((total, row) => total + row.wordCount, 0);
  return {
    app_info: () => APP_INFO,
    workspace_current: () => CURRENT_WORKSPACE,
    settings_get: () => SETTINGS,
    novel_list: () => [novelSummary(rows.length, words, rows.filter((row) => row.translationStatus !== "none").length)],
    novel_chapters: () => rows,
    novel_chapter_read: (args) => sourceOf(String(args["chapterId"])),
    novel_cover_get: () => COVER,
    translation_get: (args) => {
      const translation = translationFor(state, Number(args["novelId"]), String(args["target"]));
      refreshWarnings(translation);
      return cloneTranslation(translation);
    },
    translation_warnings: (args) => {
      const translation = translationFor(state, Number(args["novelId"]), String(args["target"]));
      return refreshWarnings(translation).map((warning) => ({ ...warning }));
    },
    translation_guidelines_save: (args) => {
      const translation = translationFor(state, Number(args["novelId"]), String(args["target"]));
      const text = String(args["text"]).trim();
      if (translation.guidelines === text) {
        return false;
      }
      translation.guidelines = text;
      return true;
    },
    translation_dict_add: (args) => {
      const translation = translationFor(state, Number(args["novelId"]), String(args["target"]));
      const input = args["input"] as Omit<DictEntry, "id">;
      const entry: DictEntry = { id: state.nextDictionaryId, src: input.src, dst: input.dst, type: input.type, note: input.note };
      state.nextDictionaryId += 1;
      translation.dict.push(entry);
      return { entry: { ...entry }, flagged: dictionaryWarningCount(translation, entry.id) };
    },
    translation_dict_update: (args) => {
      const id = Number(args["id"]);
      const patch = args["patch"] as Partial<Omit<DictEntry, "id">>;
      const translation = Object.values(state.translations).find((item) => item.dict.some((entry) => entry.id === id));
      const entry = translation?.dict.find((item) => item.id === id);
      if (!translation || !entry) {
        throw new Error(`No dictionary entry: ${id}`);
      }
      Object.assign(entry, patch);
      return { entry: { ...entry }, flagged: dictionaryWarningCount(translation, id) };
    },
    translation_dict_delete: (args) => {
      const id = Number(args["id"]);
      for (const translation of Object.values(state.translations)) {
        translation.dict = translation.dict.filter((entry) => entry.id !== id);
        refreshWarnings(translation);
      }
      return undefined;
    },
    translation_passage_save: (args) => {
      const translation = translationFor(state, Number(args["novelId"]), String(args["target"]));
      const chapter = chapterFor(translation, String(args["chapterId"]));
      const paragraph = chapter.paragraphs.find((item) => item.n === Number(args["n"]));
      if (!paragraph) {
        throw new Error(`No translated paragraph: ${args["n"]}`);
      }
      paragraph.text = String(args["text"]);
      refreshWarnings(translation);
      return cloneChapter(chapter);
    },
    translation_note_save: (args) => {
      const translation = translationFor(state, Number(args["novelId"]), String(args["target"]));
      const chapter = chapterFor(translation, String(args["chapterId"]));
      const paragraph = chapter.paragraphs.find((item) => item.n === Number(args["n"]));
      if (!paragraph) {
        throw new Error(`No translated paragraph: ${args["n"]}`);
      }
      paragraph.note = String(args["text"]).trim();
      return cloneChapter(chapter);
    },
    pipeline_start: (args) => startPipeline(state, args),
    pipeline_cancel: () => cancelPipeline(state),
    pipeline_history_list: () => [],
  };
}

function ipcProvider(scenario: TranslationScenario): Provider {
  const rows = scenario.chapters === false ? [] : chapterRows(scenario.translated !== false);
  const state: MockState = { scenario, translations: {}, nextDictionaryId: 11, nextPipelineId: 1, activePipeline: null };
  const handlers = ipcHandlers(state, rows);
  const mock: Partial<DesktopIpcService> = {
    invoke: <TResult>(command: string, args: Record<string, unknown> = {}): Promise<TResult> => Promise.resolve((handlers[command]?.(args) ?? (command.endsWith("_list") ? [] : undefined)) as TResult),
    channel: <TMessage>(onMessage: (message: TMessage) => void) => ({ emit: onMessage }) as never,
  };
  return { provide: DesktopIpcService, useValue: mock };
}

function languageProvider(): EnvironmentProviders {
  return provideAppInitializer(startup);
}

async function startup(): Promise<void> {
  const settings = inject(SettingsService);
  const workspace = inject(WorkspaceService);
  inject(I18nService).init();
  await settings.load();
  await workspace.restoreCurrent();
}

export function translationProviders(scenario: TranslationScenario = {}): Array<Provider | EnvironmentProviders> {
  return [ipcProvider(scenario), llmServiceProvider(LLM_PROVIDERS), languageProvider()];
}

export function withTranslation(scenario: TranslationScenario = {}): { decorators: Decorator[] } {
  return { decorators: [applicationConfig({ providers: translationProviders(scenario) })] };
}
