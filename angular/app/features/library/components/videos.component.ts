import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from "@angular/core";
import { Datatable, DatatableCell, DatatableColumn, DatatableRowEvent } from "@components/datatable";
import { Icon } from "@components/icon";
import { Slider } from "@components/slider";
import {
  DesktopDragDropEvent,
  DesktopIpcService,
  DesktopUnlisten,
} from "@app/core/desktop/desktop-ipc.service";
import { I18nKey } from "@app/core/i18n/i18n.models";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { I18nService } from "@app/core/i18n/i18n.service";
import { LibraryDialogsService } from "../library.dialogs.service";
import { AssetRef, ASSET_RATIOS } from "../library.models";
import { formatBytes } from "../library.rules";
import { LibraryService } from "../library.service";
import { LibraryVideo, VideoSort } from "../library.videos.models";
import { videoMeta } from "../library.videos.rules";
import { LibraryVideoService } from "../library.videos.service";
import { LibraryVideoMedia } from "./video-media.component";
import { LibraryVideoThumb } from "./video-thumb.component";

const FIELD_SELECTOR = "input,textarea,select";

function isField(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(FIELD_SELECTOR) !== null;
}
function toAssetRef(video: LibraryVideo): AssetRef {
  return { kind: "video", id: video.id };
}

@Component({
  selector: "app-library-videos",
  standalone: true,
  imports: [Datatable, DatatableCell, Icon, I18nPipe, LibraryVideoMedia, LibraryVideoThumb, Slider],
  templateUrl: "./videos.component.html",
  host: { "data-testid": "library-videos" },
})
export class LibraryVideos implements OnInit, OnDestroy {
  private readonly ipc = inject(DesktopIpcService);
  readonly videos = inject(LibraryVideoService);
  readonly library = inject(LibraryService);
  private readonly i18n = inject(I18nService);
  readonly dialogs = inject(LibraryDialogsService);
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
    this.videos.query.set((event.target as HTMLInputElement).value);
  }
  onSort(event: Event): void {
    this.videos.sort.set(
      (event.target as HTMLSelectElement).value as VideoSort,
    );
  }
  onGridSize(value: number): void {
    this.videos.setGridSize(value);
  }
  setRatio(value: string): void {
    this.videos.setGridRatio(value);
  }
  setView(value: "grid" | "list"): void {
    this.library.setViewMode(value);
  }
  select(video: LibraryVideo): void {
    this.videos.select(video.id);
  }

  open(video: LibraryVideo): void {
    this.select(video);
    this.dialogs.openVideoPreview(
      video.id,
      this.videos.visible().map(toAssetRef),
    );
  }

  onVideoKeydown(video: LibraryVideo, event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      this.open(video);
    }
    if (event.key === " ") {
      event.preventDefault();
      this.select(video);
    }
  }

  openUpload(): void {
    this.dialogs.openUpload([], "video");
  }
  clearAllFilters(): void {
    this.videos.query.set("");
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
    return (
      this.videos.query().trim().length > 0 || this.library.filtersActive()
    );
  }
  collectionName(video: LibraryVideo): string {
    return video.collectionId === null
      ? "\u2014"
      : (this.library.collectionById(video.collectionId)?.name ?? "\u2014");
  }
  collectionFilterName(): string {
    const filter = this.library.filterCollection();
    return typeof filter === "number"
      ? (this.library.collectionById(filter)?.name ?? "\u2014")
      : "";
  }
  collectionFilterIsKey(): boolean {
    return this.library.filterCollection() === "none";
  }
  unfiledKey(): I18nKey {
    return "library.explorer.filters.unfiled";
  }
  ratioIcon(value: string): string {
    return `ratio-${value.replace("/", "-")}`;
  }

  readonly tableRowClass = (row: object): Record<string, boolean> => ({ "is-selected": this.isSelected(this.videoOf(row)) });

  get tableColumns(): DatatableColumn[] {
    return [
      { key: "name", label: this.i18n.translate("library.image.column.name") },
      { key: "spec", label: this.i18n.translate("library.image.info.specs"), width: "170px" },
      { key: "size", label: this.i18n.translate("library.image.column.size"), align: "right", width: "110px" },
      { key: "collection", label: this.i18n.translate("library.image.column.collection"), width: "180px", ellipsis: true },
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

  @HostListener("document:keydown", ["$event"])
  onDeleteKey(event: KeyboardEvent): void {
    const id = this.videos.selectedId();
    if (
      event.key !== "Delete" ||
      isField(event.target) ||
      id === null ||
      this.dialogs.uploadOpen() ||
      this.isDialogOpen()
    )
      return;
    this.dialogs.openDeleteVideos([id]);
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
      this.dialogs.openUpload(event.paths, "video");
    }
  }

  private isDialogOpen(): boolean {
    return (
      this.dialogs.previewVideoId() !== null ||
      this.dialogs.deleteVideoIds().length > 0 ||
      document.querySelector(".modal") !== null
    );
  }
}
