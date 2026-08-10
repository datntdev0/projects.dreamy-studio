import { Component, inject, signal } from "@angular/core";
import { Button } from "../../../../components/button";
import { Dialog } from "../../../../components/dialog";
import { Icon } from "../../../../components/icon";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { I18nKey } from "../../../core/i18n/i18n.models";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryService } from "../library.service";
import { libraryErrorKey } from "../library.rules";

@Component({ selector: "app-library-collection-dialog", standalone: true, imports: [Button, Dialog, Icon, I18nPipe], templateUrl: "./collection.dialog.html", host: { "data-testid": "library-collection-dialog" } })
export class LibraryCollectionDialog {
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly library = inject(LibraryService);
  readonly open = this.dialogs.createCollectionOpen;
  readonly name = signal("");
  readonly description = signal("");
  readonly errorKey = signal<I18nKey | null>(null);
  readonly busy = signal(false);
  onName(event: Event): void { this.name.set((event.target as HTMLInputElement).value); this.errorKey.set(null); }
  onDescription(event: Event): void { this.description.set((event.target as HTMLTextAreaElement).value); }
  close(): void { this.dialogs.closeCreateCollection(); }
  async submit(): Promise<void> {
    const name = this.name().trim();
    if (!name) { this.errorKey.set("library.error.nameRequired"); return; }
    if (this.library.isDuplicateCollection(name)) { this.errorKey.set("library.error.collectionExists"); return; }
    this.busy.set(true);
    try { await this.library.createCollection({ name, description: this.description().trim() }); this.name.set(""); this.description.set(""); this.close(); }
    catch (error) { this.errorKey.set(libraryErrorKey(error) as I18nKey); }
    finally { this.busy.set(false); }
  }
}
