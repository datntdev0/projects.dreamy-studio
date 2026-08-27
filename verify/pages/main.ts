import type { Locator, Page } from "@playwright/test";
import { ConfirmDialog, SwitchDialog } from "./dialogs.ts";
import { AddChapterDialog, DisplayPanel, NovelChapters, NovelCreateDialog, NovelExplorer, NovelImportDialog, NovelList, NovelPanel, NovelReader } from "./novels.ts";

export class MainPage {
  readonly switchDialog: SwitchDialog;
  readonly confirm: ConfirmDialog;
  readonly explorer: NovelExplorer;
  readonly novels: NovelList;
  readonly createDialog: NovelCreateDialog;
  readonly importDialog: NovelImportDialog;
  readonly panel: NovelPanel;
  readonly display: DisplayPanel;
  readonly chapters: NovelChapters;
  readonly addChapterDialog: AddChapterDialog;
  readonly reader: NovelReader;

  constructor(private readonly page: Page) {
    this.switchDialog = new SwitchDialog(page);
    this.confirm = new ConfirmDialog(page);
    this.explorer = new NovelExplorer(page);
    this.novels = new NovelList(page);
    this.createDialog = new NovelCreateDialog(page);
    this.importDialog = new NovelImportDialog(page);
    this.panel = new NovelPanel(page);
    this.display = new DisplayPanel(page);
    this.chapters = new NovelChapters(page);
    this.addChapterDialog = new AddChapterDialog(page);
    this.reader = new NovelReader(page);
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

  get toasts(): Locator {
    return this.page.getByTestId("toast");
  }

  toast(text: string | RegExp): Locator {
    return this.toasts.filter({ hasText: text });
  }

  async showNovels(): Promise<void> {
    await this.novelRail.click();
  }

  async openSwitchDialog(): Promise<void> {
    await this.workspaceButton.click();
  }
}
