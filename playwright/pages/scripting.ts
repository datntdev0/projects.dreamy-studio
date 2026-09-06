import type { Locator, Page } from '@playwright/test';

export type ScriptPresetId = 'audiobook' | 'film';

export type BlockTool = 'up' | 'down' | 'duplicate' | 'remove';

export function unitKey(position: number): string {
  return `U${String(position).padStart(2, '0')}`;
}

export class ScriptBlock {
  constructor(readonly root: Locator) {}

  get type(): Locator {
    return this.root.getByTestId(/^sc-type-btn-/);
  }

  get hint(): Locator {
    return this.root.getByTestId('scripting-block-hint');
  }

  get text(): Locator {
    return this.root.getByTestId(/^sc-text-/);
  }

  get who(): Locator {
    return this.root.getByTestId(/^sc-who-btn-/);
  }

  get tone(): Locator {
    return this.root.getByTestId(/^sc-paren-/);
  }

  get pause(): Locator {
    return this.root.getByTestId(/^sc-pause-input-/);
  }

  get up(): Locator {
    return this.root.getByTestId(/^sc-up-/);
  }

  get down(): Locator {
    return this.root.getByTestId(/^sc-down-/);
  }

  get duplicate(): Locator {
    return this.root.getByTestId(/^sc-dup-/);
  }

  get remove(): Locator {
    return this.root.getByTestId(/^sc-del-/);
  }

  async use(tool: BlockTool): Promise<void> {
    await this.root.hover();
    await this[tool].click();
  }
}

export class CastRow {
  constructor(readonly root: Locator) {}

  get dot(): Locator {
    return this.root.locator('.sc-dot');
  }

  get name(): Locator {
    return this.root.getByTestId(/^sc-cast-name-/);
  }

  get remove(): Locator {
    return this.root.getByTestId(/^sc-cast-del-/);
  }

  get kb(): Locator {
    return this.root.getByTestId('scripting-inspector-cast-kb');
  }

  get narrator(): Locator {
    return this.root.getByTestId('scripting-inspector-cast-narrator');
  }

  get used(): Locator {
    return this.root.getByTestId('scripting-inspector-cast-used');
  }
}

export class ScriptCast {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId('sc-ins-cast');
  }

  get heading(): Locator {
    return this.root.locator('.eyebrow').first();
  }

  get list(): Locator {
    return this.page.getByTestId('scripting-inspector-cast-list');
  }

  get rows(): Locator {
    return this.list.getByTestId(/^sc-cast-(?!name-|del-)/);
  }

  get names(): Locator {
    return this.list.getByTestId(/^sc-cast-name-/);
  }

  get newName(): Locator {
    return this.page.getByTestId('sc-cast-new-input');
  }

  get add(): Locator {
    return this.page.getByTestId('sc-cast-add-btn');
  }

  get hint(): Locator {
    return this.page.getByTestId('scripting-inspector-cast-hint');
  }

  row(id: string): CastRow {
    return new CastRow(this.page.getByTestId(`sc-cast-${id}`));
  }

  rowAt(index: number): CastRow {
    return new CastRow(this.rows.nth(index));
  }
}

export class ScriptResetDialog {
  constructor(private readonly page: Page) {}

  get panel(): Locator {
    return this.page.getByTestId('sc-reset-modal');
  }

  get intro(): Locator {
    return this.page.getByTestId('scripting-reset-intro');
  }

  get unitScope(): Locator {
    return this.page.getByTestId('sc-reset-scope-input-unit');
  }

  get allScope(): Locator {
    return this.page.getByTestId('sc-reset-scope-input-all');
  }

  get unitLabel(): Locator {
    return this.page.getByTestId('sc-reset-scope-unit');
  }

  get allLabel(): Locator {
    return this.page.getByTestId('sc-reset-scope-all');
  }

  get warning(): Locator {
    return this.page.getByTestId('scripting-reset-banner');
  }

  get cancel(): Locator {
    return this.page.getByTestId('sc-reset-cancel-btn');
  }

  get confirm(): Locator {
    return this.page.getByTestId('sc-reset-go-btn');
  }
}

export class ScriptingPage {
  readonly cast: ScriptCast;
  readonly reset: ScriptResetDialog;

  constructor(private readonly page: Page) {
    this.cast = new ScriptCast(page);
    this.reset = new ScriptResetDialog(page);
  }

  get root(): Locator {
    return this.page.getByTestId('sc-root');
  }

  get back(): Locator {
    return this.page.getByTestId('sc-back-btn');
  }

  get title(): Locator {
    return this.page.getByTestId('scripting-title');
  }

  get preset(): Locator {
    return this.page.getByTestId('sc-preset-badge');
  }

  get picker(): Locator {
    return this.page.getByTestId('sc-pick');
  }

  get presets(): Locator {
    return this.page.getByTestId(/^sc-pick-(audiobook|film)$/);
  }

  get rail(): Locator {
    return this.page.getByTestId('sc-rail');
  }

  get railCount(): Locator {
    return this.page.getByTestId('sc-rail-count');
  }

  get railProgress(): Locator {
    return this.page.getByTestId('scripting-rail-progress').locator('i');
  }

  get railResizer(): Locator {
    return this.rail.getByTestId('resizer');
  }

  get units(): Locator {
    return this.page.getByTestId('sc-units').getByRole('treeitem');
  }

  get unitNumber(): Locator {
    return this.page.getByTestId('scripting-subbar-number');
  }

  get unitTitle(): Locator {
    return this.page.getByTestId('sc-unit-title');
  }

  get subbar(): Locator {
    return this.page.getByTestId('sc-sub');
  }

  get resetButton(): Locator {
    return this.page.getByTestId('sc-reset-btn');
  }

  get addButton(): Locator {
    return this.page.getByTestId('sc-add-btn');
  }

  get empty(): Locator {
    return this.page.getByTestId('scripting-empty');
  }

  get generate(): Locator {
    return this.page.getByTestId('sc-empty-default-btn');
  }

  get start(): Locator {
    return this.page.getByTestId('sc-empty-start-btn');
  }

  get sheet(): Locator {
    return this.page.getByTestId('sc-page');
  }

  get sheetTitle(): Locator {
    return this.page.getByTestId('sc-page-title').locator('h2');
  }

  get blank(): Locator {
    return this.page.getByTestId('scripting-page-empty');
  }

  get blocks(): Locator {
    return this.sheet.getByTestId(/^sc-blk-/);
  }

  get texts(): Locator {
    return this.sheet.getByTestId(/^sc-text-/);
  }

  get types(): Locator {
    return this.sheet.getByTestId(/^sc-type-btn-/);
  }

  get menu(): Locator {
    return this.page.getByTestId('scripting-menu');
  }

  get menuItems(): Locator {
    return this.menu.getByTestId('scripting-menu-item');
  }

  get inspectorTab(): Locator {
    return this.page.locator('[data-testid=inspector-tab][data-tab=inspector]');
  }

  presetOption(id: ScriptPresetId): Locator {
    return this.page.getByTestId(`sc-pick-${id}`);
  }

  unit(position: number): Locator {
    return this.page.getByTestId(`sc-unit-${unitKey(position)}`);
  }

  block(index: number): ScriptBlock {
    return new ScriptBlock(this.blocks.nth(index));
  }

  menuItem(label: string): Locator {
    return this.menuItems.filter({ hasText: label });
  }
}
