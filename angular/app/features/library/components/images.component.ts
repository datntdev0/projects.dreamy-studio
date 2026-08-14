import { Component, HostListener, OnDestroy, OnInit, inject, signal } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { DesktopDragDropEvent, DesktopIpcService, DesktopUnlisten } from "../../../core/desktop/desktop-ipc.service";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { LibraryDialogsService } from "../library.dialogs.service";
import { IMAGE_RATIOS, ImageSort, ImageViewMode, LibraryImage } from "../library.images.models";
import { dimensionsText, formatBytes } from "../library.images.rules";
import { LibraryImageService } from "../library.images.service";
import { LibraryService } from "../library.service";
import { LibraryImageThumb } from "./image-thumb.component";

const FIELD_SELECTOR = "input,textarea,select";

function isField(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(FIELD_SELECTOR) !== null;
}

@Component({
  selector: "app-library-images",
  standalone: true,
  imports: [Icon, I18nPipe, LibraryImageThumb],
  templateUrl: "./images.component.html",
})
export class LibraryImages implements OnInit, OnDestroy {
  private readonly ipc = inject(DesktopIpcService);
  readonly images = inject(LibraryImageService);
  readonly library = inject(LibraryService);
  readonly dialogs = inject(LibraryDialogsService);
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
    this.images.query.set((event.target as HTMLInputElement).value);
  }

  onSort(event: Event): void {
    this.images.sort.set((event.target as HTMLSelectElement).value as ImageSort);
  }

  onGridSize(event: Event): void {
    this.images.setGridSize(Number((event.target as HTMLInputElement).value));
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
    if (event.key === "Enter") {
      event.preventDefault();
      this.open(image);
    }
    if (event.key === " ") {
      event.preventDefault();
      this.select(image);
    }
  }

  openUpload(): void {
    this.dialogs.openUpload();
  }

  clearAllFilters(): void {
    this.images.query.set("");
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
      return "—";
    }
    return this.library.collectionById(image.collectionId)?.name ?? "—";
  }

  collectionFilterName(): string {
    const filter = this.library.filterCollection();
    return typeof filter === "number" ? this.library.collectionById(filter)?.name ?? "—" : "";
  }

  collectionFilterIsKey(): boolean {
    return this.library.filterCollection() === "none";
  }

  unfiledKey(): I18nKey {
    return "library.explorer.filters.unfiled";
  }

  formatBytes(value: number): string {
    return formatBytes(value);
  }

  dimensions(image: LibraryImage): string {
    return dimensionsText(image);
  }

  ratioIcon(value: string): string {
    return `ratio-${value.replace("/", "-")}`;
  }

  isSelected(image: LibraryImage): boolean {
    return this.images.selectedId() === image.id;
  }

  hasActiveFilters(): boolean {
    return this.images.query().trim().length > 0 || this.library.filtersActive();
  }

  @HostListener("document:keydown", ["$event"])
  onDeleteKey(event: KeyboardEvent): void {
    const id = this.images.selectedId();
    if (event.key !== "Delete" || isField(event.target) || id === null || this.dialogs.uploadOpen() || this.isDialogOpen()) {
      return;
    }
    this.dialogs.openDeleteImages([id]);
  }

  private async listenForDrops(): Promise<void> {
    this.unlisten = await this.ipc.onDragDrop(this.handleDragDrop.bind(this));
  }

  private handleDragDrop(event: DesktopDragDropEvent): void {
    if (this.dialogs.uploadOpen()) {
      this.dragging.set(false);
      return;
    }
    if (event.type === "enter" || event.type === "over") {
      this.dragging.set(true);
      return;
    }
    if (event.type === "leave") {
      this.dragging.set(false);
      return;
    }
    if (event.type === "drop") {
      this.dragging.set(false);
      this.dialogs.openUpload(event.paths);
    }
  }

  private isDialogOpen(): boolean {
    return this.dialogs.previewImageId() !== null || this.dialogs.deleteImageIds().length > 0 || document.querySelector(".modal") !== null;
  }
}
