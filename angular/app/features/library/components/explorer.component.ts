import { Component, inject, signal } from "@angular/core";
import { Icon } from "@components/icon";
import { LanguagePipe } from "@app/core/language/language.pipe";
import { LibraryKind, LibraryTag } from "../library.models";
import { LibraryCollectionAssetsService } from "../library.collection-assets.service";
import { LibraryService } from "../library.service";
import { TabsService } from "@layout/tabs.service";
import { sumCounts, tagsForKind } from "../library.rules";
import { collectionTabId } from "@layout/layout.models";

@Component({ selector: "app-library-explorer", standalone: true, imports: [Icon, LanguagePipe], templateUrl: "./explorer.component.html", host: { "data-testid": "library-explorer" } })
export class LibraryExplorer {
  readonly library = inject(LibraryService);
  readonly tabs = inject(TabsService);
  private readonly collectionAssets = inject(LibraryCollectionAssetsService);
  readonly open = signal(true);
  readonly filtersOpen = signal(true);
  toggle(): void { this.open.set(!this.open()); }
  toggleFilters(): void { this.filtersOpen.set(!this.filtersOpen()); }
  isActive(id: number): boolean { return this.tabs.activeId() === collectionTabId(id); }
  isImagesActive(): boolean { return this.tabs.isActive("images"); }
  isSoundsActive(): boolean { return this.tabs.isActive("sounds"); }
  isVideosActive(): boolean { return this.tabs.isActive("videos"); }
  isPromptsActive(): boolean { return this.tabs.isActive("prompts"); }
  activeKind(): LibraryKind | null { const active = this.tabs.activeId(); if (active === "images") return "image"; if (active === "sounds") return "sound"; if (active === "videos") return "video"; if (active === "prompts") return "prompt"; return null; }
  activeCollectionId(): number | null { const tab = this.tabs.active(); return tab.kind === "collection" ? tab.collectionId : null; }
  filterTags(): LibraryTag[] { const collection = this.activeCollectionId(); if (collection !== null) return this.collectionAssets.tags(collection); const kind = this.activeKind(); return kind ? tagsForKind(this.library.tags(), kind) : this.library.tags(); }
  tagCount(tag: LibraryTag): number { const kind = this.activeKind(); return kind ? tag.counts[kind] : this.count(tag.counts); }
  assetCount(kind: LibraryKind): number { return this.library.summary().assets[kind]; }
  isTagOn(tag: string): boolean { return this.library.filterTags().includes(tag); }
  openCollections(): void { this.tabs.openCollections(); }
  openImages(): void { this.tabs.openImages(); }
  openSounds(): void { this.tabs.openSounds(); }
  openVideos(): void { this.tabs.openVideos(); }
  openPrompts(): void { this.tabs.openPrompts(); }
  openCollection(id: number, name: string): void { this.library.selectCollection(id); this.tabs.openCollection(id, name); }
  setCollectionFilter(event: Event): void { const value = (event.target as HTMLSelectElement).value; this.library.setFilterCollection(value === "" ? null : value === "none" ? "none" : Number(value)); }
  count(counts: Parameters<typeof sumCounts>[0]): number { return sumCounts(counts); }
}
