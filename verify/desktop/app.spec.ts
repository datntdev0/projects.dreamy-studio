import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp, type RunningApp } from "../scripts/launch.ts";

let root: string;
let running: RunningApp;

test.beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "dreamy-verify-"));
  running = await launchApp({ dataDir: join(root, "data"), webviewDir: join(root, "webview") });
});

test.afterAll(async () => {
  await running?.stop();
  await rm(root, { recursive: true, force: true }).catch(() => undefined);
});

test("opens the splash screen on the first open", async ({}, testInfo) => {
  await expect(running.page.getByTestId("splash-page")).toBeVisible();
  await expect(running.page.getByTestId("splash-open-workspace")).toBeVisible();
  await testInfo.attach("splash", { body: await running.page.screenshot(), contentType: "image/png" });
});
