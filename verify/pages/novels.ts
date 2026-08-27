import type { Locator, Page } from "@playwright/test";

export class NovelExplorer {
  constructor(private readonly page: Page) {}

  get management(): Locator {
    return this.page.getByTestId("novel-explorer-management");
  }

  get novels(): Locator {
    return this.page.getByTestId("novel-explorer-novel");
  }

  get empty(): Locator {
    return this.page.getByTestId("novel-explorer-empty");
  }

  get tags(): Locator {
    return this.page.getByTestId("novel-explorer-tag");
  }

  get langs(): Locator {
    return this.page.getByTestId("novel-explorer-lang");
  }

  get clear(): Locator {
    return this.page.getByTestId("novel-explorer-clear");
  }

  novel(name: string): Locator {
    return this.novels.filter({ hasText: name });
  }

  group(name: string): Locator {
    return this.page.getByTestId("novel-explorer-group").filter({ has: this.novel(name) });
  }

  chapters(name: string): Locator {
    return this.group(name).getByTestId("novel-explorer-chapters");
  }

  tag(tag: string): Locator {
    return this.tags.filter({ has: this.page.locator(".nf-t", { hasText: new RegExp(`^${tag}$`) }) });
  }

  lang(lang: string): Locator {
    return this.langs.filter({ has: this.page.locator(".nf-t", { hasText: new RegExp(`^${lang}$`) }) });
  }
}

export class NovelCreateDialog {
  constructor(private readonly page: Page) {}

  get panel(): Locator {
    return this.page.getByTestId("novel-create-dialog-panel");
  }

  get title(): Locator {
    return this.page.getByTestId("novel-create-title-input");
  }

  get titleError(): Locator {
    return this.page.getByTestId("novel-create-title-error");
  }

  get name(): Locator {
    return this.page.getByTestId("novel-create-name-input");
  }

  get author(): Locator {
    return this.page.getByTestId("novel-create-author-input");
  }

  get lang(): Locator {
    return this.page.getByTestId("novel-create-lang-select");
  }

  get tags(): Locator {
    return this.page.getByTestId("novel-create-tags-input");
  }

  get description(): Locator {
    return this.page.getByTestId("novel-create-description-input");
  }

  get cancel(): Locator {
    return this.page.getByTestId("novel-create-cancel");
  }

  get submit(): Locator {
    return this.page.getByTestId("novel-create-submit");
  }
}

export class NovelList {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("novel-list");
  }

  get search(): Locator {
    return this.page.getByTestId("novel-list-search");
  }

  get count(): Locator {
    return this.page.getByTestId("novel-list-count");
  }

  get chips(): Locator {
    return this.page.getByTestId("novel-list-chips");
  }

  get clearFilters(): Locator {
    return this.page.getByTestId("novel-list-clear-filters");
  }

  get gridView(): Locator {
    return this.page.getByTestId("novel-list-view-grid");
  }

  get tableView(): Locator {
    return this.page.getByTestId("novel-list-view-list");
  }

  get importButton(): Locator {
    return this.page.getByTestId("novel-list-import");
  }

  get createButton(): Locator {
    return this.page.getByTestId("novel-list-create");
  }

  get grid(): Locator {
    return this.page.getByTestId("novel-list-grid");
  }

  get table(): Locator {
    return this.page.getByTestId("novel-list-table");
  }

  get cards(): Locator {
    return this.page.getByTestId("novel-list-card");
  }

  get rows(): Locator {
    return this.page.getByTestId("novel-list-row");
  }

  get empty(): Locator {
    return this.page.getByTestId("novel-list-empty-none");
  }

  get emptyCreate(): Locator {
    return this.page.getByTestId("novel-list-empty-create");
  }

  get emptyImport(): Locator {
    return this.page.getByTestId("novel-list-empty-import");
  }

  get noMatch(): Locator {
    return this.page.getByTestId("novel-list-empty-nomatch");
  }

  get noMatchClear(): Locator {
    return this.page.getByTestId("novel-list-empty-clear");
  }

  card(name: string): Locator {
    return this.cards.filter({ hasText: name });
  }

  row(name: string): Locator {
    return this.rows.filter({ hasText: name });
  }

  async removeRow(name: string): Promise<void> {
    await this.row(name).getByTestId("datatable-row-menu").click();
    await this.page.locator("[data-testid=datatable-menu-item][data-action=delete]").click();
  }
}

export type InspectStep = "format" | "open" | "manifest" | "chapters" | "list" | "cover";

export const INSPECT_STEPS: readonly InspectStep[] = ["format", "open", "manifest", "chapters", "list", "cover"];

