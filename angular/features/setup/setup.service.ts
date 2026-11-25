import { inject, Injectable, signal } from '@angular/core';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';
import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';

// prettier-ignore
import { SetupEvent, SetupOutcome, SetupState, StartupEvent, StepsView } from './setup.models';
// prettier-ignore
import { applySetupEvent, applyStartupEvent, canContinue, failedSetupState, failedStartupView, initialSetupState, initialStartupView, isSetupFailure, isStartupFailure } from './setup.rules';

export type SplashStage = 'setup' | 'startup' | 'workspace';

function payloadOf(error: unknown): unknown {
  return error instanceof DesktopIpcError ? error.cause : error;
}

@Injectable({ providedIn: 'root' })
export class SetupService {
  private readonly ipc = inject(DesktopIpcService);
  private appVersion = '';

  readonly stage = signal<SplashStage>('setup');
  readonly setup = signal<SetupState>(initialSetupState(''));
  readonly startup = signal<StepsView>(initialStartupView());

  async begin(appVersion: string): Promise<void> {
    if (this.stage() !== 'setup') return;
    this.appVersion = appVersion;
    await this.runSetup();
  }

  async runSetup(): Promise<void> {
    this.setup.set(initialSetupState(this.appVersion));
    const channel = this.ipc.channel<SetupEvent>(this.receiveSetup.bind(this));
    try {
      const outcome = await this.ipc.invoke<SetupOutcome>('setup_run', { channel });
      this.finishSetup(outcome);
    } catch (error) {
      this.failSetup(payloadOf(error));
    }
  }

  pause(): Promise<void> {
    return this.ipc.invoke<void>('setup_pause');
  }

  async importPackage(): Promise<void> {
    const path = await this.ipc.invoke<string | null>('setup_package_pick');
    if (!path) return;
    try {
      await this.ipc.invoke<number>('setup_package_import', { path });
    } catch (error) {
      this.failSetup(payloadOf(error));
      return;
    }
    await this.runSetup();
  }

  async continueToStartup(): Promise<void> {
    this.stage.set('startup');
    await this.runStartup();
  }

  async runStartup(): Promise<void> {
    this.startup.set(initialStartupView());
    const channel = this.ipc.channel<StartupEvent>(this.receiveStartup.bind(this));
    try {
      await this.ipc.invoke<void>('startup_run', { channel });
    } catch (error) {
      const payload = payloadOf(error);
      const code = isStartupFailure(payload) ? payload.code : null;
      this.startup.update((view) => failedStartupView(view, code));
      return;
    }
    this.startup.update((view) => ({ ...view, status: 'done' }));
    this.stage.set('workspace');
  }

  private receiveSetup(event: SetupEvent): void {
    this.setup.update((state) => applySetupEvent(state, event));
  }

  private receiveStartup(event: StartupEvent): void {
    this.startup.update((view) => applyStartupEvent(view, event));
  }

  private finishSetup(outcome: SetupOutcome): void {
    if (outcome.result === 'paused') {
      this.setup.update((state) => ({ ...state, status: 'paused', speed: 0 }));
      return;
    }
    this.setup.update((state) => ({ ...state, status: 'ready', speed: 0 }));
    if (canContinue(this.setup())) {
      void this.continueToStartup();
    }
  }

  private failSetup(payload: unknown): void {
    const failure = isSetupFailure(payload) ? payload : { code: 'io' as const, detail: '' };
    this.setup.update((state) => failedSetupState(state, failure));
  }
}
