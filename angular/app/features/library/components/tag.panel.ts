import { Component, inject, input } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryService } from "../library.service";
import { LIBRARY_KINDS, LibraryKind, LibraryTag } from "../library.models";
import { normalizeTag, sumCounts } from "../library.rules";

@Component({ selector: "app-library-tag-panel", standalone: true, imports: [Icon, I18nPipe], templateUrl: "./tag.panel.html", host: { "data-testid": "library-tag-panel" } })
export class LibraryTagPanel {
  readonly tag = input.required<string>();
  readonly library = inject(LibraryService);
  readonly kinds = LIBRARY_KINDS;
  private readonly dialogs = inject(LibraryDialogsService);
  row() { return this.library.tags().find(this.matchesTag.bind(this)); }
  total(item: LibraryTag): number { return sumCounts(item.counts); }
  count(item: LibraryTag, kind: LibraryKind): number { return item.counts[kind]; }
  rename(event: Event): void {
    const old = this.tag(); const next = normalizeTag((event.target as HTMLInputElement).value);
    if (!next || next === old) return;
    if (this.library.tags().some(this.matchesOtherTag.bind(this, next, old))) { this.dialogs.openTagConfirmation({ kind: "merge", tag: old, target: next }); return; }
    void this.library.renameTag(old, next);
  }
  merge(event: Event): void { const target = (event.target as HTMLSelectElement).value; if (target) this.dialogs.openTagConfirmation({ kind: "merge", tag: this.tag(), target }); }
  delete(): void { this.dialogs.openTagConfirmation({ kind: "delete", tag: this.tag(), target: "" }); }
  private matchesTag(row: LibraryTag): boolean { return row.tag === this.tag(); }
  private matchesOtherTag(next: string, old: string, row: LibraryTag): boolean { return row.tag === next && row.tag !== old; }
}
