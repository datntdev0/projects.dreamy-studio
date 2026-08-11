import { Component, HostListener, computed, effect, inject, signal, untracked } from "@angular/core";
import { Button } from "../../../../components/button";
import { Dialog } from "../../../../components/dialog";
import { Icon } from "../../../../components/icon";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { LibraryDialogsService } from "../library.dialogs.service";
import { ImageRights, LibraryImage } from "../library.images.models";
import { dimensionsText, formatBytes, imageCode } from "../library.images.rules";
import { LibraryImageService } from "../library.images.service";
import { LibraryService } from "../library.service";

const RIGHTS_KEYS: Record<ImageRights, I18nKey> = {
  own: "library.image.rights.own",
  licensed: "library.image.rights.licensed",
  free: "library.image.rights.free",
  other: "library.image.rights.other",
};

function sameId(id: number, image: LibraryImage): boolean {
  return image.id === id;
}

@Component({
  selector: "app-library-image-preview-dialog",
  standalone: true,
  imports: [Button, Dialog, Icon, I18nPipe],
  templateUrl: "./image-preview.dialog.html",
  host: { "data-testid": "library-image-preview-dialog" },
})
export class LibraryImagePreviewDialog {
  private readonly images = inject(LibraryImageService);
  private readonly library = inject(LibraryService);
  private readonly dialogs = inject(LibraryDialogsService);
  private readToken = 0;

  readonly image = computed(this.findImage.bind(this));
  readonly open = computed(this.isOpen.bind(this));
  readonly source = signal<string | null>(null);
  readonly position = computed(this.buildPosition.bind(this));

  constructor() {
    effect(this.syncPreview.bind(this));
  }

  close(): void {
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

  code(image: LibraryImage): string {
    return imageCode(image.id);
  }

  dimensions(image: LibraryImage): string {
    return dimensionsText(image);
  }

  size(image: LibraryImage): string {
    return formatBytes(image.size);
  }

  added(image: LibraryImage): string {
    return image.createdAt.slice(0, 10);
  }

  rightsKey(rights: ImageRights): I18nKey {
    return RIGHTS_KEYS[rights];
  }

  collectionName(image: LibraryImage): string {
    return image.collectionId === null ? "" : this.library.collectionById(image.collectionId)?.name ?? "—";
  }

  hasCollection(image: LibraryImage): boolean {
    return image.collectionId !== null;
  }

  @HostListener("document:keydown", ["$event"])
  onKeydown(event: KeyboardEvent): void {
    if (!this.open()) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.previous();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      this.next();
    }
  }

  private findImage(): LibraryImage | null {
    const id = this.dialogs.previewImageId();
    return id === null ? null : this.images.items().find(sameId.bind(null, id)) ?? null;
  }

  private isOpen(): boolean {
    return this.image() !== null;
  }

  private buildPosition(): { index: number; total: number } {
    const image = this.image();
    const visible = this.images.visible();
    return { index: image === null ? -1 : visible.findIndex(sameId.bind(null, image.id)), total: visible.length };
  }

  private syncPreview(): void {
    const id = this.dialogs.previewImageId();
    untracked(this.startRead.bind(this, id));
  }

  private startRead(id: number | null): void {
    const token = ++this.readToken;
    this.source.set(null);
    if (id !== null) {
      void this.readImage(id, token);
    }
  }

  private async readImage(id: number, token: number): Promise<void> {
    try {
      const source = await this.images.read(id);
      if (token === this.readToken && this.dialogs.previewImageId() === id) {
        this.source.set(source);
      }
    } catch {
      return;
    }
  }

  private move(offset: number): void {
    const position = this.position();
    const next = this.images.visible()[position.index + offset];
    if (!next) {
      return;
    }
    this.images.select(next.id);
    this.dialogs.openPreview(next.id);
  }
}
