import { Component, inject } from "@angular/core";
import { Button } from "../../../components/button";
import { Icon } from "../../../components/icon";
import { WorkspaceLoadService } from "../../core/workspace/workspace-load.service";
import { LoadMode } from "../../core/workspace/workspace.models";

@Component({
  selector: "app-loading-page",
  standalone: true,
  imports: [Button, Icon],
  templateUrl: "./loading.page.html",
})
export class LoadingPage {
  private readonly loader = inject(WorkspaceLoadService);

  readonly state = this.loader.state;

  modeTitle(mode: LoadMode | null): string {
    if (mode === "create") {
      return "Đang khởi tạo workspace";
    }
    if (mode === "open") {
      return "Đang mở workspace";
    }
    return "Đang chuẩn bị workspace";
  }

  cancel(): void {
    void this.loader.cancel();
  }
}
