import { Component, effect, inject, signal } from "@angular/core";
import { Dialog } from "../../../../components/dialog";
import { Button } from "../../../../components/button";
import { Icon } from "../../../../components/icon";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nService } from "../../../core/i18n/i18n.service";
import { WorkspaceService } from "../workspace.service";
import { LoadRequest } from "../workspace.models";
import { RecentWorkspace } from "../workspace.models";
import { RecentWorkspaceList } from "./recent.component";

@Component({
  selector: "app-switch-workspace-dialog",
  standalone: true,
  imports: [Button, Dialog, Icon, I18nPipe, RecentWorkspaceList],
  templateUrl: "./switch.dialog.html",
  host: { "data-testid": "switch-workspace-dialog" },
})
export class SwitchWorkspaceDialog {
  private readonly workspace = inject(WorkspaceService);
  private readonly i18n = inject(I18nService);

  readonly open = this.workspace.switchDialogOpen;
  readonly rows = signal<RecentWorkspace[]>([]);
  readonly notice = signal<string | null>(null);

  constructor() {
    effect(this.syncOpen.bind(this));
  }

  close(): void {
    this.workspace.closeSwitchDialog();
  }

  openRecent(row: RecentWorkspace): void {
    void this.workspace.switchTo({ path: row.path });
  }

  async openFolder(): Promise<void> {
    const path = await this.workspace.folderPick();
    if (path) {
      await this.switchToPicked({ path });
    }
  }

  async relocate(row: RecentWorkspace): Promise<void> {
    const path = await this.workspace.folderPick();
    if (path) {
      await this.switchToPicked({ path, relocateFrom: row.path });
    }
  }

  private syncOpen(): void {
    if (this.open()) {
      this.notice.set(null);
      void this.refresh();
    }
  }

  private async switchToPicked(request: LoadRequest): Promise<void> {
    if (await this.isOpenWorkspace(request.path)) {
      this.notice.set(this.i18n.translate("switch.alreadyOpen"));
      return;
    }
    this.notice.set(null);
    await this.workspace.switchTo(request);
  }

  private async isOpenWorkspace(path: string): Promise<boolean> {
    try {
      return await this.workspace.isCurrentPath(path);
    } catch {
      return false;
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
    this.rows.set(await this.fetchRecent());
  }
}
