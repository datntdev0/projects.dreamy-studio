import { RecentWorkspaceReason } from "../../core/workspace/workspace.models";

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];
const KILO = 1024;
const DATE_FORMAT = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

export const SIZE_PENDING = "…";
export const SIZE_UNKNOWN = "—";

const REASON_TEXT: Record<RecentWorkspaceReason, string> = {
  missing: "Thư mục không còn tồn tại hoặc ổ đĩa chưa được gắn.",
  not_a_directory: "Đường dẫn này không còn là một thư mục.",
  no_access: "Không có quyền truy cập thư mục này.",
};

export function formatSize(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= KILO && unit < SIZE_UNITS.length - 1) {
    value /= KILO;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${SIZE_UNITS[unit]}`;
}

export function formatLastOpened(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}

export function reasonText(reason: RecentWorkspaceReason | undefined): string {
  return REASON_TEXT[reason ?? "missing"];
}
