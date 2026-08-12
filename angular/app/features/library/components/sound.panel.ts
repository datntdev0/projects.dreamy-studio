import { Component, computed, inject, input } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nService } from "../../../core/i18n/i18n.service";
import { ToastService } from "../../../core/toast/toast.service";
import { LibraryDialogsService } from "../library.dialogs.service";
import { AssetPatch, AssetRights, ASSET_RIGHTS } from "../library.models";
import { formatBytes, libraryErrorKey, normalizeTag } from "../library.rules";
import { LibraryService } from "../library.service";
import { LibrarySound } from "../library.sounds.models";
import { audioText, durationText, soundCode } from "../library.sounds.rules";
import { LibrarySoundService } from "../library.sounds.service";
import { LibrarySoundPlay } from "./sound-play.component";
import { LibrarySoundTime } from "./sound-time.component";
import { LibrarySoundWave } from "./sound-wave.component";

const MAX_TAGS = 12;

const RIGHTS_KEYS: Record<AssetRights, I18nKey> = {
  own: "library.rights.own",
  licensed: "library.rights.licensed",
  free: "library.rights.free",
  other: "library.rights.other",
};

@Component({ selector: "app-library-sound-panel", standalone: true, imports: [Icon, I18nPipe, LibrarySoundPlay, LibrarySoundTime, LibrarySoundWave], templateUrl: "./sound.panel.html", host: { "data-testid": "library-sound-panel" } })
export class LibrarySoundPanel {
  readonly soundId = input<number | undefined>();
  readonly sounds = inject(LibrarySoundService);
  readonly library = inject(LibraryService);
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly i18n = inject(I18nService);
  private readonly toasts = inject(ToastService);
  readonly rightOptions = ASSET_RIGHTS;
  readonly sound = computed(this.resolveSound.bind(this));
  rightKey(right: AssetRights): I18nKey { return RIGHTS_KEYS[right]; }
  code(sound: LibrarySound): string { return soundCode(sound.id); }
  duration(sound: LibrarySound): string { return durationText(sound.durationMs); }
  audio(sound: LibrarySound): string { return audioText(sound); }
  size(sound: LibrarySound): string { return formatBytes(sound.size); }
  nameKeydown(event: KeyboardEvent): void { if (event.key === "Enter") { event.preventDefault(); (event.target as HTMLInputElement).blur(); } }
  nameBlur(sound: LibrarySound, event: Event): void {
    const field = event.target as HTMLInputElement;
    const name = field.value.trim();
    if (!name || name === sound.name) { field.value = sound.name; return; }
    void this.rename(sound, name);
  }
  removeTag(sound: LibrarySound, tag: string): void { void this.save(sound, { tags: sound.tags.filter((value) => value !== tag) }); }
  addTag(sound: LibrarySound, event: KeyboardEvent): void {
    if (event.key !== "Enter") { return; }
    event.preventDefault();
    const field = event.target as HTMLInputElement;
    const tag = normalizeTag(field.value);
    if (!tag) { return; }
    if (sound.tags.includes(tag)) { this.toasts.show(this.i18n.translate("library.sound.toast.tagExists", { tag }), "warning"); return; }
    if (sound.tags.length >= MAX_TAGS) { this.toasts.show(this.i18n.translate("library.sound.toast.tagLimit"), "warning"); return; }
    field.value = "";
    void this.save(sound, { tags: [...sound.tags, tag] });
  }
  setCollection(sound: LibrarySound, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === "__new") { this.dialogs.openCreateCollection(); return; }
    const collectionId = value ? Number(value) : null;
    if (collectionId !== sound.collectionId) { void this.save(sound, { collectionId }); }
  }
  setRights(sound: LibrarySound, event: Event): void {
    const rights = (event.target as HTMLSelectElement).value as AssetRights;
    if (rights !== sound.rights) { void this.save(sound, { rights }); }
  }
  view(sound: LibrarySound): void { this.dialogs.openSoundPreview(sound.id); }
  remove(sound: LibrarySound): void { this.dialogs.openDeleteSounds([sound.id]); }
  private async rename(sound: LibrarySound, name: string): Promise<void> {
    try {
      const updated = await this.sounds.update(sound.id, { name });
      if (updated.name !== name) { this.toasts.show(this.i18n.translate("library.sound.toast.renamed", { name: updated.name }), "warning"); } else { this.toasts.show(this.i18n.translate("library.sound.toast.updated")); }
    } catch (cause) { this.notifyFailure(cause); }
  }
  private async save(sound: LibrarySound, patch: AssetPatch): Promise<void> {
    try { await this.sounds.update(sound.id, patch); this.toasts.show(this.i18n.translate("library.sound.toast.updated")); } catch (cause) { this.notifyFailure(cause); }
  }
  private notifyFailure(cause: unknown): void { this.toasts.show(this.i18n.translate(libraryErrorKey(cause) as I18nKey), "danger"); }
  private resolveSound(): LibrarySound | null { const id = this.soundId(); return id === undefined ? this.sounds.selected() : this.sounds.items().find((sound) => sound.id === id) ?? null; }
}
