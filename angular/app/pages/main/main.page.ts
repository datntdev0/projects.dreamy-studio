import { Component, effect, inject } from "@angular/core";
import { Title } from "@angular/platform-browser";
import { Editor } from "../../../layout/editor/editor";
import { Explorer } from "../../../layout/explorer/explorer";
import { Inspector } from "../../../layout/inspector/inspector";
import { LayoutService } from "../../../layout/layout.service";
import { Railbar } from "../../../layout/railbar/railbar";
import { Statusbar } from "../../../layout/statusbar/statusbar";
import { Titlebar } from "../../../layout/titlebar/titlebar";
import { WorkspaceService } from "../../features/workspace/workspace.service";
import { CurrentWorkspace } from "../../features/workspace/workspace.models";

const APP_TITLE = "Dreamy Studio";

@Component({
  selector: "app-main-page",
  standalone: true,
  imports: [Titlebar, Railbar, Explorer, Editor, Inspector, Statusbar],
  templateUrl: "./main.page.html",
})
export class MainPage {
  private readonly title = inject(Title);

  readonly layout = inject(LayoutService);
  readonly workspace = inject(WorkspaceService).current;

  constructor() {
    effect(this.syncTitle.bind(this));
  }

  private syncTitle(): void {
    this.title.setTitle(this.titleFor(this.workspace()));
  }

  private titleFor(current: CurrentWorkspace | null): string {
    return current ? `${current.name} — ${APP_TITLE}` : APP_TITLE;
  }
}
