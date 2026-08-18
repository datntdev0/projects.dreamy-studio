import { Component, computed, inject, signal } from "@angular/core";
import { Button } from "@components/button";
import { Dialog } from "@components/dialog";
import { Icon } from "@components/icon";
import { I18nPipe } from "@app/core/i18n/i18n.pipe";
import { LibraryDialogsService } from "../library.dialogs.service";
import { LibraryService } from "../library.service";
import { sumCounts } from "../library.rules";

@Component({ selector: "app-library-tag-confirm-dialog", standalone: true, imports: [Button, Dialog, Icon, I18nPipe], templateUrl: "./tag-confirm.dialog.html", host: { "data-testid": "library-tag-confirm-dialog" } })
export class LibraryTagConfirmDialog {
  private readonly dialogs = inject(LibraryDialogsService);
  private readonly library = inject(LibraryService);
  readonly value = this.dialogs.tagConfirmation;
  readonly busy = signal(false);
  readonly count = computed(this.buildCount.bind(this));
  close(): void { this.dialogs.closeTagConfirmation(); }
  async confirm(): Promise<void> { const value = this.value(); if (!value || this.busy()) return; this.busy.set(true); try { if (value.kind === "merge") await this.library.mergeTag(value.tag, value.target); else await this.library.deleteTag(value.tag); this.close(); } finally { this.busy.set(false); } }
  private buildCount(): number { const tag = this.value()?.tag; const row = this.library.tags().find(this.matchesTag.bind(null, tag ?? "")); return row ? sumCounts(row.counts) : 0; }
  private matchesTag(tag: string, row: { tag: string }): boolean { return row.tag === tag; }
}
