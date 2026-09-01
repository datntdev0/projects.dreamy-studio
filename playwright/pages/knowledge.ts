import type { Locator, Page } from '@playwright/test';

export type KnowledgeTab = 'graph' | 'list' | 'review';
export type AnalyzeMode = 'missing' | 'range' | 'all';

export const KNOWLEDGE_TABS: readonly KnowledgeTab[] = ['graph', 'list', 'review'];

const TAB_ROOTS: Readonly<Record<KnowledgeTab, string>> = {
  graph: 'novel-knowledge-graph',
  list: 'novel-knowledge-list',
  review: 'novel-knowledge-review',
};

export class KnowledgeAnalyzeDialog {
  constructor(private readonly page: Page) {}

  get panel(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-panel');
  }

  get tabs(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-tabs');
  }

  get pane(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-pane');
  }

  get ontologyPane(): Locator {
    return this.page.getByTestId('novel-knowledge-ontology-pane');
  }

  get lang(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-lang');
  }

  get provider(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-provider');
  }

  get settings(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-settings');
  }

  get modes(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-modes');
  }

  get from(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-from');
  }

  get to(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-to');
  }

  get overwrite(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-overwrite');
  }

  get overwriteField(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-overwrite-field');
  }

  get summary(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-summary');
  }

  get run(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-run');
  }

  get pipeline(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-pipeline');
  }

  get noSource(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-nosource');
  }

  get overwriteWarning(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-overwrite-warn');
  }

  get flow(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-flow');
  }

  get start(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-start');
  }

  get cancel(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-cancel');
  }

  mode(mode: AnalyzeMode): Locator {
    return this.page.locator(`[data-testid=novel-knowledge-analyze-mode][data-mode=${mode}]`);
  }
}

export class KnowledgePage {
  readonly analyzeDialog: KnowledgeAnalyzeDialog;

  constructor(private readonly page: Page) {
    this.analyzeDialog = new KnowledgeAnalyzeDialog(page);
  }

  get host(): Locator {
    return this.page.getByTestId('editor-knowledge-host');
  }

  get tab(): Locator {
    return this.page.getByTestId('editor-tab-knowledge');
  }

  get root(): Locator {
    return this.page.getByTestId('novel-knowledge');
  }

  get tabs(): Locator {
    return this.page.getByTestId('novel-knowledge-tab');
  }

  get reviewCount(): Locator {
    return this.page.getByTestId('novel-knowledge-review-count');
  }

  get lang(): Locator {
    return this.page.getByTestId('novel-knowledge-lang');
  }

  get analyze(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze');
  }

  get body(): Locator {
    return this.page.getByTestId('novel-knowledge-body');
  }

  get tabBody(): Locator {
    return this.page.getByTestId('novel-knowledge-tabbody');
  }

  get empty(): Locator {
    return this.page.getByTestId('novel-knowledge-empty');
  }

  get emptyAnalyze(): Locator {
    return this.page.getByTestId('novel-knowledge-empty-analyze');
  }

  get emptyChapters(): Locator {
    return this.page.getByTestId('novel-knowledge-empty-chapters');
  }

  get inspectorHost(): Locator {
    return this.page.getByTestId('inspector-knowledge-host');
  }

  get inspectorEmpty(): Locator {
    return this.page.getByTestId('novel-knowledge-inspector-empty');
  }

  get detail(): Locator {
    return this.page.getByTestId('novel-knowledge-detail');
  }

  get omniscient(): Locator {
    return this.page.getByTestId('novel-omniscient');
  }

  tabButton(tab: KnowledgeTab): Locator {
    return this.page.locator(`[data-testid=novel-knowledge-tab][data-tab=${tab}]`);
  }

  tabRoot(tab: KnowledgeTab): Locator {
    return this.page.getByTestId(TAB_ROOTS[tab]);
  }
}

export class ExtractionDialog {
  constructor(private readonly page: Page) {}

  get startButton(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-start').locator('button');
  }

  get langOptions(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-lang').locator('option');
  }

  get keep(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-summary').locator('dd').nth(2);
  }

  get words(): Locator {
    return this.page.getByTestId('novel-knowledge-analyze-summary').locator('dd').nth(3);
  }

  get providerDialog(): Locator {
    return this.page.getByTestId('settings-dialog-panel');
  }

  get providerPane(): Locator {
    return this.page.getByTestId('settings-pane-llm');
  }
}

export class ExtractionKnowledge {
  constructor(private readonly page: Page) {}

