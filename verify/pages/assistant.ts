import type { Locator, Page } from "@playwright/test";

export type SessionGroupKey = "today" | "yesterday" | "week" | "older";

export class AssistantStartView {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("assistant-start");
  }

  get history(): Locator {
    return this.page.getByTestId("assistant-start-history");
  }

  get scopeToggle(): Locator {
    return this.page.getByTestId("assistant-scope-toggle");
  }

  get scopeCurrent(): Locator {
    return this.page.getByTestId("assistant-scope-current");
  }

  get scopeMeta(): Locator {
    return this.page.getByTestId("assistant-scope-meta");
  }

  get scopeChange(): Locator {
    return this.page.getByTestId("assistant-scope-change");
  }

  get scopePanel(): Locator {
    return this.page.getByTestId("assistant-scope-panel");
  }

  get scopeSearch(): Locator {
    return this.page.getByTestId("assistant-scope-search");
  }

  get scopeEmpty(): Locator {
    return this.page.getByTestId("assistant-scope-empty");
  }

  get scopeNow(): Locator {
    return this.page.getByTestId("assistant-start-scope");
  }

  get workspaceOption(): Locator {
    return this.page.locator("[data-testid=assistant-scope-option][data-scope=workspace]");
  }

  get novelOptions(): Locator {
    return this.page.locator("[data-testid=assistant-scope-option][data-scope^=novel-]");
  }

  novelOption(name: string): Locator {
    return this.novelOptions.filter({ has: this.page.getByTestId("assistant-scope-option-name").getByText(name, { exact: true }) });
  }

  optionMeta(option: Locator): Locator {
    return option.getByTestId("assistant-scope-option-meta");
  }

  get error(): Locator {
    return this.page.getByTestId("assistant-start-error");
  }

  get errorDismiss(): Locator {
    return this.page.getByTestId("assistant-start-error-dismiss");
  }
}

export class AssistantHistoryView {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("assistant-sessions");
  }

  get back(): Locator {
    return this.page.getByTestId("assistant-sessions-back");
  }

  get count(): Locator {
    return this.page.getByTestId("assistant-sessions-count");
  }

  get search(): Locator {
    return this.page.getByTestId("assistant-sessions-search");
  }

  get filter(): Locator {
    return this.page.getByTestId("assistant-sessions-filter");
  }

  get groups(): Locator {
    return this.page.getByTestId("assistant-sessions-group");
  }

  get sessions(): Locator {
    return this.page.getByTestId("assistant-session");
  }

  get empty(): Locator {
    return this.page.getByTestId("assistant-sessions-empty");
  }

  get emptyTitle(): Locator {
    return this.page.getByTestId("assistant-sessions-empty-title");
  }

  get emptyDescription(): Locator {
    return this.page.getByTestId("assistant-sessions-empty-description");
  }

  get noMatch(): Locator {
    return this.page.getByTestId("assistant-sessions-nomatch");
  }

  get clear(): Locator {
    return this.page.getByTestId("assistant-sessions-clear");
  }

  get error(): Locator {
    return this.page.getByTestId("assistant-sessions-error");
  }

  get retry(): Locator {
    return this.page.getByTestId("assistant-sessions-retry");
  }

  group(key: SessionGroupKey): Locator {
    return this.page.locator(`[data-testid=assistant-sessions-group][data-group=${key}]`);
  }

  groupLabel(key: SessionGroupKey): Locator {
    return this.group(key).getByTestId("assistant-sessions-group-label");
  }

  session(title: string): Locator {
    return this.sessions.filter({ has: this.page.getByTestId("assistant-session-title").getByText(title, { exact: true }) });
  }

  open(session: Locator): Locator {
    return session.getByTestId("assistant-session-open");
  }

  remove(session: Locator): Locator {
    return session.getByTestId("assistant-session-delete");
  }

  scope(session: Locator): Locator {
    return session.getByTestId("assistant-session-scope");
  }

  messages(session: Locator): Locator {
    return session.getByTestId("assistant-session-count");
  }
}

export class AssistantChatView {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("assistant-chat");
  }

  get history(): Locator {
    return this.page.getByTestId("assistant-chat-history");
  }

  get title(): Locator {
    return this.page.getByTestId("assistant-chat-title");
  }

  get newChat(): Locator {
    return this.page.getByTestId("assistant-chat-new");
  }

  get remove(): Locator {
    return this.page.getByTestId("assistant-chat-delete");
  }

  get scopeChip(): Locator {
    return this.page.getByTestId("assistant-chat-scope-chip");
  }

  get count(): Locator {
    return this.page.getByTestId("assistant-chat-count");
  }

  get editNotice(): Locator {
    return this.page.getByTestId("assistant-chat-edit-notice");
  }

  get userMessages(): Locator {
    return this.page.getByTestId("assistant-message-user");
  }

  get userTexts(): Locator {
    return this.page.getByTestId("assistant-message-bubble");
  }

  get replies(): Locator {
    return this.page.getByTestId("assistant-message-assistant");
  }

  get replyTexts(): Locator {
    return this.page.getByTestId("assistant-message-text");
  }

  get activitySummary(): Locator {
    return this.page.getByTestId("assistant-message-activities-summary");
  }

  get activities(): Locator {
    return this.page.getByTestId("assistant-message-activity");
  }

  get pending(): Locator {
    return this.page.getByTestId("assistant-message-pending-bubble");
  }

  get typing(): Locator {
    return this.page.getByTestId("assistant-typing");
  }

  get typingLabel(): Locator {
    return this.page.getByTestId("assistant-typing-label");
  }

  get liveLabel(): Locator {
    return this.page.getByTestId("assistant-live-label");
  }

  get liveCount(): Locator {
    return this.page.getByTestId("assistant-live-count");
  }

  get error(): Locator {
    return this.page.getByTestId("assistant-chat-error");
  }

  get errorDismiss(): Locator {
    return this.page.getByTestId("assistant-chat-error-dismiss");
  }
}

