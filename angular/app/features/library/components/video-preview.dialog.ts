import { Component, HostListener, QueryList, ViewChildren, computed, inject, signal } from "@angular/core";
import { Icon } from "@components/icon";
import { LanguageKey } from "@app/core/language/language.models";
import { CoreModule } from "@app/core/core.module";
import { LibraryDialogsService } from "../library.dialogs.service";
import { AssetRef, AssetRights } from "../library.models";
import { formatBytes, formatIsoMinute } from "../library.rules";
import { LibraryService } from "../library.service";
import { LibraryVideo } from "../library.videos.models";
import { videoCode, videoMeta } from "../library.videos.rules";
import { LibraryVideoService } from "../library.videos.service";

const RIGHTS_KEYS: Record<AssetRights, LanguageKey> = {
  own: "library.rights.own",
  licensed: "library.rights.licensed",
  free: "library.rights.free",
  other: "library.rights.other",
};

function sameId(id: number, video: LibraryVideo): boolean {
  return video.id === id;
}
function isVideoTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("video") !== null;
}

@Component({
  selector: "app-library-video-preview-dialog",
  standalone: true,
  imports: [Icon, CoreModule],
  templateUrl: "./video-preview.dialog.html",
  host: { "data-testid": "library-video-preview-dialog" },
})
export class LibraryVideoPreviewDialog {
  private readonly dialogs = inject(LibraryDialogsService);
  readonly videos = inject(LibraryVideoService);
  readonly library = inject(LibraryService);
  @ViewChildren("player") private readonly players!: QueryList<{
    nativeElement: HTMLVideoElement;
  }>;

  readonly video = computed(this.findVideo.bind(this));
  readonly open = computed(this.isOpen.bind(this));
  readonly position = computed(this.buildPosition.bind(this));
  readonly failedId = signal<number | null>(null);

  close(): void {
    this.stopPlayers();
    this.dialogs.closePreview();
  }

  previous(): void {
    this.move(-1);
  }
  next(): void {
    this.move(1);
  }
  hasPrevious(): boolean {
    return this.position().index > 0;
  }
  hasNext(): boolean {
    const position = this.position();
    return position.index >= 0 && position.index + 1 < position.total;
  }
  code(video: LibraryVideo): string {
    return videoCode(video.id);
  }
  parameters(video: LibraryVideo): string {
    return videoMeta(video);
  }
  size(video: LibraryVideo): string {
    return formatBytes(video.size);
  }
  added(video: LibraryVideo): string {
    return formatIsoMinute(video.createdAt);
  }
  rightsKey(rights: AssetRights): LanguageKey {
    return RIGHTS_KEYS[rights];
  }
  collectionName(video: LibraryVideo): string {
    return video.collectionId === null
      ? ""
      : (this.library.collectionById(video.collectionId)?.name ?? "\u2014");
  }
  hasCollection(video: LibraryVideo): boolean {
    return video.collectionId !== null;
  }
  playbackFailed(video: LibraryVideo): boolean {
    return this.failedId() === video.id;
  }
  onVideoError(video: LibraryVideo): void {
    this.failedId.set(video.id);
  }

  @HostListener("document:keydown", ["$event"])
  onKeydown(event: KeyboardEvent): void {
    if (!this.open()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return;
    }
    if (isVideoTarget(event.target)) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.previous();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      this.next();
    }
  }

  private findVideo(): LibraryVideo | null {
    const id = this.dialogs.previewVideoId();
    return id === null
      ? null
      : (this.videos.items().find(sameId.bind(null, id)) ?? null);
  }

  private isOpen(): boolean {
    return this.video() !== null;
  }

  private buildPosition(): { index: number; total: number } {
    const video = this.video();
    const sequence = this.sequence();
    return {
      index:
        video === null
          ? -1
          : sequence.findIndex(this.isVideoRef.bind(null, video.id)),
      total: sequence.length,
    };
  }

  private move(offset: number): void {
    const next = this.sequence()[this.position().index + offset];
    if (!next) return;
    this.stopPlayers();
    this.failedId.set(null);
    this.dialogs.openPreviewRef(next, this.sequence());
  }

  private stopPlayers(): void {
    for (const player of this.players ?? []) {
      player.nativeElement.pause();
      player.nativeElement.removeAttribute("src");
      player.nativeElement.load();
    }
  }

  private sequence(): AssetRef[] {
    return (
      this.dialogs.previewSequence() ?? this.videos.visible().map(this.toRef)
    );
  }
  private toRef(video: LibraryVideo): AssetRef {
    return { kind: "video", id: video.id };
  }
  private isVideoRef(id: number, ref: AssetRef): boolean {
    return ref.kind === "video" && ref.id === id;
  }
}
