import type { PanelSpec, SuiteSpec } from "./screens.ts";
import { expect } from "./test.ts";
import type { Studio } from "./studio.ts";

export async function comparePanels(studio: Studio, panels: readonly PanelSpec[], folder: readonly string[]): Promise<void> {
  for (const panel of panels) {
    await studio.conceal(panel);
    const clip = await studio.region(panel);
    const name = [...folder, `${panel.name}.png`];
    const label = `${folder.join("/")}/${panel.name}`;
    if (clip) {
      await expect.soft(studio.page, label).toHaveScreenshot(name, { clip });
    } else {
      await expect.soft(studio.panel(panel), label).toHaveScreenshot(name);
    }
    expect.soft(await studio.outline(panel), `${label} (aria)`).toMatchSnapshot([...folder, `${panel.name}.aria.yml`]);
  }
}

export function panelsOf(suite: SuiteSpec, names: readonly string[]): PanelSpec[] {
  return suite.panels.filter((panel) => names.includes(panel.name));
}
