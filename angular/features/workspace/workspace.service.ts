import { Injectable, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { Channel } from "@tauri-apps/api/core";
import { DesktopIpcError } from "@core/desktop/desktop-ipc-error";
import { DesktopIpcService } from "@core/desktop/desktop-ipc.service";
import { LanguageKey } from "@core/language/language.models";
import { LanguageService } from "@core/language/language.service";
import { SettingsService } from "@features/settings/settings.service";
import { AppInfo } from "./workspace.models";
import { CancelOutcome } from "./workspace.models";
import { CurrentWorkspace } from "./workspace.models";
import { EnterOutcome } from "./workspace.models";
import { LoadError } from "./workspace.models";
import { LoadErrorCode } from "./workspace.models";
import { LoadEvent } from "./workspace.models";
import { LoadOrigin } from "./workspace.models";
import { LoadOutcome } from "./workspace.models";
import { LoadRequest } from "./workspace.models";
import { LoadState } from "./workspace.models";
import { LoadStepId } from "./workspace.models";
import { LoadStepItem } from "./workspace.models";
import { LoadStepView } from "./workspace.models";
import { RecentWorkspace } from "./workspace.models";

const FAILURE_HOLD_MS = 1200;

const STEP_ORDER: LoadStepId[] = ["application", "backend", "llm", "workspace"];

const STEP_NAME_KEYS: Record<LoadStepId, LanguageKey> = {
  application: "loading.stepName.application",
  backend: "loading.stepName.backend",
  workspace: "loading.stepName.workspace",
  llm: "loading.stepName.llm",
};

const ERROR_CAUSE_KEYS: Record<LoadErrorCode, LanguageKey> = {
  folder_missing: "loading.cause.folder_missing",
  folder_not_directory: "loading.cause.folder_not_directory",
  folder_not_readable: "loading.cause.folder_not_readable",
  folder_not_writable: "loading.cause.folder_not_writable",
  db_corrupt: "loading.cause.db_corrupt",
  db_newer_version: "loading.cause.db_newer_version",
  db_migration_failed: "loading.cause.db_migration_failed",
  db_io: "loading.cause.db_io",
  logs_failed: "loading.cause.logs_failed",
  backend_missing: "loading.cause.backend_missing",
  backend_start_failed: "loading.cause.backend_start_failed",
  backend_timeout: "loading.cause.backend_timeout",
};

const CODES_WITHOUT_DETAIL: LoadErrorCode[] = [
  "folder_missing",
  "folder_not_directory",
  "db_newer_version",
];

function folderName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const segments = trimmed.split(/[\\/]/);
  const last = segments[segments.length - 1];
  return last ? last : path;
}

function pendingStep(id: LoadStepId): LoadStepItem {
  return { id, state: "pending" };
}

function initialLoadState(path: string, origin: LoadOrigin): LoadState {
  return {
    origin,
    path,
    name: folderName(path),
    mode: null,
    steps: STEP_ORDER.map(pendingStep),
    percent: 0,
    status: "running",
  };
}

function replaceStep(
  steps: LoadStepItem[],
  id: LoadStepId,
  state: LoadStepView,
): LoadStepItem[] {
  return steps.map((step) => (step.id === id ? { ...step, state } : step));
}

function applyLoadEvent(state: LoadState, event: LoadEvent): LoadState {
  switch (event.kind) {
    case "started":
      return { ...state, mode: event.mode, name: event.name, path: event.path };
    case "step":
      return {
        ...state,
        steps: replaceStep(state.steps, event.id, event.state),
      };
    case "progress":
      return { ...state, percent: event.percent };
  }
}

function markLoadFailed(state: LoadState, step: LoadStepId): LoadState {
  return {
    ...state,
    steps: replaceStep(state.steps, step, "error"),
    status: "failed",
  };
}

