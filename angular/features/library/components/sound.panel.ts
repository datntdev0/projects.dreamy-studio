import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { fieldValue } from '@shared/utils/dom';

import { LibraryConfirmService } from '../library.confirm.service';
import { LibraryDialogsService } from '../library.dialogs.service';
import { ASSET_RIGHTS, AssetPatch, AssetRights } from '../library.models';
// prettier-ignore
import { clearTagField, enteredTag, formatBytes, formatIsoMinute, libraryErrorKey, rightsKey } from '../library.rules';
import { LibraryService } from '../library.service';
import { LibrarySound } from '../library.sounds.models';
import { audioText, durationText, soundCode } from '../library.sounds.rules';
import { LibrarySoundService } from '../library.sounds.service';

const MAX_TAGS = 12;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-sound-panel',
  imports: [Icon, CoreModule],
  templateUrl: './sound.panel.html',
  host: { 'data-testid': 'library-sound-panel' },
})
export class LibrarySoundPanel {
  readonly soundId = input<number | undefined>();
  readonly sounds = inject(LibrarySoundService);
  readonly library = inject(LibraryService);
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly confirms = inject(LibraryConfirmService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  readonly rightOptions = ASSET_RIGHTS;
  readonly sound = computed(this.resolveSound.bind(this));
  rightKey(right: AssetRights): LanguageKey {
    return rightsKey(right);
  }
  code(sound: LibrarySound): string {
    return soundCode(sound.id);
  }
  duration(sound: LibrarySound): string {
    return durationText(sound.durationMs);
  }
  audio(sound: LibrarySound): string {
    return audioText(sound);
  }
  size(sound: LibrarySound): string {
    return formatBytes(sound.size);
  }
  addedAt(sound: LibrarySound): string {
    return formatIsoMinute(sound.createdAt);
  }
  originKey(sound: LibrarySound): LanguageKey {
    return sound.origin === 'app' ? 'library.origin.app' : 'library.origin.upload';
  }
  nameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
    }
  }
  nameBlur(sound: LibrarySound, event: Event): void {
    const field = event.target as HTMLInputElement;
    const name = field.value.trim();
    if (!name || name === sound.name) {
      field.value = sound.name;
      return;
    }
    void this.rename(sound, name);
  }
  removeTag(sound: LibrarySound, tag: string): void {
    void this.save(sound, { tags: sound.tags.filter((value) => value !== tag) });
  }
  addTag(sound: LibrarySound, event: KeyboardEvent): void {
    const tag = enteredTag(event);
    if (!tag) {
      return;
    }
    if (sound.tags.includes(tag)) {
      this.toasts.show(
        this.languageService.translate('library.sound.toast.tagExists', { tag }),
        'warning',
      );
      return;
    }
    if (sound.tags.length >= MAX_TAGS) {
      this.toasts.show(this.languageService.translate('library.sound.toast.tagLimit'), 'warning');
      return;
    }
    clearTagField(event);
    void this.save(sound, { tags: [...sound.tags, tag] });
  }
  setCollection(sound: LibrarySound, event: Event): void {
    const value = fieldValue(event);
    if (value === '__new') {
      this.dialogs.openCreateCollection();
      return;
    }
    const collectionId = value ? Number(value) : null;
    if (collectionId !== sound.collectionId) {
      void this.save(sound, { collectionId });
    }
  }
  setRights(sound: LibrarySound, event: Event): void {
    const rights = fieldValue(event) as AssetRights;
    if (rights !== sound.rights) {
      void this.save(sound, { rights });
    }
  }
  remove(sound: LibrarySound): void {
    this.confirms.deleteSounds([sound.id]);
  }
  private async rename(sound: LibrarySound, name: string): Promise<void> {
    try {
      const updated = await this.sounds.update(sound.id, { name });
      if (updated.name !== name) {
        this.toasts.show(
          this.languageService.translate('library.sound.toast.renamed', { name: updated.name }),
          'warning',
        );
      } else {
        this.toasts.show(this.languageService.translate('library.sound.toast.updated'));
      }
    } catch (cause) {
      this.notifyFailure(cause);
    }
  }
  private async save(sound: LibrarySound, patch: AssetPatch): Promise<void> {
    try {
      await this.sounds.update(sound.id, patch);
      this.toasts.show(this.languageService.translate('library.sound.toast.updated'));
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
  private resolveSound(): LibrarySound | null {
    const id = this.soundId();
    return id === undefined
      ? this.sounds.selected()
      : (this.sounds.items().find((sound) => sound.id === id) ?? null);
  }
}
