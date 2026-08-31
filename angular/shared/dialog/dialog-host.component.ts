import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, Type } from '@angular/core';
import { Button } from '@components/button';
import { Cover } from '@components/cover';
import { Icon } from '@components/icon';
import { Dialog } from '@shared/dialog/dialog.component';
import { LanguagePipe } from '@shared/language/language.pipe';
import { fieldChecked } from '@shared/utils/dom';

import { DialogItem, DialogRow } from './dialog.models';
import { DialogService } from './dialog.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dialog-host',
  imports: [NgComponentOutlet, Button, Cover, Dialog, Icon, LanguagePipe],
  templateUrl: './dialog-host.component.html',
  host: { 'data-testid': 'dialog-host' },
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
    this.dialogs.acknowledge(fieldChecked(event));
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
