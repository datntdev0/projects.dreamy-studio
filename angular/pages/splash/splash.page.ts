// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Badge } from '@components/badge';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { SegmentOption, Segments } from '@components/segments';
import { SettingsService } from '@features/settings/settings.service';
import { WorkspaceLoading } from '@features/workspace/components/loading.component';
import { RecentWorkspaceList } from '@features/workspace/components/recent.component';
import { AppInfo, RecentWorkspace } from '@features/workspace/workspace.models';
import { WorkspaceService } from '@features/workspace/workspace.service';
import { CoreModule } from '@shared/core.module';
import { isLanguage, LanguageService } from '@shared/language/language.service';
import { ThemeService } from '@shared/theme/theme.service';

const LANGUAGE_OPTIONS: SegmentOption[] = [
  { value: 'vi', label: 'VI' },
  { value: 'en', label: 'EN' },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-splash-page',
  imports: [Badge, Button, Icon, Segments, CoreModule, RecentWorkspaceList, WorkspaceLoading],
  templateUrl: './splash.page.html',
})
export class SplashPage implements OnInit {
  private readonly workspace = inject(WorkspaceService);
  private readonly languageService = inject(LanguageService);
  private readonly themes = inject(ThemeService);
  private readonly settings = inject(SettingsService);

  readonly info = signal<AppInfo | null>(null);
  readonly recent = signal<RecentWorkspace[]>([]);
  readonly language = this.languageService.language;
  readonly languageOptions = LANGUAGE_OPTIONS;
  readonly themeIcon = computed(() => (this.themes.theme() === 'dark' ? 'sun' : 'moon'));
  readonly themeToggleKey = computed(() =>
    this.themes.theme() === 'dark' ? 'theme.toLight' : 'theme.toDark',
  );
  readonly notice = this.workspace.notice;
  readonly state = this.workspace.state;
  readonly lastUsedPath = computed(() => this.firstAccessiblePath(this.recent()));

  ngOnInit(): void {
    void this.loadInfo();
    void this.refresh();
  }

  changeLanguage(value: string): void {
    if (isLanguage(value)) {
      this.settings.setLanguage(value);
    }
  }

  toggleTheme(): void {
    this.settings.setTheme(this.themes.theme() === 'dark' ? 'light' : 'dark');
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
