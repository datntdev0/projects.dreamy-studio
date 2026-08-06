import { Component, inject } from "@angular/core";
import { Icon } from "../../components/icon";
import { I18nPipe } from "../../app/core/i18n/i18n.pipe";
import { WorkspaceService } from "../../app/features/workspace/workspace.service";
import { Bottom } from "../bottom/bottom";
import { LayoutService } from "../layout.service";

@Component({
  selector: "app-editor",
  standalone: true,
  imports: [Icon, I18nPipe, Bottom],
  templateUrl: "./editor.html",
})
export class Editor {
  readonly layout = inject(LayoutService);
  readonly workspace = inject(WorkspaceService).current;
}
