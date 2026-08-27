import type { Locator, Page } from "@playwright/test";

export type SectionKind = "image" | "sound" | "video" | "prompt";

const SECTION_ROOTS: Readonly<Record<SectionKind, string>> = {
  image: "library-images",
  sound: "library-sounds",
  video: "library-videos",
  prompt: "library-prompts-content",
};

const SECTION_PREFIXES: Readonly<Record<SectionKind, string>> = {
  image: "library-images",
  sound: "library-sounds",
  video: "library-videos",
  prompt: "library-prompts",
};

const EXPLORER_ROWS: Readonly<Record<SectionKind, string>> = {
  image: "library-explorer-images",
  sound: "library-explorer-sounds",
  video: "library-explorer-videos",
  prompt: "library-explorer-prompts",
};

export class LibraryExplorer {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("library-explorer-content");
  }

  get taxonomy(): Locator {
    return this.page.getByTestId("library-explorer-taxonomy");
  }

  get voices(): Locator {
    return this.page.getByTestId("library-explorer-voices");
  }

  get organizeHead(): Locator {
    return this.page.getByTestId("library-explorer-section");
  }

  get collections(): Locator {
    return this.page.getByTestId(/^library-explorer-collection-\d+$/);
  }

  get emptyCollections(): Locator {
    return this.page.getByTestId("library-explorer-empty");
  }

  get filtersHead(): Locator {
    return this.page.getByTestId("library-explorer-filters-head");
  }

  get filterCollection(): Locator {
    return this.page.getByTestId("library-explorer-filter-collection-select");
  }

  get filterTags(): Locator {
    return this.page.getByTestId("library-explorer-filter-tag");
  }

  get filterClear(): Locator {
    return this.page.getByTestId("library-explorer-filter-clear");
  }

  row(kind: SectionKind): Locator {
    return this.page.getByTestId(EXPLORER_ROWS[kind]);
  }

  count(kind: SectionKind): Locator {
    return this.page.getByTestId(`${EXPLORER_ROWS[kind]}-count`);
  }

  collection(id: number): Locator {
    return this.page.getByTestId(`library-explorer-collection-${id}`);
  }

  collectionNamed(name: string): Locator {
    return this.collections.filter({ hasText: name });
  }

  filterTag(tag: string): Locator {
    return this.filterTags.filter({ has: this.page.getByTestId("library-explorer-filter-tag-name").filter({ hasText: new RegExp(`^${tag}$`) }) });
  }
}

export class LibrarySectionList {
  constructor(
    private readonly page: Page,
    readonly kind: SectionKind,
  ) {}

  get root(): Locator {
    return this.page.getByTestId(SECTION_ROOTS[this.kind]);
  }

  get toolbar(): Locator {
    return this.part("toolbar");
  }

  get search(): Locator {
    return this.part("search");
  }

  get count(): Locator {
    return this.part("count");
  }

  get sort(): Locator {
    return this.part("sort");
  }

  get gridView(): Locator {
    return this.part("view-grid");
  }

  get listView(): Locator {
    return this.part("view-list");
  }

  get upload(): Locator {
    return this.part("upload");
  }

  get empty(): Locator {
    return this.part("empty");
  }

  get emptyFiltered(): Locator {
    return this.part("empty-filtered");
  }

  get emptyUpload(): Locator {
    return this.part("empty-upload");
  }

  get clearFilters(): Locator {
    return this.part("clear-filters");
  }

  get grid(): Locator {
    return this.part("grid");
  }

  get cards(): Locator {
    return this.part("card");
  }

  get table(): Locator {
    return this.part("table");
  }

  get rows(): Locator {
    return this.part("table-row");
  }

  get cardNames(): Locator {
    return this.part("card-name");
  }

  card(name: string): Locator {
    return this.cards.filter({ hasText: name });
  }

  row(name: string): Locator {
    return this.rows.filter({ hasText: name });
  }

  protected part(suffix: string): Locator {
    return this.page.getByTestId(`${SECTION_PREFIXES[this.kind]}-${suffix}`);
  }
}

export class LibraryTaxonomy {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("library-collections-page");
  }

  get create(): Locator {
    return this.page.getByTestId("library-collections-create");
  }

  get emptyCreate(): Locator {
    return this.page.getByTestId("library-collections-empty-create");
  }

  get collectionsPane(): Locator {
    return this.page.getByTestId("library-collections-pane");
  }

  get tagsPane(): Locator {
    return this.page.getByTestId("library-tags-pane");
  }

  get collectionRows(): Locator {
    return this.page.getByTestId(/^library-collection-row-\d+$/);
  }

  get tagRows(): Locator {
    return this.page.locator('[data-testid^="library-tag-row-"]');
  }

  get tagSearch(): Locator {
    return this.page.getByTestId("library-tag-search");
  }

  collectionRow(id: number): Locator {
    return this.page.getByTestId(`library-collection-row-${id}`);
  }

  collectionRowNamed(name: string): Locator {
    return this.collectionRows.filter({ hasText: name });
  }

  tagRow(tag: string): Locator {
    return this.page.getByTestId(`library-tag-row-${tag}`);
  }
}

