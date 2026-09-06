import type { Locator, Page } from '@playwright/test';

import { unitKey } from './scripting.ts';

export type AudiobookMode = 'prod' | 'voices';
export type MixField = 'gap' | 'intro' | 'outro' | 'vol' | 'sentence';
export type BannerKind = 'who' | 'voice' | 'engine' | 'changed';
export type StaleReason = 'text' | 'speaker' | 'voice' | 'speed' | 'tone';

export class AudioSegment {
  constructor(readonly root: Locator) {}

  get play(): Locator {
    return this.root.getByTestId(/^ab-play-/);
  }

  get number(): Locator {
    return this.root.locator('.ab-n');
  }

  get type(): Locator {
    return this.root.locator('.type-tag');
  }

  get speaker(): Locator {
    return this.root.getByTestId('audiobook-segment-speaker');
  }

  get voice(): Locator {
    return this.root.getByTestId('audiobook-segment-voice');
  }

  get tone(): Locator {
    return this.root.getByTestId('audiobook-segment-paren');
  }

  get text(): Locator {
    return this.root.getByTestId('audiobook-segment-text');
  }

  get flagNote(): Locator {
    return this.root.getByTestId('audiobook-segment-flag');
  }

  get reasons(): Locator {
    return this.root.getByTestId(/^audiobook-segment-reason-/);
  }

  get duration(): Locator {
    return this.root.getByTestId('audiobook-segment-duration');
  }

  get state(): Locator {
    return this.root.getByTestId(/^audiobook-segment-state-/);
  }

  get regenerate(): Locator {
    return this.root.getByTestId(/^ab-regen-/);
  }

  get flag(): Locator {
    return this.root.getByTestId(/^ab-flag-/);
  }

  get edit(): Locator {
    return this.root.getByTestId(/^ab-edit-/);
  }

  reason(kind: StaleReason): Locator {
    return this.root.getByTestId(`audiobook-segment-reason-${kind}`);
  }
}

export class SpeakerRow {
  constructor(readonly root: Locator) {}

  get name(): Locator {
    return this.root.getByTestId(/^ab-spk-name-/);
  }

  get voice(): Locator {
    return this.root.getByTestId(/^ab-spk-voice-/);
  }

  get groups(): Locator {
    return this.voice.locator('optgroup');
  }

  get speed(): Locator {
    return this.root.getByTestId(/^ab-spk-speed-/);
  }

  get uses(): Locator {
    return this.root.getByTestId('audiobook-voices-uses');
  }

  get status(): Locator {
    return this.root.getByTestId('audiobook-voices-status');
  }

  get statusBadge(): Locator {
    return this.status.locator('.badge');
  }

  get preview(): Locator {
    return this.root.getByTestId(/^ab-spk-preview-/);
  }

  get remove(): Locator {
    return this.root.getByTestId(/^ab-spk-del-/);
  }

  option(label: string): Locator {
    return this.voice.locator('option').filter({ hasText: label });
  }
}

export class AudiobookVoices {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId('ab-voices');
  }

  get table(): Locator {
    return this.page.getByTestId('ab-spk-table');
  }

  get body(): Locator {
    return this.page.getByTestId('audiobook-voices-body');
  }

  get names(): Locator {
    return this.body.getByTestId(/^ab-spk-name-/);
  }

  get newName(): Locator {
    return this.page.getByTestId('ab-spk-new-input');
  }

  get add(): Locator {
    return this.page.getByTestId('ab-spk-add-btn');
  }

  get lost(): Locator {
    return this.page.getByTestId('ab-lost-ban');
  }

  get lostText(): Locator {
    return this.page.getByTestId('audiobook-voices-lost');
  }

  get lostGo(): Locator {
    return this.page.getByTestId('ab-lost-go-btn');
  }

  row(speakerId: string): SpeakerRow {
    return new SpeakerRow(this.page.getByTestId(`ab-spk-${speakerId}`));
  }
}

export class AudiobookChapterPanel {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId('audiobook-inspector-chapter');
  }

  get details(): Locator {
    return this.page.getByTestId('audiobook-inspector-chapter-details');
  }

  get assembly(): Locator {
    return this.page.getByTestId('ab-ins-mix');
  }

  get blockers(): Locator {
    return this.page.getByTestId('audiobook-inspector-chapter-blocker');
  }

  mix(field: MixField): Locator {
    return this.page.getByTestId(`ab-mix-${field}`);
  }
}

export class AudiobookEnginePanel {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId('audiobook-inspector-voices');
  }

  get local(): Locator {
    return this.page.getByTestId('audiobook-inspector-voices-local');
  }

  get cloud(): Locator {
    return this.page.getByTestId('audiobook-inspector-voices-cloud');
  }

  get localTts(): Locator {
    return this.page.getByTestId('ab-ins-tts-btn');
  }

  get cloudSpeech(): Locator {
    return this.page.getByTestId('ab-ins-speech-btn');
  }

  get library(): Locator {
    return this.page.getByTestId('ab-ins-library-btn');
  }
}

export class AudiobookPlayer {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId('ab-player');
  }

  get toggle(): Locator {
    return this.page.getByTestId('ab-pl-toggle');
  }

  get title(): Locator {
    return this.page.getByTestId('ab-pl-title');
  }

  get progress(): Locator {
    return this.page.getByTestId('audiobook-player-progress').locator('i');
  }

  get time(): Locator {
    return this.page.getByTestId('audiobook-player-time');
  }

  get stop(): Locator {
    return this.page.getByTestId('ab-pl-stop');
  }
}

export class AudiobookGenerateDialog {
  constructor(private readonly page: Page) {}

  get panel(): Locator {
    return this.page.getByTestId('ab-gen-modal');
  }

