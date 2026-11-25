import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { fieldValue } from '@shared/utils/dom';

import { AssistantService } from '../assistant.service';
import { AssistantUsageMeter } from './usage.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-assistant-composer',
  imports: [AssistantUsageMeter, Button, Icon, CoreModule],
  templateUrl: './composer.component.html',
})
export class AssistantComposer {
  private readonly field = viewChild<ElementRef<HTMLTextAreaElement>>('field');

  readonly assistant = inject(AssistantService);

  editOn(): boolean {
    return this.assistant.active()?.editGranted === true;
  }

  toggleEdit(): void {
    void this.assistant.setEdit(!this.editOn());
  }

  focus(): void {
    this.field()?.nativeElement.focus();
  }

  onInput(event: Event): void {
    this.assistant.draft.set(fieldValue(event));
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void this.submit();
    }
  }

  async submit(): Promise<void> {
    const text = this.assistant.draft();
    if (text.trim() === '' || this.assistant.sending()) {
      return;
    }
    this.assistant.draft.set('');
    const sent = await this.assistant.send(text);
    if (!sent && this.assistant.draft() === '') {
      this.assistant.draft.set(text);
    }
  }
}
