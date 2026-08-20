import { Component, inject, input } from "@angular/core";
import { LanguagePipe } from "@app/core/language/language.pipe";
import { LibraryService } from "../library.service";
import { LibraryCollectionAssets } from "./collection-assets.component";

@Component({ selector: "app-library-collection", standalone: true, imports: [LanguagePipe, LibraryCollectionAssets], templateUrl: "./collection.component.html", host: { "data-testid": "library-collection" } })
export class LibraryCollectionView {
  readonly collectionId = input.required<number>();
  readonly library = inject(LibraryService);
  collection() { return this.library.collectionById(this.collectionId()); }
}
