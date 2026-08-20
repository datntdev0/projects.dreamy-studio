import { I18nKey } from "@app/core/i18n/i18n.models";
import { PipelineSnapshot, PipelineStatus, PipelineTask } from "@app/features/novel/novel.translation.models";
import { PipelineCounts, PipelineFilter, PipelineKindMeta, PipelineLogEntry, PipelineLogKind, PipelineBar, PipelineLogLevel, PipelineTotals } from "./pipeline.models";

export const HISTORY_LIMIT = 50;


export const PIPELINE_FILTERS: PipelineFilter[] = ["all", "running", "completed", "failed", "cancelled"];

export const PIPELINE_FILTER_KEYS: Record<PipelineFilter, I18nKey> = {
  all: "pipeline.filter.all",
  running: "pipeline.status.running",
  completed: "pipeline.status.completed",
  failed: "pipeline.status.failed",
  cancelled: "pipeline.status.cancelled",
};

export const PIPELINE_STATUS_KEYS: Record<PipelineStatus, I18nKey> = {
  running: "pipeline.status.running",
  completed: "pipeline.status.completed",
  failed: "pipeline.status.failed",
  cancelled: "pipeline.status.cancelled",
};

export const PIPELINE_STATUS_BADGES: Record<PipelineStatus, string> = {
  running: "badge-running",
  completed: "badge-success",
  failed: "badge-danger",
  cancelled: "badge-warning",
};

export const PIPELINE_KINDS: Record<string, PipelineKindMeta> = {
  translation: { icon: "lang", size: 16, labelKey: "pipeline.kind.translation" },
  analysis: { icon: "graph", size: 16, labelKey: "pipeline.kind.analysis" },
  audio: { icon: "mic", size: 18, labelKey: "pipeline.kind.audio" },
  render: { icon: "film", size: 15, labelKey: "pipeline.kind.render" },
};

export const PIPELINE_FALLBACK_ICON = "activity";

export const PIPELINE_FALLBACK_SIZE = 16;

export const PIPELINE_LOG_KEYS: Record<PipelineLogKind, I18nKey> = {
  started: "pipeline.log.started",
  taskStarted: "pipeline.log.taskStarted",
  taskRunning: "pipeline.log.taskRunning",
  taskDone: "pipeline.log.taskDone",
  taskFailed: "pipeline.log.taskFailed",
  taskCancelled: "pipeline.log.taskCancelled",
  finished: "pipeline.log.finished",
};

export const PIPELINE_FINISH_LEVELS: Record<PipelineStatus, PipelineLogLevel> = {
  running: "info",
  completed: "ok",
  failed: "err",
  cancelled: "warn",
};

export function kindKey(kind: string): I18nKey | null {
  return PIPELINE_KINDS[kind]?.labelKey ?? null;
}

export function kindIcon(kind: string): string {
  return PIPELINE_KINDS[kind]?.icon ?? PIPELINE_FALLBACK_ICON;
}

export function kindSize(kind: string): number {
  return PIPELINE_KINDS[kind]?.size ?? PIPELINE_FALLBACK_SIZE;
}

export function countsOf(pipelines: PipelineSnapshot[]): PipelineCounts {
  const counts: PipelineCounts = { all: pipelines.length, running: 0, completed: 0, failed: 0, cancelled: 0 };
  for (const pipeline of pipelines) {
    counts[pipeline.status] += 1;
  }
  return counts;
}

export function elapsedMs(pipeline: PipelineSnapshot, now: number): number | null {
  const begin = pipeline.startedAt ?? pipeline.createdAt;
  const span = now - new Date(begin).getTime();
  return Number.isFinite(span) && span >= 0 ? span : null;
}

export function etaMs(pipeline: PipelineSnapshot, now: number): number | null {
  const elapsed = elapsedMs(pipeline, now);
  const percent = percentOf(pipeline);
  if (elapsed === null || percent <= 0 || percent >= 100) {
    return null;
  }
  return Math.round((elapsed / percent) * (100 - percent));
}

function percentOfTotal(total: number, units: number): number {
  return total > 0 ? (units / total) * 100 : 0;
}

export function barOf(pipeline: PipelineSnapshot): PipelineBar {
  const bar: PipelineBar = { completed: 0, failed: 0, running: 0 };
  if (pipeline.tasks.length === 0) {
    bar.completed = percentOfTotal(pipeline.total, pipeline.done);
    bar.failed = percentOfTotal(pipeline.total, pipeline.failed);
    return bar;
  }
  const total = pipeline.tasks.length;
  for (const task of pipeline.tasks) {
    if (task.status === "completed") {
      bar.completed += percentOfTotal(total, 1);
    } else if (task.status === "failed") {
      bar.failed += percentOfTotal(total, 1);
    } else if (task.status === "running") {
      bar.running += percentOfTotal(total, task.progress / 100);
    }
  }
  return bar;
}