export class LibraryCollectionView {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("library-collection-assets");
  }

  get missing(): Locator {
    return this.page.getByTestId("library-collection-missing");
  }

  get title(): Locator {
    return this.page.getByTestId("library-collection-assets-title-text");
  }

  get count(): Locator {
    return this.page.getByTestId("library-collection-assets-count");
  }

  get empty(): Locator {
    return this.page.getByTestId("library-collection-assets-empty");
  }

  get cards(): Locator {
    return this.page.getByTestId("library-collection-assets-card");
  }

  get rows(): Locator {
    return this.page.getByTestId("library-collection-assets-table-row");
  }
}

export class LibraryNav {
  readonly explorer: LibraryExplorer;
  readonly images: LibrarySectionList;
  readonly sounds: LibrarySectionList;
  readonly videos: LibrarySectionList;
  readonly prompts: LibrarySectionList;
  readonly taxonomy: LibraryTaxonomy;
  readonly collection: LibraryCollectionView;

  constructor(readonly page: Page) {
    this.explorer = new LibraryExplorer(page);
    this.images = new LibrarySectionList(page, "image");
    this.sounds = new LibrarySectionList(page, "sound");
    this.videos = new LibrarySectionList(page, "video");
    this.prompts = new LibrarySectionList(page, "prompt");
    this.taxonomy = new LibraryTaxonomy(page);
    this.collection = new LibraryCollectionView(page);
  }

  get rail(): Locator {
    return this.page.locator("[data-testid=railbar-item][data-rail=library]");
  }

  get tabbar(): Locator {
    return this.page.getByTestId("editor-tabbar");
  }

  section(kind: SectionKind): LibrarySectionList {
    if (kind === "sound") {
      return this.sounds;
    }
    if (kind === "video") {
      return this.videos;
    }
    return kind === "prompt" ? this.prompts : this.images;
  }
}

export class UploadDialog {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("library-upload-dialog-panel");
  }

  get title(): Locator {
    return this.root.getByTestId("dialog-title");
  }

  get closeButton(): Locator {
    return this.root.getByTestId("dialog-close").locator("button");
  }

  get dropzone(): Locator {
    return this.page.getByTestId("library-upload-dialog-dropzone");
  }

  get dropzoneTitle(): Locator {
    return this.page.getByTestId("library-upload-dialog-dropzone-title");
  }

  get pick(): Locator {
    return this.page.getByTestId("library-upload-dialog-pick").locator("button");
  }

  get queue(): Locator {
    return this.page.getByTestId("library-upload-dialog-queue");
  }

  get rows(): Locator {
    return this.page.getByTestId("library-upload-dialog-queue-row");
  }

  get collection(): Locator {
    return this.page.getByTestId("library-upload-dialog-collection");
  }

  get newCollection(): Locator {
    return this.page.getByTestId("library-upload-dialog-new-collection");
  }

  get tags(): Locator {
    return this.page.getByTestId("library-upload-dialog-tags");
  }

  get rights(): Locator {
    return this.page.getByTestId("library-upload-dialog-rights");
  }

  get submit(): Locator {
    return this.page.getByTestId("library-upload-dialog-submit").locator("button");
  }

  get cancel(): Locator {
    return this.page.getByTestId("library-upload-dialog-cancel").locator("button");
  }

  row(name: string): Locator {
    return this.rows.filter({ has: this.page.getByTestId("library-upload-dialog-file-name").getByText(name, { exact: true }) });
  }

  badge(name: string): Locator {
    return this.row(name).getByTestId("library-upload-dialog-status-badge");
  }

  message(name: string): Locator {
    return this.row(name).getByTestId("library-upload-dialog-file-message");
  }

  size(name: string): Locator {
    return this.row(name).getByTestId("library-upload-dialog-queue-size");
  }

  remove(name: string): Locator {
    return this.row(name).getByTestId("library-upload-dialog-remove");
  }
}

export class PromptDialog {
  constructor(private readonly page: Page) {}

  get panel(): Locator {
    return this.page.getByTestId("library-upload-dialog-panel");
  }

