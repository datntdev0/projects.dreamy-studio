import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CoreModule } from '@shared/core.module';

import { AudiobookContext } from '../audiobook.models';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-inspector-rules',
  host: { 'data-testid': 'audiobook-inspector-rules' },
  imports: [CoreModule],
  templateUrl: './inspector-rules.component.html',
})
export class AudiobookInspectorRules {
  readonly ctx = input.required<AudiobookContext>();
}
