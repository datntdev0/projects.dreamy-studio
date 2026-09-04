import type { Locator, Page } from '@playwright/test';

export class VoiceRow {
  constructor(readonly root: Locator) {}

  get name(): Locator {
    return this.root.getByTestId('library-voices-table-name-text');
  }

  get description(): Locator {
    return this.root.getByTestId('library-voices-table-description');
  }

  get play(): Locator {
    return this.root.getByTestId('library-voice-play-button');
  }

  get engine(): Locator {
    return this.root.getByTestId('library-voices-table-engine');
  }

  get language(): Locator {
    return this.root.getByTestId('library-voices-table-language');
  }

  get gender(): Locator {
    return this.root.getByTestId('library-voices-table-gender');
  }

  get source(): Locator {
    return this.root.getByTestId('library-voices-table-source');
  }

  get duration(): Locator {
    return this.root.getByTestId('library-voices-table-duration');
  }

  get updated(): Locator {
    return this.root.getByTestId('library-voices-table-updated');
  }
}

export class VoiceList {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId('library-voices');
  }

  get search(): Locator {
    return this.root.getByTestId('library-voices-search');
  }

  get filter(): Locator {
    return this.root.getByTestId('library-voices-filter');
  }

  get sort(): Locator {
    return this.root.getByTestId('library-voices-sort');
  }

  get count(): Locator {
    return this.root.getByTestId('library-voices-count');
  }

  get create(): Locator {
    return this.root.getByTestId('library-voices-create');
  }

  get notice(): Locator {
    return this.root.getByTestId('library-voices-notice');
  }

  get empty(): Locator {
    return this.root.getByTestId('library-voices-empty');
  }

  get emptyCreate(): Locator {
    return this.root.getByTestId('library-voices-empty-create');
  }

  get emptyFiltered(): Locator {
    return this.root.getByTestId('library-voices-empty-filtered');
  }

  get clearFilters(): Locator {
    return this.root.getByTestId('library-voices-empty-filtered-clear');
  }

  get table(): Locator {
    return this.root.getByTestId('library-voices-table');
  }

  get rows(): Locator {
    return this.table.getByTestId('library-voices-table-row');
  }

  get names(): Locator {
    return this.rows.getByTestId('library-voices-table-name-text');
  }

  row(name: string): VoiceRow {
    return new VoiceRow(this.rows.filter({ has: this.page.getByText(name, { exact: true }) }));
  }

  sortOption(key: 'new' | 'name'): Locator {
    return this.root.getByTestId(`library-voices-sort-${key}`);
  }
}

export class VoiceDialog {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId('library-voice-dialog-panel');
  }

  get notice(): Locator {
    return this.root.getByTestId('library-voice-dialog-notice');
  }

  get name(): Locator {
    return this.root.getByTestId('library-voice-dialog-name');
  }

  get engine(): Locator {
    return this.root.getByTestId('library-voice-dialog-engine');
  }

  get source(): Locator {
    return this.root.getByTestId('library-voice-dialog-source');
  }

  get preset(): Locator {
    return this.root.getByTestId('library-voice-dialog-preset');
  }

  get presetOptions(): Locator {
    return this.root.getByTestId('library-voice-dialog-preset-option');
  }

  get reference(): Locator {
    return this.root.getByTestId('library-voice-dialog-reference');
  }

  get sound(): Locator {
    return this.root.getByTestId('library-voice-dialog-sound');
  }

  get chooseFile(): Locator {
    return this.root.getByTestId('library-voice-dialog-file-choose');
  }

  get fileName(): Locator {
    return this.root.getByTestId('library-voice-dialog-file-name');
  }

  get consent(): Locator {
    return this.root.getByTestId('library-voice-dialog-consent');
  }

  get prompt(): Locator {
    return this.root.getByTestId('library-voice-dialog-prompt');
  }

  get promptHint(): Locator {
    return this.root.getByTestId('library-voice-dialog-prompt-hint');
  }

  get language(): Locator {
    return this.root.getByTestId('library-voice-dialog-language');
  }

  get gender(): Locator {
    return this.root.getByTestId('library-voice-dialog-gender');
  }

  get description(): Locator {
    return this.root.getByTestId('library-voice-dialog-description');
  }

  get submit(): Locator {
    return this.root.getByTestId('library-voice-dialog-submit').locator('button');
  }

  get cancel(): Locator {
    return this.root.getByTestId('library-voice-dialog-cancel');
  }

  sourceOption(label: string): Locator {
    return this.source.getByRole('button', { name: label, exact: true });
  }

  referenceOption(label: string): Locator {
    return this.reference.getByRole('button', { name: label, exact: true });
  }

  genderOption(label: string): Locator {
    return this.gender.getByRole('button', { name: label, exact: true });
  }
}

export class VoicePanel {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId('inspector-voice-panel');
  }

  get empty(): Locator {
    return this.root.getByTestId('library-voice-panel-empty');
  }

  get name(): Locator {
    return this.root.getByTestId('library-voice-panel-name');
  }

  get warning(): Locator {
    return this.root.getByTestId('library-voice-panel-warning');
  }

  get openSettings(): Locator {
    return this.root.getByTestId('library-voice-panel-warning-settings');
  }

  get sampleText(): Locator {
    return this.root.getByTestId('library-voice-panel-sample-text');
  }

  get play(): Locator {
    return this.root
      .getByTestId('library-voice-panel-play')
      .getByTestId('library-voice-play-button');
  }

  get duration(): Locator {
    return this.root.getByTestId('library-voice-panel-duration');
  }

  get description(): Locator {
    return this.root.getByTestId('library-voice-panel-description');
  }

  get engine(): Locator {
    return this.root.getByTestId('library-voice-panel-engine-name');
  }

  get sourceName(): Locator {
    return this.root.getByTestId('library-voice-panel-source-name');
  }

  get sourceDetail(): Locator {
    return this.root.getByTestId('library-voice-panel-source-detail');
  }

  get language(): Locator {
    return this.root.getByTestId('library-voice-panel-language');
  }

  get gender(): Locator {
    return this.root.getByTestId('library-voice-panel-gender');
  }

  get immutableHint(): Locator {
    return this.root.getByTestId('library-voice-panel-immutable-hint');
  }

  get duplicate(): Locator {
    return this.root.getByTestId('library-voice-panel-duplicate');
  }

  get remove(): Locator {
    return this.root.getByTestId('library-voice-panel-delete');
  }
}
