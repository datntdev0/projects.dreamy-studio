import type { Locator } from "@playwright/test";

export class RecentList {
  constructor(private readonly root: Locator) {}

  get rows(): Locator {
    return this.root.getByTestId("recent-row");
  }

  rowAt(path: string): Locator {
    return this.rows.filter({ has: this.root.page().getByTestId("recent-row-path").filter({ hasText: path }) });
  }
}