  get progress(): Locator {
    return this.page.getByTestId('novel-progress-frac');
  }

  get listRows(): Locator {
    return this.page.getByTestId('novel-knowledge-list-row');
  }

  get listCount(): Locator {
    return this.page.getByTestId('novel-knowledge-list-count');
  }

  get detailTitle(): Locator {
    return this.page.getByTestId('novel-knowledge-detail-title');
  }

  get detail(): Locator {
    return this.page.getByTestId('novel-knowledge-detail');
  }

  listRow(name: string): Locator {
    return this.listRows.filter({ hasText: name });
  }
}

export type GraphGroupKey =
  'character' | 'persona' | 'location' | 'organization' | 'artifact' | 'skill' | 'term' | 'event';

export class KnowledgeList {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId('novel-knowledge-list');
  }

  get search(): Locator {
    return this.page.getByTestId('novel-knowledge-list-search');
  }

  get type(): Locator {
    return this.page.getByTestId('novel-knowledge-list-type');
  }

  get chapter(): Locator {
    return this.page.getByTestId('novel-knowledge-list-chapter');
  }

  get onlyIssues(): Locator {
    return this.page.getByTestId('novel-knowledge-list-issues');
  }

  get count(): Locator {
    return this.page.getByTestId('novel-knowledge-list-count');
  }

  get rows(): Locator {
    return this.page.getByTestId('novel-knowledge-list-row');
  }

  get empty(): Locator {
    return this.page.getByTestId('novel-knowledge-list-empty');
  }

  get clear(): Locator {
    return this.page.getByTestId('novel-knowledge-list-clear');
  }

  get conflicts(): Locator {
    return this.page.getByTestId('novel-knowledge-list-conflict');
  }

  row(name: string, type?: string): Locator {
    const named = this.rows.filter({ has: exactText(this.page.locator('div.t-ink'), name) });
    return type === undefined ? named : named.filter({ has: this.typeTag(type) });
  }

  typeTag(label: string): Locator {
    return exactText(this.page.getByTestId('novel-knowledge-type'), label);
  }

  aliases(row: Locator): Locator {
    return row.getByTestId('novel-knowledge-list-aliases');
  }
}

export class KnowledgeGraphView {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId('novel-knowledge-graph');
  }

  get canvas(): Locator {
    return this.page.getByTestId('graph-canvas');
  }

  get search(): Locator {
    return this.page.getByTestId('graph-search');
  }

  get orphans(): Locator {
    return this.page.getByTestId('graph-orphans');
  }

  get legend(): Locator {
    return this.page.getByTestId('graph-legend');
  }

  get legendFlag(): Locator {
    return this.page.getByTestId('graph-legend-flag');
  }

  get empty(): Locator {
    return this.page.getByTestId('graph-empty');
  }

  group(key: GraphGroupKey): Locator {
    return this.page.getByTestId(`graph-group-${key}`);
  }
}

export class KnowledgeInspector {
  constructor(private readonly page: Page) {}

  get host(): Locator {
    return this.page.getByTestId('inspector-knowledge-host');
  }

  get empty(): Locator {
    return this.page.getByTestId('novel-knowledge-inspector-empty');
  }

  get detail(): Locator {
    return this.page.getByTestId('novel-knowledge-detail');
  }

  get title(): Locator {
    return this.page.getByTestId('novel-knowledge-detail-title');
  }

  get titles(): Locator {
    return this.page.getByTestId('novel-knowledge-detail-titles');
  }

  get aliases(): Locator {
    return this.page.getByTestId('novel-knowledge-detail-aliases');
  }

  get scalars(): Locator {
    return this.page.getByTestId('novel-knowledge-detail-scalars');
  }

  get relations(): Locator {
    return this.page.getByTestId('novel-knowledge-detail-relations');
  }

  get evidence(): Locator {
    return this.page.getByTestId('novel-knowledge-detail-evidence');
  }

  get quotes(): Locator {
    return this.evidence.locator('blockquote');
  }

  get references(): Locator {
    return this.evidence.locator('.kn-ref');
  }

  get type(): Locator {
    return this.detail.locator('.kd-head');
  }
}

export class KnowledgeReviewView {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId('novel-knowledge-review');
  }

  get issues(): Locator {
    return this.page.getByTestId('novel-knowledge-review-issue');
  }
}

