import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';

import { BackendMessage } from '../backend.status';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-backend-status',
  imports: [Icon, CoreModule],
  templateUrl: './backend-status.component.html',
  host: {
    class: 'llm-msg t-sm',
    role: 'status',
    '[class.is-ok]': "message().tone === 'ok'",
    '[class.is-warn]': "message().tone === 'warn'",
    '[attr.data-testid]': 'testid() || null',
  },
})
export class BackendStatusLine {
  readonly message = input.required<BackendMessage>();
  readonly testid = input('');
}
