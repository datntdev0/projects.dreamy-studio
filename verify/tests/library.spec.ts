import { PANELS, panelsNamed, SCREENS, type PanelSpec } from "../src/screens.ts";
import { expect, test } from "../src/test.ts";
import type { Studio } from "../src/studio.ts";

async function compare(studio: Studio, panels: readonly PanelSpec[], folder: string[]): Promise<void> {
  for (const panel of panels) {
    const masks = (panel.mask ?? []).map((selector) => studio.panel(panel).locator(selector));
    const clip = await studio.region(panel);
    const name = [...folder, `${panel.name}.png`];
    const label = `${folder.join("/")}/${panel.name}`;
    if (clip) {
      await expect.soft(studio.page, label).toHaveScreenshot(name, { clip, mask: masks });
    } else {
      await expect.soft(studio.panel(panel), label).toHaveScreenshot(name, { mask: masks });
    }
    expect.soft(await studio.outline(panel), `${label} (aria)`).toMatchSnapshot([...folder, `${panel.name}.aria.yml`]);
  }
}

test.describe("library screens", () => {
  for (const screen of SCREENS) {
    test(`${screen.id} overview`, async ({ studio }) => {
      await studio.open(screen);
      await compare(studio, PANELS, [screen.id, "overview"]);
    });

    test(`${screen.id} selected`, async ({ studio }) => {
      await studio.open(screen);
      await studio.select(screen);
      await compare(studio, panelsNamed(screen.selectedPanels), [screen.id, "selected"]);
    });
  }
});