export function compareNewestFirst(a: PipelineSnapshot, b: PipelineSnapshot): number {
  return b.id - a.id;
}

export function percentOf(pipeline: PipelineSnapshot): number {
  if (pipeline.total <= 0) {
    return 0;
  }
  let units = 0;
  for (const task of pipeline.tasks) {
    if (task.status === "completed" || task.status === "failed") {
      units += 100;
    }
    if (task.status === "running") {
      units += task.progress;
    }
  }
  if (pipeline.tasks.length === 0) {
    units = (pipeline.done + pipeline.failed) * 100;
  }
  return Math.min(100, Math.round(units / pipeline.total));
}

export function runningTasks(pipeline: PipelineSnapshot): PipelineTask[] {
  const out: PipelineTask[] = [];
  for (const task of pipeline.tasks) {
    if (task.status === "running") {
      out.push(task);
    }
  }
  return out;
}

export function queuedCount(pipeline: PipelineSnapshot): number {
  let count = 0;
  for (const task of pipeline.tasks) {
    if (task.status === "queued") {
      count += 1;
    }
  }
  return count;
}

export function firstError(pipeline: PipelineSnapshot): string {
  for (const task of pipeline.tasks) {
    if (task.status === "failed" && task.error) {
      return task.error;
    }
  }
  return "";
}

export function matchesFilter(status: PipelineStatus, filter: PipelineFilter): boolean {
  return filter === "all" || status === filter;
}

export function matchesQuery(novelName: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || novelName.toLowerCase().includes(needle);
}

export function durationMs(pipeline: PipelineSnapshot): number | null {
  if (!pipeline.startedAt || !pipeline.finishedAt) {
    return null;
  }
  const span = new Date(pipeline.finishedAt).getTime() - new Date(pipeline.startedAt).getTime();
  return Number.isFinite(span) && span >= 0 ? span : null;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDuration(ms: number | null): string {
  if (ms === null) {
    return "—";
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${pad(seconds % 60)}s`;
  }
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}

export function totalsOf(running: PipelineSnapshot[]): PipelineTotals {
  let done = 0;
  let total = 0;
  for (const pipeline of running) {
    done += pipeline.done + pipeline.failed;
    total += pipeline.total;
  }
  return { count: running.length, done, total };
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function taskEntries(task: PipelineTask, fallback: string): PipelineLogEntry[] {
  const out: PipelineLogEntry[] = [];
  const started = task.startedAt ?? fallback;
  if (task.startedAt) {
    out.push({ time: started, level: "info", kind: "taskStarted", task });
  }
  if (task.status === "running") {
    out.push({ time: started, level: "info", kind: "taskRunning", task });
  }
  const finished = task.finishedAt ?? fallback;
  if (task.status === "completed") {
    out.push({ time: finished, level: "ok", kind: "taskDone", task });
  }
  if (task.status === "failed") {
    out.push({ time: finished, level: "err", kind: "taskFailed", task });
  }
  if (task.status === "cancelled") {
    out.push({ time: finished, level: "warn", kind: "taskCancelled", task });
  }
  return out;
}

function compareEntries(a: { entry: PipelineLogEntry; order: number }, b: { entry: PipelineLogEntry; order: number }): number {
  const span = new Date(a.entry.time).getTime() - new Date(b.entry.time).getTime();
  return Number.isFinite(span) && span !== 0 ? span : a.order - b.order;
}

export function logOf(pipeline: PipelineSnapshot): PipelineLogEntry[] {
  const begin = pipeline.startedAt ?? pipeline.createdAt;
  const entries: PipelineLogEntry[] = [{ time: begin, level: "info", kind: "started", task: null }];
  for (const task of pipeline.tasks) {
    entries.push(...taskEntries(task, pipeline.finishedAt ?? begin));
  }
  if (pipeline.status !== "running") {
    entries.push({ time: pipeline.finishedAt ?? begin, level: PIPELINE_FINISH_LEVELS[pipeline.status], kind: "finished", task: null });
  }
  const ordered = entries.map(withOrder).sort(compareEntries);
  return ordered.map(withoutOrder);
}

function withOrder(entry: PipelineLogEntry, order: number): { entry: PipelineLogEntry; order: number } {
  return { entry, order };
}

function withoutOrder(item: { entry: PipelineLogEntry }): PipelineLogEntry {
  return item.entry;
}
