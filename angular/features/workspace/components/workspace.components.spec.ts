import { TestBed } from "@angular/core/testing";
import { ComponentCase, describeComponents } from "@testing/exercise";
import { setupWorld, warmWorld } from "@testing/world";
import { WorkspaceService } from "../workspace.service";
import { RecentWorkspaceList } from "./recent.component";
import { SwitchWorkspaceDialog } from "./switch.dialog";

const rows = [
  { path: "C:/ws/alpha", name: "alpha", lastOpenedAt: "2026-01-02T03:04:00Z", status: "ok" as const, projectCount: 3, isCurrent: true },
  { path: "C:/ws/beta", name: "beta", lastOpenedAt: "2026-01-01T03:04:00Z", status: "ok" as const, projectCount: 1 },
  { path: "C:/ws/missing", name: "missing", lastOpenedAt: "2025-12-01T03:04:00Z", status: "not_found" as const, reason: "missing" as const },
];

const cases: ComponentCase[] = [
  { name: "RecentWorkspaceList", type: RecentWorkspaceList, inputs: { rows, lastUsedPath: "C:/ws/beta" }, before: () => warmWorld() },
  { name: "RecentWorkspaceList (empty)", type: RecentWorkspaceList, inputs: { rows: [] }, before: () => warmWorld() },
  { name: "SwitchWorkspaceDialog", type: SwitchWorkspaceDialog, before: async () => { await warmWorld(); TestBed.inject(WorkspaceService).openSwitchDialog(); } },
];

describeComponents("workspace components", cases, () => {
  setupWorld();
});
