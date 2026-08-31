// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, HostListener, inject, input, OnInit, signal } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { fieldValue, isDeleteShortcut, isModalOpen } from '@shared/utils/dom';

import { AssetRow } from '../library.assets.models';
import { LibraryCollectionAssetsService } from '../library.collection-assets.service';
import { LibraryConfirmService } from '../library.confirm.service';
import { LibraryDialogsService } from '../library.dialogs.service';
import { dimensionsText } from '../library.images.rules';
import { LibraryImageService } from '../library.images.service';
import { AssetRef } from '../library.models';
import { charCount } from '../library.prompts.rules';
import { LibraryPromptService } from '../library.prompts.service';
import { formatBytes } from '../library.rules';
import { LibraryService } from '../library.service';
import { durationText } from '../library.sounds.rules';
import { LibrarySoundService } from '../library.sounds.service';
import { videoMeta } from '../library.videos.rules';
import { LibraryVideoService } from '../library.videos.service';
import { LibraryImageThumb } from './image-thumb.component';
import { LibraryPromptMedia } from './prompt-media.component';
import { LibrarySoundMedia } from './sound-media.component';
import { LibrarySoundPlay } from './sound-play.component';
import { LibraryVideoMedia } from './video-media.component';
import { LibraryVideoThumb } from './video-thumb.component';

function rowRef(row: AssetRow): AssetRef {
  return row.ref;
}

function inCollection(collectionId: number, row: AssetRow): boolean {
  return row.collectionId === collectionId;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-collection-assets',
  imports: [
    Icon,
    CoreModule,
    LibraryImageThumb,
    LibrarySoundMedia,
    LibrarySoundPlay,
    LibraryVideoMedia,
    LibraryVideoThumb,
    LibraryPromptMedia,
  ],
  templateUrl: './collection-assets.component.html',
  host: { 'data-testid': 'library-collection-assets' },
})
export class LibraryCollectionAssets implements OnInit {
  readonly collectionId = input.required<number>();
  private readonly images = inject(LibraryImageService);
  private readonly sounds = inject(LibrarySoundService);
  private readonly videos = inject(LibraryVideoService);
  private readonly prompts = inject(LibraryPromptService);
  private readonly languageService = inject(LanguageService);
  readonly library = inject(LibraryService);
  readonly assets = inject(LibraryCollectionAssetsService);
  readonly dialogs = inject(LibraryDialogsService);
  private readonly confirms = inject(LibraryConfirmService);
  readonly uploadMenuOpen = signal(false);
  readonly visible = computed(this.buildVisible.bind(this));
  readonly total = computed(this.buildTotal.bind(this));

  ngOnInit(): void {
    void this.images.ensureLoaded();
    void this.sounds.ensureLoaded();
    void this.videos.ensureLoaded();
    void this.prompts.ensureLoaded();
  }

  onQuery(event: Event): void {
    this.assets.query.set(fieldValue(event));
  }

  onSort(event: Event): void {
    this.assets.sort.set(fieldValue(event) as 'new' | 'name' | 'size');
  }

  setView(value: 'grid' | 'list'): void {
    this.library.setViewMode(value);
  }

  select(row: AssetRow): void {
    this.assets.select(this.collectionId(), row.ref);
  }

  open(row: AssetRow): void {
    this.select(row);
    this.dialogs.openPreviewRef(row.ref, this.visible().map(rowRef));
  }

  onRowKeydown(row: AssetRow, event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.open(row);
    }
    if (event.key === ' ') {
      event.preventDefault();
      this.select(row);
    }
  }

  toggleUploadMenu(): void {
    this.uploadMenuOpen.update((open) => !open);
  }

  openUpload(
    kind: 'image' | 'sound' | 'video' | 'prompt',
    mode: 'files' | 'write' = 'files',
  ): void {
    this.uploadMenuOpen.set(false);
    this.dialogs.openUpload([], kind, this.collectionId(), mode);
  }

  clearAllFilters(): void {
    this.assets.query.set('');
    this.library.clearFilters();
  }

  removeTagFilter(tag: string): void {
    this.library.toggleFilterTag(tag);
  }

  meta(row: AssetRow): string {
    if (row.video) {
      return videoMeta(row.video);
    }
    if (row.prompt) {
      return this.languageService.translate('library.prompt.chars', {
        count: charCount(row.prompt.text),
      });
    }
    return row.image
      ? dimensionsText(row.image)
      : row.sound
        ? durationText(row.sound.durationMs)
        : '—';
  }

  size(row: AssetRow): string {
    return formatBytes(row.size);
  }

  typeKey(row: AssetRow): LanguageKey {
    if (row.ref.kind === 'prompt') return 'library.kind.prompt';
    return row.ref.kind === 'image'
      ? 'library.kind.image'
      : row.ref.kind === 'sound'
        ? 'library.kind.sound'
        : 'library.kind.video';
  }

  typeIcon(row: AssetRow): string {
    if (row.ref.kind === 'prompt') return 'prompt';
    return row.ref.kind === 'image' ? 'image' : row.ref.kind === 'sound' ? 'music' : 'film';
  }

  collectionName(row: AssetRow): string {
    return row.collectionId === null
      ? '—'
      : (this.library.collectionById(row.collectionId)?.name ?? '—');
  }

  firstTags(row: AssetRow): string[] {
    return row.tags.slice(0, 2);
  }

  moreTags(row: AssetRow): number {
    return Math.max(0, row.tags.length - 2);
  }

  isSelected(row: AssetRow): boolean {
    const selected = this.assets.selectedRef(this.collectionId());
    return selected !== null && selected.kind === row.ref.kind && selected.id === row.ref.id;
  }

  hasActiveFilters(): boolean {
    return this.assets.query().trim().length > 0 || this.library.filterTags().length > 0;
  }

  @HostListener('document:keydown', ['$event'])
  onDeleteKey(event: KeyboardEvent): void {
    const selected = this.assets.selectedRef(this.collectionId());
    if (
      !isDeleteShortcut(event) ||
      selected === null ||
      this.dialogs.uploadOpen() ||
      this.isDialogOpen()
    ) {
      return;
    }
    if (selected.kind === 'image') this.confirms.deleteImages([selected.id]);
    else if (selected.kind === 'sound') this.confirms.deleteSounds([selected.id]);
    else if (selected.kind === 'video') this.confirms.deleteVideos([selected.id]);
    else this.confirms.deletePrompts([selected.id]);
  }

  private buildVisible(): AssetRow[] {
    return this.assets.rows(this.collectionId())();
  }

  private buildTotal(): number {
    return this.assets.allRows().filter(inCollection.bind(null, this.collectionId())).length;
  }

  private isDialogOpen(): boolean {
    return (
      this.dialogs.previewImageId() !== null ||
      this.dialogs.previewSoundId() !== null ||
      this.dialogs.previewVideoId() !== null ||
      this.dialogs.previewPromptId() !== null ||
      isModalOpen()
    );
  }
}
