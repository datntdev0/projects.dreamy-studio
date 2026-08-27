import type { Locator, Page } from "@playwright/test";
import { ConfirmDialog, SwitchDialog } from "./dialogs.ts";

export class MainPage {
  readonly switchDialog: SwitchDialog;
  readonly confirm: ConfirmDialog;

  constructor(private readonly page: Page) {
    this.switchDialog = new SwitchDialog(page);
    this.confirm = new ConfirmDialog(page);
  }

  get root(): Locator {
    return this.page.getByTestId("main-page");
  }

  get workspaceButton(): Locator {
    return this.page.getByTestId("main-workspace");
  }

  get workspaceName(): Locator {
    return this.page.getByTestId("main-workspace-name");
  }

  get statusPath(): Locator {
    return this.page.getByTestId("statusbar-workspace");
  }

  get switchNotice(): Locator {
    return this.page.getByTestId("main-switch-notice");
  }

  get novelRail(): Locator {
    return this.page.locator("[data-testid=railbar-item][data-rail=novels]");
  }

  get novelRows(): Locator {
    return this.page.getByTestId("novel-explorer-novel");
  }

  async showNovels(): Promise<void> {
    await this.novelRail.click();
  }

  async openSwitchDialog(): Promise<void> {
    await this.workspaceButton.click();
  }
}
