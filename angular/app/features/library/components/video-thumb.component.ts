import { Component, computed, inject, input } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { LibraryVideo } from "../library.videos.models";
import { LibraryVideoService } from "../library.videos.service";
import { LibraryVideoPlay } from "./video-play.component";

@Component({
  selector: "app-library-video-thumb",
  standalone: true,
  imports: [Icon, LibraryVideoPlay],
  templateUrl: "./video-thumb.component.html",
  host: { "data-testid": "library-video-thumb" },
})
export class LibraryVideoThumb {
  readonly video = input.required<LibraryVideo>();
  readonly playable = input(false);
  private readonly videos = inject(LibraryVideoService);
  readonly poster = computed(this.resolvePoster.bind(this));

  private resolvePoster(): string {
    return this.videos.poster(this.video().id) ?? "";
  }
}