export class NovelImportDialog {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("novel-import");
  }

  get pick(): Locator {
    return this.page.getByTestId("novel-import-pick");
  }

  get clear(): Locator {
    return this.page.getByTestId("novel-import-clear");
  }

  get fileName(): Locator {
    return this.page.getByTestId("novel-import-file-name");
  }

  get check(): Locator {
    return this.page.getByTestId("novel-import-check");
  }

  get checks(): Locator {
    return this.page.getByTestId("novel-import-checks");
  }

  get resultOk(): Locator {
    return this.page.getByTestId("novel-import-result-ok");
  }

  get resultBad(): Locator {
    return this.page.getByTestId("novel-import-result-bad");
  }

  get error(): Locator {
    return this.page.getByTestId("novel-import-error");
  }

  get next(): Locator {
    return this.page.getByTestId("novel-import-next").getByRole("button");
  }

  get progress(): Locator {
    return this.page.getByTestId("novel-import-progress");
  }

  get back(): Locator {
    return this.page.getByTestId("novel-import-back");
  }

  get cancel(): Locator {
    return this.page.getByTestId("novel-import-cancel");
  }

  get submit(): Locator {
    return this.page.getByTestId("novel-import-submit");
  }

  get form(): Locator {
    return this.page.getByTestId("novel-import-form");
  }

  get preview(): Locator {
    return this.page.getByTestId("novel-import-preview");
  }

  get stats(): Locator {
    return this.page.getByTestId("novel-import-stats");
  }

  get display(): Locator {
    return this.page.getByTestId("novel-import-display");
  }

  get title(): Locator {
    return this.page.getByTestId("novel-import-title");
  }

  get titleError(): Locator {
    return this.page.getByTestId("novel-import-title-error");
  }

  get duplicate(): Locator {
    return this.page.getByTestId("novel-import-duplicate");
  }

  get author(): Locator {
    return this.page.getByTestId("novel-import-author");
  }

  get lang(): Locator {
    return this.page.getByTestId("novel-import-lang");
  }

  get description(): Locator {
    return this.page.getByTestId("novel-import-description");
  }

  get tags(): Locator {
    return this.page.getByTestId("novel-import-tags");
  }

  get failed(): Locator {
    return this.page.getByTestId("novel-import-failed");
  }

  step(step: InspectStep): Locator {
    return this.page.getByTestId(`novel-import-check-${step}`);
  }
}

export class NovelPanel {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("novel-panel");
  }

  get empty(): Locator {
    return this.page.getByTestId("inspector-novels-empty");
  }

  get export(): Locator {
    return this.page.getByTestId("novel-panel-export");
  }

  get remove(): Locator {
    return this.page.getByTestId("novel-panel-delete");
  }

  get heading(): Locator {
    return this.page.getByTestId("novel-panel-name");
  }

  get original(): Locator {
    return this.page.getByTestId("novel-panel-original");
  }

  get author(): Locator {
    return this.page.getByTestId("novel-panel-author");
  }

  get lang(): Locator {
    return this.page.getByTestId("novel-panel-lang");
  }

  get stats(): Locator {
    return this.page.getByTestId("novel-panel-stats");
  }

  get name(): Locator {
    return this.page.getByTestId("novel-panel-name-input");
  }

  get title(): Locator {
    return this.page.getByTestId("novel-panel-title-input");
  }

  get authorInput(): Locator {
    return this.page.getByTestId("novel-panel-author-input");
  }

  get langSelect(): Locator {
    return this.page.getByTestId("novel-panel-lang-select");
  }

  get description(): Locator {
    return this.page.getByTestId("novel-panel-description-input");
  }

  get tags(): Locator {
    return this.page.getByTestId("novel-panel-tag");
  }

  get tagsEmpty(): Locator {
    return this.page.getByTestId("novel-panel-tags-empty");
  }

  get tagInput(): Locator {
    return this.page.getByTestId("novel-panel-tag-input");
  }

  get coverPick(): Locator {
    return this.page.getByTestId("novel-panel-cover-pick");
  }

  get coverInput(): Locator {
    return this.page.getByTestId("novel-panel-cover-input");
  }

  get coverRemove(): Locator {
    return this.page.getByTestId("novel-panel-cover-remove");
  }

  get cover(): Locator {
    return this.page.getByTestId("novel-panel-cover").getByTestId("cover");
  }

  tag(tag: string): Locator {
    return this.tags.filter({ hasText: new RegExp(`^\\s*${tag}\\s*$`) });
  }

  async addTag(tag: string): Promise<void> {
    await this.tagInput.fill(tag);
    await this.tagInput.press("Enter");
  }

  async setField(field: Locator, value: string): Promise<void> {
    await field.fill(value);
    await field.blur();
  }
}

export class DisplayPanel {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("novel-display-panel");
  }

  get reset(): Locator {
    return this.page.getByTestId("novel-display-reset");
  }

  get sizeValue(): Locator {
    return this.page.getByTestId("novel-display-size-value");
  }

  get size(): Locator {
    return this.page.getByTestId("novel-display-size");
  }

  get nums(): Locator {
    return this.page.getByTestId("novel-display-nums");
  }

  get justify(): Locator {
    return this.page.getByTestId("novel-display-justify");
  }

  font(value: string): Locator {
    return this.page.getByTestId(`novel-display-font-${value}`);
  }

  lineHeight(value: string): Locator {
    return this.page.getByTestId(`novel-display-lh-${value}`);
  }

  width(value: string): Locator {
    return this.page.getByTestId(`novel-display-width-${value}`);
  }

  paper(value: string): Locator {
    return this.page.getByTestId(`novel-display-paper-${value}`);
  }
}

