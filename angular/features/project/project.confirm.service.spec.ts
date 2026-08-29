import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { DialogService } from "@core/dialog/dialog.service";
import { setupWorld, warmWorld } from "@testing/world";
import { ProjectConfirmService } from "./project.confirm.service";
import { ProjectDialogsService } from "./project.dialogs.service";

describe("ProjectConfirmService", () => {
  async function prepare() {
    const ipc = setupWorld();
    await warmWorld();
    return { ipc, confirms: TestBed.inject(ProjectConfirmService), dialogs: TestBed.inject(DialogService) };
  }

  it("ignores empty or unknown selections", async () => {
    const { confirms } = await prepare();
    expect(await confirms.deleteProjects([])).toBe(false);
    expect(await confirms.deleteProjects([99])).toBe(false);
  });

  it("deletes projects after confirmation", async () => {
    const { ipc, confirms, dialogs } = await prepare();
    const asking = confirms.deleteProjects([1, 2]);
    expect(dialogs.current()?.options.items?.length).toBe(2);
    await dialogs.accept();
    expect(dialogs.current()).not.toBeNull();
    dialogs.acknowledge(true);
    await dialogs.accept();
    expect(await asking).toBe(true);
    expect(ipc.called("project_delete")).toBe(1);
  });

  it("cancels and reports failures", async () => {
    const { ipc, confirms, dialogs } = await prepare();
    const cancelled = confirms.deleteProjects([1]);
    dialogs.cancel();
    expect(await cancelled).toBe(false);
    ipc.fail("project_delete", { code: "x", detail: "no" });
    const failing = confirms.deleteProjects([1]);
    dialogs.acknowledge(true);
    await dialogs.accept();
    expect(dialogs.error()).not.toBeNull();
    dialogs.cancel();
    await failing;
  });

  it("opens and closes the create dialog", () => {
    const dialogs = TestBed.inject(ProjectDialogsService);
    dialogs.openCreate();
    expect(dialogs.createOpen()).toBe(true);
    dialogs.closeCreate();
    expect(dialogs.createOpen()).toBe(false);
  });
});
