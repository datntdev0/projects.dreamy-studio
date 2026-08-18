import { Component, computed, inject, signal } from "@angular/core";
import { Button } from "@components/button";
import { Dialog } from "@components/dialog";
import { Icon } from "@components/icon";
import { I18nKey } from "@app/core/i18n/i18n.models";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { I18nService } from "@app/core/i18n/i18n.service";
import { ToastService } from "@app/core/toast/toast.service";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibrarySoundService } from "../library.sounds.service";
import { LibrarySound } from "../library.sounds.models";
import { formatBytes, libraryErrorKey } from "../library.rules";

function hasSoundId(ids: Set<number>, sound: LibrarySound): boolean { return ids.has(sound.id); }

@Component({ selector: "app-library-sound-delete-dialog", standalone: true, imports: [Button, Dialog, Icon, I18nPipe], templateUrl: "./sound-delete.dialog.html", host: { "data-testid": "library-sound-delete-dialog" } })
export class LibrarySoundDeleteDialog {
  private readonly dialogs = inject(LibraryDialogsService); private readonly sounds = inject(LibrarySoundService); private readonly i18n = inject(I18nService); private readonly toasts = inject(ToastService);
  readonly ids = this.dialogs.deleteSoundIds; readonly items = computed(this.buildItems.bind(this)); readonly busy = signal(false);
  close(): void { this.dialogs.closeDeleteSounds(); }
  titleKey(): I18nKey { return this.ids().length === 1 ? "library.soundDelete.title.one" : "library.soundDelete.title.other"; }
  confirmKey(): I18nKey { return this.ids().length === 1 ? "library.soundDelete.confirm.one" : "library.soundDelete.confirm.other"; }
  size(sound: LibrarySound): string { return formatBytes(sound.size); }
  async confirm(): Promise<void> { if (!this.ids().length || this.busy()) return; this.busy.set(true); try { const count = await this.sounds.remove(this.ids()); this.close(); this.toasts.show(this.i18n.translate(count === 1 ? "library.sound.toast.deleted.one" : "library.sound.toast.deleted.other", count === 1 ? { name: this.items()[0]?.name ?? "" } : { count })); } catch (cause) { this.toasts.show(this.i18n.translate(libraryErrorKey(cause) as I18nKey), "danger"); } finally { this.busy.set(false); } }
  private buildItems(): LibrarySound[] { const ids = new Set(this.ids()); return this.sounds.items().filter(hasSoundId.bind(null, ids)); }
}
