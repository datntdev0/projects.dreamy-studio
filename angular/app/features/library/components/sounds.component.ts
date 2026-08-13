import { Component, HostListener, OnDestroy, OnInit, inject, signal } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { DesktopDragDropEvent, DesktopIpcService, DesktopUnlisten } from "../../../core/desktop/desktop-ipc.service";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { LibraryDialogsService } from "../library.dialogs.service";
import { AssetRef } from "../library.models";
import { formatBytes } from "../library.rules";
import { LibraryService } from "../library.service";
import { LibrarySound, SoundSort } from "../library.sounds.models";
import { durationText } from "../library.sounds.rules";
import { LibrarySoundService } from "../library.sounds.service";
import { LibrarySoundMedia } from "./sound-media.component";
import { LibrarySoundPlay } from "./sound-play.component";

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
  imports: [Icon, I18nPipe, LibrarySoundMedia, LibrarySoundPlay],
  templateUrl: "./sounds.component.html",
  host: { "data-testid": "library-sounds" },
})
export class LibrarySounds implements OnInit, OnDestroy {
  private readonly ipc = inject(DesktopIpcService);
  readonly sounds = inject(LibrarySoundService);
  readonly library = inject(LibraryService);
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

  firstTags(sound: LibrarySound): string[] {
    return sound.tags.slice(0, 2);
  }

  moreTags(sound: LibrarySound): number {
    return Math.max(0, sound.tags.length - 2);
  }

  isSelected(sound: LibrarySound): boolean {
    return this.sounds.selectedId() === sound.id;
  }

  hasActiveFilters(): boolean {
    return this.sounds.query().trim().length > 0 || this.library.filtersActive();
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
