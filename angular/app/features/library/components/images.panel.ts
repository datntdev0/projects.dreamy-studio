import { Component, computed, inject } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { TabsService } from "../../../../layout/tabs.service";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { IMAGE_EXTENSIONS } from "../library.images.models";
import { IMAGE_MAX_BYTES } from "../library.images.models";
import { LibraryCollection } from "../library.models";
import { formatBytes } from "../library.images.rules";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryImageService } from "../library.images.service";
import { LibraryService } from "../library.service";

interface PopularTag {
  tag: string;
  count: number;
}

function comparePopularTags(a: PopularTag, b: PopularTag): number {
  return b.count - a.count || a.tag.localeCompare(b.tag);
}

@Component({
  selector: "app-library-images-panel",
  standalone: true,
  imports: [Icon, I18nPipe],
  templateUrl: "./images.panel.html",
  host: { "data-testid": "library-images-panel" },
})
export class LibraryImagesPanel {
  readonly library = inject(LibraryService);
  readonly images = inject(LibraryImageService);
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly tabs = inject(TabsService);
  readonly formats = IMAGE_EXTENSIONS.map(this.toFormat);
  readonly limit = formatBytes(IMAGE_MAX_BYTES);
  readonly popularTags = computed(this.buildPopularTags.bind(this));
  readonly collections = computed(this.buildCollections.bind(this));

  openUpload(): void {
    this.dialogs.openUpload();
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

  private buildPopularTags(): PopularTag[] {
    const counts = new Map<string, number>();
    for (const image of this.images.items()) {
      for (const tag of image.tags) {
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
    return this.library.collections().filter(this.hasImages);
  }

  private hasImages(collection: LibraryCollection): boolean {
    return collection.counts.image > 0;
  }
}