export class OmniscientPanel {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId('novel-omniscient');
  }

  get empty(): Locator {
    return this.page.getByTestId('novel-omniscient-empty');
  }

  get main(): Locator {
    return this.root.locator('.om-main');
  }

  get mode(): Locator {
    return this.page.getByTestId('novel-omniscient-mode');
  }

  get controls(): Locator {
    return this.page.getByTestId('novel-omniscient-controls');
  }

  get select(): Locator {
    return this.page.getByTestId('novel-omniscient-select');
  }

  get position(): Locator {
    return this.page.getByTestId('novel-omniscient-position');
  }

  get next(): Locator {
    return this.page.getByTestId('novel-omniscient-next');
  }

  get prev(): Locator {
    return this.page.getByTestId('novel-omniscient-prev');
  }

  get ticks(): Locator {
    return this.page.getByTestId('novel-omniscient-tick');
  }

  modeButton(name: string): Locator {
    return this.mode.getByRole('button', { name, exact: true });
  }
}

export class KnowledgeBrowsing {
  readonly list: KnowledgeList;
  readonly graph: KnowledgeGraphView;
  readonly inspector: KnowledgeInspector;
  readonly review: KnowledgeReviewView;
  readonly omniscient: OmniscientPanel;

  constructor(page: Page) {
    this.list = new KnowledgeList(page);
    this.graph = new KnowledgeGraphView(page);
    this.inspector = new KnowledgeInspector(page);
    this.review = new KnowledgeReviewView(page);
    this.omniscient = new OmniscientPanel(page);
  }
}

function exactText(locator: Locator, text: string): Locator {
  return locator.and(locator.page().getByText(text, { exact: true }));
}

export type PreviewState = 'idle' | 'invalid' | 'clean' | 'warn' | 'open' | 'resolved';
export type CardState = 'same' | 'edited' | 'new' | 'deleted' | 'merged' | 'removed';

export class KnowledgeEditCard {
  constructor(readonly root: Locator) {}

  get toggle(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-toggle');
  }

  get select(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-select');
  }

  get remove(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-delete');
  }

  get restore(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-restore');
  }

  get form(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-entity-form');
  }

  get name(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-name');
  }

  get nameError(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-name-error');
  }

  get type(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-type');
  }

  get typeError(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-type-error');
  }

  get evidenceRequired(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-evidence-required');
  }

  get evidenceItems(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-evidence-item');
  }

  get evidenceChapter(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-evidence-chapter');
  }

  get evidenceP(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-evidence-p');
  }

  get evidenceQuote(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-evidence-quote');
  }

  get evidenceAdd(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-evidence-add');
  }

  list(field: 'titles' | 'aliases'): KnowledgeEditList {
    return new KnowledgeEditList(this.root.getByTestId(`novel-knowledge-edit-${field}`));
  }
}

export class KnowledgeEditList {
  constructor(readonly root: Locator) {}

  get chips(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-chip');
  }

  get input(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-list-input');
  }

  get add(): Locator {
    return this.root.getByTestId('novel-knowledge-edit-list-add');
  }

  chipRemove(value: string): Locator {
    return this.chips.filter({ hasText: value }).getByTestId('novel-knowledge-edit-chip-remove');
  }
}

export class KnowledgeEditingPage {
  constructor(private readonly page: Page) {}

  get panel(): Locator {
    return this.page.getByTestId('novel-knowledge-edit-panel');
  }

  get issue(): Locator {
    return this.page.getByTestId('novel-knowledge-edit-issue');
  }

  get addEntity(): Locator {
    return this.page.getByTestId('novel-knowledge-edit-add-entity');
  }

  get entityCards(): Locator {
    return this.page
      .getByTestId('novel-knowledge-edit-entities')
      .getByTestId('novel-knowledge-edit-card');
  }

  get factCards(): Locator {
    return this.page
      .getByTestId('novel-knowledge-edit-facts')
      .getByTestId('novel-knowledge-edit-card');
  }

  get selection(): Locator {
    return this.page.getByTestId('novel-knowledge-edit-selection');
  }

  get merge(): Locator {
    return this.page.getByTestId('novel-knowledge-edit-merge');
  }

  get mergeForm(): Locator {
    return this.page.getByTestId('novel-knowledge-edit-merge-form');
  }

  get mergeTarget(): Locator {
    return this.page.getByTestId('novel-knowledge-edit-merge-target');
  }

  get mergeApply(): Locator {
    return this.page.getByTestId('novel-knowledge-edit-merge-apply');
  }

  get changesToggle(): Locator {
    return this.page.getByTestId('novel-knowledge-edit-changes-toggle');
  }

