import { Component, inject, input } from "@angular/core";
import { Icon } from "@components/icon";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { LibraryConfirmService } from "../library.confirm.service";
import { LibraryService } from "../library.service";
import { LibraryCollection, LibraryKind, LIBRARY_KINDS } from "../library.models";
import { formatIsoMinute, sumCounts } from "../library.rules";
import { TabsService } from "@layout/tabs.service";

@Component({ selector: "app-library-collection-panel", standalone: true, imports: [Icon, I18nPipe], templateUrl: "./collection.panel.html", host: { "data-testid": "library-collection-panel" } })
export class LibraryCollectionPanel {
  readonly collectionId = input.required<number>();
  readonly showOpen = input(false);
  readonly library = inject(LibraryService);
  readonly kinds = LIBRARY_KINDS;
  private readonly confirms = inject(LibraryConfirmService);
  private readonly tabs = inject(TabsService);
  collection() { return this.library.collectionById(this.collectionId()); }
  created(item: LibraryCollection): string { return formatIsoMinute(item.createdAt); }
  total(item: LibraryCollection): number { return sumCounts(item.counts); }
  count(item: LibraryCollection, kind: LibraryKind): number { return item.counts[kind]; }
  editName(event: Event): void { const item = this.collection(); const field = event.target as HTMLInputElement; const name = field.value.trim(); if (!item) return; if (!name || this.library.isDuplicateCollection(name, item.id)) { field.value = item.name; return; } if (name !== item.name) void this.save(item, { name }); }
  editDescription(event: Event): void { const item = this.collection(); if (item) void this.save(item, { description: (event.target as HTMLTextAreaElement).value }); }
  open(item: LibraryCollection): void { this.tabs.openCollection(item.id, item.name); }
  remove(item: LibraryCollection): void { this.confirms.deleteCollection(item.id); }
  private async save(item: LibraryCollection, patch: { name?: string; description?: string }): Promise<void> { const updated = await this.library.updateCollection(item.id, patch); this.tabs.renameCollection(item.id, updated.name); }
}
