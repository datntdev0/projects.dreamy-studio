import { Component, OnInit, inject, signal } from "@angular/core";
import { Icon } from "@components/icon";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { WorkspaceService } from "@app/features/workspace/workspace.service";
import { AppInfo } from "@app/features/workspace/workspace.models";
import { LayoutService } from "../layout.service";

@Component({
  selector: "app-statusbar",
  standalone: true,
  imports: [Icon, I18nPipe],
  templateUrl: "./statusbar.html",
})
export class Statusbar implements OnInit {
  private readonly service = inject(WorkspaceService);

  readonly layout = inject(LayoutService);
  readonly workspace = this.service.current;
  readonly info = signal<AppInfo | null>(null);

  ngOnInit(): void {
    void this.loadInfo();
  }

  private async loadInfo(): Promise<void> {
    try {
      this.info.set(await this.service.appInfo());
    } catch {
      this.info.set(null);
    }
  }
}
