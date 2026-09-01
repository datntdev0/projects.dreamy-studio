import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CoreModule } from '@shared/core.module';

import { AudiobookContext } from '../audiobook.models';
import { AudiobookEmpty } from './empty.component';
import { AudiobookSegment } from './segment.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audiobook-list',
  imports: [CoreModule, AudiobookSegment, AudiobookEmpty],
  templateUrl: './list.component.html',
})
export class AudiobookList {
  readonly ctx = input.required<AudiobookContext>();
}
