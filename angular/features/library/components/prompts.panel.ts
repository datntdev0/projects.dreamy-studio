import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CoreModule } from '@shared/core.module';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-prompts-panel',
  imports: [CoreModule],
  templateUrl: './prompts.panel.html',
  host: { 'data-testid': 'library-prompts-panel' },
})
export class LibraryPromptsPanel {}
