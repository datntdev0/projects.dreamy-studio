import { Component, computed, inject, input } from "@angular/core";
import { Icon } from "@components/icon";
import { LanguageKey } from "@app/core/language/language.models";
import { LanguagePipe } from "@app/core/language/language.pipe";
import { LanguageService } from "@app/core/language/language.service";
import { ToastService } from "@app/core/toast/toast.service";
import { ImagePatch } from "../library.images.models";
import { ImageRights } from "../library.images.models";
import { IMAGE_RIGHTS } from "../library.images.models";
import { LibraryImage } from "../library.images.models";
import { imageInspectorDimensionsText } from "../library.images.rules";
import { imageInspectorFormatText } from "../library.images.rules";
import { formatBytes } from "../library.images.rules";
import { imageCode } from "../library.images.rules";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryConfirmService } from "../library.confirm.service";
import { LibraryImageService } from "../library.images.service";
import { normalizeTag } from "../library.rules";
import { libraryErrorKey } from "../library.rules";
import { formatIsoMinute } from "../library.rules";
import { LibraryService } from "../library.service";

const MAX_TAGS = 12;

const RIGHTS_KEYS: Record<ImageRights, LanguageKey> = {
  own: "library.rights.own",
  licensed: "library.rights.licensed",
  free: "library.rights.free",
  other: "library.rights.other",
};

@Component({
  selector: "app-library-image-panel",
  standalone: true,
  imports: [Icon, LanguagePipe],
  templateUrl: "./image.panel.html",
  host: { "data-testid": "library-image-panel" },
})
export class LibraryImagePanel {
  readonly imageId = input<number | undefined>();
  readonly images = inject(LibraryImageService);
  readonly library = inject(LibraryService);
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly confirms = inject(LibraryConfirmService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  readonly rightOptions = IMAGE_RIGHTS;
  readonly image = computed(this.resolveImage.bind(this));

  rightKey(right: ImageRights): LanguageKey {
    return RIGHTS_KEYS[right];
  }

  code(image: LibraryImage): string {
    return imageCode(image.id);
  }

  dimensions(image: LibraryImage): string {
    return imageInspectorDimensionsText(image);
  }

  format(image: LibraryImage): string {
    return imageInspectorFormatText(image);
  }

  addedAt(image: LibraryImage): string {
    return formatIsoMinute(image.createdAt);
  }

  originKey(image: LibraryImage): LanguageKey {
    return image.origin === "app" ? "library.origin.app" : "library.origin.upload";
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
      this.toasts.show(this.languageService.translate("library.image.toast.tagExists", { tag }), "warning");
      return;
    }
    if (image.tags.length >= MAX_TAGS) {
      this.toasts.show(this.languageService.translate("library.image.toast.tagLimit"), "warning");
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

  remove(image: LibraryImage): void {
    this.confirms.deleteImages([image.id]);
  }

  private async rename(image: LibraryImage, name: string): Promise<void> {
    try {
      const updated = await this.images.update(image.id, { name });
      if (updated.name !== name) {
        this.toasts.show(this.languageService.translate("library.image.toast.renamed", { name: updated.name }), "warning");
      } else {
        this.toasts.show(this.languageService.translate("library.image.toast.updated"));
      }
    } catch (cause) {
      this.notifyFailure(cause);
    }
  }

  private async save(image: LibraryImage, patch: ImagePatch): Promise<void> {
    try {
      await this.images.update(image.id, patch);
      this.toasts.show(this.languageService.translate("library.image.toast.updated"));
    } catch (cause) {
      this.notifyFailure(cause);
    }
  }

  private notifyFailure(cause: unknown): void {
    this.toasts.show(this.languageService.translate(libraryErrorKey(cause) as LanguageKey), "danger");
  }

  private resolveImage(): LibraryImage | null {
    const id = this.imageId();
    return id === undefined ? this.images.selected() : this.images.items().find((image) => image.id === id) ?? null;
  }
}
