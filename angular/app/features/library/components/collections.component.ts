import { Component, inject } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryService } from "../library.service";
import { LIBRARY_KINDS, KindCounts, LibraryTag } from "../library.models";
import { sumCounts } from "../library.rules";
import { TabsService } from "../../../../layout/tabs.service";

@Component({ selector: "app-library-collections", standalone: true, imports: [Icon, I18nPipe], templateUrl: "./collections.component.html", host: { "data-testid": "library-collections" } })
export class LibraryCollections {
  readonly library = inject(LibraryService);
  readonly kinds = LIBRARY_KINDS;
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly tabs = inject(TabsService);
  total(counts: KindCounts): number { return sumCounts(counts); }
  unfiled(): number { return sumCounts(this.library.summary().unfiled); }
  setQuery(event: Event): void { this.library.setTaxonomyQuery((event.target as HTMLInputElement).value); }
  selectCollection(id: number): void { this.library.selectCollection(id); }
  selectTag(tag: string): void { this.library.selectTag(tag); }
  selected(kind: "col" | "tag", id: number | string): boolean { const value = this.library.taxonomySelection(); return value?.kind === kind && value.id === id; }
  create(): void { this.dialogs.openCreateCollection(); }
  openCollection(id: number, name: string): void { this.library.selectCollection(id); this.tabs.openCollection(id, name); }
  trackTag(tag: LibraryTag): string { return tag.tag; }
}
