import { Component, computed, inject, signal } from "@angular/core";
import { Button } from "../../../../components/button";
import { Dialog } from "../../../../components/dialog";
import { Icon } from "../../../../components/icon";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nService } from "../../../core/i18n/i18n.service";
import { ToastService } from "../../../core/toast/toast.service";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryImage } from "../library.images.models";
import { imageCode } from "../library.images.rules";
import { LibraryImageService } from "../library.images.service";
import { libraryErrorKey } from "../library.rules";
import { LibraryImageThumb } from "./image-thumb.component";

const PREVIEW_LIMIT = 8;

@Component({
  selector: "app-library-image-delete-dialog",
  standalone: true,
  imports: [Button, Dialog, Icon, I18nPipe, LibraryImageThumb],
  templateUrl: "./image-delete.dialog.html",
  host: { "data-testid": "library-image-delete-dialog" },
})
export class LibraryImageDeleteDialog {
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly i18n = inject(I18nService);
  private readonly images = inject(LibraryImageService);
  private readonly toasts = inject(ToastService);

  readonly ids = this.dialogs.deleteImageIds;
  readonly items = computed(this.buildItems.bind(this));
  readonly previewItems = computed(this.buildPreviewItems.bind(this));
  readonly busy = signal(false);

  close(): void {
    this.dialogs.closeDeleteImages();
  }

  async confirm(): Promise<void> {
    const ids = this.ids();
    const item = this.items()[0];
    if (!ids.length || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      const count = await this.images.remove(ids);
      this.close();
      this.showSuccess(item, count);
    } catch (cause) {
      this.toasts.show(this.i18n.translate(libraryErrorKey(cause) as I18nKey), "danger");
    } finally {
      this.busy.set(false);
    }
  }

  titleKey(): I18nKey {
    return this.ids().length === 1 ? "library.imageDelete.title.one" : "library.imageDelete.title.other";
  }

  confirmKey(): I18nKey {
    return this.ids().length === 1 ? "library.imageDelete.confirm.one" : "library.imageDelete.confirm.other";
  }

  moreCount(): number {
    return this.items().length - this.previewItems().length;
  }

  code(image: LibraryImage): string {
    return imageCode(image.id);
  }

  private buildItems(): LibraryImage[] {
    const ids = new Set(this.ids());
    return this.images.items().filter(this.hasId.bind(this, ids));
  }

  private buildPreviewItems(): LibraryImage[] {
    return this.items().slice(0, PREVIEW_LIMIT);
  }

  private hasId(ids: Set<number>, image: LibraryImage): boolean {
    return ids.has(image.id);
  }

  private showSuccess(item: LibraryImage | undefined, count: number): void {
    if (count === 1 && item) {
      this.toasts.show(this.i18n.translate("library.image.toast.deleted.one", { name: item.name }));
      return;
    }
    this.toasts.show(this.i18n.translate("library.image.toast.deleted.other", { count }));
  }
}
