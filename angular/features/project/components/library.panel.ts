import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TabsService } from '@layout/tabs.service';
import { CoreModule } from '@shared/core.module';

import { ProjectLabels } from '../project.labels';
import { ProjectSummary } from '../project.models';
import { ProjectService } from '../project.service';
import { ProjectThumb } from './thumb.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-project-library-panel',
  imports: [CoreModule, ProjectThumb],
  templateUrl: './library.panel.html',
})
export class ProjectLibraryPanel {
  private readonly tabs = inject(TabsService);
  readonly projects = inject(ProjectService);
  readonly labels = inject(ProjectLabels);

  async open(project: ProjectSummary): Promise<void> {
    this.projects.selectOnly(project.id);
    const opened = await this.projects.open(project.id);
    this.tabs.openProject(opened.id, opened.name, this.labels.iconOf(opened.template));
  }
}
