import { TestBed } from '@angular/core/testing';
import { ComponentCase, describeComponents } from '@testing/exercise';
import { project } from '@testing/fixtures';
import { setupWorld, warmWorld } from '@testing/world';

import { ProjectDialogsService } from '../project.dialogs.service';
import { ProjectService } from '../project.service';
import { ProjectCreateDialog } from './create.dialog';
import { ProjectExplorer } from './explorer.component';
import { ProjectLibraryPanel } from './library.panel';
import { ProjectList } from './list.component';
import { ProjectModuleHost } from './module-host.component';
import { ProjectModules } from './modules.component';
import { ProjectOverview } from './overview.component';
import { ProjectPanel } from './project.panel';
import { ProjectView } from './project-view.component';
import { ProjectThumb } from './thumb.component';

async function warm(): Promise<void> {
  await warmWorld();
}

const cases: ComponentCase[] = [
  { name: 'ProjectList (grid)', type: ProjectList, before: warm },
  {
    name: 'ProjectList (list)',
    type: ProjectList,
    before: async () => {
      await warm();
      TestBed.inject(ProjectService).setView('list');
    },
  },
  { name: 'ProjectExplorer', type: ProjectExplorer, before: warm },
  { name: 'ProjectLibraryPanel', type: ProjectLibraryPanel, before: warm },
  { name: 'ProjectView', type: ProjectView, inputs: { projectId: 1 }, before: warm },
  {
    name: 'ProjectView (missing source)',
    type: ProjectView,
    inputs: { projectId: 2 },
    before: warm,
  },
  {
    name: 'ProjectOverview',
    type: ProjectOverview,
    inputs: { project: project({ id: 1, description: 'Night tales' }) },
    before: warm,
  },
  { name: 'ProjectPanel', type: ProjectPanel, inputs: { projectId: 1 }, before: warm },
  {
    name: 'ProjectModules',
    type: ProjectModules,
    inputs: { project: project({ id: 1 }) },
    before: warm,
  },
  {
    name: 'ProjectModuleHost',
    type: ProjectModuleHost,
    inputs: { projectId: 1, moduleId: 'scripting' },
    before: warm,
  },
  {
    name: 'ProjectThumb',
    type: ProjectThumb,
    inputs: { project: project({ id: 1 }) },
    before: warm,
  },
  {
    name: 'ProjectCreateDialog',
    type: ProjectCreateDialog,
    before: async () => {
      await warm();
      TestBed.inject(ProjectDialogsService).openCreate();
    },
  },
];

describeComponents('project components', cases, () => {
  setupWorld();
});
