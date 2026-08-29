import { TestBed } from "@angular/core/testing";
import { ComponentCase, describeComponents } from "@testing/exercise";
import { project } from "@testing/fixtures";
import { setupWorld, warmWorld } from "@testing/world";
import { ProjectDialogsService } from "../project.dialogs.service";
import { ProjectService } from "../project.service";
import { ProjectConfirmThumb } from "./confirm-thumb.component";
import { ProjectCreateDialog } from "./create.dialog";
import { ProjectExplorer } from "./explorer.component";
import { ProjectLibraryPanel } from "./library.panel";
import { ProjectList } from "./list.component";
import { ProjectView } from "./project-view.component";
import { ProjectPanel } from "./project.panel";
import { ProjectThumb } from "./thumb.component";
import { ProjectTree } from "./tree.component";

async function warm(): Promise<void> {
  await warmWorld();
}

const cases: ComponentCase[] = [
  { name: "ProjectList (grid)", type: ProjectList, before: warm },
  { name: "ProjectList (list)", type: ProjectList, before: async () => { await warm(); TestBed.inject(ProjectService).setView("list"); } },
  { name: "ProjectExplorer", type: ProjectExplorer, before: warm },
  { name: "ProjectLibraryPanel", type: ProjectLibraryPanel, before: warm },
  { name: "ProjectView", type: ProjectView, inputs: { projectId: 1 }, before: warm },
  { name: "ProjectView (missing source)", type: ProjectView, inputs: { projectId: 2 }, before: warm },
  { name: "ProjectPanel", type: ProjectPanel, inputs: { projectId: 1 }, before: warm },
  { name: "ProjectTree", type: ProjectTree, inputs: { projectId: 1 }, before: warm },
  { name: "ProjectThumb", type: ProjectThumb, inputs: { project: project({ id: 1 }) }, before: warm },
  { name: "ProjectConfirmThumb", type: ProjectConfirmThumb, inputs: { item: { name: "p", data: project({ id: 1 }) } }, before: warm },
  { name: "ProjectCreateDialog", type: ProjectCreateDialog, before: async () => { await warm(); TestBed.inject(ProjectDialogsService).openCreate(); } },
];

describeComponents("project components", cases, () => {
  setupWorld();
});
