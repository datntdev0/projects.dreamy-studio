import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-novel-mode-option',
  imports: [CoreModule],
  templateUrl: './mode-option.component.html',
  host: { 'data-testid': 'novel-mode-option' },
})
export class NovelModeOption {
  readonly mode = input.required<string>();
  readonly active = input.required<boolean>();
  readonly groupName = input.required<string>();
  readonly titleKey = input.required<LanguageKey>();
  readonly testid = input.required<string>();

  readonly picked = output<void>();

  pick(): void {
    this.picked.emit();
  }
}
