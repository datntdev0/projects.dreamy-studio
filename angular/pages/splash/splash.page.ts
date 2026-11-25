// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { Badge } from '@components/badge';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { SetupCard } from '@features/setup/components/setup-card.component';
import { StepsCard } from '@features/setup/components/steps-card.component';
import { SetupService } from '@features/setup/setup.service';
import { WorkspaceLoading } from '@features/workspace/components/loading.component';
import { RecentWorkspaceList } from '@features/workspace/components/recent.component';
import { AppInfo, RecentWorkspace } from '@features/workspace/workspace.models';
import { WorkspaceService } from '@features/workspace/workspace.service';
import { CoreModule } from '@shared/core.module';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';

import { SplashTools } from './splash-tools.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-splash-page',
  // prettier-ignore
  imports: [Badge, Button, Icon, CoreModule, RecentWorkspaceList, SetupCard, SplashTools, StepsCard, WorkspaceLoading],
  templateUrl: './splash.page.html',
})
export class SplashPage implements OnInit {
  private readonly workspace = inject(WorkspaceService);
  private readonly ipc = inject(DesktopIpcService);
  readonly setup = inject(SetupService);

  readonly info = signal<AppInfo | null>(null);
  readonly recent = signal<RecentWorkspace[]>([]);
  readonly notice = this.workspace.notice;
  readonly state = this.workspace.state;
  readonly stage = this.setup.stage;
  readonly lastUsedPath = computed(() => this.firstAccessiblePath(this.recent()));

  constructor() {
    effect(this.refreshWhenStarted.bind(this));
  }

  ngOnInit(): void {
    void this.begin();
  }

  pauseSetup(): void {
    void this.setup.pause();
  }

  runSetup(): void {
    void this.setup.runSetup();
  }

  importPackage(): void {
    void this.setup.importPackage();
  }

  continueToStartup(): void {
    void this.setup.continueToStartup();
  }

  retryStartup(): void {
    void this.setup.runStartup();
  }

  openLogs(): void {
    void this.ipc.invoke<void>('backend_logs_open');
  }

  quit(): void {
    void this.ipc.invoke<void>('app_quit');
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

  async refresh(): Promise<void> {
    this.recent.set(await this.fetchRecent());
  }

  private async begin(): Promise<void> {
    const info = await this.loadInfo();
    await this.setup.begin(info?.version ?? '');
  }

  private refreshWhenStarted(): void {
    if (this.stage() === 'workspace') {
      untracked(this.refresh.bind(this));
    }
  }

  private firstAccessiblePath(list: RecentWorkspace[]): string | null {
    return list.find(this.isAccessible)?.path ?? null;
  }

  private isAccessible(row: RecentWorkspace): boolean {
    return row.status === 'ok';
  }

  private async loadInfo(): Promise<AppInfo | null> {
    try {
      const info = await this.workspace.appInfo();
      this.info.set(info);
      return info;
    } catch {
      this.info.set(null);
      return null;
    }
  }

  private async fetchRecent(): Promise<RecentWorkspace[]> {
    try {
      return await this.workspace.recentList();
    } catch {
      return [];
    }
  }
}
