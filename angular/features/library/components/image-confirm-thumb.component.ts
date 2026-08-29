import { Component, Input } from "@angular/core";
import { DialogItem } from "@core/dialog/dialog.models";
import { LibraryImage } from "../library.images.models";
import { LibraryImageThumb } from "./image-thumb.component";

@Component({
  selector: "app-library-image-confirm-thumb",
  standalone: true,
  imports: [LibraryImageThumb],
  template: `<app-library-image-thumb [image]="image()" data-testid="library-image-confirm-thumb-image" />`,
  host: { "data-testid": "library-image-confirm-thumb" },
})
export class LibraryImageConfirmThumb {
  @Input() item: DialogItem = { name: "" };

  image(): LibraryImage {
    return this.item.data as LibraryImage;
  }
}
