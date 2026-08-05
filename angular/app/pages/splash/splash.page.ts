import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { Badge } from "../../../components/badge";
import { Button } from "../../../components/button";
import { Icon } from "../../../components/icon";
import { WorkspaceLoadService } from "../../core/workspace/workspace-load.service";
import { WorkspaceService } from "../../core/workspace/workspace.service";
import { AppInfo } from "../../core/workspace/workspace.models";
import { RecentWorkspace } from "../../core/workspace/workspace.models";
import { SIZE_PENDING } from "./splash.format";
import { SIZE_UNKNOWN } from "./splash.format";
import { formatLastOpened } from "./splash.format";
import { formatSize } from "./splash.format";
import { reasonText } from "./splash.format";

@Component({
  selector: "app-splash-page",
  standalone: true,
  imports: [Badge, Button, Icon],
  templateUrl: "./splash.page.html",
})
export class SplashPage implements OnInit {
  private readonly workspace = inject(WorkspaceService);
  private readonly loader = inject(WorkspaceLoadService);

  readonly info = signal<AppInfo | null>(null);
  readonly recent = signal<RecentWorkspace[]>([]);
  readonly sizes = signal<Record<string, string>>({});
  readonly notice = this.loader.notice;
  readonly lastUsedPath = computed(() => this.firstAccessiblePath(this.recent()));

  readonly formatLastOpened = formatLastOpened;
  readonly reasonText = reasonText;

  ngOnInit(): void {
    void this.loadInfo();
    void this.refresh();
  }

  sizeOf(path: string): string {
    return this.sizes()[path] ?? SIZE_PENDING;
  }

  async openWorkspace(): Promise<void> {
    const path = await this.workspace.folderPick();
    if (path) {
      await this.loader.start({ path });
    }
  }

  openRecent(row: RecentWorkspace): void {
    void this.loader.start({ path: row.path });
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
      await this.loader.start({ path, relocateFrom: row.path });
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
