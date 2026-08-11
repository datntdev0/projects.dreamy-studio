import { Component, computed, inject, input } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { LibraryImage } from "../library.images.models";
import { LibraryImageService } from "../library.images.service";

@Component({
  selector: "app-library-image-thumb",
  standalone: true,
  imports: [Icon],
  templateUrl: "./image-thumb.component.html",
})
export class LibraryImageThumb {
  private readonly images = inject(LibraryImageService);
  readonly image = input.required<LibraryImage>();
  readonly source = computed(this.resolveSource.bind(this));

  private resolveSource(): string {
    return this.images.thumb(this.image().id) ?? "";
  }
}
