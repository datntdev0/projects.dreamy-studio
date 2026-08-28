import type { Locator, Page } from "@playwright/test";

export type TranslationStep = "dict" | "guide" | "trans" | "result" | "warn";

export const TRANSLATION_STEPS: readonly TranslationStep[] = ["dict", "guide", "trans", "result", "warn"];

const STEP_ROOTS: Readonly<Record<TranslationStep, string>> = {
  dict: "novel-translation-dict",
  guide: "novel-translation-guide",
  trans: "novel-translation-pipeline",
  result: "novel-translation-result",
  warn: "novel-translation-warn",
};

export class TranslationPage {
  constructor(private readonly page: Page) {}

  get host(): Locator {
    return this.page.getByTestId("editor-translation-host");
  }

  get tab(): Locator {
    return this.page.getByTestId("editor-tab-translation");
  }

  get root(): Locator {
    return this.page.getByTestId("novel-translation");
  }

  get bar(): Locator {
    return this.page.getByTestId("novel-translation-bar");
  }

  get title(): Locator {
    return this.page.getByTestId("novel-translation-title");
  }

  get target(): Locator {
    return this.page.getByTestId("novel-translation-target");
  }

  get targetOptions(): Locator {
    return this.target.locator("option");
  }

  get flow(): Locator {
    return this.page.getByTestId("novel-translation-flow");
  }

  get steps(): Locator {
    return this.page.getByTestId("novel-translation-step");
  }

  get body(): Locator {
    return this.page.getByTestId("novel-translation-body");
  }

  get empty(): Locator {
    return this.page.getByTestId("novel-translation-empty");
  }

  get emptyTitle(): Locator {
    return this.page.getByTestId("novel-translation-empty-title");
  }

  get foot(): Locator {
    return this.page.getByTestId("novel-translation-foot");
  }

  get prev(): Locator {
    return this.page.getByTestId("novel-translation-prev");
  }

  get next(): Locator {
    return this.page.getByTestId("novel-translation-next");
  }

  get hint(): Locator {
    return this.page.getByTestId("novel-translation-hint");
  }

  step(step: TranslationStep): Locator {
    return this.page.locator(`[data-testid=novel-translation-step][data-step=${step}]`);
  }

  stepSummary(step: TranslationStep): Locator {
    return this.step(step).locator("small");
  }

  stepRoot(step: TranslationStep): Locator {
    return this.page.getByTestId(STEP_ROOTS[step]);
  }
}

export class TranslationWorkspacePage {
  constructor(private readonly page: Page) {}

  get picks(): Locator {
    return this.page.getByTestId("novel-translation-pipeline-pick");
  }

  get checkedPicks(): Locator {
    return this.page.locator("[data-testid=novel-translation-pipeline-pick]:checked");
  }

  get rows(): Locator {
    return this.page.getByTestId("novel-translation-pipeline-row");
  }
}

export const DICTIONARY_COLUMNS = { src: 0, dst: 1, type: 2, note: 3 } as const;

export type DictionaryColumn = keyof typeof DICTIONARY_COLUMNS;

function exactText(text: string): RegExp {
  return new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
}