function isLoadError(value: unknown): value is LoadError {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const hasStep = typeof candidate["step"] === "string";
  const hasCode = typeof candidate["code"] === "string";
  const hasDetail = typeof candidate["detail"] === "string";
  return hasStep && hasCode && hasDetail;
}

function toLoadError(error: unknown, fallbackStep: LoadStepId): LoadError {
  const payload = error instanceof DesktopIpcError ? error.cause : error;
  if (isLoadError(payload)) {
    return payload;
  }
  return { step: fallbackStep, code: "db_io", detail: String(payload) };
}

@Injectable({ providedIn: "root" })
export class WorkspaceService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly router = inject(Router);
  private readonly languageService = inject(LanguageService);
  private readonly settings = inject(SettingsService);
  private readonly opened = signal<CurrentWorkspace | null>(null);
  private previous: CurrentWorkspace | null = null;
  private origin: LoadOrigin = "splash";

  readonly current = this.opened.asReadonly();
  readonly state = signal<LoadState | null>(null);
  readonly notice = signal<string | null>(null);
  readonly run = signal(0);
  readonly switchDialogOpen = signal(false);
  readonly switchNotice = signal<string | null>(null);

  appInfo(): Promise<AppInfo> {
    return this.ipc.invoke<AppInfo>("app_info");
  }

  recentList(): Promise<RecentWorkspace[]> {
    return this.ipc.invoke<RecentWorkspace[]>("recent_list");
  }

  measure(path: string): Promise<number> {
    return this.ipc.invoke<number>("workspace_measure", { path });
  }

  workspaceDelete(path: string): Promise<void> {
    return this.ipc.invoke<void>("workspace_delete", { path });
  }

  folderPick(): Promise<string | null> {
    return this.ipc.invoke<string | null>("folder_pick");
  }

  async restoreCurrent(): Promise<CurrentWorkspace | null> {
    const current =
      await this.ipc.invoke<CurrentWorkspace | null>("workspace_current");
    this.setOpened(current);
    return current;
  }

  isCurrentPath(path: string): Promise<boolean> {
    return this.ipc.invoke<boolean>("workspace_is_current", { path });
  }

  openSwitchDialog(): void {
    this.switchDialogOpen.set(true);
  }

  closeSwitchDialog(): void {
    this.switchDialogOpen.set(false);
  }

  async switchTo(request: LoadRequest): Promise<void> {
    this.closeSwitchDialog();
    this.switchNotice.set(null);
    this.previous = this.opened();
    await this.start({ ...request, origin: "switch" });
  }

  async start(request: LoadRequest): Promise<void> {
    const token = this.nextRun();
    this.origin = request.origin ?? "splash";
    this.notice.set(null);
    this.state.set(initialLoadState(request.path, this.origin));
    if (this.isCurrent(token)) {
      await this.load(token, request);
    }
  }

  async cancel(): Promise<void> {
    this.nextRun();
    const origin = this.origin;
    try {
      const outcome = await this.requestCancel();
      if (outcome.result === "already_entered") {
        await this.enterAfterCancel(origin);
        return;
      }
    } catch {
      this.clearState();
      return;
    }
    this.clearState();
  }

  private describeLoadError(error: LoadError): string {
    const showDetail =
      error.detail !== "" && !CODES_WITHOUT_DETAIL.includes(error.code);
    return this.languageService.translate("loading.error", {
      step: this.languageService.translate(STEP_NAME_KEYS[error.step]),
      cause: this.languageService.translate(ERROR_CAUSE_KEYS[error.code]),
      suffix: showDetail ? ` (${error.detail})` : "",
    });
  }

  private requestLoad(
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

  private requestCancel(): Promise<CancelOutcome> {
    return this.ipc.invoke<CancelOutcome>("workspace_cancel");
  }

  private async requestEnter(): Promise<EnterOutcome> {
    const outcome = await this.ipc.invoke<EnterOutcome>("workspace_enter");
    if (outcome.result === "entered") {
      this.setOpened({ name: outcome.name, path: outcome.path });
    }
    return outcome;
  }

  private setOpened(current: CurrentWorkspace | null): void {
    this.opened.set(current);
    if (current) {
      void this.settings.load();
    }
  }

  private nextRun(): number {
    const token = this.run() + 1;
    this.run.set(token);
    return token;
  }

  private isCurrent(token: number): boolean {
    return this.run() === token;
  }

  private eventHandler(token: number): (event: LoadEvent) => void {
    return (event) => this.receive(token, event);
  }

  private receive(token: number, event: LoadEvent): void {
    if (this.isCurrent(token)) {
      this.state.update((state) => this.reduce(state, event));
    }
  }

  private reduce(state: LoadState | null, event: LoadEvent): LoadState | null {
    return state ? applyLoadEvent(state, event) : state;
  }

  private async load(token: number, request: LoadRequest): Promise<void> {
    const channel = this.ipc.channel<LoadEvent>(this.eventHandler(token));
    let outcome: LoadOutcome;
    try {
      outcome = await this.requestLoad(
        request.path,
        channel,
        request.relocateFrom,
      );
    } catch (cause) {
      await this.fail(token, cause, "application");
      return;
    }
    await this.afterLoad(token, outcome);
  }

  private async afterLoad(token: number, outcome: LoadOutcome): Promise<void> {
    if (!this.isCurrent(token)) {
      await this.discardStale(outcome);
      return;
    }
    if (outcome.result === "ready") {
      await this.enter(token);
      return;
    }
    this.clearState();
  }

  private async discardStale(outcome: LoadOutcome): Promise<void> {
    if (outcome.result !== "ready" || this.state() !== null) {
      return;
    }
    try {
      await this.requestCancel();
    } catch {
      return;
    }
  }

  private async enter(token: number): Promise<void> {
    let entered: boolean;
    try {
      const outcome = await this.requestEnter();
      entered = outcome.result === "entered";
    } catch (cause) {
      await this.fail(token, cause, "application");
      return;
    }
    if (!this.isCurrent(token)) {
      return;
    }
    if (entered) {
      await this.goHome();
      return;
    }
    this.clearState();
  }

  private async enterAfterCancel(origin: LoadOrigin): Promise<void> {
    if (origin === "switch") {
      await this.enterAfterSwitchCancel();
      return;
    }
    await this.enterHome();
  }

  private async enterHome(): Promise<void> {
    const current = await this.restoreCurrent();
    if (current) {
      await this.goHome();
      return;
    }
    this.clearState();
  }

  private async enterAfterSwitchCancel(): Promise<void> {
    let current: CurrentWorkspace | null;
    try {
      current = await this.restoreCurrent();
    } catch {
      this.clearState();
      return;
    }
    if (current && current.path !== this.previous?.path) {
      await this.goHome();
      return;
    }
    this.clearState();
  }

  private async fail(
    token: number,
    cause: unknown,
    fallbackStep: LoadStepId,
  ): Promise<void> {
    if (!this.isCurrent(token)) {
      return;
    }
    const error = toLoadError(cause, fallbackStep);
    this.state.update((state) => this.markFailed(state, error.step));
    await this.hold(FAILURE_HOLD_MS);
    if (this.isCurrent(token)) {
      this.publishFailure(this.describeLoadError(error));
      this.clearState();
    }
  }

  private publishFailure(message: string): void {
    if (this.origin === "switch") {
      this.switchNotice.set(message);
      return;
    }
    this.notice.set(message);
  }

  private markFailed(
    state: LoadState | null,
    step: LoadStepId,
  ): LoadState | null {
    return state ? markLoadFailed(state, step) : state;
  }

  private hold(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private async goHome(): Promise<void> {
    await this.router.navigateByUrl("/home");
    this.state.set(null);
  }

  private clearState(): void {
    this.state.set(null);
  }
}
