import { Component, Input, inject } from "@angular/core";
import { Button } from "@components/button";
import { Icon } from "@components/icon";
import { LanguageKey } from "@app/core/language/language.models";
import { CoreModule } from "@app/core/core.module";
import { WorkspaceService } from "../workspace.service";
import { LoadMode } from "../workspace.models";
import { LoadState } from "../workspace.models";
import { LoadStepId } from "../workspace.models";

const STEP_KEYS: Record<LoadStepId, LanguageKey> = {
  application: "loading.step.application",
  backend: "loading.step.backend",
  workspace: "loading.step.workspace",
  llm: "loading.step.llm",
};

const MODE_KEYS: Record<LoadMode, LanguageKey> = {
  create: "loading.mode.create",
  open: "loading.mode.open",
};

@Component({
  selector: "app-workspace-loading",
  standalone: true,
  imports: [Button, Icon, CoreModule],
  templateUrl: "./loading.component.html",
  host: { "data-testid": "workspace-loading" },
})
export class WorkspaceLoading {
  private readonly workspace = inject(WorkspaceService);

  @Input({ required: true }) state!: LoadState;

  modeKey(mode: LoadMode | null): LanguageKey {
    return mode ? MODE_KEYS[mode] : "loading.mode.prepare";
  }

  stepKey(id: LoadStepId): LanguageKey {
    return STEP_KEYS[id];
  }

  cancel(): void {
    void this.workspace.cancel();
  }
}
