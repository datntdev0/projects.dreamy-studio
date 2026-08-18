import { Component, inject, input } from "@angular/core";
import { Icon } from "@components/icon";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryVideo } from "../library.videos.models";

@Component({
  selector: "app-library-video-play",
  standalone: true,
  imports: [Icon, I18nPipe],
  templateUrl: "./video-play.component.html",
  host: { "data-testid": "library-video-play" },
})
export class LibraryVideoPlay {
  readonly video = input.required<LibraryVideo>();
  readonly size = input<"sm" | "lg" | null>(null);
  private readonly dialogs = inject(LibraryDialogsService);

  open(event: Event): void {
    event.stopPropagation();
    this.dialogs.openVideoPreview(this.video().id);
  }
}
