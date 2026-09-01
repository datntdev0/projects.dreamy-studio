import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { fieldValue } from '@shared/utils/dom';

import { AudiobookContext } from '../audiobook.models';
import { AudiobookDialogBase } from './audiobook.dialog.base';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-flag-dialog',
  imports: [Button, Icon, CoreModule],
  templateUrl: './flag.dialog.html',
  host: { 'data-testid': 'audiobook-flag-dialog' },
})
export class AudiobookFlagDialog extends AudiobookDialogBase {
  readonly note = signal('');
  readonly blockId = computed(this.buildBlockId.bind(this));

  constructor() {
    super('flag');
  }

  onNote(event: Event): void {
    this.note.set(fieldValue(event));
  }

  override close(): void {
    this.note.set('');
    super.close();
  }

  save(): void {
    const projectId = this.projectId();
    const blockId = this.blockId();
    if (projectId === null || blockId === null) {
      return;
    }
    const flagged = this.audiobook.flagSegment(projectId, blockId, this.note());
    this.close();
    if (flagged) {
      this.toasts.show(this.languageService.translate('audiobook.dialog.flag.toast'), 'warning');
    }
  }

  protected override admits(ctx: AudiobookContext): boolean {
    const blockId = this.dialogs.flagTarget()?.blockId;
    const row = ctx.segments.find((item) => item.block.id === blockId);
    return !!row && row.record !== null && !row.record.flag;
  }

  private buildBlockId(): string | null {
    return this.dialogs.flagTarget()?.blockId ?? null;
  }
}
