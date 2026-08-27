import { mkdir } from "node:fs/promises";
import { basename } from "node:path";
import { expect } from "@playwright/test";
import type { AppSession } from "./app.ts";
import type { Ui } from "./fixtures.ts";
import type { PickerStub } from "./picker.ts";

export async function pickFromSplash(ui: Ui, picker: PickerStub, folder: string): Promise<void> {
  await picker.queue("folder_pick", folder);
  await ui.splash.openWorkspace.click();
}

export async function openFromSplash(ui: Ui, picker: PickerStub, folder: string): Promise<void> {
  await mkdir(folder, { recursive: true });
  await picker.queue("folder_pick", folder);
  await ui.splash.openWorkspace.click();
  await expect(ui.main.root).toBeVisible();
}

export async function switchFromMain(ui: Ui, picker: PickerStub, folder: string): Promise<void> {
  await mkdir(folder, { recursive: true });
  await ui.main.openSwitchDialog();
  await expect(ui.main.switchDialog.panel).toBeVisible();
  await picker.queue("folder_pick", folder);
  await ui.main.switchDialog.openFolder.click();
}

export async function switchWorkspace(ui: Ui, picker: PickerStub, folder: string): Promise<void> {
  await switchFromMain(ui, picker, folder);
  await expect(ui.main.workspaceName).toHaveText(basename(folder));
}

export async function rememberWorkspaces(ui: Ui, app: AppSession, picker: PickerStub, folders: readonly string[]): Promise<void> {
  const [first, ...others] = folders;
  if (first === undefined) {
    throw new Error("at least one workspace folder is required");
  }
  await openFromSplash(ui, picker, first);
  for (const folder of others) {
    await switchWorkspace(ui, picker, folder);
  }
  await app.restart();
  await expect(ui.splash.root).toBeVisible();
}
