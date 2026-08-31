import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

import { LibraryPrompt } from '../library.prompts.models';
import { promptExcerpt } from '../library.prompts.rules';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-library-prompt-media',
  imports: [CoreModule],
  templateUrl: './prompt-media.component.html',
  host: { 'data-testid': 'library-prompt-media' },
})
export class LibraryPromptMedia {
  readonly prompt = input.required<LibraryPrompt>();
  excerpt(): string {
    return promptExcerpt(this.prompt().text);
  }
  kindKey(): LanguageKey {
    return `library.prompt.kind.${this.prompt().kind}` as LanguageKey;
  }
}
