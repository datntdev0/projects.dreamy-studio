import { Component, computed, inject, input } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { LibraryVideo } from "../library.videos.models";
import { LibraryVideoService } from "../library.videos.service";
import { durationText } from "../library.rules";

@Component({
  selector: "app-library-video-media",
  standalone: true,
  imports: [Icon],
  templateUrl: "./video-media.component.html",
  host: { "data-testid": "library-video-media" },
})
export class LibraryVideoMedia {
  readonly video = input.required<LibraryVideo>();
  private readonly videos = inject(LibraryVideoService);
  readonly poster = computed(this.resolvePoster.bind(this));

  duration(): string {
    return durationText(this.video().durationMs);
  }

  private resolvePoster(): string {
    return this.videos.poster(this.video().id) ?? "";
  }
}
