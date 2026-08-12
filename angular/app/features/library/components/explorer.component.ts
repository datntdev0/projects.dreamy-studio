import { Component, inject, signal } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { LibraryService } from "../library.service";
import { TabsService } from "../../../../layout/tabs.service";
import { sumCounts } from "../library.rules";
import { collectionTabId } from "../../../../layout/layout.models";

@Component({ selector: "app-library-explorer", standalone: true, imports: [Icon, I18nPipe], templateUrl: "./explorer.component.html", host: { "data-testid": "library-explorer" } })
export class LibraryExplorer {
  readonly library = inject(LibraryService);
  readonly tabs = inject(TabsService);
  readonly open = signal(true);
  readonly filtersOpen = signal(true);
  toggle(): void { this.open.set(!this.open()); }
  toggleFilters(): void { this.filtersOpen.set(!this.filtersOpen()); }
  isActive(id: number): boolean { return this.tabs.activeId() === collectionTabId(id); }
  isImagesActive(): boolean { return this.tabs.isActive("images"); }
  isSoundsActive(): boolean { return this.tabs.isActive("sounds"); }
  isTagOn(tag: string): boolean { return this.library.filterTags().includes(tag); }
  openCollections(): void { this.tabs.openCollections(); }
  openImages(): void { this.tabs.openImages(); }
  openSounds(): void { this.tabs.openSounds(); }
  openCollection(id: number, name: string): void { this.library.selectCollection(id); this.tabs.openCollection(id, name); }
  setCollectionFilter(event: Event): void { const value = (event.target as HTMLSelectElement).value; this.library.setFilterCollection(value === "" ? null : value === "none" ? "none" : Number(value)); }
  count(counts: Parameters<typeof sumCounts>[0]): number { return sumCounts(counts); }
}
