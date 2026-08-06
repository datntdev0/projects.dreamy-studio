import { Component, Input, inject } from "@angular/core";
import { Button } from "../../../../components/button";
import { Icon } from "../../../../components/icon";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { WorkspaceService } from "../workspace.service";
import { LoadMode } from "../workspace.models";
import { LoadState } from "../workspace.models";
import { LoadStepId } from "../workspace.models";

const STEP_KEYS: Record<LoadStepId, I18nKey> = {
  application: "loading.step.application",
  backend: "loading.step.backend",
  workspace: "loading.step.workspace",
};

const MODE_KEYS: Record<LoadMode, I18nKey> = {
  create: "loading.mode.create",
  open: "loading.mode.open",
};

@Component({
  selector: "app-workspace-loading",
  standalone: true,
  imports: [Button, Icon, I18nPipe],
  templateUrl: "./loading.component.html",
  host: { "data-testid": "workspace-loading" },
})
export class WorkspaceLoading {
  private readonly workspace = inject(WorkspaceService);

  @Input({ required: true }) state!: LoadState;

  modeKey(mode: LoadMode | null): I18nKey {
    return mode ? MODE_KEYS[mode] : "loading.mode.prepare";
  }

  stepKey(id: LoadStepId): I18nKey {
    return STEP_KEYS[id];
  }

  cancel(): void {
    void this.workspace.cancel();
  }
}
