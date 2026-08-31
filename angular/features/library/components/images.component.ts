// prettier-ignore
import { ChangeDetectionStrategy, Component, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
// prettier-ignore
import { Datatable, DatatableCell, DatatableColumn, DatatableRowEvent } from '@components/datatable';
import { Icon } from '@components/icon';
import { Slider } from '@components/slider';
import { CoreModule } from '@shared/core.module';
// prettier-ignore
import { DesktopIpcService, DesktopUnlisten } from '@shared/desktop/desktop-ipc.service';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { fieldValue, isDeleteShortcut, isModalOpen } from '@shared/utils/dom';

import { LibraryConfirmService } from '../library.confirm.service';
import { LibraryDialogsService } from '../library.dialogs.service';
import { listenForLibraryDrops } from '../library.drag-drop';
import { IMAGE_RATIOS, ImageSort, ImageViewMode, LibraryImage } from '../library.images.models';
import { dimensionsText, formatBytes } from '../library.images.rules';
import { LibraryImageService } from '../library.images.service';
import { LibraryService } from '../library.service';
import { LibraryImageThumb } from './image-thumb.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-images',
  imports: [Datatable, DatatableCell, Icon, CoreModule, LibraryImageThumb, Slider],
  templateUrl: './images.component.html',
})
export class LibraryImages implements OnInit, OnDestroy {
  private readonly ipc = inject(DesktopIpcService);
  readonly images = inject(LibraryImageService);
  readonly library = inject(LibraryService);
  private readonly languageService = inject(LanguageService);
  readonly dialogs = inject(LibraryDialogsService);
  private readonly confirms = inject(LibraryConfirmService);
  readonly dragging = signal(false);
  readonly ratioOptions = IMAGE_RATIOS;
  private unlisten: DesktopUnlisten | null = null;

  ngOnInit(): void {
    void this.images.ensureLoaded();
    void this.listenForDrops();
  }

  ngOnDestroy(): void {
    this.unlisten?.();
  }

  onQuery(event: Event): void {
    this.images.query.set(fieldValue(event));
  }

  onSort(event: Event): void {
    this.images.sort.set(fieldValue(event) as ImageSort);
  }

  onGridSize(value: number): void {
    this.images.setGridSize(value);
  }

  setRatio(value: string): void {
    this.images.setGridRatio(value);
  }

  setView(value: ImageViewMode): void {
    this.images.setViewMode(value);
  }

  select(image: LibraryImage): void {
    this.images.select(image.id);
  }

  open(image: LibraryImage): void {
    this.images.select(image.id);
    this.dialogs.openPreview(image.id);
  }

  onImageKeydown(image: LibraryImage, event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.open(image);
    }
    if (event.key === ' ') {
      event.preventDefault();
      this.select(image);
    }
  }

  openUpload(): void {
    this.dialogs.openUpload();
  }

  clearAllFilters(): void {
    this.images.query.set('');
    this.library.clearFilters();
  }

  removeCollectionFilter(): void {
    this.library.setFilterCollection(null);
  }

  removeTagFilter(tag: string): void {
    this.library.toggleFilterTag(tag);
  }

  collectionName(image: LibraryImage): string {
    if (image.collectionId === null) {
      return '—';
    }
    return this.library.collectionById(image.collectionId)?.name ?? '—';
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

  formatBytes(value: number): string {
    return formatBytes(value);
  }

  dimensions(image: LibraryImage): string {
    return dimensionsText(image);
  }

  ratioIcon(value: string): string {
    return `ratio-${value.replace('/', '-')}`;
  }

  isSelected(image: LibraryImage): boolean {
    return this.images.selectedId() === image.id;
  }

  hasActiveFilters(): boolean {
    return this.images.query().trim().length > 0 || this.library.filtersActive();
  }

  readonly tableRowClass = (row: object): Record<string, boolean> => ({
    'is-selected': this.isSelected(this.imageOf(row)),
  });

  get tableColumns(): DatatableColumn[] {
    return [
      { key: 'name', label: this.languageService.translate('library.image.column.name') },
      {
        key: 'dimensions',
        label: this.languageService.translate('library.image.column.dimensions'),
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

  imageOf(row: object): LibraryImage {
    return row as LibraryImage;
  }

  onRowSelected(index: number): void {
    const item = this.images.visible()[index];
    if (item) {
      this.select(item);
    }
  }

  onRowDblClick(event: DatatableRowEvent): void {
    this.open(this.imageOf(event.row));
  }

  onRowEnter(event: DatatableRowEvent): void {
    this.open(this.imageOf(event.row));
  }

  @HostListener('document:keydown', ['$event'])
  onDeleteKey(event: KeyboardEvent): void {
    const id = this.images.selectedId();
    if (
      !isDeleteShortcut(event) ||
      id === null ||
      this.dialogs.uploadOpen() ||
      this.isDialogOpen()
    ) {
      return;
    }
    this.confirms.deleteImages([id]);
  }

  private async listenForDrops(): Promise<void> {
    this.unlisten = await listenForLibraryDrops(this.ipc, this.dragging, this.dialogs, 'image');
  }

  private isDialogOpen(): boolean {
    return this.dialogs.previewImageId() !== null || isModalOpen();
  }
}
