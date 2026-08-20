import { NgComponentOutlet } from "@angular/common";
import { Component, Type, computed, inject } from "@angular/core";
import { Button } from "@components/button";
import { Dialog } from "@components/dialog";
import { Icon } from "@components/icon";
import { LanguagePipe } from "@app/core/language/language.pipe";
import { DialogItem, DialogRow } from "./dialog.models";
import { DialogService } from "./dialog.service";

@Component({
  selector: "app-dialog-host",
  standalone: true,
  imports: [NgComponentOutlet, Button, Dialog, Icon, LanguagePipe],
  templateUrl: "./dialog-host.component.html",
  host: { "data-testid": "dialog-host" },
})
export class DialogHost {
  private readonly dialogs = inject(DialogService);

  readonly request = this.dialogs.current;
  readonly busy = this.dialogs.busy;
  readonly error = this.dialogs.error;
  readonly acknowledged = this.dialogs.acknowledged;
  readonly thumb = computed(this.buildThumb.bind(this));
  readonly shown = computed(this.buildShown.bind(this));
  readonly hidden = computed(this.buildHidden.bind(this));
  readonly blocked = computed(this.buildBlocked.bind(this));

  accept(): void {
    void this.dialogs.accept();
  }

  cancel(): void {
    this.dialogs.cancel();
  }

  onAcknowledge(event: Event): void {
    this.dialogs.acknowledge((event.target as HTMLInputElement).checked);
  }

  private items(): DialogItem[] {
    return this.request()?.options.items ?? [];
  }

  private buildThumb(): Type<unknown> | null {
    return this.request()?.options.thumb ?? null;
  }

  private buildShown(): DialogRow[] {
    const limit = this.request()?.options.itemLimit;
    const items = this.items();
    return (limit === undefined ? items : items.slice(0, limit)).map(this.toRow);
  }

  private toRow(item: DialogItem): DialogRow {
    return { item, inputs: { item } };
  }

  private buildHidden(): number {
    const limit = this.request()?.options.itemLimit;
    return limit === undefined ? 0 : Math.max(0, this.items().length - limit);
  }

  private buildBlocked(): boolean {
    const options = this.request()?.options;
    if (this.busy() || !options) {
      return true;
    }
    return !!options.acknowledge && !this.acknowledged();
  }
}
