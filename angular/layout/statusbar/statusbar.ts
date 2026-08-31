import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { Icon } from '@components/icon';
import { PipelineService } from '@features/pipeline/pipeline.service';
import { AppInfo } from '@features/workspace/workspace.models';
import { WorkspaceService } from '@features/workspace/workspace.service';
import { CoreModule } from '@shared/core.module';

import { LayoutService } from '../layout.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-statusbar',
  imports: [Icon, CoreModule],
  templateUrl: './statusbar.html',
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
