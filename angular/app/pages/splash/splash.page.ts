import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { Badge } from "../../../components/badge";
import { Button } from "../../../components/button";
import { Icon } from "../../../components/icon";
import { WorkspaceService } from "../../features/workspace/workspace.service";
import { LoadMode } from "../../features/workspace/workspace.models";
import { AppInfo } from "../../features/workspace/workspace.models";
import { RecentWorkspace } from "../../features/workspace/workspace.models";
import { RecentWorkspaceReason } from "../../features/workspace/workspace.models";

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];
const KILO = 1024;
const DATE_FORMAT = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

const SIZE_PENDING = "…";
const SIZE_UNKNOWN = "—";

const REASON_TEXT: Record<RecentWorkspaceReason, string> = {
  missing: "Thư mục không còn tồn tại hoặc ổ đĩa chưa được gắn.",
  not_a_directory: "Đường dẫn này không còn là một thư mục.",
  no_access: "Không có quyền truy cập thư mục này.",
};

function formatSize(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= KILO && unit < SIZE_UNITS.length - 1) {
    value /= KILO;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${SIZE_UNITS[unit]}`;
}

function formatLastOpened(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}

function reasonText(reason: RecentWorkspaceReason | undefined): string {
  return REASON_TEXT[reason ?? "missing"];
}

@Component({
  selector: "app-splash-page",
  standalone: true,
  imports: [Badge, Button, Icon],
  templateUrl: "./splash.page.html",
})
export class SplashPage implements OnInit {
  private readonly workspace = inject(WorkspaceService);

  readonly info = signal<AppInfo | null>(null);
  readonly recent = signal<RecentWorkspace[]>([]);
  readonly sizes = signal<Record<string, string>>({});
  readonly notice = this.workspace.notice;
  readonly state = this.workspace.state;
  readonly lastUsedPath = computed(() => this.firstAccessiblePath(this.recent()));

  readonly formatLastOpened = formatLastOpened;
  readonly reasonText = reasonText;

  ngOnInit(): void {
    void this.loadInfo();
    void this.refresh();
  }

  modeTitle(mode: LoadMode | null): string {
    if (mode === "create") {
      return "Đang khởi tạo workspace";
    }
    if (mode === "open") {
      return "Đang mở workspace";
    }
    return "Đang chuẩn bị workspace";
  }

  cancel(): void {
    void this.workspace.cancel();
  }

  sizeOf(path: string): string {
    return this.sizes()[path] ?? SIZE_PENDING;
  }

  async openWorkspace(): Promise<void> {
    const path = await this.workspace.folderPick();
    if (path) {
      await this.workspace.start({ path });
    }
  }

  openRecent(row: RecentWorkspace): void {
    void this.workspace.start({ path: row.path });
  }

  openRecentByKey(event: Event, row: RecentWorkspace): void {
    if (event.target === event.currentTarget) {
      event.preventDefault();
      this.openRecent(row);
    }
  }

  async relocate(row: RecentWorkspace): Promise<void> {
    const path = await this.workspace.folderPick();
    if (path) {
      await this.workspace.start({ path, relocateFrom: row.path });
    }
  }

  async remove(row: RecentWorkspace): Promise<void> {
    await this.workspace.recentRemove(row.path);
    await this.refresh();
  }

  private firstAccessiblePath(list: RecentWorkspace[]): string | null {
    return list.find(this.isAccessible)?.path ?? null;
  }

  private isAccessible(row: RecentWorkspace): boolean {
    return row.status === "ok";
  }

  private async loadInfo(): Promise<void> {
    try {
      this.info.set(await this.workspace.appInfo());
    } catch {
      this.info.set(null);
    }
  }

  private async fetchRecent(): Promise<RecentWorkspace[]> {
    try {
      return await this.workspace.recentList();
    } catch {
      return [];
    }
  }

  private async refresh(): Promise<void> {
    const list = await this.fetchRecent();
    this.recent.set(list);
    for (const row of list.filter(this.isAccessible)) {
      void this.measureRow(row.path);
    }
  }

  private async measureRow(path: string): Promise<void> {
    if (path in this.sizes()) {
      return;
    }
    const text = await this.sizeText(path);
    this.sizes.set({ ...this.sizes(), [path]: text });
  }

  private async sizeText(path: string): Promise<string> {
    try {
      return formatSize(await this.workspace.measure(path));
    } catch {
      return SIZE_UNKNOWN;
    }
  }
}
