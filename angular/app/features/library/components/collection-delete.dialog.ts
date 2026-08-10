import { Component, computed, inject, signal } from "@angular/core";
import { Button } from "../../../../components/button";
import { Dialog } from "../../../../components/dialog";
import { Icon } from "../../../../components/icon";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryService } from "../library.service";
import { sumCounts } from "../library.rules";
import { TabsService } from "../../../../layout/tabs.service";

@Component({ selector: "app-library-collection-delete-dialog", standalone: true, imports: [Button, Dialog, Icon, I18nPipe], templateUrl: "./collection-delete.dialog.html", host: { "data-testid": "library-collection-delete-dialog" } })
export class LibraryCollectionDeleteDialog {
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly library = inject(LibraryService);
  private readonly tabs = inject(TabsService);
  readonly id = this.dialogs.deleteCollectionId;
  readonly collection = computed(this.buildCollection.bind(this));
  readonly busy = signal(false);
  close(): void { this.dialogs.closeDeleteCollection(); }
  async confirm(): Promise<void> { const item = this.collection(); if (!item || this.busy()) return; this.busy.set(true); try { await this.library.deleteCollection(item.id); this.tabs.closeCollection(item.id); this.close(); } finally { this.busy.set(false); } }
  private buildCollection() { const id = this.id(); return id === null ? undefined : this.library.collectionById(id); }
  total(): number { const item = this.collection(); return item ? sumCounts(item.counts) : 0; }
}
