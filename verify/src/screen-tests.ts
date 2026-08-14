import { comparePanels, panelsOf } from "./compare.ts";
import { DIALOG_PANEL, folderOf, type ScreenSpec, type SuiteSpec } from "./screens.ts";
import { test } from "./test.ts";

function screensNamed(suite: SuiteSpec, ids: readonly string[]): ScreenSpec[] {
  return ids.map((id) => {
    const screen = suite.screens.find((candidate) => candidate.id === id);
    if (!screen) {
      throw new Error(`unknown ${suite.id} screen: ${id}`);
    }
    return screen;
  });
}

function defineScreen(suite: SuiteSpec, screen: ScreenSpec): void {
  const folder = folderOf(screen);
  const view = suite.id === "library" ? `${screen.id} grid` : screen.id;

  test(`${view} overview`, async ({ studio }) => {
    await studio.open(screen);
    await comparePanels(studio, suite.panels, [...folder, "overview"]);
  });

  if (screen.select) {
    test(`${view} selected`, async ({ studio }) => {
      await studio.open(screen);
      await studio.select(screen);
      await comparePanels(studio, panelsOf(suite, screen.selectedPanels), [...folder, "selected"]);
    });
  }

  if (screen.list) {
    test(`${screen.id} list overview`, async ({ studio }) => {
      await studio.open(screen);
      await studio.showList(screen);
      await comparePanels(studio, suite.panels, [...folder, "list-overview"]);
    });

    test(`${screen.id} list selected`, async ({ studio }) => {
      await studio.open(screen);
      await studio.showList(screen);
      await studio.selectInList(screen);
      await comparePanels(studio, panelsOf(suite, screen.selectedPanels), [...folder, "list-selected"]);
    });
  }

  if (screen.preview) {
    test(`${screen.id} preview dialog`, async ({ studio }) => {
      await studio.open(screen);
      await studio.showPreview(screen);
      await comparePanels(studio, [DIALOG_PANEL], [...folder, "preview"]);
    });
  }
}

export function defineScreenTests(suite: SuiteSpec, title: string, ids: readonly string[]): void {
  test.use({ suite });
  test.describe(title, () => {
    for (const screen of screensNamed(suite, ids)) {
      defineScreen(suite, screen);
    }
  });
}
