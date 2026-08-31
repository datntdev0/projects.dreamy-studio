// prettier-ignore
import { ChangeDetectionStrategy, Component, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
// prettier-ignore
import { Datatable, DatatableCell, DatatableColumn, DatatableRowEvent } from '@components/datatable';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { DesktopIpcService, DesktopUnlisten } from '@shared/desktop/desktop-ipc.service';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { fieldValue, isDeleteShortcut, isModalOpen } from '@shared/utils/dom';

import { LibraryConfirmService } from '../library.confirm.service';
import { LibraryDialogsService } from '../library.dialogs.service';
import { listenForLibraryDrops } from '../library.drag-drop';
import { AssetRef } from '../library.models';
import { LibraryPrompt, PromptSort } from '../library.prompts.models';
import { promptMeta } from '../library.prompts.rules';
import { LibraryPromptService } from '../library.prompts.service';
import { formatBytes } from '../library.rules';
import { LibraryService } from '../library.service';
import { LibraryPromptMedia } from './prompt-media.component';

function toRef(prompt: LibraryPrompt): AssetRef {
  return { kind: 'prompt', id: prompt.id };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-prompts',
  imports: [Datatable, DatatableCell, Icon, CoreModule, LibraryPromptMedia],
  templateUrl: './prompts.component.html',
  host: { 'data-testid': 'library-prompts' },
})
export class LibraryPrompts implements OnInit, OnDestroy {
  private readonly ipc = inject(DesktopIpcService);
  readonly prompts = inject(LibraryPromptService);
  readonly library = inject(LibraryService);
  private readonly languageService = inject(LanguageService);
  readonly dialogs = inject(LibraryDialogsService);
  private readonly confirms = inject(LibraryConfirmService);
  readonly dragging = signal(false);
  private unlisten: DesktopUnlisten | null = null;

  ngOnInit(): void {
    void this.prompts.ensureLoaded();
    void this.listenForDrops();
  }
  ngOnDestroy(): void {
    this.unlisten?.();
  }
  onQuery(event: Event): void {
    this.prompts.query.set(fieldValue(event));
  }
  onSort(event: Event): void {
    this.prompts.sort.set(fieldValue(event) as PromptSort);
  }
  setView(value: 'grid' | 'list'): void {
    this.library.setViewMode(value);
  }
  select(prompt: LibraryPrompt): void {
    this.prompts.select(this.selected(prompt) ? null : prompt.id);
  }
  open(prompt: LibraryPrompt): void {
    this.prompts.select(prompt.id);
    this.dialogs.openPromptPreview(prompt.id, this.prompts.visible().map(toRef));
  }
  onKeydown(prompt: LibraryPrompt, event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.open(prompt);
    }
    if (event.key === ' ') {
      event.preventDefault();
      this.select(prompt);
    }
  }
  openUpload(): void {
    this.dialogs.openUpload([], 'prompt');
  }
  openWrite(): void {
    this.dialogs.openUpload([], 'prompt', null, 'write');
  }
  clear(): void {
    this.prompts.query.set('');
    this.library.clearFilters();
  }
  removeCollection(): void {
    this.library.setFilterCollection(null);
  }
  removeTag(tag: string): void {
    this.library.toggleFilterTag(tag);
  }
  size(prompt: LibraryPrompt): string {
    return formatBytes(prompt.size);
  }
  length(prompt: LibraryPrompt): number {
    return promptMeta(prompt);
  }
  selected(prompt: LibraryPrompt): boolean {
    return this.prompts.selectedId() === prompt.id;
  }
  active(): boolean {
    return this.prompts.query().trim().length > 0 || this.library.filtersActive();
  }
  collection(prompt: LibraryPrompt): string {
    return prompt.collectionId === null
      ? '—'
      : (this.library.collectionById(prompt.collectionId)?.name ?? '—');
  }
  collectionFilterName(): string {
    const value = this.library.filterCollection();
    return typeof value === 'number' ? (this.library.collectionById(value)?.name ?? '—') : '';
  }
  collectionFilterIsKey(): boolean {
    return this.library.filterCollection() === 'none';
  }
  unfiledKey(): LanguageKey {
    return 'library.explorer.filters.unfiled';
  }

  readonly tableRowClass = (row: object): Record<string, boolean> => ({
    'is-selected': this.selected(this.promptOf(row)),
  });

  get tableColumns(): DatatableColumn[] {
    return [
      { key: 'name', label: this.languageService.translate('library.video.column.name') },
      {
        key: 'length',
        label: this.languageService.translate('library.prompt.column.length'),
        width: '120px',
      },
      {
        key: 'size',
        label: this.languageService.translate('library.prompt.column.size'),
        align: 'right',
        width: '110px',
      },
      {
        key: 'collection',
        label: this.languageService.translate('library.video.column.collection'),
        width: '180px',
        ellipsis: true,
      },
    ];
  }

  promptOf(row: object): LibraryPrompt {
    return row as LibraryPrompt;
  }

  onRowSelected(index: number): void {
    const item = this.prompts.visible()[index];
    if (item) {
      this.select(item);
    }
  }

  onRowDblClick(event: DatatableRowEvent): void {
    this.open(this.promptOf(event.row));
  }

  onRowEnter(event: DatatableRowEvent): void {
    this.open(this.promptOf(event.row));
  }

  @HostListener('document:keydown', ['$event'])
  onDelete(event: KeyboardEvent): void {
    const id = this.prompts.selectedId();
    if (!isDeleteShortcut(event) || id === null || this.dialogs.uploadOpen() || this.dialogOpen())
      return;
    this.confirms.deletePrompts([id]);
  }

  private async listenForDrops(): Promise<void> {
    this.unlisten = await listenForLibraryDrops(this.ipc, this.dragging, this.dialogs, 'prompt');
  }
  private dialogOpen(): boolean {
    return this.dialogs.previewPromptId() !== null || isModalOpen();
  }
}
