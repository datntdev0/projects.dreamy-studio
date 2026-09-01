import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Audiobook } from '@features/audiobook/components/audiobook.component';
import { Scripting } from '@features/scripting/components/scripting.component';

import { ProjectModuleId } from '../project.models';
import { ProjectModuleFrame } from './module-frame.component';
import { ProjectModulePlaceholder } from './module-placeholder.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-project-module-host',
  imports: [ProjectModuleFrame, ProjectModulePlaceholder, Scripting, Audiobook],
  templateUrl: './module-host.component.html',
})
export class ProjectModuleHost {
  readonly projectId = input.required<number>();
  readonly moduleId = input.required<ProjectModuleId>();
}
