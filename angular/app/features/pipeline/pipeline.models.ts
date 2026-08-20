import { LanguageKey } from "@app/core/language/language.models";
import { PipelineStatus, PipelineTask } from "@app/features/novel/novel.translation.models";

export type PipelineFilter = "all" | PipelineStatus;

export interface PipelineTotals {
  count: number;
  done: number;
  total: number;
}

export type PipelineLogLevel = "info" | "ok" | "warn" | "err";

export type PipelineLogKind = "started" | "taskStarted" | "taskRunning" | "taskDone" | "taskFailed" | "taskCancelled" | "finished";

export interface PipelineLogEntry {
  time: string;
  level: PipelineLogLevel;
  kind: PipelineLogKind;
  task: PipelineTask | null;
}

export interface PipelineKindMeta {
  icon: string;
  size: number;
  labelKey: LanguageKey;
}

export interface PipelineCounts {
  all: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export interface PipelineBar {
  completed: number;
  failed: number;
  running: number;
}
