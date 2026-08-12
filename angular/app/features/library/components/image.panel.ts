import { Component, inject } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nService } from "../../../core/i18n/i18n.service";
import { ToastService } from "../../../core/toast/toast.service";
import { ImagePatch } from "../library.images.models";
import { ImageRights } from "../library.images.models";
import { IMAGE_RIGHTS } from "../library.images.models";
import { LibraryImage } from "../library.images.models";
import { dimensionsText } from "../library.images.rules";
import { formatBytes } from "../library.images.rules";
import { imageCode } from "../library.images.rules";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryImageService } from "../library.images.service";
import { normalizeTag } from "../library.rules";
import { libraryErrorKey } from "../library.rules";
import { LibraryService } from "../library.service";
import { LibraryImageThumb } from "./image-thumb.component";

const MAX_TAGS = 12;

const RIGHTS_KEYS: Record<ImageRights, I18nKey> = {
  own: "library.rights.own",
  licensed: "library.rights.licensed",
  free: "library.rights.free",
  other: "library.rights.other",
};

@Component({
  selector: "app-library-image-panel",
  standalone: true,
  imports: [Icon, I18nPipe, LibraryImageThumb],
  templateUrl: "./image.panel.html",
  host: { "data-testid": "library-image-panel" },
})
export class LibraryImagePanel {
  readonly images = inject(LibraryImageService);
  readonly library = inject(LibraryService);
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly i18n = inject(I18nService);
  private readonly toasts = inject(ToastService);
  readonly rightOptions = IMAGE_RIGHTS;

  rightKey(right: ImageRights): I18nKey {
    return RIGHTS_KEYS[right];
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

  nameKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
    }
  }

  nameBlur(image: LibraryImage, event: Event): void {
    const field = event.target as HTMLInputElement;
    const name = field.value.trim();
    if (!name || name === image.name) {
      field.value = image.name;
      return;
    }
    void this.rename(image, name);
  }

  removeTag(image: LibraryImage, tag: string): void {
    void this.save(image, { tags: image.tags.filter((value) => value !== tag) });
  }

  addTag(image: LibraryImage, event: KeyboardEvent): void {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const field = event.target as HTMLInputElement;
    const tag = normalizeTag(field.value);
    if (!tag) {
      return;
    }
    if (image.tags.includes(tag)) {
      this.toasts.show(this.i18n.translate("library.image.toast.tagExists", { tag }), "warning");
      return;
    }
    if (image.tags.length >= MAX_TAGS) {
      this.toasts.show(this.i18n.translate("library.image.toast.tagLimit"), "warning");
      return;
    }
    field.value = "";
    void this.save(image, { tags: [...image.tags, tag] });
  }

  setCollection(image: LibraryImage, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === "__new") {
      this.dialogs.openCreateCollection();
      return;
    }
    const collectionId = value ? Number(value) : null;
    if (collectionId !== image.collectionId) {
      void this.save(image, { collectionId });
    }
  }

  setRights(image: LibraryImage, event: Event): void {
    const rights = (event.target as HTMLSelectElement).value as ImageRights;
    if (rights !== image.rights) {
      void this.save(image, { rights });
    }
  }

  view(image: LibraryImage): void {
    this.dialogs.openPreview(image.id);
  }

  remove(image: LibraryImage): void {
    this.dialogs.openDeleteImages([image.id]);
  }

  private async rename(image: LibraryImage, name: string): Promise<void> {
    try {
      const updated = await this.images.update(image.id, { name });
      if (updated.name !== name) {
        this.toasts.show(this.i18n.translate("library.image.toast.renamed", { name: updated.name }), "warning");
      } else {
        this.toasts.show(this.i18n.translate("library.image.toast.updated"));
      }
    } catch (cause) {
      this.notifyFailure(cause);
    }
  }

  private async save(image: LibraryImage, patch: ImagePatch): Promise<void> {
    try {
      await this.images.update(image.id, patch);
      this.toasts.show(this.i18n.translate("library.image.toast.updated"));
    } catch (cause) {
      this.notifyFailure(cause);
    }
  }

  private notifyFailure(cause: unknown): void {
    this.toasts.show(this.i18n.translate(libraryErrorKey(cause) as I18nKey), "danger");
  }
}
