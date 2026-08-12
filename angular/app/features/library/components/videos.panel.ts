import { Component, computed, inject } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { TabsService } from "../../../../layout/tabs.service";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryCollection } from "../library.models";
import { formatBytes } from "../library.rules";
import { LibraryService } from "../library.service";
import { VIDEO_EXTENSIONS, VIDEO_MAX_BYTES } from "../library.videos.models";
import { LibraryVideoService } from "../library.videos.service";

interface PopularTag {
  tag: string;
  count: number;
}

function comparePopularTags(a: PopularTag, b: PopularTag): number {
  return b.count - a.count || a.tag.localeCompare(b.tag);
}

@Component({
  selector: "app-library-videos-panel",
  standalone: true,
  imports: [Icon, I18nPipe],
  templateUrl: "./videos.panel.html",
  host: { "data-testid": "library-videos-panel" },
})
export class LibraryVideosPanel {
  readonly library = inject(LibraryService);
  readonly videos = inject(LibraryVideoService);
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly tabs = inject(TabsService);
  readonly totalSize = computed(this.buildTotalSize.bind(this));
  readonly limit = formatBytes(VIDEO_MAX_BYTES);
  readonly formats = VIDEO_EXTENSIONS.map(this.toFormat);
  readonly popularTags = computed(this.buildPopularTags.bind(this));
  readonly collections = computed(this.buildCollections.bind(this));

  openUpload(): void {
    this.dialogs.openUpload([], "video");
  }

  toggleTag(tag: string): void {
    this.library.toggleFilterTag(tag);
  }

  openCollection(id: number, name: string): void {
    this.tabs.openCollection(id, name);
  }

  private toFormat(extension: string): string {
    return `.${extension}`;
  }

  private buildTotalSize(): string {
    return formatBytes(this.videos.items().reduce((total, video) => total + video.size, 0));
  }

  private buildPopularTags(): PopularTag[] {
    const counts = new Map<string, number>();
    for (const video of this.videos.items()) {
      for (const tag of video.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    const tags: PopularTag[] = [];
    for (const [tag, count] of counts) {
      tags.push({ tag, count });
    }
    return tags.sort(comparePopularTags).slice(0, 8);
  }

  private buildCollections(): LibraryCollection[] {
    return this.library.collections().filter(this.hasVideos);
  }

  private hasVideos(collection: LibraryCollection): boolean {
    return collection.counts.video > 0;
  }
}
