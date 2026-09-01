import { inject, Injectable } from '@angular/core';
import { ProjectService } from '@features/project/project.service';
import { TabsService } from '@layout/tabs.service';

import { ScriptingService } from '../../scripting/scripting.service';
import { AudiobookContext } from '../audiobook.models';

@Injectable({ providedIn: 'root' })
export class AudiobookInspectorActions {
  private readonly projects = inject(ProjectService);
  private readonly scripting = inject(ScriptingService);
  private readonly tabs = inject(TabsService);

  openScript(ctx: AudiobookContext, blockId: string | null): void {
    const project = this.projects.projectById(ctx.projectId);
    if (!project || !ctx.unit) {
      return;
    }
    this.scripting.selectUnit(ctx.projectId, ctx.unit.id);
    if (blockId) {
      this.scripting.gotoBlock(ctx.projectId, blockId);
    }
    this.tabs.openModule(project.id, project.name, 'scripting');
  }
}
