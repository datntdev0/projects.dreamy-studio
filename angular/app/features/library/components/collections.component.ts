import { Component, inject } from "@angular/core";
import { Icon } from "@components/icon";
import { LanguagePipe } from "@app/core/language/language.pipe";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryService } from "../library.service";
import { LIBRARY_KINDS, KindCounts, LibraryTag } from "../library.models";
import { sumCounts } from "../library.rules";

@Component({ selector: "app-library-collections", standalone: true, imports: [Icon, LanguagePipe], templateUrl: "./collections.component.html", host: { "data-testid": "library-collections" } })
export class LibraryCollections {
  readonly library = inject(LibraryService);
  readonly kinds = LIBRARY_KINDS;
  private readonly dialogs = inject(LibraryDialogsService);
  total(counts: KindCounts): number { return sumCounts(counts); }
  unfiled(): number { return sumCounts(this.library.summary().unfiled); }
  setQuery(event: Event): void { this.library.setTaxonomyQuery((event.target as HTMLInputElement).value); }
  selectCollection(id: number): void { this.library.selectCollection(id); }
  selectTag(tag: string): void { this.library.selectTag(tag); }
  selected(kind: "col" | "tag", id: number | string): boolean { const value = this.library.taxonomySelection(); return value?.kind === kind && value.id === id; }
  create(): void { this.dialogs.openCreateCollection(); }
  trackTag(tag: LibraryTag): string { return tag.tag; }
}