export class TranslationDictionaryPage {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("novel-translation-dict");
  }

  get search(): Locator {
    return this.page.getByTestId("novel-translation-dict-search");
  }

  get count(): Locator {
    return this.page.getByTestId("novel-translation-dict-count");
  }

  get create(): Locator {
    return this.page.getByTestId("novel-translation-dict-new");
  }

  get rows(): Locator {
    return this.page.getByTestId("novel-translation-dict-row");
  }

  get empty(): Locator {
    return this.page.getByTestId("novel-translation-dict-empty");
  }

  get emptyTitle(): Locator {
    return this.empty.locator("h4");
  }

  get emptyHint(): Locator {
    return this.empty.locator("p");
  }

  get draftSrc(): Locator {
    return this.page.getByTestId("novel-translation-dict-draft-src");
  }

  get draftDst(): Locator {
    return this.page.getByTestId("novel-translation-dict-draft-dst");
  }

  get draftType(): Locator {
    return this.page.getByTestId("novel-translation-dict-draft-type");
  }

  get draftNote(): Locator {
    return this.page.getByTestId("novel-translation-dict-draft-note");
  }

  get add(): Locator {
    return this.page.getByTestId("novel-translation-dict-add");
  }

  get cancel(): Locator {
    return this.page.getByTestId("novel-translation-dict-cancel");
  }

  get cellInput(): Locator {
    return this.page.getByTestId("datatable-cell-input");
  }

  row(src: string): Locator {
    return this.rows.filter({ has: this.page.locator("td").first().filter({ hasText: exactText(src) }) });
  }

  cell(row: Locator, column: DictionaryColumn): Locator {
    return row.locator("td").nth(DICTIONARY_COLUMNS[column]);
  }

  menu(row: Locator): Locator {
    return row.getByTestId("datatable-row-menu");
  }

  get deleteAction(): Locator {
    return this.page.locator("[data-testid=datatable-menu-item][data-action=delete]");
  }
}

export class GuidelinesPage {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("novel-translation-guide");
  }

  get title(): Locator {
    return this.page.getByTestId("novel-translation-guide-title");
  }

  get prompt(): Locator {
    return this.page.getByTestId("novel-translation-guide-prompt");
  }

  get save(): Locator {
    return this.page.getByTestId("novel-translation-guide-save");
  }
}

export class ChapterTableRow {
  constructor(private readonly root: Locator) {}

  get number(): Locator {
    return this.root.locator("td").nth(1);
  }

  get title(): Locator {
    return this.root.locator("td").nth(2);
  }

  get words(): Locator {
    return this.root.locator("td").nth(3);
  }

  get status(): Locator {
    return this.root.getByTestId("novel-translation-pipeline-status");
  }

  get pick(): Locator {
    return this.root.getByTestId("novel-translation-pipeline-pick");
  }
}

export class TranslationRunPage {
  constructor(private readonly page: Page) {}

  get search(): Locator {
    return this.page.getByTestId("novel-translation-pipeline-search");
  }

  get filter(): Locator {
    return this.page.getByTestId("novel-translation-pipeline-filter");
  }

  get count(): Locator {
    return this.page.getByTestId("novel-translation-pipeline-count");
  }

  get start(): Locator {
    return this.page.getByTestId("novel-translation-pipeline-start");
  }

  get cancel(): Locator {
    return this.page.getByTestId("novel-translation-pipeline-cancel");
  }

  get rows(): Locator {
    return this.page.getByTestId("novel-translation-pipeline-row");
  }

  get jump(): Locator {
    return this.page.getByTestId("novel-translation-result-jump");
  }

  get pairs(): Locator {
    return this.page.getByTestId("novel-translation-result-pair");
  }

  get texts(): Locator {
    return this.page.getByTestId("novel-translation-result-text");
  }

  get notes(): Locator {
    return this.page.getByTestId("novel-translation-result-note");
  }

  rowOf(title: string): ChapterTableRow {
    return new ChapterTableRow(this.rows.filter({ has: this.page.locator("td", { hasText: title }) }));
  }

  rowAt(index: number): ChapterTableRow {
    return new ChapterTableRow(this.rows.nth(index));
  }
}

export class TranslationReviewPage {
  constructor(private readonly page: Page) {}

  get prev(): Locator {
    return this.page.getByTestId("novel-translation-result-prev");
  }

  get next(): Locator {
    return this.page.getByTestId("novel-translation-result-next");
  }

  get jump(): Locator {
    return this.page.getByTestId("novel-translation-result-jump");
  }

  get only(): Locator {
    return this.page.getByTestId("novel-translation-result-only");
  }

  get pairs(): Locator {
    return this.page.getByTestId("novel-translation-result-pair");
  }

  get none(): Locator {
    return this.page.getByTestId("novel-translation-result-none");
  }

  get noneTitle(): Locator {
    return this.none.locator("h4");
  }

