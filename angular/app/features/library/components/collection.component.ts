import { Component, inject, input } from "@angular/core";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { LibraryService } from "../library.service";
import { LibraryCollectionAssets } from "./collection-assets.component";

@Component({ selector: "app-library-collection", standalone: true, imports: [I18nPipe, LibraryCollectionAssets], templateUrl: "./collection.component.html", host: { "data-testid": "library-collection" } })
export class LibraryCollectionView {
  readonly collectionId = input.required<number>();
  readonly library = inject(LibraryService);
  collection() { return this.library.collectionById(this.collectionId()); }
}
