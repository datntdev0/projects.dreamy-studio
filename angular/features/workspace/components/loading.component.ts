import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

import { LoadMode, LoadState, LoadStepId } from '../workspace.models';
import { WorkspaceService } from '../workspace.service';

const STEP_KEYS: Record<LoadStepId, LanguageKey> = {
  application: 'loading.step.application',
  backend: 'loading.step.backend',
  workspace: 'loading.step.workspace',
  llm: 'loading.step.llm',
};

const MODE_KEYS: Record<LoadMode, LanguageKey> = {
  create: 'loading.mode.create',
  open: 'loading.mode.open',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-workspace-loading',
  imports: [Button, Icon, CoreModule],
  templateUrl: './loading.component.html',
  host: { 'data-testid': 'workspace-loading' },
})
export class WorkspaceLoading {
  private readonly workspace = inject(WorkspaceService);

  readonly state = input.required<LoadState>();

  modeKey(mode: LoadMode | null): LanguageKey {
    return mode ? MODE_KEYS[mode] : 'loading.mode.prepare';
  }

  stepKey(id: LoadStepId): LanguageKey {
    return STEP_KEYS[id];
  }

  cancel(): void {
    void this.workspace.cancel();
  }
}
