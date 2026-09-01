import { inject, Injectable } from '@angular/core';
import { ProjectLabels } from '@features/project/project.labels';
import { ProjectService } from '@features/project/project.service';
import { TabsService } from '@layout/tabs.service';

import { ScriptingService } from '../../scripting/scripting.service';
import { AudiobookService } from '../audiobook.service';

@Injectable({ providedIn: 'root' })
export class AudiobookNavigation {
  private readonly audiobook = inject(AudiobookService);
  private readonly scripting = inject(ScriptingService);
  private readonly projects = inject(ProjectService);
  private readonly projectLabels = inject(ProjectLabels);
  private readonly tabs = inject(TabsService);

  back(projectId: number): void {
    const project = this.projects.projectById(projectId);
    if (project) {
      this.projects.selectOnly(project.id);
      this.tabs.openProject(project.id, project.name, this.projectLabels.iconOf(project.template));
    }
  }

  openScripting(projectId: number): void {
    const unit = this.audiobook.contextOf(projectId)?.unit;
    if (unit) {
      this.scripting.selectUnit(projectId, unit.id);
    }
    this.openScriptingTab(projectId);
  }

  editBlock(projectId: number, blockId: string): void {
    const unit = this.audiobook.contextOf(projectId)?.unit;
    if (unit) {
      this.scripting.selectUnit(projectId, unit.id);
      this.scripting.gotoBlock(projectId, blockId);
    }
    this.openScriptingTab(projectId);
  }

  private openScriptingTab(projectId: number): void {
    const project = this.projects.projectById(projectId);
    if (project) {
      this.tabs.openModule(project.id, project.name, 'scripting');
    }
  }
}
