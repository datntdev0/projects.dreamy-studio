import { DesktopIpcError } from "../desktop/desktop-ipc-error";
import { LoadError } from "./workspace.models";
import { LoadErrorCode } from "./workspace.models";
import { LoadEvent } from "./workspace.models";
import { LoadState } from "./workspace.models";
import { LoadStepId } from "./workspace.models";
import { LoadStepItem } from "./workspace.models";
import { LoadStepView } from "./workspace.models";

export const FAILURE_HOLD_MS = 1200;

const STEP_ORDER: LoadStepId[] = [
  "check_folder",
  "workspace_db",
  "app_db",
  "logs",
];

const STEP_LABELS: Record<LoadStepId, string> = {
  check_folder: "Kiểm tra thư mục workspace",
  workspace_db: "Khởi tạo hoặc nâng cấp workspace.dreamydb",
  app_db: "Khởi tạo hoặc nâng cấp application.dreamydb",
  logs: "Chuẩn bị nhật ký ứng dụng",
};

const STEP_NAMES: Record<LoadStepId, string> = {
  check_folder: "kiểm tra thư mục workspace",
  workspace_db: "workspace.dreamydb",
  app_db: "application.dreamydb",
  logs: "nhật ký ứng dụng",
};

const ERROR_CAUSES: Record<LoadErrorCode, string> = {
  folder_missing: "thư mục workspace không tồn tại",
  folder_not_directory: "đường dẫn đã chọn không phải là thư mục",
  folder_not_readable: "không có quyền đọc thư mục workspace",
  folder_not_writable: "không có quyền ghi vào thư mục workspace",
  db_corrupt: "dữ liệu bị hỏng hoặc không phải tệp CSDL hợp lệ",
  db_newer_version:
    "dữ liệu do phiên bản phần mềm mới hơn tạo ra, không thể nâng cấp",
  db_migration_failed: "nâng cấp dữ liệu thất bại",
  db_io: "không đọc hoặc ghi được dữ liệu",
  logs_failed: "không chuẩn bị được nhật ký ứng dụng",
};

const CODES_WITHOUT_DETAIL: LoadErrorCode[] = [
  "folder_missing",
  "folder_not_directory",
  "db_newer_version",
];

export function stepName(id: LoadStepId): string {
  return STEP_NAMES[id];
}

export function folderName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const segments = trimmed.split(/[\\/]/);
  const last = segments[segments.length - 1];
  return last ? last : path;
}

function pendingStep(id: LoadStepId): LoadStepItem {
  return { id, label: STEP_LABELS[id], state: "pending" };
}

export function initialLoadState(path: string): LoadState {
  return {
    path,
    name: folderName(path),
    mode: null,
    steps: STEP_ORDER.map(pendingStep),
    percent: 0,
    status: "running",
  };
}

function replaceStep(
  steps: LoadStepItem[],
  id: LoadStepId,
  state: LoadStepView,
): LoadStepItem[] {
  return steps.map((step) => (step.id === id ? { ...step, state } : step));
}

export function applyLoadEvent(state: LoadState, event: LoadEvent): LoadState {
  switch (event.kind) {
    case "started":
      return { ...state, mode: event.mode, name: event.name, path: event.path };
    case "step":
      return {
        ...state,
        steps: replaceStep(state.steps, event.id, event.state),
      };
    case "progress":
      return { ...state, percent: event.percent };
  }
}

export function markLoadFailed(state: LoadState, step: LoadStepId): LoadState {
  return {
    ...state,
    steps: replaceStep(state.steps, step, "error"),
    status: "failed",
  };
}

export function isLoadError(value: unknown): value is LoadError {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const hasStep = typeof candidate["step"] === "string";
  const hasCode = typeof candidate["code"] === "string";
  const hasDetail = typeof candidate["detail"] === "string";
  return hasStep && hasCode && hasDetail;
}

export function toLoadError(
  error: unknown,
  fallbackStep: LoadStepId,
): LoadError {
  const payload = error instanceof DesktopIpcError ? error.cause : error;
  if (isLoadError(payload)) {
    return payload;
  }
  return { step: fallbackStep, code: "db_io", detail: String(payload) };
}

export function describeLoadError(error: LoadError): string {
  const cause = ERROR_CAUSES[error.code];
  const showDetail =
    error.detail !== "" && !CODES_WITHOUT_DETAIL.includes(error.code);
  const suffix = showDetail ? ` (${error.detail})` : "";
  return `Bước ${stepName(error.step)} lỗi: ${cause}${suffix}`;
}
