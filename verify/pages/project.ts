import type { Locator, Page } from "@playwright/test";

export type TemplateId = "audiobook" | "filmseries" | "blank";

export class ProjectExplorer {
  constructor(private readonly page: Page) {}

  get catalog(): Locator {
    return this.page.getByTestId("project-explorer-catalog");
  }

  get templates(): Locator {
    return this.page.getByTestId("project-explorer-template");
  }

  get statuses(): Locator {
    return this.page.getByTestId("project-explorer-status");
  }

  template(label: RegExp): Locator {
    return this.templates.filter({ hasText: label });
  }

  status(label: RegExp): Locator {
    return this.statuses.filter({ hasText: label });
  }
}

export class ProjectCatalog {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("project-list");
  }

  get search(): Locator {
    return this.page.getByTestId("project-list-search");
  }

  get count(): Locator {
    return this.page.getByTestId("project-list-count");
  }

  get sort(): Locator {
    return this.page.getByTestId("project-list-sort");
  }

  get gridView(): Locator {
    return this.page.getByTestId("project-list-view-grid");
  }

  get listView(): Locator {
    return this.page.getByTestId("project-list-view-list");
  }

  get create(): Locator {
    return this.page.getByTestId("project-list-create");
  }

  get grid(): Locator {
    return this.page.getByTestId("project-list-grid");
  }

  get table(): Locator {
    return this.page.getByTestId("project-list-table");
  }

  get headers(): Locator {
    return this.table.locator("th");
  }

  get cards(): Locator {
    return this.page.getByTestId("project-list-card");
  }

  get rows(): Locator {
    return this.page.getByTestId("project-list-row");
  }

  get chipTemplates(): Locator {
    return this.page.getByTestId("project-list-chip-template");
  }

  get chipStatuses(): Locator {
    return this.page.getByTestId("project-list-chip-status");
  }

  get empty(): Locator {
    return this.page.getByTestId("project-list-empty-none");
  }

  get emptyCreate(): Locator {
    return this.page.getByTestId("project-list-empty-create");
  }

  get noMatch(): Locator {
    return this.page.getByTestId("project-list-empty-nomatch");
  }

  get noMatchClear(): Locator {
    return this.page.getByTestId("project-list-empty-clear");
  }

  card(name: string): Locator {
    return this.cards.filter({ hasText: name });
  }

  row(name: string): Locator {
    return this.rows.filter({ hasText: name });
  }

  chipRemove(chip: Locator): Locator {
    return chip.getByTestId("project-list-chip-remove");
  }
}

export class ProjectCreateDialog {
  constructor(private readonly page: Page) {}

  get panel(): Locator {
    return this.page.getByTestId("project-create-dialog-panel");
  }

  get templates(): Locator {
    return this.page.getByTestId(/^project-create-template-(audiobook|filmseries|blank)$/);
  }

  get name(): Locator {
    return this.page.getByTestId("project-create-name-input");
  }

  get nameError(): Locator {
    return this.page.getByTestId("project-create-name-error");
  }

  get novel(): Locator {
    return this.page.getByTestId("project-create-novel-select");
  }

  get version(): Locator {
    return this.page.getByTestId("project-create-version-select");
  }

  get allChapters(): Locator {
    return this.page.getByTestId("project-create-all-chapters");
  }

  get allChaptersLabel(): Locator {
    return this.page.getByTestId("project-create-all-chapters-label");
  }

  get from(): Locator {
    return this.page.getByTestId("project-create-from");
  }

  get to(): Locator {
    return this.page.getByTestId("project-create-to");
  }

  get rangeError(): Locator {
    return this.page.getByTestId("project-create-range-error");
  }

  get error(): Locator {
    return this.page.getByTestId("project-create-error");
  }

  get cancel(): Locator {
    return this.page.getByTestId("project-create-cancel");
  }

  get submit(): Locator {
    return this.page.getByTestId("project-create-submit");
  }

  template(id: TemplateId): Locator {
    return this.page.getByTestId(`project-create-template-${id}`);
  }
}

export class ProjectPanel {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("project-panel");
  }

  get thumb(): Locator {
    return this.page.getByTestId("project-panel-thumb").getByTestId("project-thumb");
  }

  get coverInput(): Locator {
    return this.page.getByTestId("project-panel-cover-input");
  }

  get coverRemove(): Locator {
    return this.page.getByTestId("project-panel-cover-remove");
  }

  get name(): Locator {
    return this.page.getByTestId("project-panel-name");
  }

  get badges(): Locator {
    return this.page.getByTestId("project-panel-badges");
  }

  get description(): Locator {
    return this.page.getByTestId("project-panel-description");
  }

  get meta(): Locator {
    return this.page.getByTestId("project-panel-meta");
  }

  get source(): Locator {
    return this.page.getByTestId("project-panel-source");
  }

  get open(): Locator {
    return this.page.getByTestId("project-panel-open");
  }

  get archive(): Locator {
    return this.page.getByTestId("project-panel-archive");
  }

  get remove(): Locator {
    return this.page.getByTestId("project-panel-delete");
  }
}

export class ProjectView {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("editor-project-host");
  }

  get tabs(): Locator {
    return this.page.getByTestId("editor-tab-project");
  }

  get title(): Locator {
    return this.page.getByTestId("project-view-title");
  }

  get tabFiles(): Locator {
    return this.page.getByTestId("project-view-tab-files");
  }

  get tabSettings(): Locator {
    return this.page.getByTestId("project-view-tab-settings");
  }

  get openFolder(): Locator {
    return this.page.getByTestId("project-view-open-folder");
  }

  get files(): Locator {
    return this.page.getByTestId("project-view-files");
  }

  get refresh(): Locator {
    return this.page.getByTestId("project-view-refresh");
  }

  get entries(): Locator {
    return this.page.getByTestId("project-tree-entry");
  }

  get settings(): Locator {
    return this.page.getByTestId("project-view-settings");
  }

  get nameInput(): Locator {
    return this.page.getByTestId("project-view-name");
  }

  get descriptionInput(): Locator {
    return this.page.getByTestId("project-view-description");
  }

  get folder(): Locator {
    return this.page.getByTestId("project-view-folder");
  }

  get source(): Locator {
    return this.page.getByTestId("project-view-source");
  }

  get sourceList(): Locator {
    return this.page.getByTestId("project-view-source-list");
  }

  entry(name: string): Locator {
    return this.entries.filter({ has: this.page.getByText(name, { exact: true }) });
  }

  async setField(field: Locator, value: string): Promise<void> {
    await field.fill(value);
    await field.blur();
  }
}

export class ProjectDeleteDialog {
  constructor(private readonly page: Page) {}

  get note(): Locator {
    return this.page.getByTestId("dialog-host-note");
  }

  get acknowledge(): Locator {
    return this.page.getByTestId("dialog-host-acknowledge");
  }
}

export class ProjectPages {
  readonly explorer: ProjectExplorer;
  readonly catalog: ProjectCatalog;
  readonly create: ProjectCreateDialog;
  readonly panel: ProjectPanel;
  readonly view: ProjectView;
  readonly deleteDialog: ProjectDeleteDialog;

  constructor(private readonly page: Page) {
    this.explorer = new ProjectExplorer(page);
    this.catalog = new ProjectCatalog(page);
    this.create = new ProjectCreateDialog(page);
    this.panel = new ProjectPanel(page);
    this.view = new ProjectView(page);
    this.deleteDialog = new ProjectDeleteDialog(page);
  }

  get rail(): Locator {
    return this.page.locator("[data-testid=railbar-item][data-rail=projects]");
  }
}
