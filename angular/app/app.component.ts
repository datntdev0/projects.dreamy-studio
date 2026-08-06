import { Component, computed, inject } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { WorkspaceLoading } from "./features/workspace/components/loading.component";
import { WorkspaceService } from "./features/workspace/workspace.service";
import { LoadState } from "./features/workspace/workspace.models";

@Component({
  selector: "app-root",
  imports: [RouterOutlet, WorkspaceLoading],
  templateUrl: "./app.component.html",
})
export class AppComponent {
  private readonly workspace = inject(WorkspaceService);

  readonly switching = computed(this.switchingState.bind(this));

  private switchingState(): LoadState | null {
    const state = this.workspace.state();
    return state?.origin === "switch" ? state : null;
  }
}
