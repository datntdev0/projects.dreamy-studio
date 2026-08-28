import { expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import type { Ui } from "./fixtures.ts";
import type { BottomTab } from "../pages/pipeline.ts";
import type { Sandbox } from "./sandbox.ts";
import { WORKSPACE_DB_FILE, readWorkspace } from "./workspaces.ts";

export async function showBottomPanel(ui: Ui, tab: BottomTab = "pipelines"): Promise<void> {
  const bottom = ui.main.pipelines.bottom;
  if (!(await bottom.root.isVisible())) {
    await ui.main.pipelines.statusbar.button.click();
  }
  await expect(bottom.root).toBeVisible();
  await bottom.tab(tab).click();
  await expect(bottom.tab(tab)).toHaveAttribute("aria-pressed", "true");
  await expect(bottom.body(tab)).toBeVisible();
}

export async function hideBottomPanel(ui: Ui): Promise<void> {
  if (await ui.main.pipelines.bottom.root.isVisible()) {
    await ui.main.pipelines.bottom.close.click();
  }
  await expect(ui.main.pipelines.bottom.root).toBeHidden();
}

export async function showPipelineHistory(ui: Ui): Promise<void> {
  await ui.main.pipelines.rail.click();
  await expect(ui.main.pipelines.history.host).toBeVisible();
  await expect(ui.main.pipelines.history.root).toBeVisible();
}

export async function expectStatusIdle(ui: Ui): Promise<void> {
  await expect(ui.main.pipelines.statusbar.idle).toBeVisible();
}

export async function expectStatusRunning(ui: Ui): Promise<void> {
  await expect(ui.main.pipelines.statusbar.running).toBeVisible();
}

export const AZURE = "Azure Chronicle";
export const HARBOR = "Harbor Lights";
export const EMBER = "Ember Vale";

export const KIND_TEXT = {
  translation: /(translation|dịch)\s*·\s*VI/i,
  analysis: /(analysis|phân tích)\s*·\s*src/i,
} as const;

export interface HistoryExpectation {
  readonly novel: string;
  readonly kind: keyof typeof KIND_TEXT;
  readonly status: "completed" | "failed" | "cancelled";
  readonly done: string;
  readonly failed: number;
}

export const NEWEST_FIRST: readonly HistoryExpectation[] = [
  { novel: HARBOR, kind: "translation", status: "completed", done: "2/2", failed: 0 },
  { novel: AZURE, kind: "analysis", status: "completed", done: "3/3", failed: 0 },
  { novel: EMBER, kind: "analysis", status: "cancelled", done: "1/2", failed: 0 },
  { novel: HARBOR, kind: "translation", status: "failed", done: "1/2", failed: 1 },
  { novel: AZURE, kind: "translation", status: "completed", done: "3/3", failed: 0 },
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function stampOf(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function startedStamps(folder: string): string[] {
  return readPipelines(folder)
    .reverse()
    .map((pipeline) => stampOf(pipeline.startedAt ?? pipeline.createdAt));
}

const BUSY_TIMEOUT_MS = 5000;

export function openReadOnly(folder: string): DatabaseSync {
  const database = new DatabaseSync(join(folder, WORKSPACE_DB_FILE), { readOnly: true });
  database.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  return database;
}

const PIPELINE_BASE_TIME = Date.UTC(2026, 0, 2, 8, 0, 0);
const PIPELINE_GAP_MS = 10 * 60_000;
const TASK_GAP_MS = 20_000;

export type PipelineKind = "translation" | "analysis";
export type FinishedState = "completed" | "failed" | "cancelled";

export interface SeedPipelineTask {
  readonly chapter: number;
  readonly passage?: number;
  readonly status?: FinishedState;
  readonly progress?: number;
  readonly error?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
}

export interface SeedPipeline {
  readonly novel: string;
  readonly kind?: PipelineKind;
  readonly target?: string;
  readonly status: FinishedState;
  readonly tasks: readonly (number | SeedPipelineTask)[];
  readonly createdAt?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
}

export function pipelineTime(offsetMs: number): string {
  return new Date(PIPELINE_BASE_TIME + offsetMs).toISOString();
}

function normalizeTask(task: number | SeedPipelineTask, fallback: FinishedState): SeedPipelineTask {
  return typeof task === "number" ? { chapter: task, status: fallback } : { status: fallback, ...task };
}

function defaultTarget(kind: PipelineKind): string {
  return kind === "analysis" ? "src" : "VI";
}

function insertTasks(database: DatabaseSync, pipelineId: number, chapters: Readonly<Record<number, string>>, tasks: readonly SeedPipelineTask[], startMs: number): void {
  const insert = database.prepare(
    "INSERT INTO ws_pipeline_tasks (pipeline_id, chapter_id, passage, status, progress, error, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const [index, task] of tasks.entries()) {
    const chapterId = chapters[task.chapter];
    if (chapterId === undefined) {
      throw new Error(`pipeline seed references an unknown chapter ${task.chapter}`);
    }
    const status = task.status ?? "completed";
    const started = task.startedAt ?? pipelineTime(startMs + index * TASK_GAP_MS);
    const finished = task.finishedAt ?? pipelineTime(startMs + index * TASK_GAP_MS + TASK_GAP_MS / 2);
    const progress = task.progress ?? (status === "completed" ? 100 : 0);
    insert.run(pipelineId, chapterId, task.passage ?? null, status, progress, task.error ?? "", started, finished);
  }
}

export async function seedPipelines(folder: string, pipelines: readonly SeedPipeline[]): Promise<number[]> {
  if (pipelines.length === 0) {
    return [];
  }
  const resolved = await readWorkspace(folder, (db) =>
    pipelines.map((pipeline) => {
      const chapters: Record<number, string> = {};
      for (const chapter of db.chapters(pipeline.novel)) {
        chapters[chapter.seq] = chapter.id;
      }
      return { novelId: db.novelId(pipeline.novel), chapters };
    }),
  );
  const database = new DatabaseSync(join(folder, WORKSPACE_DB_FILE));
  const ids: number[] = [];
  try {
    database.exec("BEGIN");
    const insert = database.prepare(
      "INSERT INTO ws_pipeline_history (novel_id, kind, target, status, total, done, failed, created_at, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const [index, pipeline] of pipelines.entries()) {
      const place = resolved[index];
      if (place === undefined) {
        continue;
      }
      const kind = pipeline.kind ?? "translation";
      const tasks = pipeline.tasks.map((task) => normalizeTask(task, pipeline.status));
      const done = tasks.filter((task) => task.status === "completed").length;
      const failed = tasks.filter((task) => task.status === "failed").length;
      const startMs = index * PIPELINE_GAP_MS;
      const created = pipeline.createdAt ?? pipelineTime(startMs);
      const started = pipeline.startedAt ?? pipelineTime(startMs + 1000);
      const finished = pipeline.finishedAt ?? pipelineTime(startMs + 1000 + tasks.length * TASK_GAP_MS);
      const result = insert.run(place.novelId, kind, pipeline.target ?? defaultTarget(kind), pipeline.status, tasks.length, done, failed, created, started, finished);
      const pipelineId = Number(result.lastInsertRowid);
      insertTasks(database, pipelineId, place.chapters, tasks, startMs + 1000);
      ids.push(pipelineId);
    }
    database.exec("COMMIT");
  } finally {
    database.close();
  }
  return ids;
}

type Row = Record<string, unknown>;

export interface PipelineTaskRecord {
  readonly id: number;
  readonly chapterId: string;
  readonly passage: number | null;
  readonly status: string;
  readonly progress: number;
  readonly error: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

export interface PipelineRecord {
  readonly id: number;
  readonly novelId: number;
  readonly kind: string;
  readonly target: string;
  readonly status: string;
  readonly total: number;
  readonly done: number;
  readonly failed: number;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly tasks: readonly PipelineTaskRecord[];
}

export interface PipelineRunLog {
  readonly name: string;
  readonly dir: string;
  readonly log: string;
  readonly files: readonly string[];
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function toTask(row: Row): PipelineTaskRecord {
  return {
    id: Number(row["id"]),
    chapterId: String(row["chapter_id"]),
    passage: row["passage"] === null || row["passage"] === undefined ? null : Number(row["passage"]),
    status: String(row["status"]),
    progress: Number(row["progress"]),
    error: String(row["error"]),
    startedAt: nullableText(row["started_at"]),
    finishedAt: nullableText(row["finished_at"]),
  };
}

function toPipeline(row: Row, tasks: readonly PipelineTaskRecord[]): PipelineRecord {
  return {
    id: Number(row["id"]),
    novelId: Number(row["novel_id"]),
    kind: String(row["kind"]),
    target: String(row["target"]),
    status: String(row["status"]),
    total: Number(row["total"]),
    done: Number(row["done"]),
    failed: Number(row["failed"]),
    createdAt: String(row["created_at"]),
    startedAt: nullableText(row["started_at"]),
    finishedAt: nullableText(row["finished_at"]),
    tasks,
  };
}

export function readPipelines(folder: string, novelId?: number): PipelineRecord[] {
  const database = openReadOnly(folder);
  try {
    const rows = novelId === undefined ? database.prepare("SELECT * FROM ws_pipeline_history ORDER BY id").all() : database.prepare("SELECT * FROM ws_pipeline_history WHERE novel_id = ? ORDER BY id").all(novelId);
    return rows.map((row) => {
      const tasks = database.prepare("SELECT * FROM ws_pipeline_tasks WHERE pipeline_id = ? ORDER BY id").all(Number(row["id"]));
      return toPipeline(row, tasks.map(toTask));
    });
  } finally {
    database.close();
  }
}

export function pipelineCount(folder: string): number {
  return readPipelines(folder).length;
}

export async function readPipelineLogs(sandbox: Sandbox): Promise<PipelineRunLog[]> {
  const root = join(sandbox.dataDir, "logs");
  let names: string[] = [];
  try {
    names = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
  const runs: PipelineRunLog[] = [];
  for (const name of names.sort()) {
    const dir = join(root, name);
    const files = await readdir(dir);
    if (!files.includes("pipeline.log")) {
      continue;
    }
    runs.push({ name, dir, log: await readFile(join(dir, "pipeline.log"), "utf8"), files });
  }
  return runs;
}

const FINISHED_STATES: readonly string[] = ["completed", "failed", "cancelled"];
const WAIT_POLL_MS = 150;

export interface WaitOptions {
  readonly id?: number;
  readonly count?: number;
  readonly states?: readonly string[];
  readonly timeoutMs?: number;
}

export async function waitForPipeline(folder: string, options: WaitOptions = {}): Promise<PipelineRecord> {
  const states = options.states ?? FINISHED_STATES;
  const deadline = Date.now() + (options.timeoutMs ?? 60_000);
  let last: PipelineRecord | undefined;
  while (Date.now() < deadline) {
    const all = readPipelines(folder);
    const enough = options.count === undefined || all.length >= options.count;
    last = options.id === undefined ? all.at(-1) : all.find((pipeline) => pipeline.id === options.id);
    if (enough && last !== undefined && states.includes(last.status)) {
      return last;
    }
    await new Promise((done) => setTimeout(done, WAIT_POLL_MS));
  }
  throw new Error(`pipeline did not reach ${states.join("/")}; last status ${last?.status ?? "none"}`);
}