  get tabs(): Locator {
    return this.page.getByTestId("library-upload-dialog-tabs");
  }

  get filesTab(): Locator {
    return this.tabs.getByRole("button").nth(0);
  }

  get writeTab(): Locator {
    return this.tabs.getByRole("button").nth(1);
  }

  get title(): Locator {
    return this.panel.getByTestId("dialog-title");
  }

  get closeButton(): Locator {
    return this.panel.getByTestId("dialog-close").getByTestId("button");
  }

  get dropzone(): Locator {
    return this.page.getByTestId("library-upload-dialog-dropzone");
  }

  get dropzoneTitle(): Locator {
    return this.page.getByTestId("library-upload-dialog-dropzone-title");
  }

  get pick(): Locator {
    return this.page.getByTestId("library-upload-dialog-pick").getByTestId("button");
  }

  get queueRows(): Locator {
    return this.page.getByTestId("library-upload-dialog-queue-row");
  }

  get name(): Locator {
    return this.page.getByTestId("library-upload-dialog-write-name");
  }

  get nameError(): Locator {
    return this.page.getByTestId("library-upload-dialog-write-name-error");
  }

  get kind(): Locator {
    return this.page.getByTestId("library-upload-dialog-write-kind");
  }

  get text(): Locator {
    return this.page.getByTestId("library-upload-dialog-write-text");
  }

  get textError(): Locator {
    return this.page.getByTestId("library-upload-dialog-write-text-error");
  }

  get variables(): Locator {
    return this.page.getByTestId("library-upload-dialog-write-variables");
  }

  get collection(): Locator {
    return this.page.getByTestId("library-upload-dialog-collection");
  }

  get newCollection(): Locator {
    return this.page.getByTestId("library-upload-dialog-new-collection");
  }

  get tags(): Locator {
    return this.page.getByTestId("library-upload-dialog-tags");
  }

  get rights(): Locator {
    return this.page.getByTestId("library-upload-dialog-rights");
  }

  get submit(): Locator {
    return this.page.getByTestId("library-upload-dialog-submit").getByTestId("button");
  }

  get cancel(): Locator {
    return this.page.getByTestId("library-upload-dialog-cancel").getByTestId("button");
  }

  row(fileName: string): Locator {
    return this.queueRows.filter({ has: this.page.getByTestId("library-upload-dialog-file-name").filter({ hasText: new RegExp(`^${escapePattern(fileName)}$`) }) });
  }

  badge(fileName: string): Locator {
    return this.row(fileName).getByTestId("library-upload-dialog-status-badge");
  }

  message(fileName: string): Locator {
    return this.row(fileName).getByTestId("library-upload-dialog-file-message");
  }

  size(fileName: string): Locator {
    return this.row(fileName).getByTestId("library-upload-dialog-queue-size");
  }
}

export class PromptInspector {
  constructor(private readonly page: Page) {}

  get name(): Locator {
    return this.page.getByTestId("library-prompt-panel-name");
  }

  get kind(): Locator {
    return this.page.getByTestId("library-prompt-panel-kind");
  }

  get text(): Locator {
    return this.page.getByTestId("library-prompt-panel-text");
  }

  get tags(): Locator {
    return this.page.getByTestId("library-prompt-panel-tag");
  }

  get collection(): Locator {
    return this.page.getByTestId("library-prompt-panel-collection");
  }

  get rights(): Locator {
    return this.page.getByTestId("library-prompt-panel-rights");
  }

  get variables(): Locator {
    return this.page.getByTestId("library-prompt-panel-variable");
  }
}

export class PromptAuthoringPage {
  readonly dialog: PromptDialog;
  readonly inspector: PromptInspector;

  constructor(private readonly page: Page) {
    this.dialog = new PromptDialog(page);
    this.inspector = new PromptInspector(page);
  }

  get write(): Locator {
    return this.page.getByTestId("library-prompts-write");
  }

  get upload(): Locator {
    return this.page.getByTestId("library-prompts-upload");
  }

  get cards(): Locator {
    return this.page.getByTestId("library-prompts-card");
  }

  card(name: string): Locator {
    return this.cards.filter({ has: this.page.getByTestId("library-prompts-card-name").filter({ hasText: new RegExp(`^${escapePattern(name)}$`) }) });
  }

  async setValue(field: Locator, value: string): Promise<void> {
    await field.evaluate(assignValue, value);
  }
}

