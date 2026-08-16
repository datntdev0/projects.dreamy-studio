import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { enterWorkspace } from "../src/app/ipc.ts";
import { launchApp, type RunningApp } from "../src/app/launch.ts";

const FAKE_CLI = [
  "@echo off",
  'if "%1"=="--version" goto version',
  'if "%1"=="auth" goto auth',
  "exit /b 2",
  ":version",
  "echo 9.9.9 (Fake CLI)",
  "exit /b 0",
  ":auth",
  'if "%2"=="login" goto login',
  'if "%2"=="logout" goto logout',
  'if "%2"=="status" goto status',
  "exit /b 2",
  ":login",
  'echo signed> "%CLAUDE_CONFIG_DIR%\\signed"',
  "exit /b 0",
  ":logout",
  'del "%CLAUDE_CONFIG_DIR%\\signed"',
  "exit /b 0",
  ":status",
  'if not exist "%CLAUDE_CONFIG_DIR%\\signed" exit /b 1',
  'echo {"loggedIn":true,"email":"e2e@example.com"}',
  "exit /b 0",
  "",
].join("\r\n");

const CLOUD_IDS = ["anthropic", "openai", "google", "openrouter", "custom"];
const SIGN_IN_TIMEOUT_MS = 30_000;

interface Sandbox {
  readonly root: string;
  readonly dataDir: string;
  readonly webviewDir: string;
  readonly workspace: string;
  readonly fakeCli: string;
  readonly settingsFile: string;
  readonly marker: string;
}

let sandbox: Sandbox;
let running: RunningApp;

function id(card: string, part: string): string {
  return `[data-testid="settings-llm-${card}${part ? `-${part}` : ""}"]`;
}

async function readSettings(): Promise<Record<string, any>> {
  return JSON.parse(await readFile(sandbox.settingsFile, "utf8"));
}

async function start(): Promise<Page> {
  running = await launchApp({ dataDir: sandbox.dataDir, webviewDir: sandbox.webviewDir });
  const page = running.page;
  await page.evaluate(() => localStorage.setItem("dreamy-studio.language", "en"));
  await enterWorkspace(page, sandbox.workspace);
  await page.goto(`${new URL(page.url()).origin}/home`);
  await page.locator('[data-testid="main-page"]').waitFor();
  return page;
}

async function openLlm(page: Page): Promise<void> {
  if (!(await page.locator('[data-testid="settings-dialog-panel"]').isVisible())) {
    await page.locator('[data-testid="railbar-settings"]').click();
  }
  await page.locator('[data-testid="settings-nav-llm"]').click();
  await page.locator('[data-testid="settings-llm-content"]').waitFor();
}

async function settled(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="settings-llm-rescan"]')).toBeEnabled({ timeout: 60_000 });
  for (const card of ["claude", "antigravity", "codex"]) {
    await expect(page.locator(id(card, "badge"))).not.toHaveText("Checking", { timeout: 60_000 });
  }
}

function pathInput(page: Page, card: string): Locator {
  return page.locator(`${id(card, "path")}, ${id(card, "manual")}`);
}

async function usePath(page: Page, card: string, path: string): Promise<void> {
  const input = pathInput(page, card);
  await input.fill(path);
  await input.press("Enter");
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.skip(test.info().project.name !== "app", "end-to-end test of the desktop app");
  const root = await mkdtemp(join(tmpdir(), "dreamy-llm-e2e-"));
  const dataDir = join(root, "data");
  sandbox = {
    root,
    dataDir,
    webviewDir: join(root, "webview"),
    workspace: join(root, "workspace"),
    fakeCli: join(root, "bin", "fake-claude.cmd"),
    settingsFile: join(dataDir, "settings.json"),
    marker: join(dataDir, "llm", "claude", "signed"),
  };
  await mkdir(sandbox.workspace, { recursive: true });
  await mkdir(join(root, "bin"), { recursive: true });
  await writeFile(sandbox.fakeCli, FAKE_CLI);
});

test.afterAll(async () => {
  await running?.stop();
  if (!sandbox) {
    return;
  }
  await rm(sandbox.root, { recursive: true, force: true }).catch(() => undefined);
});

