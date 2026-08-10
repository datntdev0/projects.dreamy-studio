import { Component, inject, input } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { LibraryService } from "../library.service";
import { sumCounts } from "../library.rules";

@Component({ selector: "app-library-collection", standalone: true, imports: [Icon, I18nPipe], templateUrl: "./collection.component.html", host: { "data-testid": "library-collection" } })
export class LibraryCollectionView {
  readonly collectionId = input.required<number>();
  readonly library = inject(LibraryService);
  collection() { return this.library.collectionById(this.collectionId()); }
  total(): number { const value = this.collection(); return value ? sumCounts(value.counts) : 0; }
}
