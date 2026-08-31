import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

export interface AnalyzeProvider {
  name: string;
  detail: string;
  state: 'ready' | 'unset' | 'unready';
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-novel-provider-status',
  imports: [Icon, CoreModule],
  templateUrl: './provider-status.component.html',
  host: { 'data-testid': 'novel-provider-status' },
})
export class NovelProviderStatus {
  readonly provider = input.required<AnalyzeProvider>();
  readonly testidPrefix = input.required<string>();
  readonly unsetKey = input.required<LanguageKey>();
  readonly changeKey = input.required<LanguageKey>();

  readonly changeRequested = output<void>();

  requestChange(): void {
    this.changeRequested.emit();
  }
}
