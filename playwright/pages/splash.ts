import type { Locator, Page } from "@playwright/test";
import { ConfirmDialog } from "./dialogs.ts";
import { RecentList } from "./recent.ts";

export class SplashPage {
  readonly confirm: ConfirmDialog;

  constructor(private readonly page: Page) {
    this.confirm = new ConfirmDialog(page);
  }

  get root(): Locator {
    return this.page.getByTestId("splash-page");
  }

  get loading(): Locator {
    return this.page.getByTestId("loading-page");
  }

  get openWorkspace(): Locator {
    return this.page.getByTestId("splash-open-workspace");
  }

  get firstRun(): Locator {
    return this.page.getByTestId("splash-first-run");
  }

  get version(): Locator {
    return this.page.getByTestId("splash-version");
  }

  get notice(): Locator {
    return this.page.getByTestId("splash-notice");
  }

  get recent(): RecentList {
    return new RecentList(this.page.getByTestId("splash-recent"));
  }
}
