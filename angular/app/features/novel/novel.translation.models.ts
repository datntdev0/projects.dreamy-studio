import { TargetLang } from "./novel.models";

export type TranslationStep = "dict" | "guide" | "trans" | "result" | "warn";
export type DictEntryType = "name" | "place" | "org" | "title" | "term";
export type PassageState = "ok" | "review";
export type WarningKind = "source" | "dict";
export type WarningFilter = "all" | "source" | "dict";
export type ChapterFilter = "all" | "none" | "done";
export type TranslateMode = "missing" | "range" | "all";

export interface DictEntry {
  id: number;
  src: string;
  dst: string;
  type: DictEntryType;
  note: string;
}

export interface DictDraft {
  src: string;
  dst: string;
  type: DictEntryType;
  note: string;
}

export interface PassageTranslation {
  text: string;
  note: string;
}

export interface ChapterTranslation {
  title: string;
  passages: Record<number, PassageTranslation>;
}

export interface TranslationWarning {
  id: string;
  kind: WarningKind;
  chapterId: string;
  seq: number;
  n: number;
  entryId: number | null;
}

export interface NovelTranslation {
  guidelines: string;
  dict: DictEntry[];
  chapters: Record<string, ChapterTranslation>;
  warnings: TranslationWarning[];
}

export interface TranslationView {
  step: TranslationStep;
  target: TargetLang | null;
  seq: number;
  focus: number | null;
  newEntry: boolean;
}

export interface TranslateRequest {
  mode: TranslateMode;
  from: number;
  to: number;
  overwrite: boolean;
}

export interface TranslateSummary {
  run: number[];
  runIds: string[];
  keep: number[];
  overwrite: number[];
  noSource: number[];
  busy: number[];
  missing: number[];
}

export interface TranslateDialogRequest {
  novelId: number;
  preset: Partial<TranslateRequest>;
}

export interface DictChange {
  entry: DictEntry;
  flagged: number;
}

export interface WireWarning {
  kind: WarningKind;
  chapterId: string;
  n: number;
  entryId: number | null;
}

export interface WirePassage {
  n: number;
  originalHashcheck: string;
  text: string;
  note: string;
}

export interface WireChapter {
  title: string;
  paragraphs: WirePassage[];
}

export interface WireTranslation {
  guidelines: string;
  dict: DictEntry[];
  chapters: Record<string, WireChapter>;
  warnings: WireWarning[];
}

export type PipelineStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface TaskRequest {
  chapterId: string;
  passage: number | null;
}

export interface PipelineTask {
  id: number;
  chapterId: string;
  passage: number | null;
  status: TaskStatus;
  progress: number;
  error: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface PipelineSnapshot {
  id: number;
  novelId: number;
  kind: string;
  target: string;
  status: PipelineStatus;
  total: number;
  done: number;
  failed: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  tasks: PipelineTask[];
}

export type PipelineEvent =
  | { type: "started"; pipeline: PipelineSnapshot }
  | { type: "updated"; pipeline: PipelineSnapshot }
  | { type: "task"; pipelineId: number; task: PipelineTask }
  | { type: "finished"; pipeline: PipelineSnapshot };