function assignValue(element: Element, value: string): void {
  const field = element as HTMLInputElement | HTMLTextAreaElement;
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class LibraryBrowsingPage {
  constructor(private readonly page: Page) {}

  get uploadDialog(): Locator {
    return this.page.getByTestId("library-upload-dialog-panel");
  }

  get uploadCancel(): Locator {
    return this.page.getByTestId("library-upload-dialog-cancel");
  }

  emptyFilteredClear(kind: SectionKind): Locator {
    return this.page.getByTestId(`${this.prefix(kind)}-empty-filtered-clear`);
  }

  tagChips(kind: SectionKind): Locator {
    return this.page.getByTestId(`${this.prefix(kind)}-tag-chip`);
  }

  collectionChip(kind: SectionKind): Locator {
    return this.page.getByTestId(`${this.prefix(kind)}-collection-chip`);
  }

  private prefix(kind: SectionKind): string {
    return kind === "prompt" ? "library-prompts" : `library-${kind}s`;
  }
}

export type PreviewKind = "image" | "sound" | "video" | "prompt";

export class AssetPreview {
  constructor(
    protected readonly page: Page,
    readonly kind: PreviewKind,
  ) {}

  get panel(): Locator {
    return this.page.getByTestId(`library-${this.kind}-preview-dialog-panel`);
  }

  get previous(): Locator {
    return this.part("previous");
  }

  get next(): Locator {
    return this.part("next");
  }

  get code(): Locator {
    return this.part("code");
  }

  get size(): Locator {
    return this.part("size");
  }

  get rights(): Locator {
    return this.part("rights");
  }

  get tags(): Locator {
    return this.part("tag");
  }

  get collection(): Locator {
    return this.part("collection");
  }

  protected part(suffix: string): Locator {
    return this.page.getByTestId(`library-${this.kind}-preview-${suffix}`);
  }
}

export class ImagePreview extends AssetPreview {
  constructor(page: Page) {
    super(page, "image");
  }

  get image(): Locator {
    return this.part("image");
  }

  get specs(): Locator {
    return this.part("specs");
  }

  get added(): Locator {
    return this.part("added");
  }

  get originLabel(): Locator {
    return this.part("origin-label");
  }

  get origin(): Locator {
    return this.part("origin");
  }
}

export class SoundPreview extends AssetPreview {
  constructor(page: Page) {
    super(page, "sound");
  }

  get wave(): Locator {
    return this.part("wave");
  }

  get waveCanvas(): Locator {
    return this.part("wave").getByTestId("library-sound-wave-canvas");
  }

  get specs(): Locator {
    return this.part("specs");
  }

  get time(): Locator {
    return this.part("time");
  }

  get play(): Locator {
    return this.part("play").getByTestId("library-sound-play-button");
  }
}

export class VideoPreview extends AssetPreview {
  constructor(page: Page) {
    super(page, "video");
  }

  get player(): Locator {
    return this.part("player");
  }

  get parameters(): Locator {
    return this.part("parameters");
  }
}

export class PromptPreview extends AssetPreview {
  constructor(page: Page) {
    super(page, "prompt");
  }

  get text(): Locator {
    return this.part("text");
  }

  get variables(): Locator {
    return this.part("variable");
  }

  get copy(): Locator {
    return this.part("copy");
  }
}

export class PromptPreviewInspector {
  constructor(private readonly page: Page) {}

  get variables(): Locator {
    return this.page.getByTestId("library-prompt-panel-variable");
  }
}

export class PreviewPages {
  readonly image: ImagePreview;
  readonly sound: SoundPreview;
  readonly video: VideoPreview;
  readonly prompt: PromptPreview;
  readonly promptInspector: PromptPreviewInspector;

  constructor(readonly page: Page) {
    this.image = new ImagePreview(page);
    this.sound = new SoundPreview(page);
    this.video = new VideoPreview(page);
    this.prompt = new PromptPreview(page);
    this.promptInspector = new PromptPreviewInspector(page);
  }
}

export type InfoKind = "image" | "prompt";

const TAG_INPUT_IDS: Readonly<Record<InfoKind, string>> = {
  image: "tags-input",
  prompt: "tag-input",
};

export class LibraryInfoPanel {
  constructor(
    private readonly page: Page,
    readonly kind: InfoKind,
  ) {}

  get root(): Locator {
    return this.page.getByTestId(`library-${this.kind}-panel-content`);
  }

  get name(): Locator {
    return this.part("name");
  }

  get rights(): Locator {
    return this.part("rights");
  }

  get collection(): Locator {
    return this.part("collection");
  }

  get tagInput(): Locator {
    return this.part(TAG_INPUT_IDS[this.kind]);
  }

  get tagCount(): Locator {
    return this.part("tags-count");
  }

  get tags(): Locator {
    return this.part("tag");
  }

  get promptKind(): Locator {
    return this.part("kind");
  }

  get promptText(): Locator {
    return this.part("text");
  }

  get variables(): Locator {
    return this.part("variable");
  }

  tag(name: string): Locator {
    return this.tags.filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) });
  }

  removeTag(name: string): Locator {
    return this.tag(name).getByTestId(`library-${this.kind}-panel-tag-remove`);
  }

  async rename(value: string): Promise<void> {
    await this.name.fill(value);
    await this.name.press("Enter");
  }

  async blurName(value: string): Promise<void> {
    await this.name.fill(value);
    await this.name.blur();
  }

  async addTag(value: string): Promise<void> {
    await this.tagInput.fill(value);
    await this.tagInput.press("Enter");
  }

  async setText(value: string): Promise<void> {
    await this.promptText.fill(value);
    await this.promptText.blur();
  }

  private part(suffix: string): Locator {
    return this.page.getByTestId(`library-${this.kind}-panel-${suffix}`);
  }
}

