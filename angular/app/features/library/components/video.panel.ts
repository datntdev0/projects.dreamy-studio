import { Component, computed, inject, input } from "@angular/core";
import { Icon } from "@components/icon";
import { LanguageKey } from "@app/core/language/language.models";
import { LanguagePipe } from "@app/core/language/language.pipe";
import { LanguageService } from "@app/core/language/language.service";
import { ToastService } from "@app/core/toast/toast.service";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryConfirmService } from "../library.confirm.service";
import { ASSET_RIGHTS, AssetPatch, AssetRights } from "../library.models";
import { durationText, formatBytes, formatIsoMinute, libraryErrorKey, normalizeTag } from "../library.rules";
import { LibraryService } from "../library.service";
import { LibraryVideo } from "../library.videos.models";
import { frameText, videoCode } from "../library.videos.rules";
import { LibraryVideoService } from "../library.videos.service";

const MAX_TAGS = 12;

const RIGHTS_KEYS: Record<AssetRights, LanguageKey> = {
  own: "library.rights.own",
  licensed: "library.rights.licensed",
  free: "library.rights.free",
  other: "library.rights.other",
};

@Component({
  selector: "app-library-video-panel",
  standalone: true,
  imports: [Icon, LanguagePipe],
  templateUrl: "./video.panel.html",
  host: { "data-testid": "library-video-panel" },
})
export class LibraryVideoPanel {
  readonly videoId = input<number | undefined>();
  readonly videos = inject(LibraryVideoService);
  readonly library = inject(LibraryService);
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly confirms = inject(LibraryConfirmService);
  private readonly languageService = inject(LanguageService);
  private readonly toasts = inject(ToastService);
  readonly rightOptions = ASSET_RIGHTS;
  readonly video = computed(this.resolveVideo.bind(this));

  rightKey(right: AssetRights): LanguageKey {
    return RIGHTS_KEYS[right];
  }

  code(video: LibraryVideo): string {
    return videoCode(video.id);
  }

  duration(video: LibraryVideo): string {
    return durationText(video.durationMs);
  }

  frame(video: LibraryVideo): string {
    return frameText(video);
  }

  size(video: LibraryVideo): string {
    return formatBytes(video.size);
  }

  addedAt(video: LibraryVideo): string {
    return formatIsoMinute(video.createdAt);
  }

  originKey(video: LibraryVideo): LanguageKey {
    return video.origin === "app" ? "library.origin.app" : "library.origin.upload";
  }

  nameKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
    }
  }

  nameBlur(video: LibraryVideo, event: Event): void {
    const field = event.target as HTMLInputElement;
    const name = field.value.trim();
    if (!name || name === video.name) {
      field.value = video.name;
      return;
    }
    void this.rename(video, name);
  }

  removeTag(video: LibraryVideo, tag: string): void {
    void this.save(video, { tags: video.tags.filter((value) => value !== tag) });
  }

  addTag(video: LibraryVideo, event: KeyboardEvent): void {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const field = event.target as HTMLInputElement;
    const tag = normalizeTag(field.value);
    if (!tag) {
      return;
    }
    if (video.tags.includes(tag)) {
      this.toasts.show(this.languageService.translate("library.video.toast.tagExists", { tag }), "warning");
      return;
    }
    if (video.tags.length >= MAX_TAGS) {
      this.toasts.show(this.languageService.translate("library.video.toast.tagLimit"), "warning");
      return;
    }
    field.value = "";
    void this.save(video, { tags: [...video.tags, tag] });
  }

  setCollection(video: LibraryVideo, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === "__new") {
      this.dialogs.openCreateCollection();
      return;
    }
    const collectionId = value ? Number(value) : null;
    if (collectionId !== video.collectionId) {
      void this.save(video, { collectionId });
    }
  }

  setRights(video: LibraryVideo, event: Event): void {
    const rights = (event.target as HTMLSelectElement).value as AssetRights;
    if (rights !== video.rights) {
      void this.save(video, { rights });
    }
  }

  remove(video: LibraryVideo): void {
    this.confirms.deleteVideos([video.id]);
  }

  private async rename(video: LibraryVideo, name: string): Promise<void> {
    try {
      const updated = await this.videos.update(video.id, { name });
      if (updated.name !== name) {
        this.toasts.show(this.languageService.translate("library.video.toast.renamed", { name: updated.name }), "warning");
      } else {
        this.toasts.show(this.languageService.translate("library.video.toast.updated"));
      }
    } catch (cause) {
      this.notifyFailure(cause);
    }
  }

  private async save(video: LibraryVideo, patch: AssetPatch): Promise<void> {
    try {
      await this.videos.update(video.id, patch);
      this.toasts.show(this.languageService.translate("library.video.toast.updated"));
    } catch (cause) {
      this.notifyFailure(cause);
    }
  }

  private notifyFailure(cause: unknown): void {
    this.toasts.show(this.languageService.translate(libraryErrorKey(cause) as LanguageKey), "danger");
  }

  private resolveVideo(): LibraryVideo | null {
    const id = this.videoId();
    return id === undefined ? this.videos.selected() : this.videos.items().find(this.hasId.bind(null, id)) ?? null;
  }

  private hasId(id: number, video: LibraryVideo): boolean {
    return video.id === id;
  }
}
