import type { Locator, Page } from "@playwright/test";

export type BottomTab = "pipelines" | "output" | "omniscient";

export class StatusBarPipelines {
  constructor(private readonly page: Page) {}

  get button(): Locator {
    return this.page.getByTestId("statusbar-pipelines");
  }

  get running(): Locator {
    return this.page.getByTestId("statusbar-pipelines-running");
  }

  get idle(): Locator {
    return this.page.getByTestId("statusbar-pipelines-idle");
  }
}

export class BottomPanel {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("bottom");
  }

  get head(): Locator {
    return this.page.getByTestId("bottom-head");
  }

  get close(): Locator {
    return this.page.getByTestId("bottom-close");
  }

  get toggle(): Locator {
    return this.page.getByTestId("titlebar-toggle-bottom");
  }

  get tabs(): Locator {
    return this.page.getByTestId("bottom-tab");
  }

  get pipelines(): Locator {
    return this.page.getByTestId("bottom-pipelines");
  }

  get output(): Locator {
    return this.page.getByTestId("bottom-output");
  }

  get omniscient(): Locator {
    return this.page.getByTestId("bottom-omniscient");
  }

  tab(id: BottomTab): Locator {
    return this.page.locator(`[data-testid=bottom-tab][data-tab=${id}]`);
  }

  body(id: BottomTab): Locator {
    return id === "pipelines" ? this.pipelines : id === "output" ? this.output : this.omniscient;
  }
}

export class PipelineList {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("pipeline-list");
  }

  get group(): Locator {
    return this.page.getByTestId("pipeline-list-group");
  }

  get running(): Locator {
    return this.page.getByTestId("pipeline-list-running");
  }

  get items(): Locator {
    return this.page.getByTestId("pipeline-item");
  }

  get empty(): Locator {
    return this.page.getByTestId("pipeline-list-empty");
  }

  get emptyTitle(): Locator {
    return this.page.getByTestId("pipeline-list-empty-title");
  }

  item(novel: string | RegExp): Locator {
    return this.items.filter({ has: this.page.getByTestId("pipeline-item-novel").filter({ hasText: novel }) });
  }
}

export class PipelineItem {
  constructor(private readonly root: Locator) {}

  private part(id: string): Locator {
    return this.root.getByTestId(`pipeline-item-${id}`);
  }

  get novel(): Locator {
    return this.part("novel");
  }

  get kind(): Locator {
    return this.part("kind");
  }

  get target(): Locator {
    return this.part("target");
  }

  get status(): Locator {
    return this.part("status");
  }

  get count(): Locator {
    return this.part("count");
  }

  get queued(): Locator {
    return this.part("queued");
  }

  get failed(): Locator {
    return this.part("failed");
  }

  get percent(): Locator {
    return this.part("percent");
  }

  get progress(): Locator {
    return this.part("progress");
  }

  get tasks(): Locator {
    return this.part("task");
  }

  get cancel(): Locator {
    return this.part("cancel");
  }

  get open(): Locator {
    return this.part("open");
  }

  get error(): Locator {
    return this.part("error");
  }
}

export class PipelineHistory {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("pipeline-history");
  }

  get host(): Locator {
    return this.page.getByTestId("editor-pipelines-host");
  }

  get search(): Locator {
    return this.page.getByTestId("pipeline-history-search");
  }

  get filter(): Locator {
    return this.page.getByTestId("pipeline-history-filter");
  }

  get count(): Locator {
    return this.page.getByTestId("pipeline-history-count");
  }

  get clear(): Locator {
    return this.page.getByTestId("pipeline-history-clear");
  }

  get refresh(): Locator {
    return this.page.getByTestId("pipeline-history-refresh");
  }

  get table(): Locator {
    return this.page.getByTestId("pipeline-history-table");
  }

  get rows(): Locator {
    return this.page.getByTestId("pipeline-history-row");
  }

  get empty(): Locator {
    return this.page.getByTestId("pipeline-history-empty");
  }

  get noMatch(): Locator {
    return this.page.getByTestId("pipeline-history-nomatch");
  }

  get noMatchClear(): Locator {
    return this.page.getByTestId("pipeline-history-nomatch-clear");
  }

  get loading(): Locator {
    return this.page.getByTestId("pipeline-history-loading");
  }

  get error(): Locator {
    return this.page.getByTestId("pipeline-history-error");
  }

  get retry(): Locator {
    return this.page.getByTestId("pipeline-history-retry");
  }

  row(index: number): Locator {
    return this.rows.nth(index);
  }

  rowFor(novel: string | RegExp): Locator {
    return this.rows.filter({ hasText: novel });
  }
}

