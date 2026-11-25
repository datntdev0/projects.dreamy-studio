import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { StepsCard } from '@features/setup/components/steps-card.component';
import { StepsView } from '@features/setup/setup.models';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

import { LoadMode, LoadState, LoadStepId, LoadStepItem } from '../workspace.models';
import { WorkspaceService } from '../workspace.service';

const STEP_KEYS: Record<LoadStepId, LanguageKey> = {
  folder: 'loading.step.folder',
  database: 'loading.step.database',
};

const MODE_KEYS: Record<LoadMode, LanguageKey> = {
  create: 'loading.mode.create',
  open: 'loading.mode.open',
};

export function modeKey(mode: LoadMode | null): LanguageKey {
  return mode ? MODE_KEYS[mode] : 'loading.mode.prepare';
}

export function stepKey(id: LoadStepId): LanguageKey {
  return STEP_KEYS[id];
}

function stepView(step: LoadStepItem): StepsView['steps'][number] {
  return { id: step.id, label: stepKey(step.id), state: step.state };
}

export function loadView(state: LoadState): StepsView {
  return {
    eyebrow: modeKey(state.mode),
    title: state.name,
    titleKey: null,
    path: state.path,
    steps: state.steps.map(stepView),
    status: state.status === 'failed' ? 'failed' : 'running',
    error: state.error,
  };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-workspace-loading',
  imports: [Button, Icon, CoreModule, StepsCard],
  templateUrl: './loading.component.html',
  host: { 'data-testid': 'workspace-loading' },
})
export class WorkspaceLoading {
  private readonly workspace = inject(WorkspaceService);

  readonly state = input.required<LoadState>();
  readonly view = computed(() => loadView(this.state()));
  readonly failed = computed(() => this.state().status === 'failed');

  cancel(): void {
    void this.workspace.cancel();
  }

  retry(): void {
    void this.workspace.retry();
  }

  back(): void {
    this.workspace.dismiss();
  }
}
