// prettier-ignore
import { ChangeDetectionStrategy, Component, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
// prettier-ignore
import { Datatable, DatatableCell, DatatableColumn, DatatableRowEvent } from '@components/datatable';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
// prettier-ignore
import { DesktopIpcService, DesktopUnlisten } from '@shared/desktop/desktop-ipc.service';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { fieldValue, isDeleteShortcut, isModalOpen } from '@shared/utils/dom';

import { LibraryConfirmService } from '../library.confirm.service';
import { LibraryDialogsService } from '../library.dialogs.service';
import { listenForLibraryDrops } from '../library.drag-drop';
import { AssetRef } from '../library.models';
import { formatBytes } from '../library.rules';
import { LibraryService } from '../library.service';
import { LibrarySound, SoundSort } from '../library.sounds.models';
import { durationText } from '../library.sounds.rules';
import { LibrarySoundService } from '../library.sounds.service';
import { LibrarySoundMedia } from './sound-media.component';

function toAssetRef(sound: LibrarySound): AssetRef {
  return { kind: 'sound', id: sound.id };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-sounds',
  imports: [Datatable, DatatableCell, Icon, CoreModule, LibrarySoundMedia],
  templateUrl: './sounds.component.html',
})
export class LibrarySounds implements OnInit, OnDestroy {
  private readonly ipc = inject(DesktopIpcService);
  readonly sounds = inject(LibrarySoundService);
  readonly library = inject(LibraryService);
  private readonly languageService = inject(LanguageService);
  readonly dialogs = inject(LibraryDialogsService);
  private readonly confirms = inject(LibraryConfirmService);
  readonly dragging = signal(false);
  private unlisten: DesktopUnlisten | null = null;

  ngOnInit(): void {
    void this.sounds.ensureLoaded();
    void this.listenForDrops();
  }

  ngOnDestroy(): void {
    this.unlisten?.();
  }

  onQuery(event: Event): void {
    this.sounds.query.set(fieldValue(event));
  }

  onSort(event: Event): void {
    this.sounds.sort.set(fieldValue(event) as SoundSort);
  }

  setView(value: 'grid' | 'list'): void {
    this.library.setViewMode(value);
  }

  select(sound: LibrarySound): void {
    this.sounds.select(sound.id);
  }

  open(sound: LibrarySound): void {
    this.select(sound);
    this.dialogs.openSoundPreview(sound.id, this.sounds.visible().map(toAssetRef));
  }

  onSoundKeydown(sound: LibrarySound, event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.open(sound);
    }
    if (event.key === ' ') {
      event.preventDefault();
      this.select(sound);
    }
  }

  openUpload(): void {
    this.dialogs.openUpload([], 'sound');
  }

  clearAllFilters(): void {
    this.sounds.query.set('');
    this.library.clearFilters();
  }

  removeCollectionFilter(): void {
    this.library.setFilterCollection(null);
  }

  removeTagFilter(tag: string): void {
    this.library.toggleFilterTag(tag);
  }

  collectionName(sound: LibrarySound): string {
    return sound.collectionId === null
      ? '—'
      : (this.library.collectionById(sound.collectionId)?.name ?? '—');
  }

  collectionFilterName(): string {
    const filter = this.library.filterCollection();
    return typeof filter === 'number' ? (this.library.collectionById(filter)?.name ?? '—') : '';
  }

  collectionFilterIsKey(): boolean {
    return this.library.filterCollection() === 'none';
  }

  unfiledKey(): LanguageKey {
    return 'library.explorer.filters.unfiled';
  }

  duration(sound: LibrarySound): string {
    return durationText(sound.durationMs);
  }

  size(sound: LibrarySound): string {
    return formatBytes(sound.size);
  }

  isSelected(sound: LibrarySound): boolean {
    return this.sounds.selectedId() === sound.id;
  }

  hasActiveFilters(): boolean {
    return this.sounds.query().trim().length > 0 || this.library.filtersActive();
  }

  readonly tableRowClass = (row: object): Record<string, boolean> => ({
    'is-selected': this.isSelected(this.soundOf(row)),
  });

  get tableColumns(): DatatableColumn[] {
    return [
      { key: 'name', label: this.languageService.translate('library.image.column.name') },
      {
        key: 'spec',
        label: this.languageService.translate('library.sound.column.spec'),
        width: '120px',
      },
      {
        key: 'size',
        label: this.languageService.translate('library.image.column.size'),
        align: 'right',
        width: '110px',
      },
      {
        key: 'collection',
        label: this.languageService.translate('library.image.column.collection'),
        width: '180px',
        ellipsis: true,
      },
    ];
  }

  soundOf(row: object): LibrarySound {
    return row as LibrarySound;
  }

  onRowSelected(index: number): void {
    const item = this.sounds.visible()[index];
    if (item) {
      this.select(item);
    }
  }

  onRowDblClick(event: DatatableRowEvent): void {
    this.open(this.soundOf(event.row));
  }

  onRowEnter(event: DatatableRowEvent): void {
    this.open(this.soundOf(event.row));
  }

  @HostListener('document:keydown', ['$event'])
  onDeleteKey(event: KeyboardEvent): void {
    const id = this.sounds.selectedId();
    if (
      !isDeleteShortcut(event) ||
      id === null ||
      this.dialogs.uploadOpen() ||
      this.isDialogOpen()
    ) {
      return;
    }
    this.confirms.deleteSounds([id]);
  }

  private async listenForDrops(): Promise<void> {
    this.unlisten = await listenForLibraryDrops(this.ipc, this.dragging, this.dialogs, 'sound');
  }

  private isDialogOpen(): boolean {
    return this.dialogs.previewSoundId() !== null || isModalOpen();
  }
}
