import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from "@angular/core";
import { Badge } from "@components/badge";
import { Button } from "@components/button";
import { Icon } from "@components/icon";
import { DialogService } from "@app/core/dialog/dialog.service";
import { I18nKey } from "@app/core/i18n/i18n.models";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { I18nService } from "@app/core/i18n/i18n.service";
import { WorkspaceService } from "../workspace.service";
import { RecentWorkspace } from "../workspace.models";
import { RecentWorkspaceReason } from "../workspace.models";

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];
const KILO = 1024;

const SIZE_PENDING = "…";
const SIZE_UNKNOWN = "—";

const REASON_KEYS: Record<RecentWorkspaceReason, I18nKey> = {
  missing: "splash.reason.missing",
  not_a_directory: "splash.reason.not_a_directory",
  no_access: "splash.reason.no_access",
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

function isMeasurable(row: RecentWorkspace): boolean {
  return row.status === "ok";
}

@Component({
  selector: "app-recent-workspace-list",
  standalone: true,
  imports: [Badge, Button, Icon, I18nPipe],
  templateUrl: "./recent.component.html",
  host: { "data-testid": "recent-workspace-list" },
})
export class RecentWorkspaceList implements OnChanges {
  private readonly workspace = inject(WorkspaceService);
  private readonly i18n = inject(I18nService);
  private readonly dialogs = inject(DialogService);
  private readonly requested = new Set<string>();

  @Input() rows: RecentWorkspace[] = [];
  @Input() lastUsedPath: string | null = null;
  @Output() opened = new EventEmitter<RecentWorkspace>();
  @Output() relocated = new EventEmitter<RecentWorkspace>();
  @Output() deleted = new EventEmitter<void>();

  readonly sizes = signal<Record<string, string>>({});
  readonly reasonKey = reasonKey;
  readonly projectsKey = projectsKey;

  ngOnChanges(): void {
    for (const row of this.rows.filter(isMeasurable)) {
      void this.measureRow(row.path);
    }
  }

  formatLastOpened(iso: string): string {
    return formatLastOpened(iso, this.i18n.locale());
  }

  sizeOf(path: string): string {
    return this.sizes()[path] ?? SIZE_PENDING;
  }

  open(row: RecentWorkspace): void {
    this.opened.emit(row);
  }

  openByKey(event: Event, row: RecentWorkspace): void {
    if (event.target === event.currentTarget) {
      event.preventDefault();
      this.open(row);
    }
  }

  relocate(row: RecentWorkspace): void {
    this.relocated.emit(row);
  }

  delete(row: RecentWorkspace): void {
    void this.dialogs.ask({
      title: this.i18n.translate("splash.recent.deleteTitle"),
      message: this.i18n.translate("splash.recent.deleteMessage", { name: row.name }),
      warning: this.i18n.translate("splash.recent.deleteWarning"),
      confirmLabel: this.i18n.translate("splash.recent.delete"),
      confirmIcon: "trash",
      onConfirm: this.removeWorkspace.bind(this, row),
    });
  }

  private async removeWorkspace(row: RecentWorkspace): Promise<void> {
    await this.workspace.workspaceDelete(row.path);
    this.deleted.emit();
  }

  private async measureRow(path: string): Promise<void> {
    if (this.requested.has(path)) {
      return;
    }
    this.requested.add(path);
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
