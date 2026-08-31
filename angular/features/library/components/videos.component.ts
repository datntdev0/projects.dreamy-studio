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
import { ASSET_RATIOS, AssetRef } from '../library.models';
import { formatBytes } from '../library.rules';
import { LibraryService } from '../library.service';
import { LibraryVideo, VideoSort } from '../library.videos.models';
import { videoMeta } from '../library.videos.rules';
import { LibraryVideoService } from '../library.videos.service';
import { LibraryVideoMedia } from './video-media.component';
import { LibraryVideoThumb } from './video-thumb.component';

function toAssetRef(video: LibraryVideo): AssetRef {
  return { kind: 'video', id: video.id };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-videos',
  imports: [
    Datatable,
    DatatableCell,
    Icon,
    CoreModule,
    LibraryVideoMedia,
    LibraryVideoThumb,
    Slider,
  ],
  templateUrl: './videos.component.html',
})
export class LibraryVideos implements OnInit, OnDestroy {
  private readonly ipc = inject(DesktopIpcService);
  readonly videos = inject(LibraryVideoService);
  readonly library = inject(LibraryService);
  private readonly languageService = inject(LanguageService);
  readonly dialogs = inject(LibraryDialogsService);
  private readonly confirms = inject(LibraryConfirmService);
  readonly dragging = signal(false);
  readonly ratioOptions = ASSET_RATIOS;
  private unlisten: DesktopUnlisten | null = null;

  ngOnInit(): void {
    void this.videos.ensureLoaded();
    void this.listenForDrops();
  }

  ngOnDestroy(): void {
    this.unlisten?.();
  }
  onQuery(event: Event): void {
    this.videos.query.set(fieldValue(event));
  }
  onSort(event: Event): void {
    this.videos.sort.set(fieldValue(event) as VideoSort);
  }
  onGridSize(value: number): void {
    this.videos.setGridSize(value);
  }
  setRatio(value: string): void {
    this.videos.setGridRatio(value);
  }
  setView(value: 'grid' | 'list'): void {
    this.library.setViewMode(value);
  }
  select(video: LibraryVideo): void {
    this.videos.select(video.id);
  }

  open(video: LibraryVideo): void {
    this.select(video);
    this.dialogs.openVideoPreview(video.id, this.videos.visible().map(toAssetRef));
  }

  onVideoKeydown(video: LibraryVideo, event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.open(video);
    }
    if (event.key === ' ') {
      event.preventDefault();
      this.select(video);
    }
  }

  openUpload(): void {
    this.dialogs.openUpload([], 'video');
  }
  clearAllFilters(): void {
    this.videos.query.set('');
    this.library.clearFilters();
  }
  removeCollectionFilter(): void {
    this.library.setFilterCollection(null);
  }
  removeTagFilter(tag: string): void {
    this.library.toggleFilterTag(tag);
  }
  videoDetails(video: LibraryVideo): string {
    return videoMeta(video);
  }
  size(video: LibraryVideo): string {
    return formatBytes(video.size);
  }
  isSelected(video: LibraryVideo): boolean {
    return this.videos.selectedId() === video.id;
  }
  hasActiveFilters(): boolean {
    return this.videos.query().trim().length > 0 || this.library.filtersActive();
  }
  collectionName(video: LibraryVideo): string {
    return video.collectionId === null
      ? '\u2014'
      : (this.library.collectionById(video.collectionId)?.name ?? '\u2014');
  }
  collectionFilterName(): string {
    const filter = this.library.filterCollection();
    return typeof filter === 'number'
      ? (this.library.collectionById(filter)?.name ?? '\u2014')
      : '';
  }
  collectionFilterIsKey(): boolean {
    return this.library.filterCollection() === 'none';
  }
  unfiledKey(): LanguageKey {
    return 'library.explorer.filters.unfiled';
  }
  ratioIcon(value: string): string {
    return `ratio-${value.replace('/', '-')}`;
  }

  readonly tableRowClass = (row: object): Record<string, boolean> => ({
    'is-selected': this.isSelected(this.videoOf(row)),
  });

  get tableColumns(): DatatableColumn[] {
    return [
      { key: 'name', label: this.languageService.translate('library.image.column.name') },
      {
        key: 'spec',
        label: this.languageService.translate('library.image.info.specs'),
        width: '170px',
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

  videoOf(row: object): LibraryVideo {
    return row as LibraryVideo;
  }

  onRowSelected(index: number): void {
    const item = this.videos.visible()[index];
    if (item) {
      this.select(item);
    }
  }

  onRowDblClick(event: DatatableRowEvent): void {
    this.open(this.videoOf(event.row));
  }

  onRowEnter(event: DatatableRowEvent): void {
    this.open(this.videoOf(event.row));
  }

  @HostListener('document:keydown', ['$event'])
  onDeleteKey(event: KeyboardEvent): void {
    const id = this.videos.selectedId();
    if (
      !isDeleteShortcut(event) ||
      id === null ||
      this.dialogs.uploadOpen() ||
      this.isDialogOpen()
    ) {
      return;
    }
    this.confirms.deleteVideos([id]);
  }

  private async listenForDrops(): Promise<void> {
    this.unlisten = await listenForLibraryDrops(this.ipc, this.dragging, this.dialogs, 'video');
  }

  private isDialogOpen(): boolean {
    return this.dialogs.previewVideoId() !== null || isModalOpen();
  }
}
