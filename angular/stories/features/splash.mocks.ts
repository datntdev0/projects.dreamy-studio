// prettier-ignore
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, Injectable, input, Provider, signal, untracked } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { SetupCard } from '@features/setup/components/setup-card.component';
import { StepsCard } from '@features/setup/components/steps-card.component';
// prettier-ignore
import { AppInfo, CurrentWorkspace, LoadRequest, LoadState, RecentWorkspace } from '@features/workspace/workspace.models';
import { WorkspaceService } from '@features/workspace/workspace.service';
import { SplashPage } from '@pages/splash/splash.page';
import { SplashTools } from '@pages/splash/splash-tools.component';
import { CoreModule } from '@shared/core.module';

import { APP_INFO, RECENT_WORKSPACES } from './mocks';
// prettier-ignore
import { SetupFailure, SetupSimulation, StepsScenario, StepsSimulation, TICK_MS } from './splash.simulation';

const PICKED_FOLDER = 'D:\\Dreamy\\Tieu Thuyet Moi';
const AUTO_CONTINUE_TICKS = 5;

export type FlowFailure =
  | 'none'
  | 'setup-network'
  | 'setup-checksum'
  | 'setup-offline'
  | 'startup-backend'
  | 'workspace-db';

export type FlowStage = 'setup' | 'startup' | 'workspace' | 'opening' | 'main';

export const FLOW_FAILURES: FlowFailure[] = [
  'none',
  'setup-network',
  'setup-checksum',
  'setup-offline',
  'startup-backend',
  'workspace-db',
];

const SETUP_FAILURES: Partial<Record<FlowFailure, SetupFailure>> = {
  'setup-network': 'network',
  'setup-checksum': 'checksum',
  'setup-offline': 'offline',
};

function folderName(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1];
}

function startupScenario(failure: FlowFailure): StepsScenario {
  return {
    eyebrow: 'startup.eyebrow',
    title: '',
    titleKey: 'startup.title',
    failedTitleKey: 'startup.titleFailed',
    path: null,
    steps: [
      { id: 'application', label: 'loading.step.application' },
      { id: 'backend', label: 'loading.step.backend' },
    ],
    failAt: failure === 'startup-backend' ? 'backend' : null,
    failure: { key: 'loading.cause.backend_start_failed' },
  };
}

function openingScenario(path: string, created: boolean, failure: FlowFailure): StepsScenario {
  return {
    eyebrow: created ? 'loading.mode.create' : 'loading.mode.open',
    title: folderName(path),
    titleKey: null,
    failedTitleKey: null,
    path,
    steps: [
      { id: 'folder', label: 'loading.step.folder' },
      { id: 'database', label: 'loading.step.database' },
    ],
    failAt: failure === 'workspace-db' ? 'database' : null,
    failure: { key: 'loading.cause.db_newer_version' },
  };
}

@Injectable()
export class FlowWorkspace {
  readonly state = signal<LoadState | null>(null);
  readonly notice = signal<string | null>(null);
  readonly switchNotice = signal<string | null>(null);
  readonly current = signal<CurrentWorkspace | null>(null);
  readonly requested = signal<string | null>(null);
  readonly recent = signal<RecentWorkspace[]>([]);

  appInfo(): Promise<AppInfo> {
    return Promise.resolve(APP_INFO);
  }

  recentList(): Promise<RecentWorkspace[]> {
    return Promise.resolve(this.recent());
  }

  measure(): Promise<number> {
    return Promise.resolve(48_234_496);
  }

  workspaceDelete(): Promise<void> {
    return Promise.resolve();
  }

  folderPick(): Promise<string | null> {
    return Promise.resolve(PICKED_FOLDER);
  }

  start(request: LoadRequest): Promise<void> {
    this.requested.set(request.path);
    return Promise.resolve();
  }

  cancel(): Promise<void> {
    return Promise.resolve();
  }
}

export function flowProviders(): Provider[] {
  return [FlowWorkspace, { provide: WorkspaceService, useExisting: FlowWorkspace }];
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-splash-flow-demo',
  imports: [Button, Icon, CoreModule, SetupCard, SplashPage, SplashTools, StepsCard],
  templateUrl: './splash.mocks.html',
})
export class SplashFlowDemo {
  private readonly workspace = inject(FlowWorkspace);
  private ticks = 0;

  readonly firstLaunch = input(true);
  readonly failure = input<FlowFailure>('none');

  readonly stage = signal<FlowStage>('setup');
  readonly setup = signal(new SetupSimulation({ installed: false, missing: [], failure: null }));
  readonly startup = signal(new StepsSimulation(startupScenario('none')));
  readonly opening = signal<StepsSimulation | null>(null);
  readonly opened = signal<string | null>(null);

  constructor() {
    const timer = setInterval(this.tick.bind(this), TICK_MS);
    inject(DestroyRef).onDestroy(clearInterval.bind(null, timer));
    effect(this.restartOnInputs.bind(this));
    effect(this.openOnRequest.bind(this));
  }

  restart(): void {
    this.ticks = 0;
    this.workspace.recent.set(this.firstLaunch() ? [] : RECENT_WORKSPACES);
    this.workspace.requested.set(null);
    this.setup.set(
      new SetupSimulation({
        installed: !this.firstLaunch(),
        missing: this.firstLaunch() ? ['antigravity'] : [],
        failure: SETUP_FAILURES[this.failure()] ?? null,
      }),
    );
    this.startup.set(new StepsSimulation(startupScenario(this.failure())));
    this.opening.set(null);
    this.opened.set(null);
    this.stage.set('setup');
  }

  continueToStartup(): void {
    this.ticks = 0;
    this.stage.set('startup');
  }

  backToWorkspaces(): void {
    this.workspace.requested.set(null);
    this.opening.set(null);
    this.stage.set('workspace');
  }

  private restartOnInputs(): void {
    this.firstLaunch();
    this.failure();
    untracked(this.restart.bind(this));
  }

  private openOnRequest(): void {
    const path = this.workspace.requested();
    if (path) untracked(this.beginOpening.bind(this, path));
  }

  private beginOpening(path: string): void {
    const created = !this.workspace.recent().some((row) => row.path === path);
    this.ticks = 0;
    this.opening.set(new StepsSimulation(openingScenario(path, created, this.failure())));
    this.stage.set('opening');
  }

  private tick(): void {
    this.ticks += 1;
    const stage = this.stage();
    if (stage === 'setup') this.tickSetup();
    if (stage === 'startup') this.tickStartup();
    if (stage === 'opening') this.tickOpening();
  }

  private tickSetup(): void {
    const setup = this.setup();
    setup.tick();
    if (setup.state().status !== 'ready' || setup.hasMissing()) {
      this.ticks = 0;
      return;
    }
    if (this.ticks > AUTO_CONTINUE_TICKS) this.continueToStartup();
  }

  private tickStartup(): void {
    const startup = this.startup();
    startup.tick();
    if (startup.view().status !== 'done') {
      this.ticks = 0;
      return;
    }
    if (this.ticks > AUTO_CONTINUE_TICKS) this.stage.set('workspace');
  }

  private tickOpening(): void {
    const opening = this.opening();
    if (!opening) return;
    opening.tick();
    if (opening.view().status !== 'done') {
      this.ticks = 0;
      return;
    }
    if (this.ticks > AUTO_CONTINUE_TICKS) {
      this.opened.set(opening.view().path);
      this.stage.set('main');
    }
  }
}
