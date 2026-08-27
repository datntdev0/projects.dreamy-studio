import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../scripts/fixtures.ts";
import { openFromSplash, rememberWorkspaces, switchWorkspace } from "../scripts/flows.ts";
import { DELETE_WARNING } from "../scripts/messages.ts";
import { WORKSPACE_DB_FILE } from "../scripts/workspace-db.ts";

test.describe("CAP-01 Workspace Management", () => {
  test.describe("FEAT-02 Workspace Deletion", () => {
    test("US-0003 deletes a workspace that is not open from the disk and the recent list", async ({ ui, app, picker, sandbox }) => {
      const doomed = sandbox.workspace("obsolete");
      const kept = sandbox.workspace("kept");
      await rememberWorkspaces(ui, app, picker, [doomed, kept]);
      await mkdir(join(doomed, "drafts"), { recursive: true });
      await writeFile(join(doomed, "drafts", "chapter.txt"), "chapter one");
      await openFromSplash(ui, picker, sandbox.workspace("host"));
      await ui.main.openSwitchDialog();

      await test.step("removes the folder and its recent entry after confirming", async () => {
        await ui.main.switchDialog.recent.deleteAt(doomed).click();
        await expect(ui.main.confirm.panel).toBeVisible();
        await ui.main.confirm.accept.click();

        await expect(ui.main.confirm.panel).toBeHidden();
        await expect(ui.main.switchDialog.recent.rowAt(doomed)).toHaveCount(0);
        expect(existsSync(doomed)).toBe(false);
      });

      await test.step("keeps the other workspaces untouched", async () => {
        await expect(ui.main.switchDialog.recent.rowAt(kept)).toBeVisible();
        expect(existsSync(join(kept, WORKSPACE_DB_FILE))).toBe(true);
      });

      await test.step("stays out of the recent list after the app restarts", async () => {
        await app.restart();

        await expect(ui.splash.root).toBeVisible();
        await expect(ui.splash.recent.rowAt(doomed)).toHaveCount(0);
        await expect(ui.splash.recent.rowAt(kept)).toBeVisible();
      });
    });

    test("US-0003 confirms the deletion from the recent list on the splash screen", async ({ ui, app, picker, sandbox }) => {
      const folder = sandbox.workspace("splash-delete");
      await rememberWorkspaces(ui, app, picker, [folder]);

      await ui.splash.recent.deleteAt(folder).click();
      await expect(ui.splash.confirm.panel).toBeVisible();
      await ui.splash.confirm.accept.click();

      await expect(ui.splash.confirm.panel).toBeHidden();
      await expect(ui.splash.recent.rowAt(folder)).toHaveCount(0);
      await expect(ui.splash.firstRun).toBeVisible();
      expect(existsSync(folder)).toBe(false);
    });

    test("US-0004 warns before deleting and changes nothing when cancelled", async ({ ui, app, picker, sandbox }) => {
      const folder = sandbox.workspace("precious");
      await rememberWorkspaces(ui, app, picker, [folder]);
      await openFromSplash(ui, picker, sandbox.workspace("host"));
      await ui.main.openSwitchDialog();

      await test.step("names the workspace and its path and warns that deleting cannot be undone", async () => {
        await ui.main.switchDialog.recent.deleteAt(folder).click();

        await expect(ui.main.confirm.panel).toBeVisible();
        await expect(ui.main.confirm.panel).toContainText("precious");
        await expect.soft(ui.main.confirm.panel).toContainText(folder);
        await expect(ui.main.confirm.warning).toContainText(DELETE_WARNING);
      });

      await test.step("leaves the workspace and the recent list unchanged when cancelled", async () => {
        await ui.main.confirm.cancel.click();

        await expect(ui.main.confirm.panel).toBeHidden();
        await expect(ui.main.switchDialog.recent.rowAt(folder)).toBeVisible();
        expect(existsSync(join(folder, WORKSPACE_DB_FILE))).toBe(true);
      });
    });

    test("US-0005 blocks deleting the open workspace and allows it after switching away", async ({ ui, app, picker, sandbox }) => {
      const previous = sandbox.workspace("previous");
      const open = sandbox.workspace("in-use");
      await rememberWorkspaces(ui, app, picker, [previous]);
      await ui.splash.recent.openAt(previous).click();
      await expect(ui.main.root).toBeVisible();
      await switchWorkspace(ui, picker, open);
      await ui.main.openSwitchDialog();
      const recent = ui.main.switchDialog.recent;

      await test.step("offers no way to delete the workspace that is open", async () => {
        await expect(recent.currentBadgeAt(open)).toBeVisible();
        await expect(recent.deleteAt(open)).toHaveCount(0);
        expect(existsSync(join(open, WORKSPACE_DB_FILE))).toBe(true);
      });

      await test.step("deletes the previous workspace once another one is open", async () => {
        await recent.deleteAt(previous).click();
        await expect(ui.main.confirm.panel).toBeVisible();
        await ui.main.confirm.accept.click();

        await expect(ui.main.confirm.panel).toBeHidden();
        await expect(recent.rowAt(previous)).toHaveCount(0);
        await expect(recent.currentBadgeAt(open)).toBeVisible();
        expect(existsSync(previous)).toBe(false);
        expect(existsSync(join(open, WORKSPACE_DB_FILE))).toBe(true);
      });
    });
  });
});
