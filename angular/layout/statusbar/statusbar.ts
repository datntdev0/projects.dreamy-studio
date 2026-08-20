import { Component, OnInit, inject, signal } from "@angular/core";
import { Icon } from "@components/icon";
import { LanguagePipe } from "@app/core/language/language.pipe";
import { WorkspaceService } from "@app/features/workspace/workspace.service";
import { PipelineService } from "@app/features/pipeline/pipeline.service";
import { AppInfo } from "@app/features/workspace/workspace.models";
import { LayoutService } from "../layout.service";

@Component({
  selector: "app-statusbar",
  standalone: true,
  imports: [Icon, LanguagePipe],
  templateUrl: "./statusbar.html",
})
export class Statusbar implements OnInit {
  private readonly service = inject(WorkspaceService);

  readonly layout = inject(LayoutService);
  readonly pipelines = inject(PipelineService);
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