export class PipelineRow {
  constructor(private readonly root: Locator) {}

  private part(id: string): Locator {
    return this.root.getByTestId(`pipeline-history-${id}`);
  }

  get novel(): Locator {
    return this.part("novel");
  }

  get started(): Locator {
    return this.part("started");
  }

  get duration(): Locator {
    return this.part("duration");
  }

  get status(): Locator {
    return this.part("status");
  }

  get progress(): Locator {
    return this.part("progress");
  }

  get done(): Locator {
    return this.part("done");
  }

  get failed(): Locator {
    return this.part("failed");
  }
}

export class PipelineLogPanel {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("pipeline-log");
  }

  get empty(): Locator {
    return this.page.getByTestId("pipeline-log-empty");
  }

  get head(): Locator {
    return this.page.getByTestId("pipeline-log-head");
  }

  get title(): Locator {
    return this.page.getByTestId("pipeline-log-title");
  }

  get novel(): Locator {
    return this.page.getByTestId("pipeline-log-novel");
  }

  get kind(): Locator {
    return this.page.getByTestId("pipeline-log-kind");
  }

  get target(): Locator {
    return this.page.getByTestId("pipeline-log-target");
  }

  get status(): Locator {
    return this.page.getByTestId("pipeline-log-status");
  }

  get summary(): Locator {
    return this.page.getByTestId("pipeline-log-summary");
  }

  get meter(): Locator {
    return this.page.getByTestId("pipeline-log-meter");
  }

  get cancel(): Locator {
    return this.page.getByTestId("pipeline-log-cancel");
  }

  get entries(): Locator {
    return this.page.getByTestId("pipeline-log-entry");
  }

  get messages(): Locator {
    return this.page.getByTestId("pipeline-log-message");
  }

  get levels(): Locator {
    return this.page.getByTestId("pipeline-log-level");
  }
}

export class PipelinesNav {
  readonly statusbar: StatusBarPipelines;
  readonly bottom: BottomPanel;
  readonly list: PipelineList;
  readonly history: PipelineHistory;
  readonly log: PipelineLogPanel;

  constructor(private readonly page: Page) {
    this.statusbar = new StatusBarPipelines(page);
    this.bottom = new BottomPanel(page);
    this.list = new PipelineList(page);
    this.history = new PipelineHistory(page);
    this.log = new PipelineLogPanel(page);
  }

  get rail(): Locator {
    return this.page.getByTestId("railbar-pipelines");
  }

  get tab(): Locator {
    return this.page.getByTestId("editor-tab-pipelines");
  }

  item(root: Locator): PipelineItem {
    return new PipelineItem(root);
  }

  row(root: Locator): PipelineRow {
    return new PipelineRow(root);
  }
}

export class MonitoringPage {
  constructor(private readonly page: Page) {}

  get runningItems(): Locator {
    return this.page.getByTestId("pipeline-list-running").getByTestId("pipeline-item");
  }

  get statusbar(): Locator {
    return this.page.getByTestId("statusbar-pipelines");
  }

  get logBody(): Locator {
    return this.page.getByTestId("pipeline-log-entries");
  }

  historyNovels(): Locator {
    return this.page.getByTestId("pipeline-history-row").getByTestId("pipeline-history-novel");
  }

  logEntry(text: string | RegExp): Locator {
    return this.page.getByTestId("pipeline-log-entry").filter({ hasText: text });
  }
}