export class AddChapterDialog {
  constructor(private readonly page: Page) {}

  get panel(): Locator {
    return this.page.getByTestId("novel-chapter-add-dialog-panel");
  }

  get title(): Locator {
    return this.page.getByTestId("novel-chapter-add-title");
  }

  get submit(): Locator {
    return this.page.getByTestId("novel-chapter-add-submit");
  }
}

export class NovelChapters {
  readonly addDialog: AddChapterDialog;

  constructor(private readonly page: Page) {
    this.addDialog = new AddChapterDialog(page);
  }

  get root(): Locator {
    return this.page.getByTestId("novel-chapters");
  }

  get read(): Locator {
    return this.page.getByTestId("novel-chapters-read");
  }

  get search(): Locator {
    return this.page.getByTestId("novel-chapters-search");
  }

  get count(): Locator {
    return this.page.getByTestId("novel-chapters-count");
  }

  get rows(): Locator {
    return this.page.getByTestId("novel-chapter-row");
  }

  get empty(): Locator {
    return this.page.getByTestId("novel-chapters-empty");
  }

  get emptyAdd(): Locator {
    return this.page.getByTestId("novel-chapters-empty-add");
  }

  row(title: string): Locator {
    return this.rows.filter({ has: this.page.getByTestId("novel-chapter-title").filter({ hasText: title }) });
  }

  rowAt(seq: number): Locator {
    return this.rows.nth(seq - 1);
  }

  async titles(): Promise<string[]> {
    return this.page.getByTestId("novel-chapter-title").allInnerTexts();
  }

  async runAction(row: Locator, action: "add" | "delete"): Promise<void> {
    await row.getByTestId("datatable-row-menu").click();
    await this.page.locator(`[data-testid=datatable-menu-item][data-action=${action}]`).click();
  }

  async drag(source: Locator, target: Locator, side: "before" | "after"): Promise<void> {
    const from = await source.boundingBox();
    const to = await target.boundingBox();
    if (from === null || to === null) {
      throw new Error("a chapter row is not on screen");
    }
    const startX = from.x + from.width / 3;
    const startY = from.y + from.height / 2;
    const endY = side === "after" ? to.y + to.height * 0.75 : to.y + to.height * 0.25;
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX, startY + (endY > startY ? 8 : -8), { steps: 3 });
    await this.page.mouse.move(startX, endY, { steps: 10 });
    await this.page.mouse.up();
    await this.page.waitForTimeout(300);
  }
}

export class NovelReader {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("novel-reader");
  }

  get back(): Locator {
    return this.page.getByTestId("novel-reader-back");
  }

  get prev(): Locator {
    return this.page.getByTestId("novel-reader-prev");
  }

  get next(): Locator {
    return this.page.getByTestId("novel-reader-next");
  }

  get jump(): Locator {
    return this.page.getByTestId("novel-reader-jump");
  }

  get eyebrow(): Locator {
    return this.page.getByTestId("novel-reader-eyebrow");
  }

  get title(): Locator {
    return this.page.getByTestId("novel-reader-title");
  }

  get titleInput(): Locator {
    return this.page.getByTestId("novel-reader-title-input");
  }

  get meta(): Locator {
    return this.page.getByTestId("novel-reader-meta");
  }

  get surface(): Locator {
    return this.page.getByTestId("novel-reader-page");
  }

  get paragraphs(): Locator {
    return this.page.getByTestId("novel-reader-para");
  }

  get editor(): Locator {
    return this.page.getByTestId("novel-reader-textarea");
  }

  get save(): Locator {
    return this.page.getByTestId("novel-reader-save");
  }

  get cancel(): Locator {
    return this.page.getByTestId("novel-reader-cancel");
  }

  get writer(): Locator {
    return this.page.getByTestId("novel-reader-write-textarea");
  }

  get writeSave(): Locator {
    return this.page.getByTestId("novel-reader-write-save");
  }

  get addPassage(): Locator {
    return this.page.getByTestId("novel-reader-add-passage");
  }

  get empty(): Locator {
    return this.page.getByTestId("novel-reader-empty");
  }

  get chapterInfo(): Locator {
    return this.page.getByTestId("novel-chapter-info");
  }

  mode(mode: "read" | "edit" | "write"): Locator {
    return this.page.getByTestId(`novel-reader-mode-${mode}`);
  }

  paragraph(n: number): Locator {
    return this.paragraphs.nth(n - 1);
  }

  async texts(): Promise<string[]> {
    return this.paragraphs.locator(".rd-tx").allInnerTexts();
  }
}
