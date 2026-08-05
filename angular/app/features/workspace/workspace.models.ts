export interface AppInfo {
  name: string;
  version: string;
}

export type RecentWorkspaceStatus = "ok" | "not_found";

export type RecentWorkspaceReason = "missing" | "not_a_directory" | "no_access";

export interface RecentWorkspace {
  path: string;
  name: string;
  lastOpenedAt: string;
  status: RecentWorkspaceStatus;
  reason?: RecentWorkspaceReason;
  projectCount?: number;
}

export type LoadMode = "create" | "open";

export type LoadStepId = "check_folder" | "workspace_db" | "app_db" | "logs";

export type LoadStepState = "running" | "done" | "error";

export interface LoadStartedEvent {
  kind: "started";
  mode: LoadMode;
  name: string;
  path: string;
}

export interface LoadStepEvent {
  kind: "step";
  id: LoadStepId;
  state: LoadStepState;
  detail?: string;
}

export interface LoadProgressEvent {
  kind: "progress";
  percent: number;
}

export type LoadEvent = LoadStartedEvent | LoadStepEvent | LoadProgressEvent;

export interface LoadReadyOutcome {
  result: "ready";
  name: string;
  path: string;
  mode: LoadMode;
}

export interface LoadCancelledOutcome {
  result: "cancelled";
}

export type LoadOutcome = LoadReadyOutcome | LoadCancelledOutcome;

export interface CancelledCancelOutcome {
  result: "cancelled";
}

export interface AlreadyEnteredCancelOutcome {
  result: "already_entered";
}

export type CancelOutcome =
  | CancelledCancelOutcome
  | AlreadyEnteredCancelOutcome;

export interface EnteredOutcome {
  result: "entered";
  name: string;
  path: string;
}

export interface EnterCancelledOutcome {
  result: "cancelled";
}

export type EnterOutcome = EnteredOutcome | EnterCancelledOutcome;

export interface CurrentWorkspace {
  name: string;
  path: string;
}

export type LoadErrorCode =
  | "folder_missing"
  | "folder_not_directory"
  | "folder_not_readable"
  | "folder_not_writable"
  | "db_corrupt"
  | "db_newer_version"
  | "db_migration_failed"
  | "db_io"
  | "logs_failed";

export interface LoadError {
  step: LoadStepId;
  code: LoadErrorCode;
  detail: string;
}

export interface LoadRequest {
  path: string;
  relocateFrom?: string;
}

export type LoadStepView = "pending" | LoadStepState;

export interface LoadStepItem {
  id: LoadStepId;
  state: LoadStepView;
}

export type LoadStatus = "running" | "failed";

export interface LoadState {
  path: string;
  name: string;
  mode: LoadMode | null;
  steps: LoadStepItem[];
  percent: number;
  status: LoadStatus;
}
