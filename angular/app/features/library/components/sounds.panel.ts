import { Component, computed, inject } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { TabsService } from "../../../../layout/tabs.service";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryCollection } from "../library.models";
import { LibraryService } from "../library.service";
import { SOUND_EXTENSIONS, SOUND_MAX_BYTES } from "../library.sounds.models";
import { LibrarySoundService } from "../library.sounds.service";
import { formatBytes } from "../library.rules";

interface PopularTag { tag: string; count: number; }

function comparePopularTags(a: PopularTag, b: PopularTag): number { return b.count - a.count || a.tag.localeCompare(b.tag); }

@Component({ selector: "app-library-sounds-panel", standalone: true, imports: [Icon, I18nPipe], templateUrl: "./sounds.panel.html", host: { "data-testid": "library-sounds-panel" } })
export class LibrarySoundsPanel {
  readonly library = inject(LibraryService);
  readonly sounds = inject(LibrarySoundService);
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly tabs = inject(TabsService);
  readonly totalSize = computed(this.buildTotalSize.bind(this));
  readonly limit = formatBytes(SOUND_MAX_BYTES);
  readonly formats = SOUND_EXTENSIONS.map((extension) => `.${extension}`);
  readonly popularTags = computed(this.buildPopularTags.bind(this));
  readonly collections = computed(this.buildCollections.bind(this));
  openUpload(): void { this.dialogs.openUpload([], "sound"); }
  toggleTag(tag: string): void { this.library.toggleFilterTag(tag); }
  openCollection(id: number, name: string): void { this.tabs.openCollection(id, name); }
  private buildTotalSize(): string { return formatBytes(this.sounds.items().reduce((total, sound) => total + sound.size, 0)); }
  private buildPopularTags(): PopularTag[] {
    const counts = new Map<string, number>();
    for (const sound of this.sounds.items()) { for (const tag of sound.tags) { counts.set(tag, (counts.get(tag) ?? 0) + 1); } }
    const tags: PopularTag[] = [];
    for (const [tag, count] of counts) { tags.push({ tag, count }); }
    return tags.sort(comparePopularTags).slice(0, 8);
  }
  private buildCollections(): LibraryCollection[] { return this.library.collections().filter(this.hasSounds); }
  private hasSounds(collection: LibraryCollection): boolean { return collection.counts.sound > 0; }
}
