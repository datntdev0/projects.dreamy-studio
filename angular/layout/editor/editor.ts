import { Component, inject } from "@angular/core";
import { Icon } from "../../components/icon";
import { I18nPipe } from "../../app/core/i18n/i18n.pipe";
import { WorkspaceService } from "../../app/features/workspace/workspace.service";

@Component({
  selector: "app-editor",
  standalone: true,
  imports: [Icon, I18nPipe],
  templateUrl: "./editor.html",
})
export class Editor {
  readonly workspace = inject(WorkspaceService).current;
}
