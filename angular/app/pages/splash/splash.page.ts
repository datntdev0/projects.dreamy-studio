import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { Badge } from "../../../components/badge";
import { Button } from "../../../components/button";
import { Icon } from "../../../components/icon";
import { Segments, SegmentOption } from "../../../components/segments";
import { I18nKey } from "../../core/i18n/i18n.models";
import { I18nPipe } from "../../core/i18n/i18n.pipe";
import { I18nService, isLanguage } from "../../core/i18n/i18n.service";
import { ThemeService } from "../../core/theme/theme.service";
import { WorkspaceService } from "../../features/workspace/workspace.service";
import { LoadMode } from "../../features/workspace/workspace.models";
import { AppInfo } from "../../features/workspace/workspace.models";
import { RecentWorkspace } from "../../features/workspace/workspace.models";
import { LoadStepId } from "../../features/workspace/workspace.models";
import { RecentWorkspaceReason } from "../../features/workspace/workspace.models";

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];
const KILO = 1024;

const LANGUAGE_OPTIONS: SegmentOption[] = [
  { value: "vi", label: "VI" },
  { value: "en", label: "EN" },
];

const SIZE_PENDING = "…";
const SIZE_UNKNOWN = "—";

const REASON_KEYS: Record<RecentWorkspaceReason, I18nKey> = {
  missing: "splash.reason.missing",
  not_a_directory: "splash.reason.not_a_directory",
  no_access: "splash.reason.no_access",
};

const STEP_KEYS: Record<LoadStepId, I18nKey> = {
  application: "loading.step.application",
  backend: "loading.step.backend",
  workspace: "loading.step.workspace",
};

const MODE_KEYS: Record<LoadMode, I18nKey> = {
  create: "loading.mode.create",
  open: "loading.mode.open",
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

function formatLastOpened(iso: string, locale: string): string {
  const date = new Date(iso);
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });
  return Number.isNaN(date.getTime()) ? iso : format.format(date);
}

function reasonKey(reason: RecentWorkspaceReason | undefined): I18nKey {
  return REASON_KEYS[reason ?? "missing"];
}

function projectsKey(count: number): I18nKey {
  return count === 1 ? "splash.recent.projects.one" : "splash.recent.projects.other";
}

@Component({
  selector: "app-splash-page",
  standalone: true,
  imports: [Badge, Button, Icon, Segments, I18nPipe],
  templateUrl: "./splash.page.html",
})
export class SplashPage implements OnInit {
  private readonly workspace = inject(WorkspaceService);
  private readonly i18n = inject(I18nService);
  private readonly themes = inject(ThemeService);

  readonly info = signal<AppInfo | null>(null);
  readonly recent = signal<RecentWorkspace[]>([]);
  readonly sizes = signal<Record<string, string>>({});
  readonly language = this.i18n.language;
  readonly languageOptions = LANGUAGE_OPTIONS;
  readonly themeIcon = computed(() => this.themes.theme() === "dark" ? "sun" : "moon");
  readonly themeToggleKey = computed(() => this.themes.theme() === "dark" ? "theme.toLight" : "theme.toDark");
  readonly notice = this.workspace.notice;
  readonly state = this.workspace.state;
  readonly lastUsedPath = computed(() => this.firstAccessiblePath(this.recent()));

  readonly reasonKey = reasonKey;
  readonly projectsKey = projectsKey;

  ngOnInit(): void {
    void this.loadInfo();
    void this.refresh();
  }

  modeKey(mode: LoadMode | null): I18nKey {
    return mode ? MODE_KEYS[mode] : "loading.mode.prepare";
  }

  stepKey(id: LoadStepId): I18nKey {
    return STEP_KEYS[id];
  }

  formatLastOpened(iso: string): string {
    return formatLastOpened(iso, this.i18n.locale());
  }

  changeLanguage(value: string): void {
    if (isLanguage(value)) {
      this.i18n.setLanguage(value);
    }
  }

  toggleTheme(): void {
    this.themes.setTheme(this.themes.theme() === "dark" ? "light" : "dark");
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
