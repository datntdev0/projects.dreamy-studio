import { Component, HostListener, OnDestroy, OnInit, inject, signal } from "@angular/core";
import { Datatable, DatatableCell, DatatableColumn, DatatableRowEvent } from "@components/datatable";
import { Icon } from "@components/icon";
import { DesktopDragDropEvent, DesktopIpcService, DesktopUnlisten } from "@app/core/desktop/desktop-ipc.service";
import { I18nKey } from "@app/core/i18n/i18n.models";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { I18nService } from "@app/core/i18n/i18n.service";
import { LibraryDialogsService } from "../library.dialogs.service";
import { AssetRef } from "../library.models";
import { formatBytes } from "../library.rules";
import { LibraryService } from "../library.service";
import { LibrarySound, SoundSort } from "../library.sounds.models";
import { durationText } from "../library.sounds.rules";
import { LibrarySoundService } from "../library.sounds.service";
import { LibrarySoundMedia } from "./sound-media.component";

const FIELD_SELECTOR = "input,textarea,select";

function isField(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(FIELD_SELECTOR) !== null;
}

function toAssetRef(sound: LibrarySound): AssetRef {
  return { kind: "sound", id: sound.id };
}

@Component({
  selector: "app-library-sounds",
  standalone: true,
  imports: [Datatable, DatatableCell, Icon, I18nPipe, LibrarySoundMedia],
  templateUrl: "./sounds.component.html",
  host: { "data-testid": "library-sounds" },
})
export class LibrarySounds implements OnInit, OnDestroy {
  private readonly ipc = inject(DesktopIpcService);
  readonly sounds = inject(LibrarySoundService);
  readonly library = inject(LibraryService);
  private readonly i18n = inject(I18nService);
  readonly dialogs = inject(LibraryDialogsService);
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
    this.sounds.query.set((event.target as HTMLInputElement).value);
  }

  onSort(event: Event): void {
    this.sounds.sort.set((event.target as HTMLSelectElement).value as SoundSort);
  }

  setView(value: "grid" | "list"): void {
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
    if (event.key === "Enter") {
      event.preventDefault();
      this.open(sound);
    }
    if (event.key === " ") {
      event.preventDefault();
      this.select(sound);
    }
  }

  openUpload(): void {
    this.dialogs.openUpload([], "sound");
  }

  clearAllFilters(): void {
    this.sounds.query.set("");
    this.library.clearFilters();
  }

  removeCollectionFilter(): void {
    this.library.setFilterCollection(null);
  }

  removeTagFilter(tag: string): void {
    this.library.toggleFilterTag(tag);
  }

  collectionName(sound: LibrarySound): string {
    return sound.collectionId === null ? "—" : this.library.collectionById(sound.collectionId)?.name ?? "—";
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

  readonly tableRowClass = (row: object): Record<string, boolean> => ({ "is-selected": this.isSelected(this.soundOf(row)) });

  get tableColumns(): DatatableColumn[] {
    return [
      { key: "name", label: this.i18n.translate("library.image.column.name") },
      { key: "spec", label: this.i18n.translate("library.sound.column.spec"), width: "120px" },
      { key: "size", label: this.i18n.translate("library.image.column.size"), align: "right", width: "110px" },
      { key: "collection", label: this.i18n.translate("library.image.column.collection"), width: "180px", ellipsis: true },
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

  @HostListener("document:keydown", ["$event"])
  onDeleteKey(event: KeyboardEvent): void {
    const id = this.sounds.selectedId();
    if (event.key !== "Delete" || isField(event.target) || id === null || this.dialogs.uploadOpen() || this.isDialogOpen()) {
      return;
    }
    this.dialogs.openDeleteSounds([id]);
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
      this.dialogs.openUpload(event.paths, "sound");
    }
  }

  private isDialogOpen(): boolean {
    return this.dialogs.previewSoundId() !== null || this.dialogs.deleteSoundIds().length > 0 || document.querySelector(".modal") !== null;
  }
}