  get translateThis(): Locator {
    return this.page.getByTestId("novel-translation-result-translate");
  }

  get empty(): Locator {
    return this.page.getByTestId("novel-translation-result-empty");
  }

  get textarea(): Locator {
    return this.page.getByTestId("novel-translation-result-textarea");
  }

  get noteInput(): Locator {
    return this.page.getByTestId("novel-translation-result-note-input");
  }

  pair(n: number): Locator {
    return this.pairs.nth(n - 1);
  }

  source(n: number): Locator {
    return this.pair(n).locator(".tl-src");
  }

  text(n: number): Locator {
    return this.pair(n).getByTestId("novel-translation-result-text");
  }

  save(n: number): Locator {
    return this.pair(n).getByTestId("novel-translation-result-save");
  }

  warnings(n: number): Locator {
    return this.pair(n).getByTestId("novel-translation-result-warning");
  }

  state(n: number): Locator {
    return this.pair(n).getByTestId("novel-translation-result-state");
  }

  note(n: number): Locator {
    return this.pair(n).getByTestId("novel-translation-result-note");
  }

  noteOpen(n: number): Locator {
    return this.pair(n).getByTestId("novel-translation-result-note-open");
  }

  noteSave(n: number): Locator {
    return this.pair(n).getByTestId("novel-translation-result-note-save");
  }
}

export type WarningFilterKind = "all" | "dict";

export function passageLabel(seq: number, n: number): string {
  return `Ch.${seq} ¶${n}`;
}

export class TranslationWarningsView {
  constructor(private readonly page: Page) {}

  get list(): Locator {
    return this.page.getByTestId("novel-translation-warn");
  }

  get cards(): Locator {
    return this.page.getByTestId("novel-translation-warn-card");
  }

  get empty(): Locator {
    return this.page.getByTestId("novel-translation-warn-empty");
  }

  filter(kind: WarningFilterKind): Locator {
    return this.page.getByTestId(`novel-translation-warn-filter-${kind}`);
  }

  card(seq: number, n: number): Locator {
    return this.cards.filter({ hasText: passageLabel(seq, n) });
  }

  badge(seq: number, n: number): Locator {
    return this.card(seq, n).locator(".badge");
  }

  reason(seq: number, n: number): Locator {
    return this.card(seq, n).locator("p");
  }

  passageChip(seq: number, n: number): Locator {
    return this.card(seq, n).getByTestId("novel-translation-warn-passage");
  }

  view(seq: number, n: number): Locator {
    return this.card(seq, n).getByTestId("novel-translation-warn-view");
  }

  openDictionary(seq: number, n: number): Locator {
    return this.card(seq, n).getByTestId("novel-translation-warn-dict");
  }

  get dictNew(): Locator {
    return this.page.getByTestId("novel-translation-dict-new");
  }

  get dictSource(): Locator {
    return this.page.getByTestId("novel-translation-dict-draft-src");
  }

  get dictTranslation(): Locator {
    return this.page.getByTestId("novel-translation-dict-draft-dst");
  }

  get dictAdd(): Locator {
    return this.page.getByTestId("novel-translation-dict-add");
  }

  get dictRows(): Locator {
    return this.page.getByTestId("novel-translation-dict-row");
  }

  get rowMenu(): Locator {
    return this.page.getByTestId("datatable-row-menu");
  }

  get deleteAction(): Locator {
    return this.page.locator("[data-testid=datatable-menu-item][data-action=delete]");
  }

  get resultJump(): Locator {
    return this.page.getByTestId("novel-translation-result-jump");
  }

  get resultPairs(): Locator {
    return this.page.getByTestId("novel-translation-result-pair");
  }

  resultPair(n: number): Locator {
    return this.resultPairs.nth(n - 1);
  }

  resultText(n: number): Locator {
    return this.resultPair(n).getByTestId("novel-translation-result-text");
  }

  get resultEditor(): Locator {
    return this.page.getByTestId("novel-translation-result-textarea");
  }

  get resultSave(): Locator {
    return this.page.getByTestId("novel-translation-result-save");
  }
}
