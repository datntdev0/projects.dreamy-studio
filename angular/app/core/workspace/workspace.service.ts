import { Injectable, inject, signal } from "@angular/core";
import { Channel } from "@tauri-apps/api/core";
import { DesktopIpcService } from "../desktop/desktop-ipc.service";
import { AppInfo } from "./workspace.models";
import { CancelOutcome } from "./workspace.models";
import { CurrentWorkspace } from "./workspace.models";
import { EnterOutcome } from "./workspace.models";
import { LoadEvent } from "./workspace.models";
import { LoadOutcome } from "./workspace.models";
import { RecentWorkspace } from "./workspace.models";

@Injectable({ providedIn: "root" })
export class WorkspaceService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly opened = signal<CurrentWorkspace | null>(null);

  readonly current = this.opened.asReadonly();

  appInfo(): Promise<AppInfo> {
    return this.ipc.invoke<AppInfo>("app_info");
  }

  recentList(): Promise<RecentWorkspace[]> {
    return this.ipc.invoke<RecentWorkspace[]>("recent_list");
  }

  measure(path: string): Promise<number> {
    return this.ipc.invoke<number>("workspace_measure", { path });
  }

  recentRemove(path: string): Promise<void> {
    return this.ipc.invoke<void>("recent_remove", { path });
  }

  folderPick(): Promise<string | null> {
    return this.ipc.invoke<string | null>("folder_pick");
  }

  load(
    path: string,
    channel: Channel<LoadEvent>,
    relocateFrom?: string,
  ): Promise<LoadOutcome> {
    return this.ipc.invoke<LoadOutcome>("workspace_load", {
      path,
      relocateFrom,
      channel,
    });
  }

  cancel(): Promise<CancelOutcome> {
    return this.ipc.invoke<CancelOutcome>("workspace_cancel");
  }

  async enter(): Promise<EnterOutcome> {
    const outcome = await this.ipc.invoke<EnterOutcome>("workspace_enter");
    if (outcome.result === "entered") {
      this.opened.set({ name: outcome.name, path: outcome.path });
    }
    return outcome;
  }

  async restoreCurrent(): Promise<CurrentWorkspace | null> {
    const current =
      await this.ipc.invoke<CurrentWorkspace | null>("workspace_current");
    this.opened.set(current);
    return current;
  }
}
