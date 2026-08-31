import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';

import { AssistantService } from '../assistant.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-assistant-pane-header',
  imports: [Button, Icon, CoreModule],
  templateUrl: './pane-header.component.html',
})
export class AssistantPaneHeader {
  readonly assistant = inject(AssistantService);
  readonly newTestId = input.required<string>();
}
