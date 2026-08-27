import { mkdir } from "node:fs/promises";
import { expect } from "@playwright/test";
import type { Ui } from "./fixtures.ts";
import type { PickerStub } from "./picker.ts";

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
