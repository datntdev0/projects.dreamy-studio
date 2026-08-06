import { Component, inject } from "@angular/core";
import { Button } from "../../components/button";
import { Icon } from "../../components/icon";
import { I18nPipe } from "../../app/core/i18n/i18n.pipe";
import { WorkspaceService } from "../../app/features/workspace/workspace.service";
import { LayoutService } from "../layout.service";

@Component({
  selector: "app-titlebar",
  standalone: true,
  imports: [Button, Icon, I18nPipe],
  templateUrl: "./titlebar.html",
})
export class Titlebar {
  readonly layout = inject(LayoutService);
  readonly workspace = inject(WorkspaceService).current;
}