test.describe("settings > LLM providers", () => {
  let page: Page;

  test.beforeAll(async () => {
    test.skip(test.info().project.name !== "app", "end-to-end test of the desktop app");
    page = await start();
  });

  test("lists the CLI providers and detects what is installed", async () => {
    await openLlm(page);
    await settled(page);
    for (const card of ["claude", "antigravity", "codex"]) {
      await expect(page.locator(id(card, ""))).toBeVisible();
      const installed = ((await page.locator(id(card, "install")).textContent()) ?? "").includes("Found");
      const badge = (await page.locator(id(card, "badge")).textContent())?.trim();
      if (installed) {
        expect(badge, `${card} has an empty app profile`).toBe("Not signed in");
        await expect(page.locator(id(card, "profile"))).toHaveValue(/llm[\\/](claude|codex)$/);
      } else {
        expect(badge).toBe("Not installed");
        await expect(page.locator(id(card, "manual"))).toBeVisible();
        await expect(page.locator(id(card, "signin-step"))).toContainText("Install the CLI first.");
      }
    }
    await expect(page.locator('[data-testid="settings-llm-ready-count"]')).toHaveText("No LLM is ready");
    await expect(page.locator('[data-testid="settings-llm-default-select"]')).toBeDisabled();
  });

  test("shows the cloud providers as disabled and coming soon", async () => {
    await expect(page.locator('[data-testid="settings-llm-cloud-soon"]')).toHaveText("Coming soon");
    for (const cloud of CLOUD_IDS) {
      const card = page.locator(id(`cloud-${cloud}`, ""));
      await expect(card).toBeVisible();
      await expect(card).toContainText("Coming soon");
      await expect(page.locator(id(`cloud-${cloud}`, "enable"))).toBeDisabled();
      await expect(page.locator(id(`cloud-${cloud}`, "key"))).toBeDisabled();
    }
  });

  test("reports a path that does not point to a file", async () => {
    await usePath(page, "claude", join(sandbox.root, "missing", "claude.cmd"));
    await expect(page.locator(id("claude", "path-error"))).toContainText("File not found");
    await expect(page.locator(id("claude", "badge"))).toHaveText("Not installed");
  });

  test("accepts a CLI by path and waits for the sign-in of the app profile", async () => {
    await usePath(page, "claude", sandbox.fakeCli);
    await expect(page.locator(id("claude", "install"))).toContainText("Found");
    await expect(page.locator(id("claude", "path"))).toHaveValue(sandbox.fakeCli);
    await expect(page.locator(id("claude", ""))).toContainText("9.9.9");
    await expect(page.locator(id("claude", "badge"))).toHaveText("Not signed in");
    await expect(page.locator(id("claude", "check"))).toBeEnabled();
    await expect(page.locator(id("claude", "set-default"))).toBeDisabled();
    expect((await readSettings())["llm"]["providers"]["claude"]["path"]).toBe(sandbox.fakeCli);
  });

  test("signs in through a terminal using the isolated profile", async () => {
    await page.locator(id("claude", "signin")).click();
    await expect(page.locator(id("claude", "badge"))).toHaveText("Ready", { timeout: SIGN_IN_TIMEOUT_MS });
    expect((await stat(sandbox.marker)).isFile()).toBe(true);
    await expect(page.locator(id("claude", "account"))).toHaveText("e2e@example.com");
    await expect(page.locator(id("claude", "signin-step"))).toContainText("Signed in");
  });

  test("makes the first ready CLI the default and persists it", async () => {
    await expect(page.locator(id("claude", "default-badge"))).toHaveText("Default");
    await expect(page.locator('[data-testid="settings-llm-ready-count"]')).toHaveText("1 / 3 ready");
    await expect(page.locator('[data-testid="settings-llm-default-select"]')).toHaveValue("claude");
    await expect.poll(async () => (await readSettings())["llm"]["default"]).toBe("claude");
  });

  test("checks the CLI on demand", async () => {
    await page.locator(id("claude", "check")).click();
    await expect(page.locator(id("claude", "status"))).toContainText("Check succeeded");
  });

  test("saves the extra arguments", async () => {
    const args = page.locator(id("claude", "args"));
    await args.fill("  --max-turns 5 ");
    await args.press("Enter");
    await expect.poll(async () => (await readSettings())["llm"]["providers"]["claude"]["args"]).toBe("--max-turns 5");
  });

  test("disables and re-enables a CLI", async () => {
    await page.locator(id("claude", "enable")).uncheck();
    await expect(page.locator(id("claude", "badge"))).toHaveText("Disabled");
    await expect(page.locator('[data-testid="settings-llm-ready-count"]')).toHaveText("No LLM is ready");
    await expect.poll(async () => (await readSettings())["llm"]["providers"]["claude"]["enabled"]).toBe(false);
    await page.locator(id("claude", "enable")).check();
    await expect(page.locator(id("claude", "badge"))).toHaveText("Ready", { timeout: 30_000 });
  });

  test("rescans every CLI", async () => {
    await page.locator('[data-testid="settings-llm-rescan"]').click();
    await settled(page);
    await expect(page.locator(id("claude", "badge"))).toHaveText("Ready");
  });

  test("keeps the choices after the app restarts", async () => {
    await running.stop();
    page = await start();
    await openLlm(page);
    await settled(page);
    await expect(page.locator(id("claude", "path"))).toHaveValue(sandbox.fakeCli);
    await expect(page.locator(id("claude", "args"))).toHaveValue("--max-turns 5");
    await expect(page.locator(id("claude", "badge"))).toHaveText("Ready");
    await expect(page.locator('[data-testid="settings-llm-default-select"]')).toHaveValue("claude");
  });

  test("signs out of the app profile", async () => {
    await page.locator(id("claude", "signout")).click();
    await expect(page.locator(id("claude", "badge"))).toHaveText("Not signed in", { timeout: 30_000 });
    await expect(stat(sandbox.marker)).rejects.toThrow();
    await expect(page.locator(id("claude", "signin"))).toBeEnabled();
    await expect.poll(async () => (await readSettings())["llm"]["default"]).toBe("claude");
  });
});
