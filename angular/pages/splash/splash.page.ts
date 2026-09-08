// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Badge } from '@components/badge';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { WorkspaceLoading } from '@features/workspace/components/loading.component';
import { RecentWorkspaceList } from '@features/workspace/components/recent.component';
import { AppInfo, RecentWorkspace } from '@features/workspace/workspace.models';
import { WorkspaceService } from '@features/workspace/workspace.service';
import { CoreModule } from '@shared/core.module';

import { SplashTools } from './splash-tools.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-splash-page',
  imports: [Badge, Button, Icon, CoreModule, RecentWorkspaceList, SplashTools, WorkspaceLoading],
  templateUrl: './splash.page.html',
})
export class SplashPage implements OnInit {
  private readonly workspace = inject(WorkspaceService);

  readonly info = signal<AppInfo | null>(null);
  readonly recent = signal<RecentWorkspace[]>([]);
  readonly notice = this.workspace.notice;
  readonly state = this.workspace.state;
  readonly lastUsedPath = computed(() => this.firstAccessiblePath(this.recent()));

  ngOnInit(): void {
    void this.loadInfo();
    void this.refresh();
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

  async relocate(row: RecentWorkspace): Promise<void> {
    const path = await this.workspace.folderPick();
    if (path) {
      await this.workspace.start({ path, relocateFrom: row.path });
    }
  }

  private firstAccessiblePath(list: RecentWorkspace[]): string | null {
    return list.find(this.isAccessible)?.path ?? null;
  }

  private isAccessible(row: RecentWorkspace): boolean {
    return row.status === 'ok';
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
    this.recent.set(await this.fetchRecent());
  }
}
