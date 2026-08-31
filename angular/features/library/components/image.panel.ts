import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { fieldValue } from '@shared/utils/dom';

import { LibraryConfirmService } from '../library.confirm.service';
import { LibraryDialogsService } from '../library.dialogs.service';
import { IMAGE_RIGHTS, ImagePatch, ImageRights, LibraryImage } from '../library.images.models';
// prettier-ignore
import { formatBytes, imageCode, imageInspectorDimensionsText, imageInspectorFormatText } from '../library.images.rules';
import { LibraryImageService } from '../library.images.service';
// prettier-ignore
import { clearTagField, enteredTag, formatIsoMinute, libraryErrorKey, rightsKey } from '../library.rules';
import { LibraryService } from '../library.service';

const MAX_TAGS = 12;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-image-panel',
  imports: [Icon, CoreModule],
  templateUrl: './image.panel.html',
  host: { 'data-testid': 'library-image-panel' },
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
    return rightsKey(right);
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
    return image.origin === 'app' ? 'library.origin.app' : 'library.origin.upload';
  }

  size(image: LibraryImage): string {
    return formatBytes(image.size);
  }

  nameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
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
    const tag = enteredTag(event);
    if (!tag) {
      return;
    }
    if (image.tags.includes(tag)) {
      this.toasts.show(
        this.languageService.translate('library.image.toast.tagExists', { tag }),
        'warning',
      );
      return;
    }
    if (image.tags.length >= MAX_TAGS) {
      this.toasts.show(this.languageService.translate('library.image.toast.tagLimit'), 'warning');
      return;
    }
    clearTagField(event);
    void this.save(image, { tags: [...image.tags, tag] });
  }

  setCollection(image: LibraryImage, event: Event): void {
    const value = fieldValue(event);
    if (value === '__new') {
      this.dialogs.openCreateCollection();
      return;
    }
    const collectionId = value ? Number(value) : null;
    if (collectionId !== image.collectionId) {
      void this.save(image, { collectionId });
    }
  }

  setRights(image: LibraryImage, event: Event): void {
    const rights = fieldValue(event) as ImageRights;
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
        this.toasts.show(
          this.languageService.translate('library.image.toast.renamed', { name: updated.name }),
          'warning',
        );
      } else {
        this.toasts.show(this.languageService.translate('library.image.toast.updated'));
      }
    } catch (cause) {
      this.notifyFailure(cause);
    }
  }

  private async save(image: LibraryImage, patch: ImagePatch): Promise<void> {
    try {
      await this.images.update(image.id, patch);
      this.toasts.show(this.languageService.translate('library.image.toast.updated'));
    } catch (cause) {
      this.notifyFailure(cause);
    }
  }

  private notifyFailure(cause: unknown): void {
    this.toasts.show(
      this.languageService.translate(libraryErrorKey(cause) as LanguageKey),
      'danger',
    );
  }

  private resolveImage(): LibraryImage | null {
    const id = this.imageId();
    return id === undefined
      ? this.images.selected()
      : (this.images.items().find((image) => image.id === id) ?? null);
  }
}