  get intro(): Locator {
    return this.page.getByTestId('audiobook-generate-intro');
  }

  get groups(): Locator {
    return this.page.getByTestId('ab-gen-groups').getByTestId(/^ab-gen-group-/);
  }

  get estimate(): Locator {
    return this.page.getByTestId('audiobook-generate-estimate-text');
  }

  get cancel(): Locator {
    return this.page.getByTestId('ab-gen-cancel-btn');
  }

  get go(): Locator {
    return this.page.getByTestId('ab-gen-go-btn').getByRole('button');
  }

  get chapters(): Locator {
    return this.page.getByTestId('ab-gen-chapters').getByTestId(/^ab-gen-ch-check-/);
  }

  get selectAll(): Locator {
    return this.page.getByTestId('ab-gen-all');
  }

  get exportAfter(): Locator {
    return this.page.getByTestId('ab-gen-export');
  }

  get nothing(): Locator {
    return this.page.getByTestId('ab-gen-nothing');
  }

  get overwrite(): Locator {
    return this.page.getByTestId('ab-gen-overwrite');
  }

  get overwriteWarning(): Locator {
    return this.page.getByTestId('ab-gen-overwrite-warn');
  }

  group(key: string): Locator {
    return this.page.getByTestId(`ab-gen-group-${key}`);
  }

  chapter(unitId: string): Locator {
    return this.page.getByTestId(`ab-gen-ch-check-${unitId}`);
  }

  chapterStatus(unitId: string): Locator {
    return this.page.getByTestId(`ab-gen-ch-status-${unitId}`);
  }
}

export class AudiobookFlagDialog {
  constructor(private readonly page: Page) {}

  get panel(): Locator {
    return this.page.getByTestId('ab-flag-modal');
  }

  get note(): Locator {
    return this.page.getByTestId('ab-flag-note');
  }

  get cancel(): Locator {
    return this.page.getByTestId('ab-flag-cancel-btn');
  }

  get save(): Locator {
    return this.page.getByTestId('ab-flag-save-btn');
  }
}

export class AudiobookPage {
  readonly voices: AudiobookVoices;
  readonly chapter: AudiobookChapterPanel;
  readonly engines: AudiobookEnginePanel;
  readonly player: AudiobookPlayer;
  readonly generateDialog: AudiobookGenerateDialog;
  readonly flagDialog: AudiobookFlagDialog;

  constructor(private readonly page: Page) {
    this.voices = new AudiobookVoices(page);
    this.chapter = new AudiobookChapterPanel(page);
    this.engines = new AudiobookEnginePanel(page);
    this.player = new AudiobookPlayer(page);
    this.generateDialog = new AudiobookGenerateDialog(page);
    this.flagDialog = new AudiobookFlagDialog(page);
  }

  get root(): Locator {
    return this.page.getByTestId('ab-root');
  }

  get back(): Locator {
    return this.page.getByTestId('ab-back-btn');
  }

  get rail(): Locator {
    return this.page.getByTestId('ab-rail');
  }

  get railCount(): Locator {
    return this.page.getByTestId('ab-rail-count');
  }

  get railProgress(): Locator {
    return this.page.getByTestId('audiobook-rail-progress').locator('i');
  }

  get units(): Locator {
    return this.page.getByTestId('ab-units').getByRole('treeitem');
  }

  get voicesView(): Locator {
    return this.mode('voices');
  }

  get productionView(): Locator {
    return this.mode('prod');
  }

  get playAll(): Locator {
    return this.page.getByTestId('ab-play-all-btn');
  }

  get generateAll(): Locator {
    return this.page.getByTestId('ab-generate-btn');
  }

  get listen(): Locator {
    return this.page.getByTestId('ab-listen');
  }

  get listenMeta(): Locator {
    return this.page.getByTestId('audiobook-listen-meta');
  }

  get editWho(): Locator {
    return this.page.getByTestId('ab-go-who-btn');
  }

  get changeVoice(): Locator {
    return this.page.getByTestId('ab-fix-engine-btn');
  }

  get chooseVoice(): Locator {
    return this.page.getByTestId('ab-pick-voice-btn');
  }

  get list(): Locator {
    return this.page.getByTestId('ab-list');
  }

  get segments(): Locator {
    return this.list.getByTestId(/^ab-seg-/);
  }

  get states(): Locator {
    return this.list.getByTestId(/^audiobook-segment-state-/);
  }

  get gaps(): Locator {
    return this.list.getByTestId(/^ab-gap-/);
  }

  get empty(): Locator {
    return this.page.getByTestId('audiobook-empty');
  }

  get openScript(): Locator {
    return this.page.getByTestId('ab-empty-script-btn');
  }

  get inspectorTab(): Locator {
    return this.page.locator('[data-testid=inspector-tab][data-tab=inspector]');
  }

  mode(mode: AudiobookMode): Locator {
    return this.page.getByTestId(`ab-views-${mode}`);
  }

  unit(position: number): Locator {
    return this.page.getByTestId(`ab-unit-${unitKey(position)}`);
  }

  unitMeta(position: number): Locator {
    return this.unit(position).locator('.sc-ub .t-sm');
  }

  unitMark(position: number): Locator {
    return this.unit(position).getByTestId('audiobook-rail-mark');
  }

  banners(kind: BannerKind): Locator {
    return this.page.getByTestId(`ab-ban-${kind}`);
  }

  bannerTexts(kind: BannerKind): Locator {
    return this.banners(kind).locator(':scope > span');
  }

  segment(index: number): AudioSegment {
    return new AudioSegment(this.segments.nth(index));
  }

  speakerName(id: string): Locator {
    return this.page.getByTestId(`ab-spk-name-${id}`);
  }
}