export type DeletionKind = "image" | "sound" | "video" | "prompt";

export class LibraryDeletionPage {
  constructor(private readonly page: Page) {}

  deleteButton(kind: DeletionKind): Locator {
    return this.page.getByTestId(`library-${kind}-panel-delete`);
  }
}

export class CollectionDialog {
  constructor(private readonly page: Page) {}

  get panel(): Locator {
    return this.page.getByTestId("library-collection-dialog-panel");
  }

  get name(): Locator {
    return this.page.getByTestId("library-collection-dialog-name");
  }

  get description(): Locator {
    return this.page.getByTestId("library-collection-dialog-description");
  }

  get error(): Locator {
    return this.page.getByTestId("library-collection-dialog-error");
  }

  get submit(): Locator {
    return this.page.getByTestId("library-collection-dialog-submit");
  }

  get cancel(): Locator {
    return this.page.getByTestId("library-collection-dialog-cancel");
  }
}

export class CollectionPanel {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("library-collection-panel-content");
  }

  get name(): Locator {
    return this.page.getByTestId("library-collection-panel-name");
  }

  get error(): Locator {
    return this.page.getByTestId("library-collection-panel-error");
  }

  get description(): Locator {
    return this.page.getByTestId("library-collection-panel-description");
  }

  get open(): Locator {
    return this.page.getByTestId("library-collection-panel-open");
  }

  get remove(): Locator {
    return this.page.getByTestId("library-collection-panel-delete");
  }
}

export class CollectionsPage {
  readonly dialog: CollectionDialog;
  readonly panel: CollectionPanel;

  constructor(private readonly page: Page) {
    this.dialog = new CollectionDialog(page);
    this.panel = new CollectionPanel(page);
  }

  get rows(): Locator {
    return this.page.getByTestId(/^library-collection-row-\d+$/);
  }

  row(name: string): Locator {
    return this.rows.filter({ has: this.page.locator(".t-ink", { hasText: new RegExp(`^${name}$`) }) });
  }

  descriptionOf(row: Locator): Locator {
    return row.locator(".lb-desc");
  }

  countsOf(row: Locator): Locator {
    return row.locator(".lb-cnt b");
  }
}

export class LibraryTagPanelView {
  constructor(private readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId("library-tag-panel-content");
  }

  get name(): Locator {
    return this.page.getByTestId("library-tag-panel-name");
  }

  get hint(): Locator {
    return this.page.getByTestId("library-tag-panel-name-hint");
  }

  get mergeSelect(): Locator {
    return this.page.getByTestId("library-tag-panel-merge");
  }

  get remove(): Locator {
    return this.page.getByTestId("library-tag-panel-delete");
  }

  get missing(): Locator {
    return this.page.getByTestId("library-tag-panel-missing");
  }
}

export class LibraryTagsPage {
  readonly panel: LibraryTagPanelView;

  constructor(private readonly page: Page) {
    this.panel = new LibraryTagPanelView(page);
  }

  get search(): Locator {
    return this.page.getByTestId("library-tag-search");
  }

  get rows(): Locator {
    return this.page.locator('[data-testid^="library-tag-row-"]');
  }

  get names(): Locator {
    return this.rows.locator(".tag");
  }

  get empty(): Locator {
    return this.page.getByTestId("library-tags-pane").locator(".empty");
  }

  get confirmMessage(): Locator {
    return this.page.getByTestId("dialog-host-message");
  }

  row(tag: string): Locator {
    return this.page.getByTestId(`library-tag-row-${tag}`);
  }

  counts(tag: string): Locator {
    return this.row(tag).locator(".lb-cnt b");
  }

  total(tag: string): Locator {
    return this.row(tag).locator("td.num");
  }
}
