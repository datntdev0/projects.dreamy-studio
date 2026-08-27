import type { Locator, Page } from "@playwright/test";
import { RecentList } from "./recent.ts";

export class ConfirmDialog {
  constructor(private readonly page: Page) {}

  get panel(): Locator {
    return this.page.getByTestId("dialog-host-panel");
  }

  get accept(): Locator {
    return this.page.getByTestId("dialog-host-accept");
  }

  get cancel(): Locator {
    return this.page.getByTestId("dialog-host-cancel");
  }
}

export class SwitchDialog {
  constructor(private readonly page: Page) {}

  get panel(): Locator {
    return this.page.getByTestId("switch-dialog");
  }

  get notice(): Locator {
    return this.page.getByTestId("switch-dialog-notice");
  }

  get openFolder(): Locator {
    return this.page.getByTestId("switch-open-folder");
  }

  get close(): Locator {
    return this.page.getByTestId("switch-close");
  }

  get recent(): RecentList {
    return new RecentList(this.panel.getByTestId("recent-list"));
  }
}
