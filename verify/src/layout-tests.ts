import { comparePanels } from "./compare.ts";
import { layoutPanel } from "./screens.ts";
import { test } from "./test.ts";

export function defineLayoutTest(name: string): void {
  test.describe("layout components", () => {
    test(name, async ({ studio }) => {
      await comparePanels(studio, [layoutPanel(name)], ["layout"]);
    });
  });
}
