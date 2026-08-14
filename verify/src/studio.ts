import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type CDPSession, type Locator, type Page } from "@playwright/test";
import { enterWorkspace } from "./app/ipc.ts";
import { launchApp, type RunningApp } from "./app/launch.ts";
import { buildFixture, fixtureExists } from "./fixture/build.ts";
import { fixtureWorkspace, runRoot, WORKSPACE_NAME } from "./paths.ts";
import type { ListSpec, PanelSpec, ScreenSpec, SuiteSpec, Target } from "./screens.ts";

const VIEWPORT = { width: 1440, height: 900 };
const THEME = "dark";
const LANGUAGE = "vi";
const READY_SELECTOR = ".editor .nv-bar";
const PROTOTYPE_WORKSPACE_NAME = '[data-testid="main-workspace-name"]';

export interface Region {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Studio {
  readonly target: Target;
  readonly page: Page;
  reset(suite: SuiteSpec): Promise<void>;
  open(screen: ScreenSpec): Promise<void>;
  select(screen: ScreenSpec): Promise<void>;
  showList(screen: ScreenSpec): Promise<void>;
  showPreview(screen: ScreenSpec): Promise<void>;
  selectInList(screen: ScreenSpec): Promise<void>;
  panel(spec: PanelSpec): Locator;
  region(spec: PanelSpec): Promise<Region | null>;
  outline(spec: PanelSpec): Promise<string>;
}

export interface Runtime {
  readonly studio: Studio;
  stop(): Promise<void>;
}

function listOf(screen: ScreenSpec): ListSpec {
  if (!screen.list) {
    throw new Error(`screen ${screen.id} has no list view`);
  }
  return screen.list;
}

abstract class BaseStudio implements Studio {
  constructor(
    readonly page: Page,
    readonly target: Target,
  ) {}

  abstract reset(suite: SuiteSpec): Promise<void>;

  async open(screen: ScreenSpec): Promise<void> {
    await this.page.locator(screen.open[this.target]).first().click();
    await this.settle();
    for (const step of screen.prepare ?? []) {
      await this.page.locator(step[this.target]).first().click();
      await this.settle();
    }
  }

  async select(screen: ScreenSpec): Promise<void> {
    if (!screen.select) {
      throw new Error(`screen ${screen.id} has nothing to select`);
    }
    await this.page.locator(screen.select[this.target]).first().click();
    await this.settle();
  }

  async showList(screen: ScreenSpec): Promise<void> {
    await this.page.locator(listOf(screen).toggle[this.target]).first().click();
    await this.settle();
  }

  async showPreview(screen: ScreenSpec): Promise<void> {
    if (!screen.preview) {
      throw new Error(`screen ${screen.id} has no preview`);
    }
    await this.page.locator(screen.preview[this.target]).first().dblclick();
    await this.settle();
  }

  async selectInList(screen: ScreenSpec): Promise<void> {
    await this.page.locator(listOf(screen).select[this.target]).first().click();
    await this.settle();
  }

  panel(spec: PanelSpec): Locator {
    return this.page.locator(spec.selector).first();
  }

  async region(spec: PanelSpec): Promise<Region | null> {
    if (!spec.below) {
      return null;
    }
    const outer = await this.panel(spec).boundingBox();
    const inner = await this.panel(spec).locator(spec.below).first().boundingBox();
    if (!outer || !inner) {
      throw new Error(`cannot measure ${spec.name}`);
    }
    const top = inner.y + inner.height;
    return { x: outer.x, y: top, width: outer.width, height: outer.y + outer.height - top };
  }

  async outline(spec: PanelSpec): Promise<string> {
    const root = this.page.locator(spec.aria ?? spec.selector).first();
    let text = await root.ariaSnapshot();
    for (const selector of spec.mask ?? []) {
      const hidden = (await this.panel(spec).locator(selector).first().innerText()).trim();
      text = hidden ? text.replaceAll(hidden, "<masked>") : text;
    }
    return `${text}
`;
  }

  protected async requireFonts(): Promise<void> {
    const loaded = await this.page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].some((face) => face.family.replaceAll('"', "") === "Geist" && face.status === "loaded");
    });
    if (!loaded) {
      throw new Error("the Geist web font did not load; screenshots would not be comparable (network access to Google Fonts is required)");
    }
  }

  protected async settle(): Promise<void> {
    await this.page.locator(READY_SELECTOR).first().waitFor();
    await this.page.mouse.move(0, 0);
    await this.page.evaluate(async () => {
      (document.activeElement as HTMLElement | null)?.blur();
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
    });
  }
}

class PrototypeStudio extends BaseStudio {
  async reset(suite: SuiteSpec): Promise<void> {
    const url = pathToFileURL(suite.page).href;
    await this.page.goto(url);
    await this.page.evaluate(() => localStorage.clear());
    await this.page.goto(url);
    await this.page.locator(READY_SELECTOR).first().waitFor();
    await this.page.evaluate(
      ([selector, name]) => {
        (window as unknown as { DSApp: { S: { workspace: { name: string } } } }).DSApp.S.workspace.name = name as string;
        document.querySelector(selector as string)!.textContent = name as string;
      },
      [PROTOTYPE_WORKSPACE_NAME, WORKSPACE_NAME],
    );
    await this.requireFonts();
    await this.settle();
  }
}

class AppStudio extends BaseStudio {
  private session: CDPSession | null = null;

  async reset(suite: SuiteSpec): Promise<void> {
    const origin = new URL(this.page.url()).origin;
    await this.page.evaluate(
      ([theme, language]) => {
        localStorage.clear();
        localStorage.setItem("dreamy-studio.theme", theme as string);
        localStorage.setItem("dreamy-studio.language", language as string);
      },
      [THEME, LANGUAGE],
    );
    await this.page.goto(`${origin}/home`);
    await this.page.locator('[data-testid="main-page"]').waitFor();
    await this.pinViewport();
    await this.page.locator(`[data-testid="railbar-item"][data-rail="${suite.rail}"]`).click();
    await this.requireFonts();
  }

  private async pinViewport(): Promise<void> {
    this.session ??= await this.page.context().newCDPSession(this.page);
    await this.session.send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, deviceScaleFactor: 1, mobile: false });
  }
}

async function startPrototype(): Promise<Runtime> {
  const browser: Browser = await chromium.launch({ channel: "msedge" });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "dark", locale: "vi-VN" });
  const page = await context.newPage();
  return { studio: new PrototypeStudio(page, "prototype"), stop: () => browser.close() };
}

async function startApp(): Promise<Runtime> {
  if (!fixtureExists()) {
    await buildFixture();
  }
  await rm(runRoot, { recursive: true, force: true });
  const workspace = join(runRoot, "workspaces", WORKSPACE_NAME);
  await cp(fixtureWorkspace, workspace, { recursive: true });
  const running: RunningApp = await launchApp({ dataDir: join(runRoot, "data"), webviewDir: join(runRoot, "webview") });
  try {
    await enterWorkspace(running.page, workspace);
  } catch (error) {
    await running.stop();
    throw error;
  }
  return { studio: new AppStudio(running.page, "app"), stop: () => running.stop() };
}

export function startRuntime(target: Target): Promise<Runtime> {
  return target === "prototype" ? startPrototype() : startApp();
}
