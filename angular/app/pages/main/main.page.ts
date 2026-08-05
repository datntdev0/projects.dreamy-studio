import { Component, effect, inject } from "@angular/core";
import { Title } from "@angular/platform-browser";
import { Icon } from "../../../components/icon";
import { WorkspaceService } from "../../core/workspace/workspace.service";
import { CurrentWorkspace } from "../../core/workspace/workspace.models";

const APP_TITLE = "Dreamy Studio";

@Component({
  selector: "app-main-page",
  standalone: true,
  imports: [Icon],
  templateUrl: "./main.page.html",
})
export class MainPage {
  private readonly title = inject(Title);

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
