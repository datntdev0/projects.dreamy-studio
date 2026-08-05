import { Injectable, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { DesktopIpcService } from "../desktop/desktop-ipc.service";
import { FAILURE_HOLD_MS } from "./workspace-load.logic";
import { applyLoadEvent } from "./workspace-load.logic";
import { describeLoadError } from "./workspace-load.logic";
import { initialLoadState } from "./workspace-load.logic";
import { markLoadFailed } from "./workspace-load.logic";
import { toLoadError } from "./workspace-load.logic";
import { WorkspaceService } from "./workspace.service";
import { LoadEvent } from "./workspace.models";
import { LoadOutcome } from "./workspace.models";
import { LoadRequest } from "./workspace.models";
import { LoadState } from "./workspace.models";
import { LoadStepId } from "./workspace.models";

@Injectable({ providedIn: "root" })
export class WorkspaceLoadService {
  private readonly ipc = inject(DesktopIpcService);
  private readonly workspace = inject(WorkspaceService);
  private readonly router = inject(Router);

  readonly state = signal<LoadState | null>(null);
  readonly notice = signal<string | null>(null);
  readonly run = signal(0);

  async start(request: LoadRequest): Promise<void> {
    const token = this.nextRun();
    this.notice.set(null);
    this.state.set(initialLoadState(request.path));
    await this.router.navigateByUrl("/loading");
    if (this.isCurrent(token)) {
      await this.load(token, request);
    }
  }

  async cancel(): Promise<void> {
    this.nextRun();
    try {
      const outcome = await this.workspace.cancel();
      if (outcome.result === "already_entered") {
        await this.enterHome();
        return;
      }
    } catch {
      await this.returnToSplash();
      return;
    }
    await this.returnToSplash();
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
      outcome = await this.workspace.load(
        request.path,
        channel,
        request.relocateFrom,
      );
    } catch (cause) {
      await this.fail(token, cause, "check_folder");
      return;
    }
    await this.afterLoad(token, outcome);
  }

  private async afterLoad(token: number, outcome: LoadOutcome): Promise<void> {
    if (!this.isCurrent(token)) {
      return;
    }
    if (outcome.result === "ready") {
      await this.enter(token);
      return;
    }
    await this.returnToSplash();
  }

  private async enter(token: number): Promise<void> {
    let entered: boolean;
    try {
      const outcome = await this.workspace.enter();
      entered = outcome.result === "entered";
    } catch (cause) {
      await this.fail(token, cause, "app_db");
      return;
    }
    if (!this.isCurrent(token)) {
      return;
    }
    if (entered) {
      await this.goHome();
      return;
    }
    await this.returnToSplash();
  }

  private async enterHome(): Promise<void> {
    const current = await this.workspace.restoreCurrent();
    if (current) {
      await this.goHome();
      return;
    }
    await this.returnToSplash();
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
      this.notice.set(describeLoadError(error));
      await this.returnToSplash();
    }
  }

  private markFailed(state: LoadState | null, step: LoadStepId): LoadState | null {
    return state ? markLoadFailed(state, step) : state;
  }

  private hold(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private async goHome(): Promise<void> {
    await this.router.navigateByUrl("/home");
    this.state.set(null);
  }

  private async returnToSplash(): Promise<void> {
    await this.router.navigateByUrl("/");
    this.state.set(null);
  }
}
