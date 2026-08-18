import { Component, computed, inject, signal } from "@angular/core";
import { Button } from "@components/button";
import { Dialog } from "@components/dialog";
import { Icon } from "@components/icon";
import { I18nKey } from "@app/core/i18n/i18n.models";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { I18nService } from "@app/core/i18n/i18n.service";
import { ToastService } from "@app/core/toast/toast.service";
import { LibraryDialogsService } from "../library.dialogs.service";
import { formatBytes, libraryErrorKey } from "../library.rules";
import { LibraryVideo } from "../library.videos.models";
import { LibraryVideoService } from "../library.videos.service";

function hasVideoId(ids: Set<number>, video: LibraryVideo): boolean {
  return ids.has(video.id);
}

@Component({
  selector: "app-library-video-delete-dialog",
  standalone: true,
  imports: [Button, Dialog, Icon, I18nPipe],
  templateUrl: "./video-delete.dialog.html",
  host: { "data-testid": "library-video-delete-dialog" },
})
export class LibraryVideoDeleteDialog {
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly videos = inject(LibraryVideoService);
  private readonly i18n = inject(I18nService);
  private readonly toasts = inject(ToastService);
  readonly ids = this.dialogs.deleteVideoIds;
  readonly items = computed(this.buildItems.bind(this));
  readonly busy = signal(false);

  close(): void {
    this.dialogs.closeDeleteVideos();
  }

  titleKey(): I18nKey {
    return this.ids().length === 1 ? "library.videoDelete.title.one" : "library.videoDelete.title.other";
  }

  confirmKey(): I18nKey {
    return this.ids().length === 1 ? "library.videoDelete.confirm.one" : "library.videoDelete.confirm.other";
  }

  size(video: LibraryVideo): string {
    return formatBytes(video.size);
  }

  async confirm(): Promise<void> {
    if (!this.ids().length || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      const count = await this.videos.remove(this.ids());
      this.close();
      if (count === 1) {
        this.toasts.show(this.i18n.translate("library.video.toast.deleted.one", { name: this.items()[0]?.name ?? "" }));
      } else {
        this.toasts.show(this.i18n.translate("library.video.toast.deleted.other", { count }));
      }
    } catch (cause) {
      this.toasts.show(this.i18n.translate(libraryErrorKey(cause) as I18nKey), "danger");
    } finally {
      this.busy.set(false);
    }
  }

  private buildItems(): LibraryVideo[] {
    const ids = new Set(this.ids());
    return this.videos.items().filter(hasVideoId.bind(null, ids));
  }
}