  get changes(): Locator {
    return this.page.getByTestId('novel-knowledge-edit-change');
  }

  get preview(): Locator {
    return this.page.getByTestId('novel-knowledge-edit-preview');
  }

  get confirm(): Locator {
    return this.page.getByTestId('novel-knowledge-edit-confirm').getByRole('button');
  }

  get cancel(): Locator {
    return this.page.getByTestId('novel-knowledge-edit-cancel');
  }

  get listAdd(): Locator {
    return this.page.getByTestId('novel-knowledge-list-add');
  }

  get listCount(): Locator {
    return this.page.getByTestId('novel-knowledge-list-count');
  }

  get detailDelete(): Locator {
    return this.page.getByTestId('novel-knowledge-detail-delete');
  }

  get detailEvidence(): Locator {
    return this.page.getByTestId('novel-knowledge-detail-evidence');
  }

  get detailTitle(): Locator {
    return this.page.getByTestId('novel-knowledge-detail-title');
  }

  get removeMessage(): Locator {
    return this.page.getByTestId('dialog-host-panel').getByTestId('dialog-host-message');
  }

  entityCard(name: string): KnowledgeEditCard {
    return new KnowledgeEditCard(
      this.entityCards.filter({ has: exactText(this.page.locator('.ed-title'), name) }),
    );
  }

  entityCardAt(index: number): KnowledgeEditCard {
    return new KnowledgeEditCard(this.entityCards.nth(index));
  }

  factCard(text: string): KnowledgeEditCard {
    return new KnowledgeEditCard(
      this.factCards.filter({ has: exactText(this.page.locator('.ed-title'), text) }),
    );
  }

  listRow(name: string, type?: string): Locator {
    const rows = this.page.getByTestId('novel-knowledge-list-row').filter({ hasText: name });
    return type === undefined
      ? rows
      : rows.filter({
          has: this.page.locator(`[data-testid=novel-knowledge-type][data-type=${type}]`),
        });
  }

  reviewIssue(rule: string): Locator {
    return this.page.locator(`[data-testid=novel-knowledge-review-issue][data-rule=${rule}]`);
  }

  reviewEdit(rule: string): Locator {
    return this.reviewIssue(rule).getByRole('button', { name: 'Edit…', exact: true });
  }
}

export class KnowledgeReviewCard {
  constructor(private readonly card: Locator) {}

  get root(): Locator {
    return this.card;
  }

  get message(): Locator {
    return this.card.getByTestId('novel-knowledge-review-message');
  }

  get chips(): Locator {
    return this.card.getByTestId('novel-knowledge-review-chip');
  }

  get merge(): Locator {
    return this.card.getByTestId('novel-knowledge-review-merge');
  }

  get move(): Locator {
    return this.card.getByTestId('novel-knowledge-review-move');
  }

  get create(): Locator {
    return this.card.getByTestId('novel-knowledge-review-create');
  }

  get keep(): Locator {
    return this.card.getByTestId('novel-knowledge-review-stale-keep');
  }

  get reanalyze(): Locator {
    return this.card.getByTestId('novel-knowledge-review-reanalyze');
  }

  get edit(): Locator {
    return this.card.getByTestId('novel-knowledge-review-edit');
  }

  get remove(): Locator {
    return this.card.getByRole('button', { name: 'Delete', exact: true });
  }

  get buttons(): Locator {
    return this.card.getByRole('button');
  }
}

export class KnowledgeReviewPage {
  constructor(private readonly page: Page) {}

  get rule(): Locator {
    return this.page.getByTestId('novel-knowledge-review-rule');
  }

  get ruleOptions(): Locator {
    return this.rule.locator('option');
  }

  get count(): Locator {
    return this.page.getByTestId('novel-knowledge-review-count');
  }

  get issues(): Locator {
    return this.page.getByTestId('novel-knowledge-review-issue');
  }

  get empty(): Locator {
    return this.page.getByTestId('novel-knowledge-review-empty');
  }

  get emptyTitle(): Locator {
    return this.empty.locator('h4');
  }

  get hint(): Locator {
    return this.page.getByTestId('novel-knowledge-review-sub');
  }

  issuesOf(rule: string): Locator {
    return this.page.locator(`[data-testid=novel-knowledge-review-issue][data-rule=${rule}]`);
  }

  card(rule: string, index = 0): KnowledgeReviewCard {
    return new KnowledgeReviewCard(this.issuesOf(rule).nth(index));
  }
}