export class AssistantComposer {
  constructor(private readonly page: Page) {}

  get field(): Locator {
    return this.page.getByTestId("assistant-field");
  }

  get send(): Locator {
    return this.page.getByTestId("assistant-send");
  }

  get hint(): Locator {
    return this.page.getByTestId("assistant-composer-hint");
  }

  get edit(): Locator {
    return this.page.getByTestId("assistant-composer-edit");
  }

  get editLabel(): Locator {
    return this.page.getByTestId("assistant-composer-edit-label");
  }
}

export class AssistantReviewCard {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("assistant-review-card");
  }

  get title(): Locator {
    return this.page.getByTestId("assistant-review-title");
  }

  get errors(): Locator {
    return this.page.getByTestId("assistant-review-stat-error");
  }

  get warnings(): Locator {
    return this.page.getByTestId("assistant-review-stat-warning");
  }

  get infos(): Locator {
    return this.page.getByTestId("assistant-review-stat-info");
  }

  get progress(): Locator {
    return this.page.getByTestId("assistant-review-progress");
  }

  get findings(): Locator {
    return this.page.getByTestId("assistant-review-finding");
  }

  get dictionary(): Locator {
    return this.page.getByTestId("assistant-review-dict");
  }

  get applyAll(): Locator {
    return this.page.getByTestId("assistant-review-apply-all");
  }

  get rejectAll(): Locator {
    return this.page.getByTestId("assistant-review-reject-all");
  }

  get finished(): Locator {
    return this.page.getByTestId("assistant-review-finished");
  }

  finding(id: string): Locator {
    return this.page.locator(`[data-testid=assistant-review-finding][data-finding-id=${id}]`);
  }

  entry(id: string): Locator {
    return this.page.locator(`[data-testid=assistant-review-dict][data-dict-id=${id}]`);
  }

  severity(item: Locator): Locator {
    return item.getByTestId("assistant-review-finding-severity");
  }

  category(item: Locator): Locator {
    return item.getByTestId("assistant-review-finding-category");
  }

  ref(item: Locator): Locator {
    return item.getByTestId("assistant-review-finding-ref");
  }

  current(item: Locator): Locator {
    return item.getByTestId("assistant-review-finding-current");
  }

  suggested(item: Locator): Locator {
    return item.getByTestId("assistant-review-finding-suggested");
  }

  status(item: Locator): Locator {
    return item.getByTestId("assistant-review-finding-status");
  }

  apply(item: Locator): Locator {
    return item.getByTestId("assistant-review-finding-apply");
  }

  reject(item: Locator): Locator {
    return item.getByTestId("assistant-review-finding-reject");
  }

  entryStatus(item: Locator): Locator {
    return item.getByTestId("assistant-review-dict-status");
  }

  entryApply(item: Locator): Locator {
    return item.getByTestId("assistant-review-dict-apply");
  }

  entryReject(item: Locator): Locator {
    return item.getByTestId("assistant-review-dict-reject");
  }
}

export class AssistantChangesCard {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("assistant-changes-card");
  }

  get title(): Locator {
    return this.page.getByTestId("assistant-changes-title");
  }

  get valid(): Locator {
    return this.page.getByTestId("assistant-changes-valid");
  }

  get invalid(): Locator {
    return this.page.getByTestId("assistant-changes-invalid");
  }

  get invalidItems(): Locator {
    return this.page.getByTestId("assistant-changes-invalid-item");
  }

  get changes(): Locator {
    return this.page.getByTestId("assistant-change");
  }

  get status(): Locator {
    return this.page.getByTestId("assistant-changes-status");
  }

  get apply(): Locator {
    return this.page.getByTestId("assistant-changes-apply");
  }

  get reject(): Locator {
    return this.page.getByTestId("assistant-changes-reject");
  }

  change(op: string): Locator {
    return this.page.locator(`[data-testid=assistant-change][data-op=${op}]`);
  }

  opLabel(change: Locator): Locator {
    return change.getByTestId("assistant-change-op");
  }

  target(change: Locator): Locator {
    return change.getByTestId("assistant-change-target");
  }

  before(change: Locator): Locator {
    return change.getByTestId("assistant-change-before");
  }

  after(change: Locator): Locator {
    return change.getByTestId("assistant-change-after");
  }
}

export class AssistantPage {
  readonly start: AssistantStartView;
  readonly history: AssistantHistoryView;
  readonly chat: AssistantChatView;
  readonly composer: AssistantComposer;
  readonly review: AssistantReviewCard;
  readonly changes: AssistantChangesCard;

  constructor(private readonly page: Page) {
    this.start = new AssistantStartView(page);
    this.history = new AssistantHistoryView(page);
    this.chat = new AssistantChatView(page);
    this.composer = new AssistantComposer(page);
    this.review = new AssistantReviewCard(page);
    this.changes = new AssistantChangesCard(page);
  }

  get rail(): Locator {
    return this.page.getByTestId("railbar-assistant");
  }

  get root(): Locator {
    return this.page.getByTestId("assistant");
  }

  get askTranslationReview(): Locator {
    return this.page.getByTestId("novel-translation-result-review");
  }

  get askKnowledgeFixes(): Locator {
    return this.page.getByTestId("novel-knowledge-review-ask");
  }
}
